<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { exchangeCode, fetchViewer, importWatchlist, startLogin } from '$lib/services/anilistOAuth';
	import { settings, updateSetting } from '$lib/stores/settings';
	import { resetProvider } from '$lib/stores/sync';
	import { toast } from '$lib/stores/toast';
	import { lang, t } from '$lib/stores/i18n';

	let error = '';

	$: status = t('completingSignIn', $lang);

	onMount(async () => {
		const params = $page.url.searchParams;
		// AniList reports refusals (denied consent, invalid client…) on the
		// callback itself — surface that instead of a generic failure.
		const oauthError = params.get('error');
		if (oauthError) {
			error = params.get('error_description') || oauthError;
			return;
		}
		// Check for direct access token (implicit / mobile grant) in hash or query
		let token = params.get('access_token');
		if (!token && typeof location !== 'undefined' && location.hash) {
			const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
			token = hashParams.get('access_token');
		}

		const code = params.get('code');
		if (!code && !token) {
			error = t('noAuthCode', $lang);
			return;
		}
		// Already signed in — a refresh or Back press lands here with the
		// same code. Don't exchange it again.
		if (get(settings).anilistToken) {
			goto('/home');
			return;
		}

		if (code) {
			// Never exchange the same code twice in this session.
			const spentKey = `anikage:anilist:code:${code}`;
			if (sessionStorage.getItem(spentKey)) {
				error = t('signInLinkUsed', $lang);
				return;
			}
			sessionStorage.setItem(spentKey, '1');
		}

		try {
			if (!token && code) {
				try {
					token = await exchangeCode(code);
				} catch {
					// Fallback: If code exchange fails (e.g. mobile without server secret), prompt for token or retry
				}
			}
			if (!token) {
				error = 'Could not obtain access token automatically. Please authorize again or paste your token below.';
				return;
			}
			updateSetting('anilistToken', token);
			// Never reuse another account's snapshot or pending deletes.
			resetProvider('anilist');
			await fetchViewer();
			const n = await importWatchlist();
			toast(`Signed in — imported ${n} titles`, true);
			goto('/home');
		} catch (e) {
			error = e instanceof Error ? e.message : t('signInFailed', $lang);
		}
	});

	let pastedToken = '';
	async function applyPastedToken() {
		if (!pastedToken.trim()) return;
		let tok = pastedToken.trim();
		if (tok.includes('access_token=')) {
			const m = tok.match(/access_token=([^&]+)/);
			if (m) tok = m[1];
		}
		try {
			updateSetting('anilistToken', tok);
			resetProvider('anilist');
			await fetchViewer();
			const n = await importWatchlist();
			toast(`Signed in — imported ${n} titles`, true);
			goto('/home');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Invalid AniList token';
		}
	}
</script>

<svelte:head><title>{t('anilistSignIn', $lang)} — AnimeShrik</title></svelte:head>

<div class="grid min-h-[60vh] place-items-center px-4">
	<div class="hairline max-w-sm rounded-xl bg-surface/40 p-8 text-center">
		{#if error}
			<p class="text-sm font-semibold text-red-400">{error}</p>
			<p class="mt-2 text-xs text-muted">{t('signInLinkHint', $lang)}</p>

			<div class="mt-4 rounded-lg bg-surface/50 p-3 text-left">
				<p class="text-xs text-muted">Or paste your access token:</p>
				<div class="mt-2 flex gap-2">
					<input
						bind:value={pastedToken}
						type="password"
						placeholder="Paste token..."
						class="min-w-0 flex-1 rounded border border-line/60 bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
					/>
					<button
						on:click={applyPastedToken}
						class="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
					>
						Submit
					</button>
				</div>
			</div>

			<button
				on:click={startLogin}
				class="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]"
			>
				{t('signInAnilistAgain', $lang)}
			</button>
			<a href="/settings" class="mt-4 inline-block text-sm text-accent underline">{t('backToSettings', $lang)}</a>
		{:else}
			<div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			<p class="mt-4 text-sm text-muted">{status}</p>
		{/if}
	</div>
</div>
