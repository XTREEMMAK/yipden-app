import { safeUrl } from '@yipden/ring-client';
import type { DroppedEntry } from '@yipden/ring-client';
import type { DirectoryDocument, DirectoryEntry, OptOutDocument } from './types.js';

const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_TAGS = 16;

export interface DirectoryValidation {
	document: DirectoryDocument;
	dropped: DroppedEntry[];
	repaired: DroppedEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed && trimmed.length <= max ? trimmed : null;
}

/**
 * Check a directory document the way `ring-client` checks a ring: one bad entry is dropped with
 * its reason and the rest are kept; a bad field on a good entry is removed and noted. Fields this
 * client does not know are carried through untouched (the contract is additive).
 *
 * An entry needs an id, a name, and at least one safe address: its site or a feed.
 */
export function validateDirectory(json: unknown): DirectoryValidation {
	const dropped: DroppedEntry[] = [];
	const repaired: DroppedEntry[] = [];
	if (!isRecord(json) || !Array.isArray(json.entries)) {
		return { document: { version: '0', entries: [] }, dropped, repaired };
	}
	const seen = new Set<string>();
	const entries: DirectoryEntry[] = [];

	json.entries.forEach((raw, index) => {
		const id = isRecord(raw) && typeof raw.id === 'string' ? raw.id : null;
		const drop = (reason: string) => dropped.push({ index, id, reason });
		const repair = (reason: string) => repaired.push({ index, id, reason });
		if (!isRecord(raw)) return drop('not an object');
		if (!id || !ID.test(id)) return drop('id must be lowercase letters, digits and dashes');
		if (seen.has(id)) return drop('duplicate id');
		const name = text(raw.name, 200);
		if (!name) return drop('name is missing');

		const entry: DirectoryEntry = { ...raw, id, name };
		delete entry.site_url;
		if (raw.site_url !== undefined) {
			const site = safeUrl(raw.site_url);
			if (site) entry.site_url = site.toString();
			else repair('site_url is not a public https address');
		}

		const feeds = Array.isArray(raw.feeds) ? raw.feeds : [];
		entry.feeds = feeds.flatMap((feed) => {
			if (!isRecord(feed) || typeof feed.type !== 'string') return [];
			const url = safeUrl(feed.url);
			if (!url) {
				repair('a feed is not a public https address');
				return [];
			}
			return [{ type: feed.type, url: url.toString(), verified: feed.verified === true }];
		});
		if (!entry.site_url && !entry.feeds.length) return drop('no site and no feed to follow');

		if (raw.note !== undefined) {
			const note = text(raw.note, 500);
			if (note) entry.note = note;
			else {
				delete entry.note;
				repair('note is empty or too long');
			}
		}
		if (raw.thumb_url !== undefined) {
			const thumb = safeUrl(raw.thumb_url);
			if (thumb) entry.thumb_url = thumb.toString();
			else {
				delete entry.thumb_url;
				repair('thumb_url is not a public https address');
			}
		}
		const position = raw.thumb_position;
		if (position !== undefined) {
			const ok =
				isRecord(position) &&
				typeof position.x === 'number' &&
				typeof position.y === 'number' &&
				position.x >= 0 &&
				position.x <= 1 &&
				position.y >= 0 &&
				position.y <= 1;
			if (!ok) {
				delete entry.thumb_position;
				repair('thumb_position must be x and y between 0 and 1');
			}
		}
		entry.tags = Array.isArray(raw.tags)
			? raw.tags
					.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
					.map((tag) => tag.trim().toLowerCase())
					.slice(0, MAX_TAGS)
			: [];
		if (raw.tracks !== undefined) {
			entry.tracks = (Array.isArray(raw.tracks) ? raw.tracks : []).flatMap((track) => {
				if (!isRecord(track)) return [];
				const label = text(track.label, 200);
				const media = safeUrl(track.media_url);
				return label && media ? [{ label, media_url: media.toString() }] : [];
			});
		}
		if (raw.listing !== undefined && raw.listing !== 'curated' && raw.listing !== 'confirmed') {
			delete entry.listing;
			repair('listing must be curated or confirmed');
		}
		for (const field of ['type', 'form'] as const) {
			if (raw[field] === undefined) continue;
			const value = text(raw[field], 40);
			if (value) entry[field] = value.toLowerCase();
			else {
				delete entry[field];
				repair(`${field} must be a short word`);
			}
		}
		if (raw.discoverable !== undefined && typeof raw.discoverable !== 'boolean') {
			delete entry.discoverable;
			repair('discoverable must be true or false');
		}
		if (raw.identities !== undefined) {
			entry.identities = (Array.isArray(raw.identities) ? raw.identities : []).filter(
				(value): value is string =>
					typeof value === 'string' && /^(url|bsky|youtube|fedi):\S+$/.test(value)
			);
		}

		seen.add(id);
		entries.push(entry);
	});

	const version = typeof json.version === 'string' ? json.version : '0';
	return { document: { ...json, version, entries }, dropped, repaired };
}

/** Check `optouts.json`: only well-formed SHA-256 hex hashes survive. */
export function validateOptOuts(json: unknown): OptOutDocument {
	if (!isRecord(json) || !Array.isArray(json.hashes)) return { version: '0', hashes: [] };
	const hashes = json.hashes.filter(
		(hash): hash is string => typeof hash === 'string' && HASH.test(hash)
	);
	return { ...json, version: typeof json.version === 'string' ? json.version : '0', hashes };
}
