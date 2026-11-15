import { derived, get, writable } from 'svelte/store';
import { watchlist } from '$lib/stores/watchlist';
import { persisted } from '$lib/stores/persisted';
import { settings } from '$lib/stores/settings';
import { gql } from '$lib/services/anilist';

/**
 * Notifications bell — new + upcoming episodes for the user's watchlist.
 *
 * Mirrors the Anime Timetable space's bell: an episode that aired in the last
 * 24 hours is "new", one airing in the next 24 hours is "upcoming". The data
 * comes from AniList's public AiringSchedule, filtered to the titles on the
 * local watchlist (Watching + Planning), so it works per user with no extra
 * sign-in and no server. Read state lives in localStorage.
 *
 * This is an in-app bell, not a push notification — it shows when the user
 * opens the site, like the timetable space.
 */

export interface NotificationItem {
	id: string;
	animeId: number;
	title: string;
	cover: string;
	episode: number;
	airingAt: number;
	kind: 'new' | 'upcoming';
}

const NEW_WINDOW_S = 24 * 3600;
const UPCOMING_WINDOW_S = 24 * 3600;
const READ_KEEP_DAYS = 7;
const PAGE_SIZE = 50;
const IDS_PER_QUERY = 50;

export const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const AIRING_QUERY = `
	query ($page: Int, $perPage: Int, $ids: [Int], $start: Int, $end: Int) {
		Page(page: $page, perPage: $perPage) {
			airingSchedules(mediaId_in: $ids, airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
				airingAt
				episode
				media {
					id
					title { romaji english }
					coverImage { extraLarge large }
				}
			}
		}
	}
`;

interface AiringRow {
	airingAt: number;
	episode: number;
	media: {
		id: number;
		title: { romaji: string | null; english: string | null };
		coverImage: { extraLarge: string; large: string };
	} | null;
}

export const notifications = writable<NotificationItem[]>([]);
export const notificationsLoading = writable(false);
export const notificationsError = writable('');

const readIds = persisted<Record<string, number>>('anikage:notifications:read', {});

export const unreadCount = derived([notifications, readIds], ([$items, $read]) =>
	$items.filter((n) => !$read[n.id]).length
);

function displayTitle(media: AiringRow['media']): string {
	if (!media) return '';
	const romaji = (media.title.romaji ?? '').trim();
	const english = (media.title.english ?? '').trim();
	return english || romaji;
}

async function fetchAiring(ids: number[], start: number, end: number): Promise<AiringRow[]> {
	const out: AiringRow[] = [];
	const chunks: number[][] = [];
	for (let i = 0; i < ids.length; i += IDS_PER_QUERY) chunks.push(ids.slice(i, i + IDS_PER_QUERY));
	await Promise.all(
		chunks.map(async (chunk) => {
			for (let page = 1; page <= 20; page++) {
				const data = await gql<{ Page: { airingSchedules: AiringRow[] } }>(AIRING_QUERY, {
					page,
					perPage: PAGE_SIZE,
					ids: chunk,
					start,
					end
				});
				const batch = data.Page?.airingSchedules ?? [];
				out.push(...batch);
				if (batch.length < PAGE_SIZE) break;
			}
		})
	);
	return out;
}

function buildItems(rows: AiringRow[], now: number, includeUpcoming = true): NotificationItem[] {
	const seen = new Set<string>();
	const items: NotificationItem[] = [];
	for (const row of rows) {
		if (!row.media) continue;
		const id = `${row.media.id}:${row.episode}`;
		if (seen.has(id)) continue;
		seen.add(id);
		items.push({
			id,
			animeId: row.media.id,
			title: displayTitle(row.media),
			cover: row.media.coverImage.extraLarge || row.media.coverImage.large,
			episode: row.episode,
			airingAt: row.airingAt,
			kind: row.airingAt <= now ? 'new' : 'upcoming'
		});
	}
	// New first (most recently aired on top), then upcoming (soonest first).
	const news = items.filter((n) => n.kind === 'new').sort((a, b) => b.airingAt - a.airingAt);
	const upcoming = includeUpcoming
		? items.filter((n) => n.kind === 'upcoming').sort((a, b) => a.airingAt - b.airingAt)
		: [];
	return [...news, ...upcoming];
}

function pruneRead() {
	const read = get(readIds);
	const cutoff = Date.now() - READ_KEEP_DAYS * 86400 * 1000;
	let changed = false;
	const next: Record<string, number> = {};
	for (const [id, at] of Object.entries(read)) {
		if (at >= cutoff) next[id] = at;
		else changed = true;
	}
	if (changed) readIds.set(next);
}

let refreshing = false;
let lastRefresh = 0;

export async function refreshNotifications(force = false): Promise<void> {
	if (refreshing) return;
	if (!force && Date.now() - lastRefresh < 60 * 1000) return;
	refreshing = true;
	notificationsLoading.set(true);
	notificationsError.set('');
	try {
		const st = get(settings);
		if (!st.notifyNewEpisodes) {
			notifications.set([]);
			return;
		}
		const allowedStatuses = st.notifyWatchingOnly ? ['watching'] : ['watching', 'planned'];
		const ids = Object.values(get(watchlist))
			.filter((e) => allowedStatuses.includes(e.status))
			.map((e) => e.id);
		if (!ids.length) {
			notifications.set([]);
			return;
		}
		const now = Math.floor(Date.now() / 1000);
		const rows = await fetchAiring(ids, now - NEW_WINDOW_S, now + UPCOMING_WINDOW_S);
		notifications.set(buildItems(rows, now, st.notifyUpcoming));
		lastRefresh = Date.now();
		pruneRead();
	} catch (e) {
		notificationsError.set(e instanceof Error ? e.message : 'Could not load notifications.');
	} finally {
		refreshing = false;
		notificationsLoading.set(false);
	}
}

export function markNotificationRead(id: string): void {
	const read = get(readIds);
	if (read[id]) return;
	readIds.set({ ...read, [id]: Date.now() });
}

export function markAllNotificationsRead(): void {
	const read = get(readIds);
	const next = { ...read };
	for (const n of get(notifications)) next[n.id] = Date.now();
	readIds.set(next);
}

export function isNotificationRead(id: string): boolean {
	return Boolean(get(readIds)[id]);
}

let started = false;

export function startNotifications(): void {
	if (started) return;
	started = true;
	void refreshNotifications(true);
	setInterval(() => void refreshNotifications(), REFRESH_INTERVAL_MS);
}
