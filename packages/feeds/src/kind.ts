import { safeUrl } from '@yipden/ring-client';
import type { FeedKind, Item, MediaKind } from './types.js';

/**
 * What kind of thing a feed is, which is a different question from what format it is in.
 *
 * Bluesky, Mastodon and most blogs all serve RSS. The reader still shows a different chip for
 * each, because "where did this come from" is the question a person actually has when a yip
 * appears in Feeds. The answer is guessed from the URL first and corrected after parsing.
 */

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

export function feedKindFromUrl(url: string): FeedKind {
	const parsed = safeUrl(url);
	if (!parsed) return 'blog';

	const host = parsed.hostname.toLowerCase();
	const path = parsed.pathname.toLowerCase();

	if (host === 'bsky.app' || host.endsWith('.bsky.app')) return 'bluesky';
	if (YOUTUBE_HOSTS.has(host) && path.startsWith('/feeds/videos.xml')) return 'youtube';

	// Mastodon serves a user's feed at /@handle.rss, a shape no blog engine produces.
	if (/\/@[^/]+\.rss$/.test(path)) return 'mastodon';

	// PeerTube reuses YouTube's path on its own instances.
	if (path.startsWith('/feeds/videos.xml')) return 'peertube';

	// Discourse: a category or the front page, always ending .rss.
	if (path.endsWith('.rss') && (path.startsWith('/c/') || path.startsWith('/latest'))) {
		return 'forum';
	}

	return 'blog';
}

/**
 * Correct the guess once the items are in hand.
 *
 * A feed whose items carry audio enclosures is a podcast whatever its URL looked like, and
 * that is the distinction Feeds' Listen filter is built on. Only an unrefined `blog` guess is
 * overridden: a Bluesky feed that happens to link an mp3 is still Bluesky.
 */
export function refineKind(kind: FeedKind, items: Item[]): FeedKind {
	if (kind !== 'blog' || !items.length) return kind;

	const withAudio = items.filter((item) =>
		item.media.some((media) => media.kind === 'audio')
	).length;
	return withAudio >= Math.max(2, items.length / 2) ? 'podcast' : kind;
}

/** What a media attachment is, from its declared type and then from its extension. */
export function mediaKindFor(mimeType: string | undefined, url: string): MediaKind | null {
	const type = mimeType?.toLowerCase().trim() ?? '';
	if (type.startsWith('audio/')) return 'audio';
	if (type.startsWith('video/')) return 'video';
	if (type.startsWith('image/')) return 'image';

	const path = safeUrl(url)?.pathname.toLowerCase() ?? '';
	if (/\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)$/.test(path)) return 'audio';
	if (/\.(mp4|m4v|webm|mov|mkv)$/.test(path)) return 'video';
	if (/\.(jpg|jpeg|png|gif|webp|avif|svg)$/.test(path)) return 'image';

	return null;
}
