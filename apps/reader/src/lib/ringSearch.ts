import {
	feedKindFromUrl,
	type DiscoveredFeed,
	type DiscoveryResult,
	type FeedKind
} from '@yipden/feeds';
import { heroImage, type RingEntry } from '@yipden/ring-client';

const KNOWN_KINDS = new Set<FeedKind>([
	'blog',
	'bluesky',
	'mastodon',
	'youtube',
	'peertube',
	'podcast',
	'forum'
]);

function normalized(value: string): string {
	return value
		.normalize('NFKD')
		.toLocaleLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/[^\p{L}\p{N}.@]+/gu, ' ')
		.trim();
}

function hostname(value: string): string {
	try {
		return new URL(value).hostname.replace(/^www\./, '').toLocaleLowerCase();
	} catch {
		return '';
	}
}

function searchable(entry: RingEntry): string[] {
	return [
		entry.creator,
		entry.id,
		entry.source_url,
		hostname(entry.source_url),
		...(entry.tags ?? []),
		...(entry.feeds ?? []).flatMap((feed) => [feed.url, hostname(feed.url)])
	]
		.map(normalized)
		.filter(Boolean);
}

function score(entry: RingEntry, query: string): number | null {
	const creator = normalized(entry.creator);
	const site = hostname(entry.source_url);
	const fields = searchable(entry);
	if (creator === query) return 0;
	if (site === query) return 1;
	if (creator.startsWith(query) || site.startsWith(query)) return 2;
	const words = query.split(/\s+/).filter(Boolean);
	if (words.every((word) => fields.some((field) => field.includes(word)))) return 3;
	if (fields.some((field) => field.includes(query))) return 4;
	return null;
}

/** Search only the Ring document already held on-device; this never contacts a creator site. */
export function searchRing(entries: RingEntry[], rawQuery: string, limit = 4): RingEntry[] {
	const query = normalized(rawQuery);
	if (query.length < 2) return [];
	return entries
		.map((entry, index) => ({ entry, index, score: score(entry, query) }))
		.filter(
			(candidate): candidate is { entry: RingEntry; index: number; score: number } =>
				candidate.score !== null
		)
		.sort((a, b) => a.score - b.score || a.index - b.index)
		.slice(0, limit)
		.map(({ entry }) => entry);
}

/** True when submitting the typed value can safely prefer a Ring record over a web lookup. */
export function isExactRingMatch(entry: RingEntry, rawQuery: string): boolean {
	const query = normalized(rawQuery);
	return (
		normalized(entry.creator) === query ||
		hostname(entry.source_url) === query ||
		normalized(entry.source_url) === query ||
		(entry.feeds ?? []).some(
			(feed) => hostname(feed.url) === query || normalized(feed.url) === query
		)
	);
}

function kindFor(type: string, url: string): FeedKind {
	const candidate = type.toLocaleLowerCase() as FeedKind;
	return KNOWN_KINDS.has(candidate) ? candidate : feedKindFromUrl(url);
}

/** Adapt trusted Ring metadata to Follow's existing choose-your-sources result model. */
export function discoveryFromRing(entry: RingEntry): DiscoveryResult {
	const seen = new Set<string>();
	const feeds: DiscoveredFeed[] = [];
	for (const feed of entry.feeds ?? []) {
		if (seen.has(feed.url)) continue;
		seen.add(feed.url);
		feeds.push({
			url: feed.url,
			kind: kindFor(feed.type, feed.url),
			title: entry.creator,
			via: 'known-pattern',
			verified: feed.verified === true
		});
	}
	return {
		canonicalUrl: entry.source_url,
		title: entry.creator,
		iconUrl: heroImage(entry),
		feeds,
		unresolved: []
	};
}
