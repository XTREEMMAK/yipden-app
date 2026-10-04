import { KNOWN_LAYOUTS, safeUrl, type SiteLayout } from '@yipden/ring-client';
import { MAX_TRACKS_PER_CREATOR, type ReaderTrack } from './readerTracks.js';
import { store as defaultStore } from './store/index.js';
import type {
	Feed,
	Person,
	SettingKey,
	ShelfItem,
	Store,
	StoredYip,
	VerdictRecord
} from './store/types.js';

const THEME_STORAGE_KEY = 'yipden:theme';
const SKIN_STORAGE_KEY = 'yipden:skin';

export interface BackupAppearance {
	theme: 'system' | 'light' | 'dark';
	skin: 'original' | 'glass' | 'forest';
}

const SETTING_KEYS: SettingKey[] = [
	'lastRefreshAt',
	'includeExplicit',
	'ringFilter',
	'ringQueue',
	'shuffleMusic',
	'maxAgeDays',
	'markReadOnScroll',
	'sounds',
	'sitesInApp',
	'explored',
	'readerTracks',
	'layoutOverrides'
];

export interface YipDenBackup {
	format: 'yipden-backup';
	version: 1;
	exportedAt: string;
	people: Person[];
	feeds: Feed[];
	yips: StoredYip[];
	/**
	 * The Shelf. Added after version 1 shipped, and additive: a backup without it is still valid,
	 * and an older build reading one with it ignores what it does not know.
	 */
	shelf?: ShelfItem[];
	/** Liked and not-for-me creators. Additive, like `shelf`. */
	verdicts?: VerdictRecord[];
	settings: Partial<Record<SettingKey, unknown>>;
	appearance: BackupAppearance;
}

export interface BackupPreview {
	backup: YipDenBackup;
	people: number;
	feeds: number;
	yips: number;
	shelf: number;
	verdicts: number;
}

export interface RestoreReport {
	peopleAdded: number;
	peopleMatched: number;
	peopleSkipped: number;
	feedsAdded: number;
	feedsMatched: number;
	feedsSkipped: number;
	yipsAdded: number;
	shelfAdded: number;
	verdictsAdded: number;
	settingsRestored: number;
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 10_000): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function stringValue(value: unknown, max = 10_000): value is string {
	return typeof value === 'string' && value.length <= max;
}

function https(value: unknown): value is string {
	return text(value, 8_192) && safeUrl(value) !== null;
}

function optionalText(value: unknown, max = 10_000): boolean {
	return value === undefined || (typeof value === 'string' && value.length <= max);
}

function optionalHttps(value: unknown): boolean {
	return value === undefined || https(value);
}

function optionalBoolean(value: unknown): boolean {
	return value === undefined || typeof value === 'boolean';
}

