import type { DroppedEntry, RingDocument, RingEntry, ValidationResult } from './types.js';
import { normalize, type NormalizeOptions } from './normalize.js';
import { safeUrl } from './url.js';

/**
 * A ceiling, not a product target. The ring holds a few hundred members; anything past this
 * is either a mistake upstream or an attempt to exhaust a phone's memory, and a reader that
 * kept parsing either one would hang rather than fail.
 */
const MAX_ENTRIES = 5000;
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface ValidateOptions extends NormalizeOptions {
	maxEntries?: number;
}

function drop(index: number, id: unknown, reason: string): DroppedEntry {
	return { index, id: typeof id === 'string' ? id.slice(0, 60) : null, reason };
}

/**
 * Check a parsed ring.json and return what is usable.
 *
 * This never throws and never discards the whole document over one bad member: a reader that
 * refused the ring because a single entry was malformed would show an empty app for a problem
 * it cannot fix. Entries fail individually, with a reason, and the caller decides whether to
 * report it.
 *
 * The bar is deliberately lower than the ring's own publishing schema. The ring enforces its
 * full contract before an entry is ever published; a reader only needs the fields it actually
 * renders, so a member missing, say, `verification_token` still shows up rather than vanishing
 * from someone's app over a field they never see.
 */
export function validate(json: unknown, options: ValidateOptions = {}): ValidationResult {
	const dropped: DroppedEntry[] = [];
	const repaired: DroppedEntry[] = [];
	const maxEntries = options.maxEntries ?? MAX_ENTRIES;

	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		dropped.push(drop(-1, null, 'document is not an object'));
		return { document: { version: '0', entries: [] }, dropped, repaired };
	}

	const raw = json as Record<string, unknown>;
	const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
	if (!Array.isArray(raw.entries)) {
		dropped.push(drop(-1, null, 'document has no entries array'));
	}
	if (rawEntries.length > maxEntries) {
		dropped.push(drop(-1, null, `entry count ${rawEntries.length} exceeds ${maxEntries}`));
	}

	const entries: RingEntry[] = [];
	const seenIds = new Set<string>();

	rawEntries.slice(0, maxEntries).forEach((candidate, index) => {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			dropped.push(drop(index, null, 'entry is not an object'));
			return;
		}
		const entry = candidate as RingEntry;

		if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
			dropped.push(drop(index, entry.id, 'missing or malformed id'));
			return;
		}
		if (seenIds.has(entry.id)) {
			dropped.push(drop(index, entry.id, 'duplicate id'));
			return;
		}
		if (typeof entry.creator !== 'string' || !entry.creator.trim()) {
			dropped.push(drop(index, entry.id, 'missing creator'));
			return;
		}
		if (typeof entry.type !== 'string' || !entry.type.trim()) {
			dropped.push(drop(index, entry.id, 'missing type'));
			return;
		}
		if (!safeUrl(entry.source_url)) {
			dropped.push(drop(index, entry.id, 'source_url is missing, not https, or not public'));
			return;
		}

		const normalized = normalize(entry, options);
		if (!normalized.tags?.length) {
			repaired.push(drop(index, entry.id, 'no usable tags'));
		}
		if (entry.thumb_url && !normalized.thumb_url) {
			repaired.push(drop(index, entry.id, 'thumb_url removed: not https or not public'));
		}
		if (Array.isArray(entry.tracks) && (normalized.tracks?.length ?? 0) < entry.tracks.length) {
			repaired.push(drop(index, entry.id, 'one or more tracks removed: unusable media_url'));
		}

		seenIds.add(entry.id);
		entries.push(normalized);
	});

	const document: RingDocument = { ...raw, version: '', entries };
	document.version = typeof raw.version === 'string' ? raw.version : '0';
	if (typeof raw.generated_at === 'string') document.generated_at = raw.generated_at;
	else delete document.generated_at;

	return { document, dropped, repaired };
}
