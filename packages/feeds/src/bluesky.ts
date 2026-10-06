import { safeUrl } from '@yipden/ring-client';
import type { FeedHttp } from './http.js';
import type { MediaAttachment, ParsedFeed } from './types.js';

/**
 * Bluesky's own RSS (`bsky.app/profile/<handle>/rss`) is text only: a photo post arrives as its
 * words, and a quote or link as "[contains quote post or other embedded content]". The same
 * posts, with their pictures, are on Bluesky's public AppView, which needs no account. So after
 * the RSS is read, the author's recent posts are read there too, and each post's picture is
 * attached to the RSS item with the same `at://` id.
 *
 * The RSS stays the feed: its ids, its follow, its dates. This only adds pictures, and when the
 * AppView cannot be reached the RSS is shown as it always was.
 */

const RSS_PATH = /^\/profile\/([^/]+)\/rss\/?$/;
const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
/** Labels Bluesky's own moderation puts on adult or graphic media. */
const SENSITIVE_LABELS = new Set(['porn', 'sexual', 'nudity', 'graphic-media', 'gore']);

/** The handle or DID a Bluesky RSS address is for, or null for any other address. */
export function blueskyActor(feedUrl: string): string | null {
	const url = safeUrl(feedUrl);
	if (!url || url.hostname.toLowerCase() !== 'bsky.app') return null;
	const actor = url.pathname.match(RSS_PATH)?.[1];
	return actor ? decodeURIComponent(actor) : null;
}

interface PostPictures {
	media: MediaAttachment[];
	sensitive: boolean;
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim().slice(0, 1_000) : undefined;

function image(url: unknown, alt?: unknown): MediaAttachment | null {
	const safe = typeof url === 'string' ? safeUrl(url) : null;
	if (!safe) return null;
	const description = text(alt);
	return { url: safe.toString(), kind: 'image', ...(description ? { alt: description } : {}) };
}

/** The pictures one embed shows: its images, a video's still, or a link card's thumbnail. */
function picturesOf(embed: Json | null): MediaAttachment[] {
	if (!embed) return [];
	const type = text(embed.$type) ?? '';
	if (type.startsWith('app.bsky.embed.images')) {
		const images = Array.isArray(embed.images) ? embed.images : [];
		return images
			.slice(0, 4)
			.map((entry) => {
				const one = record(entry);
				return one ? image(one.fullsize ?? one.thumb, one.alt) : null;
			})
			.filter((entry): entry is MediaAttachment => entry !== null);
	}
	if (type.startsWith('app.bsky.embed.recordWithMedia')) return picturesOf(record(embed.media));
	if (type.startsWith('app.bsky.embed.video')) {
		const still = image(embed.thumbnail, embed.alt);
		return still ? [still] : [];
	}
	if (type.startsWith('app.bsky.embed.external')) {
		const external = record(embed.external);
		const thumb = external ? image(external.thumb, external.title) : null;
		return thumb ? [thumb] : [];
	}
	return [];
}

/** Each post's pictures, by its `at://` id, from a getAuthorFeed response. */
export function picturesByPost(body: unknown): Map<string, PostPictures> {
	const out = new Map<string, PostPictures>();
	const feed = record(body)?.feed;
	if (!Array.isArray(feed)) return out;
	for (const entry of feed.slice(0, 100)) {
		const post = record(record(entry)?.post);
		const uri = text(post?.uri);
		if (!post || !uri?.startsWith('at://')) continue;
		const media = picturesOf(record(post.embed));
		if (!media.length) continue;
		const labels = Array.isArray(post.labels) ? post.labels : [];
		const sensitive = labels.some((label) => SENSITIVE_LABELS.has(text(record(label)?.val) ?? ''));
		out.set(uri, { media, sensitive });
	}
	return out;
}

/**
 * Attach Bluesky's pictures to a Bluesky RSS feed's items, in place. Any failure leaves the feed
 * exactly as parsed.
 */
export async function addBlueskyPictures(
	feed: ParsedFeed,
	feedUrl: string,
	http: FeedHttp
): Promise<void> {
	const actor = blueskyActor(feedUrl);
	if (!actor || !feed.items.length) return;
	let pictures: Map<string, PostPictures>;
	try {
		const params = new URLSearchParams({ actor, limit: '50', filter: 'posts_no_replies' });
		const response = await http.get(`${API}?${params}`, { accept: 'application/json' });
		pictures = picturesByPost(JSON.parse(response.body));
	} catch {
		return;
	}
	for (const item of feed.items) {
		const found = item.entryId ? pictures.get(item.entryId) : undefined;
		if (!found) continue;
		const known = new Set(item.media.map((media) => media.url));
		item.media = [...found.media.filter((media) => !known.has(media.url)), ...item.media];
		if (found.sensitive) item.sensitive = true;
	}
}
