/**
 * Whether a partner ring member's own badge image is real art rather than a small button
 * graphic, and so worth a full-screen preview: pulled out of `PartnerThumb.svelte` as a plain
 * function so the threshold itself is testable without a component harness, the same way
 * `cardStack.ts` keeps `cardPlacement` as a pure function alongside the action that calls it.
 *
 * Comfortably above a classic webring banner (88×31, confirmed live against Musicians Webring),
 * comfortably below real cover art (300×300, confirmed live against Knifebeetle).
 */
export const PREVIEWABLE_MIN_SIZE = 120;

export function isPreviewable(naturalWidth: number, naturalHeight: number): boolean {
	return naturalWidth >= PREVIEWABLE_MIN_SIZE && naturalHeight >= PREVIEWABLE_MIN_SIZE;
}
