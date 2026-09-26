import { safeUrl } from '@yipden/ring-client';
import type { FeedKind } from './types.js';

/**
 * Known profile to feed patterns.
 *
 * A person's Bluesky profile is a page, not a feed, but Bluesky publishes a feed at a
 * predictable address beside it. The same is true of Mastodon, YouTube, PeerTube and
 * Discourse. Knowing these five saves the reader from pasting five URLs, and they are the
 * platforms the indie web actually uses.
 *
 * Nothing here guesses beyond a documented pattern. A profile that does not match one comes
 * back unresolved with a reason, and the person is asked, rather than the reader inventing an
 * address and reporting a dead feed later.
 */

export interface ProfileMatch {
	feedUrl: string;
	kind: FeedKind;
	/** Shown in the list of found feeds. */
	label: string;
}

export type UnresolvedProfile = { url: string; reason: string };

export type ProfileResolution =
	| { status: 'resolved'; match: ProfileMatch }
	| { status: 'needs-page'; url: string; kind: FeedKind; reason: string }
	| { status: 'unknown' };

const MASTODON_PATH = /^\/@([A-Za-z0-9_]{1,30})\/?$/;
const BLUESKY_PATH = /^\/profile\/([^/]+)\/?$/;
const YOUTUBE_CHANNEL = /^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/;
const YOUTUBE_HANDLE = /^\/@([^/]{1,100})\/?$/;
const YOUTUBE_USER = /^\/(?:user|c)\/([A-Za-z0-9._-]{1,50})\/?$/;
const YOUTUBE_LEGACY_CUSTOM = /^\/([A-Za-z0-9._-]{1,100})\/?$/;
const YOUTUBE_RESERVED_PATHS = new Set([
	'about',
	'account',
	'ads',
	'creators',
	'embed',
	'feed',
	'gaming',
	'howyoutubeworks',
	'live',
	'logout',
	'music',
	'playlist',
	'premium',
	'results',
	'shorts',
	'signin',
	't',
	'trending',
	'upload',
	'watch'
]);

/**
 * Turn a profile URL into a feed URL where the pattern is documented and stable.
 *
 * A YouTube handle is the one case that cannot be answered from the URL alone: the feed is
 * keyed by channel id, and only the channel page knows which id a handle belongs to. That
 * returns `needs-page` so the caller can fetch it, and failing that, ask.
 */
export function resolveProfile(url: string): ProfileResolution {
	const parsed = safeUrl(url);
	if (!parsed) return { status: 'unknown' };

	const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
	const path = parsed.pathname;

	if (host === 'bsky.app') {
		const handle = path.match(BLUESKY_PATH)?.[1];
		if (handle) {
			return {
				status: 'resolved',
				match: {
					feedUrl: `https://bsky.app/profile/${handle}/rss`,
					kind: 'bluesky',
					label: `Bluesky, ${handle}`
				}
			};
		}
		return { status: 'unknown' };
	}

	if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
		const channelId = path.match(YOUTUBE_CHANNEL)?.[1];
		if (channelId) {
			return {
				status: 'resolved',
				match: {
					feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
					kind: 'youtube',
					label: 'YouTube'
				}
			};
		}
		const legacy = path.match(YOUTUBE_LEGACY_CUSTOM)?.[1]?.toLowerCase();
		if (
			YOUTUBE_HANDLE.test(path) ||
			YOUTUBE_USER.test(path) ||
			(legacy && !YOUTUBE_RESERVED_PATHS.has(legacy))
		) {
			return {
				status: 'needs-page',
				url: parsed.toString(),
				kind: 'youtube',
				reason: 'YouTube keys its feed by channel id, which only the channel page knows'
			};
		}
		return { status: 'unknown' };
	}

	// Mastodon and the wider fediverse: any instance, always /@handle.
	const mastodonHandle = path.match(MASTODON_PATH)?.[1];
	if (mastodonHandle) {
		return {
			status: 'resolved',
			match: {
				feedUrl: `https://${parsed.hostname}/@${mastodonHandle}.rss`,
				kind: 'mastodon',
				label: `Mastodon, @${mastodonHandle}@${host}`
			}
		};
	}

	// PeerTube channels and accounts, which serve Media RSS at a documented path.
	const peertube = path.match(/^\/(?:c|a|video-channels|accounts)\/([^/]+)\/?$/)?.[1];
	if (peertube) {
		return {
			status: 'needs-page',
			url: parsed.toString(),
			kind: 'peertube',
			reason: 'PeerTube feeds are per instance and announced on the page itself'
		};
	}

	// Discourse forums publish RSS beside any topic list by appending .rss.
	if (/^\/(?:c\/[^?]+|latest|top|categories)\/?$/.test(path)) {
		const clean = path.replace(/\/$/, '');
		return {
			status: 'resolved',
			match: {
				feedUrl: `${parsed.origin}${clean}.rss`,
				kind: 'forum',
				label: `Forum, ${host}`
			}
		};
	}

	return { status: 'unknown' };
}

/** Paths to try when a site announces no feed at all. In the order they are worth trying. */
export const FALLBACK_PATHS = [
	'/feed',
	'/feed.xml',
	'/rss.xml',
	'/atom.xml',
	'/index.xml',
	'/feed.json',
	'/feed/',
	'/rss'
] as const;

/**
 * Find a YouTube channel id in a channel page.
 *
 * YouTube does not offer this as an API a reader can call without a key, and the id is present
 * in the page in two stable forms. Both are checked; neither is guessed at.
 */
export function channelIdFromPage(html: string): string | null {
	for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
		const tag = match[0];
		if (!/\brel=["']canonical["']/i.test(tag)) continue;
		const href = tag.match(/\bhref=["']https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})["']/i);
		if (href?.[1]) return href[1];
	}

	// externalId identifies the page's channel. A generic channelId can belong to one of the
	// many recommended channels embedded in the same document, so it is only the last fallback.
	const external = html.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/);
	if (external?.[1]) return external[1];
	return html.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/)?.[1] ?? null;
}