function optionalNumber(value: unknown): boolean {
	return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * A per-creator map as a backup carries it (explored marks, reader tracks, layout overrides):
 * creator key to a value, bounded, keeping only the entries `valid` accepts. A malformed entry
 * is dropped, not the whole file, and `__proto__` is never a key.
 */
function creatorMap<T>(
	value: unknown,
	valid: (entry: unknown) => entry is T
): Record<string, T> | null {
	if (!record(value)) return null;
	const entries = Object.entries(value);
	if (entries.length > 50_000) return null;
	const map: Record<string, T> = {};
	for (const [key, entry] of entries) {
		if (key === '__proto__' || key.length > 2_048) continue;
		if (valid(entry)) map[key] = entry;
	}
	return map;
}

const exploredAt = (entry: unknown): entry is string => text(entry, 100);

const siteLayout = (entry: unknown): entry is SiteLayout =>
	KNOWN_LAYOUTS.some((layout) => layout === entry);

function readerTrackList(entry: unknown): entry is ReaderTrack[] {
	return (
		Array.isArray(entry) &&
		entry.length <= MAX_TRACKS_PER_CREATOR &&
		entry.every(
			(track) =>
				record(track) &&
				https(track.url) &&
				text(track.title, 200) &&
				text(track.addedAt, 100) &&
				(track.foundOn === undefined || https(track.foundOn))
		)
	);
}

/** Restored by merging into what is already here; this phone's own entry wins a clash. */
const MERGED_SETTINGS = {
	explored: exploredAt,
	readerTracks: readerTrackList,
	layoutOverrides: siteLayout
} as const;

function validPerson(value: unknown): value is Person {
	return (
		record(value) &&
		text(value.id, 8_192) &&
		text(value.name, 1_000) &&
		https(value.siteUrl) &&
		optionalText(value.iconUrl, 8_192) &&
		(value.iconUrl === undefined || https(value.iconUrl)) &&
		optionalText(value.ringId, 1_000) &&
		(value.layout === undefined || KNOWN_LAYOUTS.some((layout) => layout === value.layout)) &&
		optionalText(value.folder, 100) &&
		text(value.followedAt, 100)
	);
}

function validShelfItem(value: unknown): value is ShelfItem {
	return (
		record(value) &&
		https(value.id) &&
		https(value.url) &&
		value.id === value.url &&
		stringValue(value.title, 1_000) &&
		optionalText(value.creator, 1_000) &&
		optionalText(value.via, 1_000) &&
		(value.thumbUrl === undefined || https(value.thumbUrl)) &&
		['discover', 'feeds'].includes(String(value.from)) &&
		text(value.savedAt, 100)
	);
}

function validVerdict(value: unknown): value is VerdictRecord {
	return (
		record(value) &&
		stringValue(value.id, 1_000) &&
		https(value.url) &&
		stringValue(value.name, 1_000) &&
		['liked', 'hidden'].includes(String(value.verdict)) &&
		['indienodes', 'partner'].includes(String(value.source)) &&
		optionalText(value.via, 1_000) &&
		optionalText(value.thumbUrl, 2_000) &&
		text(value.at, 100)
	);
}

function validFeed(value: unknown): value is Feed {
	return (
		record(value) &&
		https(value.id) &&
		https(value.url) &&
		text(value.personId, 8_192) &&
		text(value.kind, 100) &&
		stringValue(value.title, 1_000) &&
		typeof value.verified === 'boolean' &&
		typeof value.failures === 'number' &&
		Number.isInteger(value.failures) &&
		value.failures >= 0 &&
		typeof value.enabled === 'boolean' &&
		(value.provenance === undefined ||
			['ring', 'discovered', 'manual', 'opml'].includes(String(value.provenance))) &&
		optionalText(value.etag, 8_192) &&
		optionalText(value.lastModified, 8_192) &&
		optionalText(value.lastFetchedAt, 100) &&
		(value.lastError === undefined || validFeedError(value.lastError))
	);
}

const FEED_PROBLEMS = [
	'offline',
	'gone',
	'refused',
	'server',
	'blocked',
	'not-a-feed',
	'unreadable'
];

function validFeedError(value: unknown): boolean {
	return (
		record(value) &&
		FEED_PROBLEMS.includes(String(value.kind)) &&
		(value.status === undefined ||
			(typeof value.status === 'number' && Number.isInteger(value.status)))
	);
}

function validMedia(value: unknown): boolean {
	return (
		record(value) &&
		https(value.url) &&
		['audio', 'video', 'image'].includes(String(value.kind)) &&
		optionalText(value.mimeType, 200) &&
		optionalText(value.title, 1_000) &&
		optionalText(value.alt, 10_000) &&
		optionalNumber(value.sizeBytes) &&
		optionalNumber(value.durationSeconds) &&
		optionalBoolean(value.sensitive)
	);
}

function validYip(value: unknown): value is StoredYip {
	return (
		record(value) &&
		text(value.key, 20_000) &&
		text(value.id, 10_000) &&
		stringValue(value.title, 10_000) &&
		https(value.url) &&
		optionalHttps(value.canonicalUrl) &&
		(value.syndicationUrls === undefined ||
			(Array.isArray(value.syndicationUrls) &&
				value.syndicationUrls.length <= 100 &&
				value.syndicationUrls.every(https))) &&
		optionalText(value.author, 10_000) &&
		(value.publishedAt === null || text(value.publishedAt, 100)) &&
		stringValue(value.summary, 100_000) &&
		(value.contentHtml === null || stringValue(value.contentHtml, 1_000_000)) &&
		optionalText(value.contentWarning, 10_000) &&
		optionalBoolean(value.sensitive) &&
		optionalHttps(value.replyToUrl) &&
		optionalHttps(value.repostOfUrl) &&
		optionalHttps(value.likeOfUrl) &&
		optionalHttps(value.bookmarkOfUrl) &&
		Array.isArray(value.media) &&
		value.media.length <= 100 &&
		value.media.every(validMedia) &&
		https(value.sourceFeedId) &&
		text(value.personId, 8_192) &&
		text(value.feedKind, 100) &&
		['posts', 'watch', 'listen'].includes(String(value.category)) &&
		text(value.seenAt, 100) &&
		optionalText(value.readAt, 100) &&
		(value.feedId === undefined || https(value.feedId))
	);
}

function readAppearance(): BackupAppearance {
	if (typeof localStorage === 'undefined') return { theme: 'system', skin: 'original' };
	const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
	const storedSkin = localStorage.getItem(SKIN_STORAGE_KEY);
	return {
		theme: storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'system',
		skin: storedSkin === 'glass' || storedSkin === 'forest' ? storedSkin : 'original'
	};
}

/** Build a plain, versioned file containing the local reader state. */
export async function createBackup(store: Store = defaultStore): Promise<YipDenBackup> {
	await store.init();
	const [people, feeds, yips, shelf, verdicts, settingValues] = await Promise.all([
		store.listPeople(),
		store.listFeeds(),
		store.listAllYips(),
		store.listShelf(),
		store.listVerdicts(),
		Promise.all(SETTING_KEYS.map((key) => store.getSetting<unknown>(key)))
	]);
	const settings: Partial<Record<SettingKey, unknown>> = {};
	SETTING_KEYS.forEach((key, index) => {
		const value = settingValues[index];
		if (value !== null) settings[key] = value;
	});
	return {
		format: 'yipden-backup',
		version: 1,
		exportedAt: new Date().toISOString(),
		people,
		feeds,
		yips,
		shelf,
		verdicts,
		settings,
		appearance: readAppearance()
	};
}

/** Parse and validate before the UI offers to restore anything. */
export function parseBackup(source: string): BackupPreview {
	if (source.length > 50 * 1024 * 1024)
		throw new Error('That backup is too large to import safely.');
	let value: unknown;
	try {
		value = JSON.parse(source);
	} catch {
		throw new Error('That file is not valid JSON.');
	}
	if (
		!record(value) ||
		value.format !== 'yipden-backup' ||
		value.version !== 1 ||
		!text(value.exportedAt, 100) ||
		!Array.isArray(value.people) ||
		!value.people.every(validPerson) ||
		!Array.isArray(value.feeds) ||
		!value.feeds.every(validFeed) ||
		!Array.isArray(value.yips) ||
		!value.yips.every(validYip) ||
		(value.shelf !== undefined &&
			(!Array.isArray(value.shelf) ||
				value.shelf.length > 10_000 ||
				!value.shelf.every(validShelfItem))) ||
		(value.verdicts !== undefined &&
			(!Array.isArray(value.verdicts) ||
				value.verdicts.length > 10_000 ||
				!value.verdicts.every(validVerdict))) ||
		!record(value.settings) ||
		!record(value.appearance) ||
		!['system', 'light', 'dark'].includes(String(value.appearance.theme)) ||
		!['original', 'glass', 'forest'].includes(String(value.appearance.skin))
	) {
		throw new Error('That is not a supported YipDen backup.');
	}
	const backup = value as unknown as YipDenBackup;
	const people = new Set(backup.people.map((person) => person.id));
	if (backup.feeds.some((feed) => !people.has(feed.personId))) {
		throw new Error('That backup contains a source without its creator.');
	}
	return {
		backup,
		people: backup.people.length,
		feeds: backup.feeds.length,
		yips: backup.yips.length,
		shelf: backup.shelf?.length ?? 0,
		verdicts: backup.verdicts?.length ?? 0
	};
}

/** Merge a validated backup without silently moving a source between creators. */
export async function restoreBackup(
	backup: YipDenBackup,
	store: Store = defaultStore
): Promise<RestoreReport> {
	await store.init();
	const existingPeople = await store.listPeople();
	const existingFeeds = await store.listFeeds();
	const peopleById = new Map(existingPeople.map((person) => [person.id, person]));
	const peopleBySite = new Map(existingPeople.map((person) => [person.siteUrl, person]));
	const personIds = new Map<string, string>();
	const report: RestoreReport = {
		peopleAdded: 0,
		peopleMatched: 0,
		peopleSkipped: 0,
		feedsAdded: 0,
		feedsMatched: 0,
		feedsSkipped: 0,
		yipsAdded: 0,
		shelfAdded: 0,
		verdictsAdded: 0,
		settingsRestored: 0
	};

	for (const person of backup.people) {
		const bySite = peopleBySite.get(person.siteUrl);
		const byId = peopleById.get(person.id);
		if (bySite) {
			personIds.set(person.id, bySite.id);
			report.peopleMatched += 1;
			continue;
		}
		if (byId && byId.siteUrl !== person.siteUrl) {
			report.peopleSkipped += 1;
			continue;
		}
		await store.follow(person, []);
		peopleById.set(person.id, person);
		peopleBySite.set(person.siteUrl, person);
		personIds.set(person.id, person.id);
		report.peopleAdded += 1;
	}

	const ownership = new Map(existingFeeds.map((feed) => [feed.id, feed.personId]));
	for (const feed of backup.feeds) {
		const personId = personIds.get(feed.personId);
		if (!personId) {
			report.feedsSkipped += 1;
			continue;
		}
		const result = await store.addFeed({ ...feed, personId });
		if (result.status === 'added') {
			ownership.set(feed.id, personId);
			report.feedsAdded += 1;
		} else if (result.status === 'already-attached') {
			ownership.set(feed.id, personId);
			report.feedsMatched += 1;
		} else {
			report.feedsSkipped += 1;
		}
	}

	const yips = backup.yips.flatMap((yip) => {
		const personId = personIds.get(yip.personId);
		const feedId = yip.feedId ?? yip.sourceFeedId;
		if (!personId || ownership.get(feedId) !== personId) return [];
		// Cached HTML came from an external file, not the sanitizer in this install.
		return [{ ...yip, personId, contentHtml: null }];
	});
	report.yipsAdded = (await store.putYips(yips)).added;

	// The Shelf is merged, never replaced: what is already saved stays, saved-again keeps its
	// first date, and it does not depend on any person or source being present.
	const shelved = new Set((await store.listShelf()).map((item) => item.id));
	for (const item of backup.shelf ?? []) {
		if (shelved.has(item.id)) continue;
		await store.saveToShelf(item);
		shelved.add(item.id);
		report.shelfAdded += 1;
	}

	// Verdicts merge too: a choice already made on this device is never overwritten by an older file.
	const decided = new Set((await store.listVerdicts()).map((item) => item.id));
	for (const item of backup.verdicts ?? []) {
		if (decided.has(item.id)) continue;
		await store.setVerdict(item);
		decided.add(item.id);
		report.verdictsAdded += 1;
	}

	for (const key of SETTING_KEYS) {
		if (!(key in backup.settings)) continue;
		if (key in MERGED_SETTINGS) {
			const valid = MERGED_SETTINGS[key as keyof typeof MERGED_SETTINGS] as (
				entry: unknown
			) => boolean;
			const incoming = creatorMap(backup.settings[key], (entry): entry is unknown => valid(entry));
			if (!incoming) continue;
			const current =
				creatorMap(await store.getSetting(key), (entry): entry is unknown => valid(entry)) ?? {};
			await store.setSetting(key, { ...incoming, ...current });
			report.settingsRestored += 1;
			continue;
		}
		await store.setSetting(key, backup.settings[key]);
		report.settingsRestored += 1;
	}
	if (typeof localStorage !== 'undefined') {
		if (backup.appearance.theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
		else localStorage.setItem(THEME_STORAGE_KEY, backup.appearance.theme);
		if (backup.appearance.skin === 'original') localStorage.removeItem(SKIN_STORAGE_KEY);
		else localStorage.setItem(SKIN_STORAGE_KEY, backup.appearance.skin);
	}

	return report;
}
