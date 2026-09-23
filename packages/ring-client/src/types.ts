/**
 * Shape of the IndieNodes ring document and its entries.
 *
 * The contract is additive only: unknown fields are carried through untouched so a client
 * built today never destroys data a newer ring emits. That is why entries keep an index
 * signature rather than a closed set of keys.
 */

/** Types the ring emits today. Unknown values are kept, never dropped. */
export const KNOWN_TYPES = ['audio', 'comic', 'text', 'game', 'art'] as const;
export type KnownType = (typeof KNOWN_TYPES)[number];

/** Audio entries declare whether they are music or spoken word. */
export const KNOWN_FORMS = ['music', 'spoken'] as const;
export type KnownForm = (typeof KNOWN_FORMS)[number];

/** Feed kinds the reader knows how to label. Anything else renders as a generic feed. */
export const KNOWN_FEED_TYPES = [
	'rss',
	'atom',
	'jsonfeed',
	'bluesky',
	'mastodon',
	'youtube',
	'podcast'
] as const;
export type KnownFeedType = (typeof KNOWN_FEED_TYPES)[number];

export interface RingTrack {
	label: string;
	media_url: string;
}

export interface RingPage {
	image_url: string;
	caption?: string;
}

export interface RingArtwork {
	image_url: string;
	alt?: string;
	year?: string;
	medium?: string;
}

export interface RingExcerpt {
	text: string;
	title?: string;
	media_url?: string;
}

export interface RingFocalPoint {
	x: number;
	y: number;
}

/**
 * A feed the creator publishes on. Additive field: the ring does not emit it yet, so a reader
 * that finds it absent falls back to discovery against `source_url`.
 */
export interface RingFeed {
	type: string;
	url: string;
	verified?: boolean;
}

export interface RingEntry {
	id: string;
	creator: string;
	type: string;
	source_url: string;
	why?: string;
	tags?: string[];
	form?: string;
	creator_id?: string;
	tracks?: RingTrack[];
	pages?: RingPage[];
	artworks?: RingArtwork[];
	excerpts?: RingExcerpt[];
	feeds?: RingFeed[];
	thumb_url?: string;
	thumb_position?: RingFocalPoint;
	preview_url?: string;
	trailer_url?: string;
	explicit?: boolean;
	discoverable?: boolean;
	verification_token?: string;
	joined_at?: string;
	updated_at?: string;
	_placeholder?: boolean;
	/** Fields a newer ring emits that this client does not model yet. */
	[unknownField: string]: unknown;
}

export interface RingDocument {
	version: string;
	entries: RingEntry[];
	/** Additive: when the ring published this document. */
	generated_at?: string;
	[unknownField: string]: unknown;
}

/** One entry the validator refused, with the reason, so a client can report rather than guess. */
export interface DroppedEntry {
	index: number;
	id: string | null;
	reason: string;
}

export interface ValidationResult {
	document: RingDocument;
	dropped: DroppedEntry[];
	/** Field-level repairs: a bad thumb_url removed, a non-https track dropped, and so on. */
	repaired: DroppedEntry[];
}
