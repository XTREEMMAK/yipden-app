import type {
	RingArtwork,
	RingEntry,
	RingFeed,
	RingFocalPoint,
	RingPage,
	RingTrack
} from './types.js';
import { normalizeUrl } from './url.js';

export interface NormalizeOptions {
	/**
	 * Maps a published URL to the address it actually resolves to, so one creator behind a
	 * redirect is one person. The ring client does no network work of its own, so whoever
	 * followed the redirect supplies the answer.
	 */
	resolveUrl?: (url: string) => string | undefined;
}

const DEFAULT_FOCAL_POINT: RingFocalPoint = { x: 50, y: 50 };
const MAX_TAGS = 32;
const MAX_TAG_LENGTH = 40;

function cleanText(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim().slice(0, maxLength);
	return trimmed || undefined;
}

function cleanTags(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	for (const raw of value) {
		if (typeof raw !== 'string') continue;
		const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
		if (tag) seen.add(tag);
		if (seen.size >= MAX_TAGS) break;
	}
	return [...seen];
}

function cleanFocalPoint(value: unknown): RingFocalPoint {
	if (!value || typeof value !== 'object') return { ...DEFAULT_FOCAL_POINT };
	const point = value as Partial<RingFocalPoint>;
	const clamp = (n: unknown, fallback: number) =>
		typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
	return { x: clamp(point.x, 50), y: clamp(point.y, 50) };
}

function cleanFeeds(value: unknown, resolve: (url: string) => string): RingFeed[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const feeds: RingFeed[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		if (!raw || typeof raw !== 'object') continue;
		const candidate = raw as Partial<RingFeed>;
		const url = normalizeUrl(candidate.url);
		if (!url) continue;
		const resolved = resolve(url);
		if (seen.has(resolved)) continue;
		seen.add(resolved);
		feeds.push({
			type: cleanText(candidate.type, 40)?.toLowerCase() ?? 'rss',
			url: resolved,
			verified: candidate.verified === true
		});
	}
	return feeds;
}

/** Drops list items whose media URL is missing or unsafe, keeping the rest of the list. */
function cleanMediaList<T>(value: unknown, urlKey: string, maxItems: number): T[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items: T[] = [];
	for (const raw of value) {
		if (!raw || typeof raw !== 'object') continue;
		const record = raw as Record<string, unknown>;
		const url = normalizeUrl(record[urlKey]);
		if (!url) continue;
		items.push({ ...record, [urlKey]: url } as T);
		if (items.length >= maxItems) break;
	}
	return items;
}

/**
 * Fill in the optionals, canonicalize every URL, and leave unknown fields exactly as found.
 *
 * Callers can then read `entry.tags` or `entry.thumb_position` without a guard at every use
 * site, which is the whole point: the checks live here once instead of in every component.
 */
export function normalize(entry: RingEntry, options: NormalizeOptions = {}): RingEntry {
	const resolve = (url: string) => options.resolveUrl?.(url) ?? url;
	const sourceUrl = normalizeUrl(entry.source_url);

	const normalized: RingEntry = {
		...entry,
		id: String(entry.id),
		creator: cleanText(entry.creator, 100) ?? String(entry.id),
		type: cleanText(entry.type, 40)?.toLowerCase() ?? 'text',
		source_url: sourceUrl ? resolve(sourceUrl) : '',
		tags: cleanTags(entry.tags),
		thumb_position: cleanFocalPoint(entry.thumb_position),
		explicit: entry.explicit === true,
		discoverable: entry.discoverable !== false
	};

	const why = cleanText(entry.why, 200);
	if (why) normalized.why = why;
	else delete normalized.why;

	const form = cleanText(entry.form, 40)?.toLowerCase();
	if (form) normalized.form = form;
	else delete normalized.form;

	const tracks = cleanMediaList<RingTrack>(entry.tracks, 'media_url', 12);
	if (tracks?.length) normalized.tracks = tracks;
	else delete normalized.tracks;

	const pages = cleanMediaList<RingPage>(entry.pages, 'image_url', 12);
	if (pages?.length) normalized.pages = pages;
	else delete normalized.pages;

	const artworks = cleanMediaList<RingArtwork>(entry.artworks, 'image_url', 12);
	if (artworks?.length) normalized.artworks = artworks;
	else delete normalized.artworks;

	const feeds = cleanFeeds(entry.feeds, resolve);
	if (feeds?.length) normalized.feeds = feeds;
	else delete normalized.feeds;

	for (const key of ['thumb_url', 'preview_url', 'trailer_url'] as const) {
		const url = normalizeUrl(entry[key]);
		if (url) normalized[key] = url;
		else delete normalized[key];
	}

	return normalized;
}

/**
 * The image Discover paints behind a member.
 *
 * `thumb_url` is optional for every type except game, so comics and art fall back to their
 * first page or artwork, matching how the ring's own schema describes them. A null answer
 * means the caller draws its deterministic color wash instead.
 */
export function heroImage(entry: RingEntry): string | null {
	if (entry.thumb_url) return entry.thumb_url;
	const page = entry.pages?.[0]?.image_url;
	if (page) return page;
	const artwork = entry.artworks?.[0]?.image_url;
	if (artwork) return artwork;
	return null;
}
