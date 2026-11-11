import { get } from 'svelte/store';
import { watchlist } from '$lib/stores/watchlist';
import { progress as progressStore } from '$lib/stores/history';
import { settings } from '$lib/stores/settings';
import { syncWatchlistEntry } from '$lib/services/watchSync';
import type { WatchStatus } from '$lib/types';

/**
 * Automatic AniList sync.
 *
 * The watch page, cards and menus already push single changes right away, but
 * any path that forgets to (or a push that fails) left the list out of sync
 * until the user remembered the manual Sync button. This watcher is the
 * safety net: it observes the local watchlist + episode progress and pushes
 * whatever changed, a few seconds after the user stops changing things.
 *
 * - Push-only. Deletions are handled by removeWatchlistEverywhere (menu) and
 *   the full manual sync; this watcher never deletes from AniList.
 * - Only the status + episode number go to AniList, never the exact resume
 *   position inside an episode.
 * - Silent. A failed push is retried on the next change instead of nagging.
 */

type PushedState = { status: WatchStatus; episode: number | undefined };

const DEBOUNCE_MS = 8000;

let started = false;
let lastPushed = new Map<number, PushedState>();
let lastKey = '';
let timer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let queued = false;

function episodeFor(id: number, status: WatchStatus, totalEpisodes: number | null): number | undefined {
	const progress = get(progressStore)[id]?.episode;
	return progress ?? (status === 'completed' && totalEpisodes ? totalEpisodes : undefined);
}

/** Cheap fingerprint of just what AniList cares about: status + episode. */
function syncKey(): string {
	const wl = get(watchlist);
	const parts: string[] = [];
	for (const e of Object.values(wl)) {
		parts.push(`${e.id}:${e.status}:${episodeFor(e.id, e.status, e.totalEpisodes) ?? ''}`);
	}
	return parts.sort().join('|');
}

function snapshot(): Map<number, PushedState> {
	const wl = get(watchlist);
	const out = new Map<number, PushedState>();
	for (const e of Object.values(wl)) {
		out.set(e.id, { status: e.status, episode: episodeFor(e.id, e.status, e.totalEpisodes) });
	}
	return out;
}

function schedule() {
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => void run(), DEBOUNCE_MS);
}

function scheduleIfChanged() {
	const key = syncKey();
	if (key === lastKey) return;
	lastKey = key;
	schedule();
}

async function run() {
	if (syncing) {
		queued = true;
		return;
	}
	// Not signed in — nothing to push. Changes made now will be caught once
	// the user signs in, because the snapshot only advances on a push.
	if (!get(settings).anilistToken) return;

	const now = snapshot();
	const changed: number[] = [];
	for (const [id, st] of now) {
		const prev = lastPushed.get(id);
		if (!prev || prev.status !== st.status || prev.episode !== st.episode) changed.push(id);
	}
	// Drop snapshot entries for titles removed locally (the watcher never
	// deletes remotely; removals go through removeWatchlistEverywhere).
	for (const id of [...lastPushed.keys()]) if (!now.has(id)) lastPushed.delete(id);
	if (!changed.length) return;

	syncing = true;
	try {
		for (const id of changed) {
			const entry = get(watchlist)[id];
			const st = now.get(id);
			if (!entry || !st) continue;
			try {
				await syncWatchlistEntry(entry, st.status);
				lastPushed.set(id, st);
			} catch (e) {
				// Leave lastPushed alone so the next change retries this entry.
				console.warn('[auto-sync] push failed for', id, e);
			}
		}
	} finally {
		syncing = false;
		if (queued) {
			queued = false;
			schedule();
		}
	}
}

/** Push any pending changes right now (used when the tab is hidden). */
export function flushAutoSync(): void {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	void run();
}

/** Start watching the local lists. Call once, in the browser, from the root layout. */
export function startAutoSync(): void {
	if (started) return;
	started = true;
	lastPushed = snapshot();
	lastKey = syncKey();
	watchlist.subscribe(() => scheduleIfChanged());
	progressStore.subscribe(() => scheduleIfChanged());
	// If the user closes the tab right after marking an episode, don't wait
	// out the debounce — push what is pending while the page is still alive.
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) flushAutoSync();
	});
}
