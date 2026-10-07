import type { SiteLayout } from '@yipden/ring-client';

/**
 * The sites index: places on the web, listed by their own document and never by the ring.
 *
 * A site is a place, not a person. The ring lists people; this lists sites. The same human can be
 * both, and the two are linked only by evidence, never merged. See docs/sites-contract.md.
 */

/** Categories the index uses today. Unknown values are kept, shown after these. */
export const SITE_CATEGORIES = [
	'shrines',
	'fandom',
	'personal',
	'blogs',
	'webrings',
	'resources'
] as const;
export type KnownSiteCategory = (typeof SITE_CATEGORIES)[number];

export interface SiteFeed {
	/** Free text, like the ring's `feeds[].type`. */
	type: string;
	url: string;
}

export interface SiteEntry {
	id: string;
	url: string;
	title: string;
	category: string;
	tags: string[];
	blurb?: string;
	/** A still, shown first and always. */
	poster_url?: string;
	/** A short muted scroll clip, played only while its card is on screen. */
	preview_url?: string;
	feeds?: SiteFeed[];
	/** Only a recognized value survives; absent is mobile friendly. */
	layout?: SiteLayout;
	explicit: boolean;
	added_at?: string;
	/** Fields a newer index emits that this client does not model yet. */
	[unknownField: string]: unknown;
}

export interface SitesDocument {
	version: string;
	generated_at?: string;
	entries: SiteEntry[];
	[unknownField: string]: unknown;
}

export interface SitesValidation {
	document: SitesDocument;
	/** One line per refused entry, or for the document itself (`index: -1`). */
	dropped: Array<{ index: number; id: string | null; reason: string }>;
}
