<script lang="ts">
	/**
	 * AnimeShrik brand mark — a text wordmark, no image assets.
	 *
	 *   • "Anime" → the theme accent colour
	 *   • "Shrik" → the theme ink colour (black on light themes, white on dark)
	 *
	 * Compact mode (tight header space) shows just the "AS" monogram.
	 */
	/** Rendered height of the mark in pixels. */
	export let height = 30;
	/** Hide the full wordmark and show only the "AS" monogram. */
	export let compact = false;
</script>

<span
	class="inline-flex items-center select-none align-middle font-extrabold leading-none tracking-tight whitespace-nowrap"
	style="height: {height}px; font-size: {Math.round(height * 0.66)}px;"
	role="img"
	aria-label="AnimeShrik"
>
	{#if compact}
		<span class="text-accent">A</span><span class="text-ink">S</span>
	{:else}
		<span class="text-accent">Anime</span><span class="text-ink">Shrik</span>
	{/if}
</span>
