<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import type { SkipWindow } from '$lib/types';

	/**
	 * EmbedPlayer — cross-origin iframe host speaking the `anikage-player`
	 * postMessage protocol, plus the Zoko (`zokoanime`) protocol.
	 *
	 * Outbound (plyr): { source:'anikage-player-host', type, ...payload }
	 *   types: seek{time} | play | pause | togglePlay | skipIntro | skipOutro
	 *          | setAutoSkipIntro{value} | setAutoSkipOutro{value} | setAutoplay{value}
	 *
	 * Inbound (plyr):  data.source === 'anikage-player'
	 *   types: ready{duration} | status{ok,attempt,detail} | play{currentTime}
	 *          | pause{currentTime} | ended{currentTime,duration}
	 *          | time{currentTime,duration,reason} | skipped{segment,auto,to}
	 *
	 * Outbound (Zoko): { channel:'zokoanime', type, ...payload }
	 *   types: seek{time} | play | pause
	 *   (Zoko's own fullscreen button uses the real Fullscreen API here —
	 *   this site runs in a normal browser, not the Muse webview, so no
	 *   fullscreen bridge is needed.)
	 *
	 * Inbound (Zoko):  data.channel === 'zokoanime'
	 *   types: ready{duration} | time{position,duration,percent}
	 *          | play{position} | pause{position} | ended
	 *   These are translated into the same events the host page consumes,
	 *   so resume, progress and the 75% auto-mark work identically.
	 *
	 * Third-party embeds that don't speak either protocol still play fine —
	 * the skip UI simply stays hidden and the boot spinner times out.
	 */
	export let src = '';
	export let title = 'AnimeShrik player';
	export let intro: SkipWindow | null = null;
	export let outro: SkipWindow | null = null;
	export let autoSkipIntro = false;
	export let autoSkipOutro = false;
	export let autoplay = true;

	interface PlayerMessage {
		source?: string;
		channel?: string;
		type?: string;
		currentTime?: number;
		duration?: number;
		position?: number;
		percent?: number;
		ok?: boolean;
		attempt?: number;
		detail?: string;
		segment?: string;
		auto?: boolean;
		to?: number;
		reason?: string;
	}

	/** True when the current embed is a Zoko player (different protocol). */
	function isZokoUrl(u: string): boolean {
		try {
			return new URL(u).hostname.toLowerCase() === 'zokoanime.video';
		} catch {
			return false;
		}
	}

	const dispatch = createEventDispatcher<{
		ready: number;
		play: number;
		pause: number;
		ended: { currentTime: number; duration: number };
		time: { currentTime: number; duration: number; reason: string };
		status: { ok: boolean; attempt: number; detail: string };
		skipped: { segment: string; auto: boolean; to: number };
	}>();

	let iframe: HTMLIFrameElement | null = null;
	/** True once the embedded player has handshaken via `ready`. */
	let protocolReady = false;
	/** Boot spinner — clears on handshake, or after a timeout for dumb embeds. */
	let booting = true;
	let currentTime = 0;
	let duration = 0;
	/** Auto-skip arming: only fire once per pass through a window. */
	let introArmed = true;
	let outroArmed = true;
	let bootTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSrc = '';

	function send(type: string, payload: Record<string, unknown> = {}): void {
		if (isZokoUrl(src)) {
			iframe?.contentWindow?.postMessage({ channel: 'zokoanime', type, ...payload }, 'https://zokoanime.video');
		} else {
			iframe?.contentWindow?.postMessage({ source: 'anikage-player-host', type, ...payload }, '*');
		}
	}

	/* Imperative API for the host page (via bind:this). */
	export function seek(time: number): void {
		send('seek', { time });
	}
	export function play(): void {
		send('play');
	}
	export function pause(): void {
		send('pause');
	}
	export function togglePlay(): void {
		send('togglePlay');
	}
	export function skipIntroSegment(): void {
		introArmed = false;
		// Zoko has no skip commands — seek past the intro instead.
		if (isZokoUrl(src) && intro) send('seek', { time: intro.end });
		else send('skipIntro');
	}
	export function skipOutroSegment(): void {
		outroArmed = false;
		if (isZokoUrl(src) && outro) send('seek', { time: outro.end });
		else send('skipOutro');
	}

	function inWindow(w: SkipWindow | null, t: number): boolean {
		return !!w && t >= w.start && t <= w.end;
	}

	/** Reset handshake/skip state whenever the stream URL changes. */
	function resetFor(s: string): void {
		if (s === lastSrc) return;
		lastSrc = s;
		protocolReady = false;
		booting = true;
		currentTime = 0;
		duration = 0;
		introArmed = true;
		outroArmed = true;
		if (bootTimer) clearTimeout(bootTimer);
		bootTimer = setTimeout(() => (booting = false), 4500);
	}
	$: resetFor(src);

	function onMessage(e: MessageEvent): void {
		const d = e.data as PlayerMessage | null;
		if (!d) return;

		// Zoko protocol: { channel:'zokoanime', type, position, duration, percent }.
		// Only accept it from the Zoko origin and only while a Zoko embed is loaded.
		if (d.channel === 'zokoanime') {
			if (e.origin !== 'https://zokoanime.video' || !isZokoUrl(src)) return;
			switch (d.type) {
				case 'ready': {
					protocolReady = true;
					booting = false;
					duration = Number(d.duration) || 0;
					dispatch('ready', duration);
					break;
				}
				case 'play': {
					currentTime = Number(d.position) || 0;
					dispatch('play', currentTime);
					break;
				}
				case 'pause': {
					currentTime = Number(d.position) || 0;
					dispatch('pause', currentTime);
					break;
				}
				case 'ended': {
					currentTime = Number(d.position) || duration;
					duration = Number(d.duration) || duration;
					dispatch('ended', { currentTime, duration });
					break;
				}
				case 'time': {
					currentTime = Number(d.position) || 0;
					duration = Number(d.duration) || duration;
					booting = false;
					// Auto-skip via seek (Zoko has no skip commands).
					if (introArmed && autoSkipIntro && intro && inWindow(intro, currentTime)) {
						introArmed = false;
						send('seek', { time: intro.end });
					} else if (outroArmed && autoSkipOutro && outro && inWindow(outro, currentTime)) {
						outroArmed = false;
						send('seek', { time: outro.end });
					}
					if (!inWindow(intro, currentTime)) introArmed = true;
					if (!inWindow(outro, currentTime)) outroArmed = true;
					dispatch('time', { currentTime, duration, reason: '' });
					break;
				}
				// Fullscreen requests are ignored — this site runs in a normal
				// browser, so Zoko's own fullscreen button works as-is.
			}
			return;
		}

		if (d.source !== 'anikage-player') return;

		switch (d.type) {
			case 'ready': {
				protocolReady = true;
				booting = false;
				duration = Number(d.duration) || 0;
				// Push current prefs so the iframe starts in sync.
				send('setAutoSkipIntro', { value: autoSkipIntro });
				send('setAutoSkipOutro', { value: autoSkipOutro });
				send('setAutoplay', { value: autoplay });
				dispatch('ready', duration);
				break;
			}
			case 'status': {
				dispatch('status', {
					ok: !!d.ok,
					attempt: Number(d.attempt) || 0,
					detail: String(d.detail ?? '')
				});
				break;
			}
			case 'play': {
				currentTime = Number(d.currentTime) || 0;
				dispatch('play', currentTime);
				break;
			}
			case 'pause': {
				currentTime = Number(d.currentTime) || 0;
				dispatch('pause', currentTime);
				break;
			}
			case 'ended': {
				currentTime = Number(d.currentTime) || 0;
				duration = Number(d.duration) || duration;
				dispatch('ended', { currentTime, duration });
				break;
			}
			case 'time': {
				currentTime = Number(d.currentTime) || 0;
				duration = Number(d.duration) || duration;
				booting = false;
				// Auto-skip: fire once per pass through a window.
				if (introArmed && autoSkipIntro && inWindow(intro, currentTime)) {
					introArmed = false;
					send('skipIntro');
				} else if (outroArmed && autoSkipOutro && inWindow(outro, currentTime)) {
					outroArmed = false;
					send('skipOutro');
				}
				if (!inWindow(intro, currentTime)) introArmed = true;
				if (!inWindow(outro, currentTime)) outroArmed = true;
				dispatch('time', {
					currentTime,
					duration,
					reason: String(d.reason ?? '')
				});
				break;
			}
			case 'skipped': {
				const segment = String(d.segment ?? '');
				if (segment === 'intro') introArmed = false;
				if (segment === 'outro') outroArmed = false;
				if (Number.isFinite(Number(d.to))) currentTime = Number(d.to) || currentTime;
				dispatch('skipped', { segment, auto: !!d.auto, to: Number(d.to) || 0 });
				break;
			}
		}
	}

	/* Keep the iframe in sync when toggles flip mid-playback (no reload).
	 * Plyr only — Zoko doesn't understand these prefs. */
	$: if (protocolReady && !isZokoUrl(src)) send('setAutoSkipIntro', { value: autoSkipIntro });
	$: if (protocolReady && !isZokoUrl(src)) send('setAutoSkipOutro', { value: autoSkipOutro });
	$: if (protocolReady && !isZokoUrl(src)) send('setAutoplay', { value: autoplay });

	$: introVisible = protocolReady && inWindow(intro, currentTime);
	$: outroVisible = protocolReady && !introVisible && inWindow(outro, currentTime);
	// Retained so auto-skip state changes still trigger reactivity; the skip UI
	// itself lives in the embedded player's own control bar.
	$: void introVisible;
	$: void outroVisible;

	onDestroy(() => {
		if (bootTimer) clearTimeout(bootTimer);
	});
</script>

<svelte:window on:message={onMessage} />

<div class="relative h-full w-full bg-black">
	<iframe
		bind:this={iframe}
		{src}
		{title}
		class="absolute inset-0 h-full w-full border-0"
		allowfullscreen
		allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
		referrerpolicy="origin"
	></iframe>
</div>
