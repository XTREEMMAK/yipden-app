/**
 * One normalized shape for everything a followed feed produces.
 *
 * RSS 2.0, Atom and JSON Feed disagree about almost every field name and agree about almost
 * every concept. This is where that ends: parsers return `Item`, and nothing downstream of
 * them knows or cares which format it came from. An `Item` is what the UI layer calls a yip.
 */

/** Feed formats this package can parse. */
export type FeedFormat = 'rss' | 'atom' | 'jsonfeed';

/**
 * Where a feed comes from, which is a different question from what format it is in.
 * Bluesky and Mastodon both serve RSS; the reader still labels them differently.
 */
export type FeedKind =
	'blog' | 'bluesky' | 'mastodon' | 'youtube' | 'peertube' | 'podcast' | 'forum';

export type MediaKind = 'audio' | 'video' | 'image';

export interface MediaAttachment {
	url: string;
	kind: MediaKind;
	mimeType?: string;
	/** Bytes, as the feed declared them. Not to be trusted, only displayed. */
	sizeBytes?: number;
	/** Seconds. */
	durationSeconds?: number;
	title?: string;
	/** A creator-supplied description of visual media. */
	alt?: string;
	/** The source marked this individual attachment as sensitive. */
	sensitive?: boolean;
}

export interface Item {
	/** Stable within a feed: the feed's own guid or id when it has one, else the URL. */
	id: string;
	title: string;
	/** Where the yip can be opened. Always https, always checked. */
	url: string;
	/** An explicitly declared canonical URL, when it differs from or confirms `url`. */
	canonicalUrl?: string;
	/** Other published copies declared by the creator. Used for syndication grouping later. */
	syndicationUrls?: string[];
	author?: string;
	/** ISO 8601. Null when the feed gave no usable date, which the UI sorts to the end. */
	publishedAt: string | null;
	/** Plain text, entity decoded and collapsed. This is what v0.9 renders. */
	summary: string;
	/** Sanitized HTML, kept for a later reader view. Never raw feed markup. */
	contentHtml: string | null;
	/** Creator-supplied content warning text, without the hidden body. */
	contentWarning?: string;
	/** The source marked the item or one of its attachments as sensitive. */
	sensitive?: boolean;
	replyToUrl?: string;
	repostOfUrl?: string;
	likeOfUrl?: string;
	bookmarkOfUrl?: string;
	media: MediaAttachment[];
	sourceFeedId: string;
}

export interface ParsedFeed {
	/** Stable id for the feed itself: its canonical URL after redirects. */
	id: string;
	title: string;
	/** The feed's own home page, not the feed document. */
	siteUrl: string | null;
	description: string;
	iconUrl: string | null;
	format: FeedFormat;
	kind: FeedKind;
	items: Item[];
}

/** A feed found behind a URL, before the reader has chosen whether to follow it. */
export interface DiscoveredFeed {
	url: string;
	kind: FeedKind;
	/** What to show in the list: the feed's own title, or a name derived from the URL. */
	title: string;
	/** How this was found, so the UI can explain itself. */
	via: 'alternate-link' | 'rel-me' | 'known-pattern' | 'fallback-path' | 'direct';
	/** The profile links back to the site it was discovered from: a two way rel=me. */
	verified: boolean;
}

export interface DiscoveryResult {
	/** The address the page actually resolved to, after redirects. */
	canonicalUrl: string;
	/** The person's name, from the page title or an h-card, when one was found. */
	title: string | null;
	iconUrl: string | null;
	feeds: DiscoveredFeed[];
	/** Links that looked like a profile but produced no feed, so the UI can say so. */
	unresolved: Array<{ url: string; reason: string }>;
}
