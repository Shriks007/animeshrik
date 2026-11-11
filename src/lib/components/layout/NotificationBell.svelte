<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { Bell, CalendarDays, CheckCheck } from 'lucide-svelte';
	import {
		notifications,
		unreadCount,
		notificationsLoading,
		refreshNotifications,
		markNotificationRead,
		markAllNotificationsRead,
		isNotificationRead,
		type NotificationItem
	} from '$lib/services/notifications';
	import { lang, t, tf } from '$lib/stores/i18n';
	import { countdown, timeAgo } from '$lib/utils/format';

	/** 'header' = dropdown under the top bar, 'bottom' = card above the bottom nav. */
	export let variant: 'header' | 'bottom' = 'header';

	let open = false;
	let root: HTMLElement;
	let now = Date.now();
	let ticker: ReturnType<typeof setInterval>;

	onMount(() => {
		ticker = setInterval(() => (now = Date.now()), 30 * 1000);
		function onDoc(e: MouseEvent) {
			if (open && root && !root.contains(e.target as Node)) open = false;
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') open = false;
		}
		document.addEventListener('click', onDoc, true);
		document.addEventListener('keydown', onKey);
		return () => {
			clearInterval(ticker);
			document.removeEventListener('click', onDoc, true);
			document.removeEventListener('keydown', onKey);
		};
	});

	function toggle() {
		open = !open;
		if (open) void refreshNotifications();
	}

	function openAnime(n: NotificationItem) {
		markNotificationRead(n.id);
		open = false;
		void goto(`/anime/${n.animeId}`);
	}

	function sub(n: NotificationItem): string {
		if (n.kind === 'new') {
			return `${tf('episodeIsOut', { ep: n.episode }, $lang)} · ${timeAgo(n.airingAt * 1000)}`;
		}
		return tf('episodeAirsIn', { ep: n.episode, time: countdown(n.airingAt) }, $lang);
	}
</script>

<div bind:this={root} class="relative {variant === 'bottom' ? '' : ''}">
	<button
		on:click={toggle}
		class={variant === 'header'
			? 'relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line/60 bg-surface/60 text-muted transition hover:border-accent/40 hover:text-accent active:scale-95'
			: 'mnav-item relative flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-muted transition-colors duration-200 active:scale-95'}
		aria-label={t('notifications', $lang)}
		aria-haspopup="menu"
		aria-expanded={open}
	>
		<Bell size={variant === 'header' ? 16 : 19} strokeWidth={variant === 'header' ? 2 : 1.9} />
		{#if variant === 'bottom'}
			<span class="text-[10px] font-medium tracking-wide">{t('notifications', $lang)}</span>
		{/if}
		{#if $unreadCount > 0}
			<span
				class="absolute {variant === 'header'
					? '-right-1 -top-1 h-4 min-w-4 px-1 text-[10px]'
					: 'right-2 top-1 h-4 min-w-4 px-1 text-[10px]'} grid place-items-center rounded-full bg-accent font-bold leading-none text-white"
			>
				{$unreadCount > 9 ? '9+' : $unreadCount}
			</span>
		{/if}
	</button>

	{#if open}
		<div
			transition:slide={{ duration: 200 }}
			class="{variant === 'header'
				? 'absolute right-0 top-full z-[60] mt-2 w-[min(92vw,22rem)]'
				: 'fixed inset-x-3 bottom-20 z-[70]'} overflow-hidden rounded-2xl border border-line/60 bg-bg/95 shadow-2xl backdrop-blur-2xl"
			role="menu"
		>
			<div class="flex items-center justify-between gap-2 border-b border-line/50 px-3.5 py-3">
				<p class="text-sm font-semibold text-ink">
					{t('notifications', $lang)}
					{#if $unreadCount > 0}
						<span class="ml-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[11px] font-bold text-accent">
							{$unreadCount}
						</span>
					{/if}
				</p>
				{#if $unreadCount > 0}
					<button
						on:click={markAllNotificationsRead}
						class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
					>
						<CheckCheck size={13} /> {t('markAllRead', $lang)}
					</button>
				{/if}
			</div>

			<div class="max-h-[60vh] overflow-y-auto p-1.5">
				{#if $notificationsLoading && !$notifications.length}
					<p class="px-3 py-6 text-center text-sm text-muted">…</p>
				{:else if !$notifications.length}
					<div class="px-3 py-6 text-center">
						<p class="text-sm font-medium text-ink">{t('noNotifications', $lang)}</p>
						<p class="mt-1 text-xs text-muted">{t('notificationsEmpty', $lang)}</p>
					</div>
				{:else}
					{#each $notifications as n (n.id)}
						<button
							on:click={() => openAnime(n)}
							class="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-surface/60 {isNotificationRead(n.id)
								? 'opacity-70'
								: 'bg-accent/[0.06]'}"
						>
							<img
								src={n.cover}
								alt=""
								loading="lazy"
								class="h-14 w-10 shrink-0 rounded-md object-cover"
							/>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-ink">{n.title}</span>
								<span class="mt-0.5 block text-xs {n.kind === 'new' ? 'font-medium text-accent' : 'text-muted'}">
									{sub(n)}
								</span>
							</span>
							{#if !isNotificationRead(n.id)}
								<span class="h-2 w-2 shrink-0 rounded-full bg-accent"></span>
							{/if}
						</button>
					{/each}
				{/if}
			</div>

			<div class="border-t border-line/50 p-1.5">
				<a
					href="/schedule"
					on:click={() => (open = false)}
					class="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink"
				>
					<CalendarDays size={15} /> {t('viewSchedule', $lang)}
				</a>
			</div>
		</div>
	{/if}
</div>
