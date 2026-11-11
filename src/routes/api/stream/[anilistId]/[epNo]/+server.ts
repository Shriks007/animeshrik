import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { API_URL } from '$lib/config';

/**
 * Same-origin proxy for the AnimeShrik worker stream API.
 *
 * The worker is a cross-origin host. Fetching it straight from the browser can
 * stall during page hydration (CORS preflight timing), which leaves the server
 * list spinning forever. Proxying through the SvelteKit server removes the
 * cross-origin handshake entirely — the browser only ever talks to its own
 * origin.
 *
 * The upstream request is bounded by UPSTREAM_TIMEOUT so a hung worker can
 * never hold a browser request open indefinitely.
 */

/** How long the worker gets to answer before we give up on it. */
const UPSTREAM_TIMEOUT = 28_000;
export const GET: RequestHandler = async ({ params }) => {
	const anilistId = Number(params.anilistId);
	const epNo = Number(params.epNo);

	if (!Number.isFinite(anilistId) || !Number.isFinite(epNo) || anilistId <= 0 || epNo <= 0) {
		return json({ error: 'Invalid episode identifier' }, { status: 400 });
	}

	try {
		// The worker can be slow while it scrapes providers, so the upstream call
		// gets a generous but finite budget. Without it a hung worker would hold
		// the browser's request open forever and the UI would spin endlessly.
		const res = await fetch(`${API_URL}/${anilistId}/${epNo}`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(UPSTREAM_TIMEOUT)
		});

		if (!res.ok) {
			if (res.status === 404) {
				return json({ error: 'No streams indexed for this episode yet.' }, { status: 404 });
			}
			return json({ error: `Stream service failed (${res.status}).` }, { status: 502 });
		}

		const data = await res.json();
		return json(data, {
			headers: {
				// 5-minute cache (matches the worker's own cache) so repeat
				// visits and retries are served instantly instead of
				// re-scraping. max-age is the browser cache; s-maxage is the
				// edge/CDN cache (Vercel only caches shared responses with
				// s-maxage). stale-while-revalidate keeps serving a slightly
				// old list for a minute past expiry while the fresh one is
				// fetched in the background.
				'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60'
			}
		});
	} catch (e) {
		if (e instanceof DOMException && e.name === 'TimeoutError') {
			return json({ error: 'Stream service timed out.' }, { status: 504 });
		}
		return json({ error: 'Stream service unreachable.' }, { status: 502 });
	}
};
