<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import Header from '$lib/components/layout/Header.svelte';
	import MobileNav from '$lib/components/layout/MobileNav.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import MalUnderConstruction from '$lib/components/ui/MalUnderConstruction.svelte';
	import { malUnderConstruction } from '$lib/stores/underConstruction';
	import CommandPalette from '$lib/components/layout/CommandPalette.svelte';
	import Toasts from '$lib/components/layout/Toasts.svelte';
	import LoadingBar from '$lib/components/layout/LoadingBar.svelte';
	import Ambient from '$lib/components/ui/Ambient.svelte';
	import { setOg } from '$lib/utils/og';
	import { startAutoSync } from '$lib/services/autoSync';
	import { startNotifications } from '$lib/services/notifications';
	import { dev } from '$app/environment';

	let paletteOpen = false;
	let showSplash = true;

	/** The lander is a standalone page — no top bar, bottom bar or footer. */
	$: bare = $page.url.pathname === '/landing';

	// Every page starts from the site-wide card; pages that have their own
	// artwork (anime, episode) replace it once their data arrives.
	beforeNavigate(() => setOg({}));

	onMount(() => {
		// Dismiss animated splash screen shortly after mounting
		const splashTimer = setTimeout(() => {
			showSplash = false;
		}, 850);

		// Turn the static fallback tags into absolute URLs for link previews.
		setOg({});

		// Keep AniList in sync automatically — any watchlist/progress change
		// is pushed a few seconds later, no manual Sync tap needed.
		startAutoSync();

		// Notifications bell — new + upcoming episodes for the watchlist.
		startNotifications();

		// Installable app — register the service worker (production only).
		if (!dev && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {});
		}

		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				paletteOpen = !paletteOpen;
			}
		}
		window.addEventListener('keydown', onKey);

		// Deep link handling for mobile custom scheme (e.g. animeshrik://auth/anilist/callback?code=...)
		let unlistenDeepLink: (() => void) | undefined;
		(async () => {
			try {
				const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
				const startUrls = await getCurrent();
				if (startUrls && startUrls.length > 0) {
					for (const u of startUrls) handleDeepLinkUrl(u);
				}
				unlistenDeepLink = await onOpenUrl((urls) => {
					for (const u of urls) handleDeepLinkUrl(u);
				});
			} catch {
				// Non-tauri or plugin unavailable
			}
		})();

		return () => {
			window.removeEventListener('keydown', onKey);
			if (unlistenDeepLink) unlistenDeepLink();
		};
	});

	function handleDeepLinkUrl(rawUrl: string) {
		if (!rawUrl) return;
		console.log('[deep-link] Received URL:', rawUrl);
		try {
			const normalized = rawUrl.replace(/^animeshrik:\/\//, 'http://localhost/');
			const parsed = new URL(normalized);
			if (parsed.pathname.includes('/auth/anilist/callback')) {
				goto(`/auth/anilist/callback${parsed.search}`);
			} else if (parsed.pathname && parsed.pathname !== '/') {
				goto(`${parsed.pathname}${parsed.search}`);
			}
		} catch (e) {
			console.error('[deep-link] Error parsing URL:', rawUrl, e);
		}
	}

	function onPaletteNav(e: CustomEvent<string>) {
		goto(e.detail);
	}
</script>

<div class="relative min-h-screen">
	<Ambient />

	<div class="relative z-10">
		{#if !bare}
			<Header onSearch={() => (paletteOpen = true)} />
		{/if}
		<main class={bare ? '' : 'pb-28 md:pb-8'}>
			<slot />
		</main>
		{#if !bare}
			<!-- Desktop footer only: hidden on mobile so it doesn't clash behind the mobile navigation bar -->
			<div class="hidden md:block">
				<Footer />
			</div>
		{/if}
	</div>

	{#if !bare}
		<MobileNav />
	{/if}
	<CommandPalette
		open={paletteOpen}
		on:close={() => (paletteOpen = false)}
		on:navigate={onPaletteNav}
	/>
	<Toasts />
	<LoadingBar />
	<!-- MyAnimeList sign-in is under construction — a popup, not a redirect. -->
	<MalUnderConstruction open={$malUnderConstruction} />

	<!-- Animated Splash Entrance -->
	{#if showSplash}
		<div
			transition:fade={{ duration: 400 }}
			class="pointer-events-none fixed inset-0 z-[200] flex flex-col items-center justify-center bg-bg"
		>
			<div class="flex flex-col items-center gap-4">
				<div class="relative grid h-24 w-24 place-items-center">
					<div class="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse"></div>
					<div class="relative grid h-20 w-20 place-items-center rounded-2xl border border-accent/40 bg-surface shadow-glow">
						<span class="font-display text-3xl font-black tracking-tighter text-accent">AS</span>
					</div>
				</div>
				<div class="flex flex-col items-center">
					<span class="font-display text-2xl font-black tracking-tight text-ink">
						Anime<span class="text-accent">Shrik</span>
					</span>
					<span class="mt-1 text-[10px] font-semibold tracking-widest uppercase text-muted">
						Cinematic Anime Streaming
					</span>
				</div>
			</div>
		</div>
	{/if}
</div>
