import { sha256Hex } from '@yipden/feeds';

/**
 * A reference: a pointer to something a creator published on their own site, kept by a reader
 * and attached to that creator. Never the thing itself. YipDen copies no media and keeps no
 * thumbnail; the creator's server stays the source of truth, and if they remove the file the
 * reference dies (`status: 'gone'`).
 *
 * One shape for every kind: audio (the audio find), image (comics), screenshot (games) and text
 * (writing). Changes from the brief's suggested shape are in DECISIONS.md (2026-10-04).
 */

export type ReferenceKind = 'audio' | 'image' | 'text' | 'screenshot';

/** Modeled on the W3C Web Annotation TextQuoteSelector. Text references only. */
export interface TextSelector {
	/** The selected text, at most `MAX_SNIP` characters: a passage, never a chapter. */
	exact: string;
	prefix?: string;
	suffix?: string;
}

/** Which ring a creator was found through, or `none` for one a reader found by other means. */
export type RingSource = 'own' | 'partner' | 'none';

export interface RingOrigin {
	source: Exclude<RingSource, 'none'>;
	/** `indienodes` for YipDen's own ring, or the partner adapter's id. */
	id: string;
}

export interface Reference {
	id: string;
	kind: ReferenceKind;
	/** The creator it is attached to: `verdictKey` of their site, as Liked and layouts use. */
	creatorId: string;
	/**
	 * Their name as shown where it was kept, for the Library. Absent on references kept before
	 * 2026-10-04 evening; those show a followed person's name, or else the site address.
	 */
	creatorName?: string;
	ringSource: RingSource;
	/** Null when `ringSource` is `none`. */
	ringId: string | null;
	/** What the reader sees it called: a track's name, an image's alt text, a page's title. */
	title: string;
	/** The media address (audio, image) or the page address (text). */
	url: string;
	/** After following redirects. The same as `url` until the first check resolves it. */
	canonicalUrl: string;
	/** The public page it was found on, as proof it was linked. Absent for a pasted link. */
	foundOnPage?: string;
	/** The media is on one of the creator's own sites (capture rules). */
	hostVerified: boolean;
	/**
	 * The found-on page's own markup links it (or, for text, shows the passage), as fetched. Absent
	 * when that could not be read. Media a page's script adds is seen when captured but is not in
	 * the markup, so only a markup link can be proved again by a re-check.
	 */
	linkedInMarkup?: boolean;
	/** May enter the v2.0 shared index. Computed and stored now; nothing reads it in this build. */
	sharable: boolean;
	etag?: string;
	contentHash?: string;
	selector?: TextSelector;
	/** `foundOnPage#:~:text=…`, so opening a snip scrolls the creator's page to it. */
	textFragmentUrl?: string;
	status: 'live' | 'gone';
	createdAt: string;
	/** Absent until the first re-check. */
	checkedAt?: string;
}

export const REFERENCE_KINDS: readonly ReferenceKind[] = ['audio', 'image', 'text', 'screenshot'];

/** At most this many characters of selected text. */
export const MAX_SNIP = 500;

/** Per creator and kind, so one creator cannot crowd a phone. Audio keeps the old limit. */
export const MAX_PER_KIND: Record<ReferenceKind, number> = {
	audio: 20,
	image: 50,
	screenshot: 50,
	text: 50
};

export const MAX_TITLE = 200;

/**
 * The same pointer saved twice is one reference: the same creator, kind and address, and for
 * text the same passage.
 */
export function referenceId(
	creatorId: string,
	kind: ReferenceKind,
	url: string,
	selector?: TextSelector
): string {
	const parts = [creatorId, kind, url, ...(selector ? [selector.exact] : [])];
	return `ref_${sha256Hex(parts.join('\n')).slice(0, 32)}`;
}

/** The ring fields of a reference, from where its creator was found. */
export function ringFields(ring: RingOrigin | null | undefined): {
	ringSource: RingSource;
	ringId: string | null;
} {
	return ring ? { ringSource: ring.source, ringId: ring.id } : { ringSource: 'none', ringId: null };
}
