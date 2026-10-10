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

/** How a site entered Surf. Basic listings never authorize YipDen-hosted captures. */
export interface SiteListing {
	level: 'basic' | 'owner-approved';
	approved_at?: string;
	/** The index publisher's page for claiming, correcting or removing this listing. */
	manage_url?: string;
}

/** Where a site is hosted. This is provenance, never the site's category. */
export interface SiteHosting {
	provider: string;
	/** The site's own page at its host, useful when it has a custom domain. */
	profile_url?: string;
}

/** A creator identity linked to a site only after the index publisher verifies the evidence. */
export interface SiteMaker {
	name: string;
	url: string;
	person_id?: string;
	evidence: string;
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
	/** Absent on old documents; treated as an owner-approved legacy listing. */
	listing?: SiteListing;
	hosting?: SiteHosting;
	makers?: SiteMaker[];
	/** Only a recognized value survives; absent is mobile friendly. */
	layout?: SiteLayout;
	explicit: boolean;
	added_at?: string;
	/**
	 * Forum index only: the software a forum runs (`discourse`, `smf`, `proboards`), which decides
	 * whether YipDen can follow it. Only `discourse` can be followed today.
	 */
	software?: string;
	/** Forum index only: why this forum can be visited but not followed, in a reader's words. */
	follow_note?: string;
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
