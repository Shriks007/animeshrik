/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

/**
 * Minimal service worker — only here so the site is installable as an app
 * and the app shell loads fast. It caches ONLY the immutable build output
 * and static files. Pages, the AniList API, the stream proxy and the entry
 * gate are never intercepted, so nothing here can serve stale content or a
 * stale sign-in state.
 */

const CACHE = `animeshrik-${version}`;

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(build.concat(files)))
			.then(() => (self as unknown as ServiceWorkerGlobalScope).skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => (self as unknown as ServiceWorkerGlobalScope).clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request as Request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	// Immutable build output + static files only. Everything else (pages,
	// /api/*, streams) goes straight to the network.
	if (!url.pathname.startsWith('/_app/immutable/') && !files.includes(url.pathname)) return;
	event.respondWith(
		caches.match(req).then(
			(cached) =>
				cached ??
				fetch(req).then((res) => {
					const copy = res.clone();
					caches.open(CACHE).then((cache) => cache.put(req, copy));
					return res;
				})
		)
	);
});
