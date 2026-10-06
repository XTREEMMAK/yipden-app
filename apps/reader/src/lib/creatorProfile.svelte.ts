import { goto } from '$app/navigation';
import { FeedHttp, resolveProfile, scanPage } from '@yipden/feeds';
import { safeUrl, type SiteLayout } from '@yipden/ring-client';
import { httpFetch } from './platform/http.js';
import type { RingOrigin } from './references/types.js';
import { verdictKey } from './verdicts.svelte.js';

/**
 * A creator's profile: one screen for everything YipDen knows about someone, assembled from
 * what is already kept (their follow and feeds, Liked and Not Liked, the Library, layout, the
 * ring's entry) plus their own site, read once when the profile opens. Nothing new is stored:
 * this is the view the Creator Database's local record will later back (2026-10-06).
 *
 * Keyed like everything else per creator, by `verdictKey` of their site.
 */

/**
 * What the screen that opened a profile knew about the creator: a Discover entry or a partner
 * ring member that may be followed nowhere and kept nowhere. Remembered for the session only.
 */
export interface CreatorHint {
	url: string;
	name: string;
	artUrl?: string | null;
	ring?: RingOrigin | null;
	/** The partner ring's own words about them, with the ring's name to credit it. */
	blurb?: string;
	ringName?: string;
	layout?: SiteLayout;
}

/** What their own site says about them. */
export interface SiteFacts {
	name: string | null;
	/** Their bio, and where it came from: an h-card note is their own words about themselves. */
	bio: { text: string; from: 'h-card' | 'site' } | null;
	photoUrl: string | null;
	iconUrl: string | null;
	/** The places their site says are also them (`rel=me`, h-card `u-url`, JSON-LD `sameAs`). */
	places: Place[];
}

/** Somewhere a creator is, as their site links it. */
export interface Place {
	url: string;
	/** A platform's name, or the place's host. */
	label: string;
	/** The `FeedKind` a known platform resolves to, for its color; absent for anything else. */
	kind?: string;
}

/** Where a profile lives. */
export function profileHref(url: string): string {
	return `/creator/?site=${encodeURIComponent(url)}`;
}

const PLATFORM_HOSTS: Record<string, string> = {
	'bsky.app': 'Bluesky',
	'instagram.com': 'Instagram',
	'tiktok.com': 'TikTok',
	'x.com': 'X',
	'twitter.com': 'X',
	'youtube.com': 'YouTube',
	'twitch.tv': 'Twitch',
	'soundcloud.com': 'SoundCloud',
	'bandcamp.com': 'Bandcamp',
	'spotify.com': 'Spotify',
	'patreon.com': 'Patreon',
	'ko-fi.com': 'Ko-fi',
	'etsy.com': 'Etsy',
	'itch.io': 'itch.io',
	'github.com': 'GitHub',
	'tumblr.com': 'Tumblr',
	'neocities.org': 'Neocities',
	'linktr.ee': 'Linktree',
	'cara.app': 'Cara',
	'artstation.com': 'ArtStation',
	'deviantart.com': 'DeviantArt'
};

const KIND_NAMES: Record<string, string> = {
	bluesky: 'Bluesky',
	mastodon: 'Mastodon',
	youtube: 'YouTube',
	peertube: 'PeerTube'
};

/** A name for a place: its platform when known, else its host. */
export function placeLabel(url: string): Pick<Place, 'label' | 'kind'> {
	const resolved = resolveProfile(url);
	const kind =
		resolved.status === 'resolved'
			? resolved.match.kind
			: resolved.status === 'needs-page'
				? resolved.kind
				: undefined;
	let host = '';
	try {
		host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return { label: url };
	}
	const platform = Object.entries(PLATFORM_HOSTS).find(
		([name]) => host === name || host.endsWith(`.${name}`)
	)?.[1];
	const label = (kind && KIND_NAMES[kind]) ?? platform ?? host;
	return kind && kind !== 'blog' ? { label, kind } : { label };
}

/** The places a site links as its own, labelled, without the site itself or repeats. */
export function placesFrom(relMe: readonly string[], siteUrl: string): Place[] {
	const own = verdictKey(siteUrl);
	const seen = new Set<string>([own]);
	const places: Place[] = [];
	for (const raw of relMe) {
		const url = safeUrl(raw)?.toString();
		if (!url) continue;
		const key = verdictKey(url);
		if (seen.has(key)) continue;
		seen.add(key);
		places.push({ url, ...placeLabel(url) });
		if (places.length >= 24) break;
	}
	return places;
}

class CreatorProfiles {
	private hints = new Map<string, CreatorHint>();
	/** Their sites' answers, this session: a fact sheet, null when it could not be read. */
	facts = $state<Map<string, SiteFacts | null>>(new Map());
	private reading = new Map<string, Promise<SiteFacts | null>>();
	private http: FeedHttp | null = null;

	/** Open someone's profile, remembering what the screen opening it knew about them. */
	open(hint: CreatorHint): void {
		const url = safeUrl(hint.url)?.toString();
		if (!url) return;
		this.hints.set(verdictKey(url), { ...hint, url });
		void goto(profileHref(url));
	}

	hintFor(url: string): CreatorHint | null {
		return this.hints.get(verdictKey(url)) ?? null;
	}

	/**
	 * Read their site once this session: its h-card, description, picture and `rel=me` links.
	 * Robots rules are honoured by `FeedHttp`, the same polite client discovery uses.
	 */
	read(url: string): Promise<SiteFacts | null> {
		const key = verdictKey(url);
		let pending = this.reading.get(key);
		if (!pending) {
			pending = this.fetchFacts(url).then((facts) => {
				this.facts = new Map(this.facts).set(key, facts);
				return facts;
			});
			this.reading.set(key, pending);
		}
		return pending;
	}

	factsFor(url: string): SiteFacts | null | undefined {
		return this.facts.get(verdictKey(url));
	}

	private async fetchFacts(url: string): Promise<SiteFacts | null> {
		const target = safeUrl(url);
		if (!target) return null;
		this.http ??= new FeedHttp({ fetch: httpFetch });
		try {
			const response = await this.http.get(target.toString(), {
				accept: 'text/html,application/xhtml+xml;q=0.9'
			});
			const page = scanPage(response.body, response.url);
			const bio = page.cardNote
				? { text: page.cardNote, from: 'h-card' as const }
				: page.description
					? { text: page.description, from: 'site' as const }
					: null;
			return {
				name: page.cardName ?? page.title,
				bio,
				photoUrl: page.photoUrl,
				iconUrl: page.iconUrl,
				places: placesFrom(page.relMe, response.url)
			};
		} catch {
			return null;
		}
	}
}

export const creatorProfiles = new CreatorProfiles();
