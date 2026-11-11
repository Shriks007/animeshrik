<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Construction, X } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { lockScroll, unlockScroll } from '$lib/utils/scrollLock';
	import { startLogin } from '$lib/services/anilistOAuth';
	import { hideMalUnderConstruction } from '$lib/stores/underConstruction';
	import { lang, t } from '$lib/stores/i18n';

	export let open = false;

	function close() {
		hideMalUnderConstruction();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}

	$: if (open) lockScroll();
	else unlockScroll();
</script>

<svelte:window on:keydown={onKey} />

{#if open}
	<div use:portal class="fixed inset-0 z-[80] flex items-center justify-center p-4">
		<div
			transition:fade={{ duration: 160 }}
			class="absolute inset-0 bg-black/70 backdrop-blur-sm"
			on:click={close}
			aria-hidden="true"
		></div>
		<div
			transition:fly={{ y: 12, duration: 200 }}
			class="relative w-full max-w-sm rounded-2xl border border-line/60 bg-bg p-6 text-center shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="MyAnimeList login under construction"
		>
			<button
				on:click={close}
				class="absolute right-3 top-3 rounded-md p-1.5 text-muted transition hover:bg-surface/60 hover:text-ink"
				aria-label={t('close', $lang)}
			>
				<X size={16} />
			</button>
			<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
				<Construction size={26} class="text-accent" />
			</div>
			<h2 class="mt-4 text-lg font-bold text-ink">MyAnimeList login is still under construction</h2>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				Our builders are still arguing with MyAnimeList's paperwork. The login button is here, the login
				itself is… not. It is currently held together with tape and good intentions.
			</p>
			<p class="mt-2 text-sm leading-relaxed text-muted">
				AniList login works perfectly, though — same lists, less drama.
			</p>
			<button
				on:click={() => {
					close();
					startLogin();
				}}
				class="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
			>
				Sign in with AniList instead
			</button>
			<button
				on:click={close}
				class="mt-2 w-full rounded-lg border border-line/60 px-4 py-2.5 text-sm font-medium text-muted transition hover:border-accent/40 hover:text-ink active:scale-[0.99]"
			>
				Carry on as a guest
			</button>
		</div>
	</div>
{/if}
