<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { Check, ChevronDown, Layers, Search, Server } from 'lucide-svelte';
	import type { StreamCategory, StreamSource } from '$lib/types';
	import { lang, t } from '$lib/stores/i18n';

	/**
	 * One expandable server picker.
	 *
	 * Collapsed it is a single button showing the server that is playing and
	 * how many servers exist. Expanded it opens a panel with every server,
	 * arranged the way a viewer actually thinks: SUB and DUB sections, each
	 * split by source, with a search box to jump to a server by name.
	 * Picking a server closes the panel and remembers the choice.
	 */
	export let groups: Record<StreamCategory, StreamSource[]> = {
		'h-sub': [],
		's-sub': [],
		'dub': [],
		'e-sub': [],
		'e-dub': [],
		'v-sub': [],
		'v-dub': []
	};
	export let activeUrl = '';
	export let onSelect: (src: StreamSource, cat: StreamCategory) => void = () => {};
	export let loading = false;

	const SUB_CATS: StreamCategory[] = ['h-sub', 's-sub', 'e-sub', 'v-sub'];
	const DUB_CATS: StreamCategory[] = ['dub', 'e-dub', 'v-dub'];

	let open = false;
	let query = '';

	/** Total servers across every category. */
	$: total = [...SUB_CATS, ...DUB_CATS].reduce((n, c) => n + (groups[c]?.length ?? 0), 0);

	/** Label of the server that is playing (or the first available one). */
	$: activeLabel = (() => {
		for (const c of [...SUB_CATS, ...DUB_CATS]) {
			const hit = groups[c]?.find((s) => s.url === activeUrl);
			if (hit) return hit.label;
		}
		for (const c of [...SUB_CATS, ...DUB_CATS]) {
			if (groups[c]?.length) return groups[c][0].label;
		}
		return '';
	})();

	/** Category of the server that is playing. */
	$: activeCat = (() => {
		for (const c of [...SUB_CATS, ...DUB_CATS]) {
			if (groups[c]?.some((s) => s.url === activeUrl)) return c;
		}
		return null;
	})();

	/**
	 * Servers per category, filtered by the search box. This MUST be a
	 * reactive statement that reads `query` directly — a helper function
	 * hides the dependency from the compiler, so the list never re-filtered
	 * when the user typed (the search box looked unwired).
	 */
	$: filtered = (() => {
		const q = query.trim().toLowerCase();
		const out = {} as Record<StreamCategory, StreamSource[]>;
		for (const c of [...SUB_CATS, ...DUB_CATS]) {
			const list = groups[c] ?? [];
			out[c] = q ? list.filter((s) => s.label.toLowerCase().includes(q)) : list;
		}
		return out;
	})();

	/** Categories of one audio that still have servers after filtering. */
	$: subCats = SUB_CATS.filter((c) => filtered[c].length);
	$: dubCats = DUB_CATS.filter((c) => filtered[c].length);

	function pick(src: StreamSource, cat: StreamCategory) {
		open = false;
		onSelect(src, cat);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window on:keydown={onKey} />

{#if loading}
	<div class="flex items-center gap-2 text-sm text-muted">
		<Server size={14} class="animate-pulse text-accent" aria-hidden="true" />
		<span>{t('loadingServers', $lang)}</span>
	</div>
{:else if total}
	<div class="relative">
		<!-- Trigger: the server that is playing + how many exist -->
		<button
			on:click={() => (open = !open)}
			class="flex w-full items-center gap-2 rounded-lg border border-line/60 bg-surface/40 px-3 py-2.5 text-sm text-muted transition hover:border-accent/40 active:scale-[0.99] {open ? 'border-accent/50' : ''}"
			aria-haspopup="listbox"
			aria-expanded={open}
			title={t('switchServer', $lang)}
		>
			<Server size={14} class="shrink-0 text-accent" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate text-left">
				<span class="text-muted">{t('server', $lang)}: </span>
				<span class="font-semibold text-ink">{activeLabel || '—'}</span>
				{#if activeCat}
					<span class="ml-1 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">{activeCat}</span>
				{/if}
			</span>
			<span class="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">{total}</span>
			<ChevronDown size={15} class="shrink-0 transition-transform duration-200 {open ? 'rotate-180' : ''}" aria-hidden="true" />
		</button>

		{#if open}
			<div
				transition:fly={{ y: -4, duration: 160 }}
				class="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-line/60 bg-bg/95 shadow-2xl backdrop-blur-2xl"
				role="listbox"
			>
				<!-- Search: jump to a server by name -->
				<div class="border-b border-line/50 px-3 py-2">
					<div class="flex items-center gap-2 rounded-md border border-line/60 bg-surface/40 px-2.5 py-1.5">
						<Search size={13} class="shrink-0 text-muted" aria-hidden="true" />
						<input
							type="text"
							bind:value={query}
							placeholder={t('searchServers', $lang)}
							class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
							aria-label={t('searchServers', $lang)}
						/>
					</div>
				</div>

				<div class="max-h-[22rem] space-y-4 overflow-y-auto px-3 py-3">
					{#if subCats.length}
						<section>
							<p class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
								<Layers size={11} aria-hidden="true" /> Sub
								<span class="font-normal normal-case tracking-normal text-muted">· {subCats.reduce((n, c) => n + filtered[c].length, 0)}</span>
							</p>
							{#each subCats as cat (cat)}
								<p class="mb-1 mt-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">{cat}</p>
								<div class="flex flex-wrap gap-1.5">
									{#each filtered[cat] as src (src.url)}
										<button
											on:click={() => pick(src, cat)}
											class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-95 {activeUrl === src.url
												? 'border-accent/60 bg-accent/15 text-accent'
												: 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink'}"
											role="option"
											aria-selected={activeUrl === src.url}
										>
											<span class="max-w-40 truncate">{src.label}</span>
											{#if src.label === 'Zoko'}<span class="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">Default</span>{/if}
											{#if activeUrl === src.url}
												<Check size={12} class="shrink-0 text-accent" strokeWidth={3} />
											{/if}
										</button>
									{/each}
								</div>
							{/each}
						</section>
					{/if}

					{#if dubCats.length}
						<section>
							<p class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-accent">
								<Layers size={11} aria-hidden="true" /> Dub
								<span class="font-normal normal-case tracking-normal text-muted">· {dubCats.reduce((n, c) => n + filtered[c].length, 0)}</span>
							</p>
							{#each dubCats as cat (cat)}
								<p class="mb-1 mt-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">{cat}</p>
								<div class="flex flex-wrap gap-1.5">
									{#each filtered[cat] as src (src.url)}
										<button
											on:click={() => pick(src, cat)}
											class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition active:scale-95 {activeUrl === src.url
												? 'border-accent/60 bg-accent/15 text-accent'
												: 'border-line/60 bg-surface/40 text-muted hover:border-accent/30 hover:text-ink'}"
											role="option"
											aria-selected={activeUrl === src.url}
										>
											<span class="max-w-40 truncate">{src.label}</span>
											{#if src.label === 'Zoko'}<span class="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">Default</span>{/if}
											{#if activeUrl === src.url}
												<Check size={12} class="shrink-0 text-accent" strokeWidth={3} />
											{/if}
										</button>
									{/each}
								</div>
							{/each}
						</section>
					{/if}

					{#if !subCats.length && !dubCats.length}
						<p class="py-3 text-center text-sm text-muted">{t('noServersMatch', $lang)}</p>
					{/if}
				</div>

				<p class="border-t border-line/50 px-3 py-2 text-[11px] text-muted/80">{t('serverPickRemembered', $lang)}</p>
			</div>
			<button class="fixed inset-0 z-40 cursor-default" aria-label={t('close', $lang)} on:click={() => (open = false)}></button>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted">{t('noServersIndexed', $lang)}</p>
{/if}
