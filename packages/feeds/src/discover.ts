import { safeUrl } from '@yipden/ring-client';
import { FeedHttp, type FeedHttpOptions, type FetchLike } from './http.js';
import { isFeedLink, linksBackTo, scanPage, type ScannedPage } from './html.js';
import { parseFeed } from './parse/index.js';
import { channelIdFromPage, FALLBACK_PATHS, resolveProfile } from './profiles.js';
import { feedKindFromUrl } from './kind.js';
import { sameUrl } from './urls.js';
import type { DiscoveredFeed, DiscoveryResult } from './types.js';

/**
 * Find everything one person publishes, starting from one URL.
 *
 * The order is the order the brief lays out, and it is an order of decreasing confidence:
 * a page that announces its own feed is telling the truth about itself, a documented platform
 * pattern is reliable, and a guessed path is a guess. Results come back as a list the reader
 * toggles, never as a silent mass follow, because following is a decision a person makes about
 * another person.
 */

export interface DiscoverOptions extends FeedHttpOptions {
	http?: FeedHttp;
	fetch?: FetchLike;
	/**
	 * Check that a profile links back to the site, a two way rel=me. Costs one request per
	 * profile, and is the only thing that can honestly mark a feed verified.
	 */
	verifyBacklinks?: boolean;
	/** How many fallback paths to try when a site announces nothing. */
	maxProbes?: number;
	maxProfiles?: number;
}

const DEFAULT_MAX_PROBES = 5;
const DEFAULT_MAX_PROFILES = 8;

function titleFromUrl(url: string): string {
	const parsed = safeUrl(url);
	if (!parsed) return 'Feed';
	return parsed.hostname.replace(/^www\./, '');
}

function addFeed(feeds: DiscoveredFeed[], candidate: DiscoveredFeed): void {
	if (feeds.some((feed) => sameUrl(feed.url, candidate.url))) return;
	feeds.push(candidate);
}

/** Try a URL as a feed document. Returns its title when it parses, null when it does not. */
async function tryFeed(
	http: FeedHttp,
	url: string
): Promise<{ url: string; title: string } | null> {
	try {
		const response = await http.get(url);
		if (!response.body.trim()) return null;
		const feed = parseFeed(response.body, {
			feedUrl: response.url,
			contentType: response.contentType,
			maxItems: 1
		});
		return { url: response.url, title: feed.title };
	} catch {
		return null;
	}
}

async function resolveNeedsPage(
	http: FeedHttp,
	url: string,
	kind: string
): Promise<{ feedUrl: string; label: string } | null> {
	try {
		const response = await http.get(url, { accept: 'text/html' });

		if (kind === 'youtube') {
			const channelId = channelIdFromPage(response.body);
			if (!channelId) return null;
			return {
				feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
				label: 'YouTube'
			};
		}

		// PeerTube and anything else that announces its own feed on the page.
		const page = scanPage(response.body, response.url);
		const alternate = page.alternates.find(isFeedLink);
		if (!alternate) return null;
		return { feedUrl: alternate.href, label: alternate.title || titleFromUrl(alternate.href) };
	} catch {
		return null;
	}
}

async function verifyBacklink(http: FeedHttp, profileUrl: string, site: string): Promise<boolean> {
	try {
		const response = await http.get(profileUrl, { accept: 'text/html' });
		return linksBackTo(scanPage(response.body, response.url), site);
	} catch {
		return false;
	}
}

export async function discoverFeeds(
	input: string,
	options: DiscoverOptions = {}
): Promise<DiscoveryResult> {
	const target = safeUrl(input);
	if (!target) throw new Error('that does not look like an https address');

	const {
		http = new FeedHttp(options),
		verifyBacklinks = true,
		maxProbes = DEFAULT_MAX_PROBES,
		maxProfiles = DEFAULT_MAX_PROFILES
	} = options;

	const feeds: DiscoveredFeed[] = [];
	const unresolved: DiscoveryResult['unresolved'] = [];

	const response = await http.get(target.toString());
	// The address it actually resolved to is the one that matters from here on. A person behind
	// a redirect is still one person, and following them twice would be the bug.
	const canonicalUrl = response.url;

	// The pasted URL may be the feed itself, which is the whole answer.
	try {
		const feed = parseFeed(response.body, {
			feedUrl: canonicalUrl,
			contentType: response.contentType,
			maxItems: 1
		});
		return {
			canonicalUrl,
			title: feed.title,
			iconUrl: feed.iconUrl,
			feeds: [
				{
					url: canonicalUrl,
					kind: feed.kind,
					title: feed.title,
					via: 'direct',
					verified: false
				}
			],
			unresolved
		};
	} catch {
		// Not a feed. It is a page, and pages are where the rest of this happens.
	}

	const page: ScannedPage = scanPage(response.body, canonicalUrl);

	for (const link of page.alternates.filter(isFeedLink)) {
		addFeed(feeds, {
			url: link.href,
			kind: feedKindFromUrl(link.href),
			title: link.title || page.title || titleFromUrl(link.href),
			via: 'alternate-link',
			verified: false
		});
	}

	// Profiles: rel=me first, since that is the person saying "this is also me", then any other
	// outbound link that matches a platform pattern.
	const candidates = [...page.relMe, ...page.links].slice(0, maxProfiles * 4);
	const declared = new Set(page.relMe.map((url) => url.toLowerCase()));
	let profilesSeen = 0;

	for (const candidate of candidates) {
		if (profilesSeen >= maxProfiles) break;
		if (sameUrl(candidate, canonicalUrl)) continue;

		const resolution = resolveProfile(candidate);
		if (resolution.status === 'unknown') continue;
		profilesSeen += 1;

		if (resolution.status === 'needs-page') {
			const resolved = await resolveNeedsPage(http, resolution.url, resolution.kind);
			if (!resolved) {
				unresolved.push({ url: candidate, reason: resolution.reason });
				continue;
			}
			addFeed(feeds, {
				url: resolved.feedUrl,
				kind: resolution.kind,
				title: resolved.label,
				via: 'known-pattern',
				verified:
					declared.has(candidate.toLowerCase()) &&
					verifyBacklinks &&
					(await verifyBacklink(http, candidate, canonicalUrl))
			});
			continue;
		}

		const { match } = resolution;
		addFeed(feeds, {
			url: match.feedUrl,
			kind: match.kind,
			title: match.label,
			via: 'known-pattern',
			verified:
				declared.has(candidate.toLowerCase()) &&
				verifyBacklinks &&
				(await verifyBacklink(http, candidate, canonicalUrl))
		});
	}

	// Only guess when the site said nothing at all. Probing a site that already announced its
	// feed would be spending someone else's bandwidth to learn what they already told us.
	if (!feeds.length) {
		for (const path of FALLBACK_PATHS.slice(0, maxProbes)) {
			const found = await tryFeed(http, new URL(path, canonicalUrl).toString());
			if (!found) continue;
			addFeed(feeds, {
				url: found.url,
				kind: feedKindFromUrl(found.url),
				title: found.title || page.title || titleFromUrl(found.url),
				via: 'fallback-path',
				verified: false
			});
			break;
		}
	}

	return {
		canonicalUrl,
		title: page.cardName ?? page.title,
		iconUrl: page.iconUrl,
		feeds,
		unresolved
	};
}
