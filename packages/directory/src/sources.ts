import { fetchRing, type FetchLike, type RingCache, type RingEntry } from '@yipden/ring-client';
import { identitiesOf } from './identity.js';
import { loadDocument, type DocumentCache, type LoadSource } from './load.js';
import type { DirectoryDocument, DirectoryEntry, Listing, Person } from './types.js';
import { validateDirectory } from './validate.js';

/** Where people to discover come from: the ring, YipDen's directory, or a list a reader added. */
export interface DirectorySource {
	/** `indienodes`, `yipden`, or `list:<id>`. */
	id: string;
	/** For the card's label: "IndieNodes member", "Listed by YipDen", "From <name>". */
	name: string;
	load(): Promise<SourceResult>;
}

export interface SourceResult {
	people: Person[];
	status: LoadSource;
	fetchedAt: string | null;
	error?: Error;
}

interface Origin {
	source: string;
	sourceName: string;
	listing: Listing;
}

/** Optional fields left out rather than set to `undefined`: the store and backups stay tidy. */
function withoutUndefined<T>(value: { [K in keyof T]: T[K] | undefined }): T {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** A ring entry as a person. Members of the IndieNodes ring opted in: `listing: 'member'`. */
export function personFromRingEntry(entry: RingEntry, origin: Origin): Person {
	const feeds = (entry.feeds ?? []).map((feed) => ({
		type: feed.type,
		url: feed.url,
		verified: feed.verified === true
	}));
	const person = withoutUndefined<Person>({
		id: `${origin.source}:${entry.id}`,
		name: entry.creator,
		note: entry.why,
		thumbUrl: entry.thumb_url,
		thumbPosition: entry.thumb_position,
		tags: entry.tags ?? [],
		siteUrl: entry.source_url,
		feeds,
		tracks: entry.tracks?.map((track) => ({ label: track.label, mediaUrl: track.media_url })),
		...origin,
		discoverable: entry.discoverable !== false && entry._placeholder !== true,
		identities: []
	});
	person.identities = identitiesOf(person);
	return person;
}

/** A `people.json` entry as a person. */
export function personFromDirectoryEntry(entry: DirectoryEntry, origin: Origin): Person {
	const feeds = (entry.feeds ?? []).map((feed) => ({
		type: feed.type,
		url: feed.url,
		verified: feed.verified === true
	}));
	const person = withoutUndefined<Person>({
		id: `${origin.source}:${entry.id}`,
		name: entry.name,
		note: entry.note,
		thumbUrl: entry.thumb_url,
		thumbPosition: entry.thumb_position,
		tags: entry.tags ?? [],
		siteUrl: entry.site_url,
		feeds,
		tracks: entry.tracks?.map((track) => ({ label: track.label, mediaUrl: track.media_url })),
		...origin,
		discoverable: entry.discoverable !== false,
		identities: []
	});
	person.identities = identitiesOf({ ...person, identities: entry.identities ?? [] });
	return person;
}

interface Network {
	fetch: FetchLike;
	revalidate?: boolean;
}

/** The IndieNodes ring, through `ring-client` as it is (its contract is not ours to change). */
export function indieNodesSource(
	options: Network & { url?: string; cache?: RingCache }
): DirectorySource {
	return {
		id: 'indienodes',
		name: 'IndieNodes',
		async load() {
			const result = await fetchRing({
				fetch: options.fetch,
				revalidate: options.revalidate ?? false,
				...(options.url ? { url: options.url } : {}),
				...(options.cache ? { cache: options.cache } : {})
			});
			return {
				people: result.document.entries.map((entry) =>
					personFromRingEntry(entry, {
						source: 'indienodes',
						sourceName: 'IndieNodes',
						listing: 'member'
					})
				),
				status: result.source,
				fetchedAt: result.fetchedAt,
				...(result.error ? { error: result.error } : {})
			};
		}
	};
}

async function directoryPeople(
	options: Network & { url: string; cache?: DocumentCache<DirectoryDocument> },
	origin: (entry: DirectoryEntry) => Origin
): Promise<SourceResult> {
	const result = await loadDocument<DirectoryDocument>({
		url: options.url,
		fetch: options.fetch,
		parse: (json) => validateDirectory(json).document,
		isEmpty: (document) => document.entries.length === 0,
		revalidate: options.revalidate ?? false,
		...(options.cache ? { cache: options.cache } : {})
	});
	return {
		people: (result.document?.entries ?? []).map((entry) =>
			personFromDirectoryEntry(entry, origin(entry))
		),
		status: result.source,
		fetchedAt: result.fetchedAt,
		...(result.error ? { error: result.error } : {})
	};
}

/** YipDen's curated directory (`people.json`). */
export function yipdenSource(
	options: Network & { url: string; cache?: DocumentCache<DirectoryDocument> }
): DirectorySource {
	return {
		id: 'yipden',
		name: 'YipDen',
		load: () =>
			directoryPeople(options, (entry) => ({
				source: 'yipden',
				sourceName: 'YipDen',
				listing: entry.listing ?? 'curated'
			}))
	};
}

/**
 * A creator list a reader added, by its address: YipDen's directory format, or an IndieNodes-style
 * `ring.json`. Its people are labelled with the list's own name, and the reader's choice to add it
 * is the only thing vouching for them, so they are `listing: 'list'`.
 */
export function listSource(
	options: Network & {
		id: string;
		name: string;
		url: string;
		format: 'directory' | 'ring';
		cache?: DocumentCache<DirectoryDocument>;
		ringCache?: RingCache;
	}
): DirectorySource {
	const source = `list:${options.id}`;
	const origin: Origin = { source, sourceName: options.name, listing: 'list' };
	return {
		id: source,
		name: options.name,
		async load() {
			if (options.format === 'directory') return directoryPeople(options, () => origin);
			const result = await fetchRing({
				url: options.url,
				fetch: options.fetch,
				revalidate: options.revalidate ?? false,
				...(options.ringCache ? { cache: options.ringCache } : {})
			});
			return {
				people: result.document.entries.map((entry) => personFromRingEntry(entry, origin)),
				status: result.source,
				fetchedAt: result.fetchedAt,
				...(result.error ? { error: result.error } : {})
			};
		}
	};
}
