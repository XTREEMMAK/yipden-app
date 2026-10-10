import { KNOWN_LAYOUTS, normalizeUrl } from '@yipden/ring-client';
import type {
	SiteEntry,
	SiteFeed,
	SiteHosting,
	SiteListing,
	SiteMaker,
	SitesDocument,
	SitesValidation
} from './types.js';

/**
 * Check a parsed sites document and keep what is usable, the same way `ring-client` reads the
 * ring: never throws, never refuses the whole document over one bad entry, and drops each bad
 * entry with a reason. Unknown fields ride along untouched; the contract is additive only.
 */

/** The partner ring's ceilings: past them the lists need paging, which waits for real numbers. */
export const MAX_SITES = 2000;
const MAX_TAGS = 16;
const MAX_TAG_LENGTH = 40;
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/**
 * Media bundled with the app for the seed, served from the app itself. Only allowed when the
 * caller says the document is the bundled one: a fetched document must point at https.
 */
const LOCAL_MEDIA = /^\/(sites|forums)\/[a-z0-9-]+\.(jpg|jpeg|png|webp|webm|mp4)$/;

export interface ValidateSitesOptions {
	/** True only for the seed bundled in the app, whose media lives under `/sites/`. */
	localMedia?: boolean;
	maxEntries?: number;
}

function text(value: unknown, max: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim().slice(0, max);
	return trimmed || undefined;
}

function tags(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	for (const raw of value) {
		const tag = text(raw, MAX_TAG_LENGTH)?.toLowerCase();
		if (tag) seen.add(tag);
		if (seen.size >= MAX_TAGS) break;
	}
	return [...seen];
}

function media(value: unknown, localMedia: boolean): string | undefined {
	if (localMedia && typeof value === 'string' && LOCAL_MEDIA.test(value)) return value;
	return normalizeUrl(value) ?? undefined;
}

function feeds(value: unknown): SiteFeed[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const found: SiteFeed[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		if (!raw || typeof raw !== 'object') continue;
		const candidate = raw as Record<string, unknown>;
		const url = normalizeUrl(candidate.url);
		if (!url || seen.has(url)) continue;
		seen.add(url);
		found.push({ type: text(candidate.type, 40)?.toLowerCase() ?? 'rss', url });
	}
	return found.length ? found : undefined;
}

function listing(value: unknown): SiteListing | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const raw = value as Record<string, unknown>;
	if (raw.level !== 'basic' && raw.level !== 'owner-approved') return undefined;
	const found: SiteListing = { level: raw.level };
	const approvedAt = text(raw.approved_at, 40);
	const manageUrl = normalizeUrl(raw.manage_url);
	if (approvedAt) found.approved_at = approvedAt;
	if (manageUrl) found.manage_url = manageUrl;
	return found;
}

function hosting(value: unknown): SiteHosting | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	const raw = value as Record<string, unknown>;
	const provider = text(raw.provider, 60)?.toLowerCase();
	if (!provider) return undefined;
	const found: SiteHosting = { provider };
	const profileUrl = normalizeUrl(raw.profile_url);
	if (profileUrl) found.profile_url = profileUrl;
	return found;
}

function makers(value: unknown): SiteMaker[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const found: SiteMaker[] = [];
	const seen = new Set<string>();
	for (const candidate of value.slice(0, 8)) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
		const raw = candidate as Record<string, unknown>;
		const name = text(raw.name, 120);
		const url = normalizeUrl(raw.url);
		const evidence = text(raw.evidence, 40)?.toLowerCase();
		if (!name || !url || !evidence || seen.has(url)) continue;
		seen.add(url);
		const maker: SiteMaker = { name, url, evidence };
		const personId = text(raw.person_id, 80);
		if (personId) maker.person_id = personId;
		found.push(maker);
	}
	return found.length ? found : undefined;
}

function entryFrom(raw: Record<string, unknown>, localMedia: boolean): SiteEntry | string {
	const id = typeof raw.id === 'string' ? raw.id : '';
	if (!ID_PATTERN.test(id)) return 'missing or malformed id';
	const url = normalizeUrl(raw.url);
	if (!url) return 'url is missing, not https, or not public';
	const title = text(raw.title, 120);
	if (!title) return 'missing title';
	const category = text(raw.category, 40)?.toLowerCase();
	if (!category) return 'missing category';

	const entry: SiteEntry = {
		...raw,
		id,
		url,
		title,
		category,
		tags: tags(raw.tags),
		explicit: raw.explicit === true
	};
	const optional = {
		blurb: text(raw.blurb, 240),
		poster_url: media(raw.poster_url, localMedia),
		preview_url: media(raw.preview_url, localMedia),
		feeds: feeds(raw.feeds),
		listing: listing(raw.listing),
		hosting: hosting(raw.hosting),
		makers: makers(raw.makers),
		layout: KNOWN_LAYOUTS.find((layout) => layout === raw.layout),
		added_at: text(raw.added_at, 40),
		software: text(raw.software, 40)?.toLowerCase(),
		follow_note: text(raw.follow_note, 200)
	};
	for (const [key, value] of Object.entries(optional)) {
		if (value === undefined) delete entry[key];
		else entry[key] = value;
	}
	// A nomination permits a listing, not a YipDen-hosted moving capture. A basic listing may still
	// use the remote sharing image its site offers to link previews.
	if (entry.listing?.level === 'basic') delete entry.preview_url;
	return entry;
}

export function validateSites(json: unknown, options: ValidateSitesOptions = {}): SitesValidation {
	const dropped: SitesValidation['dropped'] = [];
	const maxEntries = options.maxEntries ?? MAX_SITES;
	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		return {
			document: { version: '0', entries: [] },
			dropped: [{ index: -1, id: null, reason: 'document is not an object' }]
		};
	}

	const raw = json as Record<string, unknown>;
	const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
	if (!Array.isArray(raw.entries)) {
		dropped.push({ index: -1, id: null, reason: 'document has no entries array' });
	}
	if (rawEntries.length > maxEntries) {
		dropped.push({
			index: -1,
			id: null,
			reason: `entry count ${rawEntries.length} exceeds ${maxEntries}`
		});
	}

	const entries: SiteEntry[] = [];
	const seen = new Set<string>();
	rawEntries.slice(0, maxEntries).forEach((candidate, index) => {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			dropped.push({ index, id: null, reason: 'entry is not an object' });
			return;
		}
		const record = candidate as Record<string, unknown>;
		const id = typeof record.id === 'string' ? record.id.slice(0, 60) : null;
		const entry = entryFrom(record, options.localMedia === true);
		if (typeof entry === 'string') {
			dropped.push({ index, id, reason: entry });
			return;
		}
		if (seen.has(entry.id)) {
			dropped.push({ index, id, reason: 'duplicate id' });
			return;
		}
		seen.add(entry.id);
		entries.push(entry);
	});

	const document: SitesDocument = {
		...raw,
		version: typeof raw.version === 'string' ? raw.version : '0',
		entries
	};
	if (typeof raw.generated_at === 'string') document.generated_at = raw.generated_at;
	else delete document.generated_at;
	return { document, dropped };
}
