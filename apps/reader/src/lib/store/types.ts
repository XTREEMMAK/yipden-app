import type { Item } from '@yipden/feeds';
import type { RingCacheRecord } from '@yipden/ring-client';

export type { Item } from '@yipden/feeds';

/**
 * Everything a reader owns, behind one interface.
 *
 * No component may talk to IndexedDB or SQLite directly. That is not tidiness: v2.0 adds a
 * syncing implementation behind this same interface, and that is only possible if this is the
 * only door. A component that reaches past it is a component that will have to be rewritten.
 */

/** A person, which is the thing a reader actually follows. */
export interface Person {
	id: string;
	name: string;
	/** Their own site, after redirects. This is their identity. */
	siteUrl: string;
	iconUrl?: string;
	/** Set when they were followed from the ring rather than from a pasted link. */
	ringId?: string;
	followedAt: string;
}

/** How a source entered this reader; this is provenance, not an identity guarantee. */
export type FeedProvenance = 'ring' | 'discovered' | 'manual' | 'opml';

export type AddFeedResult =
	| { status: 'added' }
	| { status: 'already-attached' }
	| { status: 'belongs-to-other'; personId: string };

/** One feed belonging to a person. Following a person follows all of theirs. */
export interface Feed {
	/** The feed's canonical URL, which is also its identity. */
	id: string;
	personId: string;
	url: string;
	/**
	 * Free text, not the closed FeedKind union `@yipden/feeds` discovers with. The ring's own
	 * feeds[].type field is documented as free text so a new platform never needs a client
	 * release, and a value that arrived from there must be representable here too. UI code
	 * that wants a label for one falls back to something generic for a kind it does not know.
	 */
	kind: string;
	title: string;
	verified: boolean;
	/** Manual means reader-supplied and remains unverified unless a separate proof exists. */
	provenance?: FeedProvenance;
	/** Conditional request validators from the last fetch, so the next one costs nothing. */
	etag?: string;
	lastModified?: string;
	lastFetchedAt?: string;
	/** Consecutive failures, so a dead feed can be backed off rather than retried forever. */
	failures: number;
	/** False keeps the feed but stops fetching it. */
	enabled: boolean;
}

/**
 * Which filter pane a yip belongs to.
 *
 * Decided once when the yip is stored rather than on every render, because Feeds filters by it
 * and a filter that has to open every record to answer is a filter that stutters on scroll.
 */
export type YipCategory = 'posts' | 'watch' | 'listen';

/** A yip as stored: the parsed item plus what this reader has done with it. */
export interface StoredYip extends Item {
	/** Unique across feeds: an item id is only stable within the feed that published it. */
	key: string;
	/** The followed feed record this came from. Absent only on records stored before this field. */
	feedId?: string;
	personId: string;
	/** See `Feed.kind`: free text, not the closed union. */
	feedKind: string;
	category: YipCategory;
	readAt?: string;
	/** When this reader first saw it, which is how "new" is counted. */
	seenAt: string;
}

export interface YipQuery {
	/** Feeds' filter pills. */
	filter?: 'everything' | 'posts' | 'watch' | 'listen';
	/** Only items from these followed feed records. An empty list intentionally returns none. */
	feedIds?: string[];
	limit?: number;
	/** Cursor: return yips older than this ISO timestamp. */
	before?: string;
}

export type SettingKey =
	'lastRefreshAt' | 'includeExplicit' | 'ringFilter' | 'ringQueue' | 'shuffleMusic';

/**
 * Cached waveform peaks, keyed by media URL and ETag so a track is decoded at most once.
 *
 * Decoding means downloading the whole file, which spends a creator's bandwidth. Doing it
 * twice for the same track would be spending it for nothing.
 */
export interface PeaksRecord {
	key: string;
	peaks: number[];
	duration: number;
	cachedAt: string;
}

export interface Store {
	/** Open the database and run any migrations. Safe to call more than once. */
	init(): Promise<void>;

	listPeople(): Promise<Person[]>;
	listFeeds(personId?: string): Promise<Feed[]>;
	/** Follow a person and their feeds in one transaction, so a partial follow cannot happen. */
	follow(person: Person, feeds: Feed[]): Promise<void>;
	/** Attach one source without overwriting a source already owned by another person. */
	addFeed(feed: Feed): Promise<AddFeedResult>;
	/** Remove one source and only the cached yips that came from it. */
	removeFeed(personId: string, feedId: string): Promise<void>;
	/** Unfollow a person, their feeds and their yips. A reader's undo is following again. */
	unfollow(personId: string): Promise<void>;
	isFollowing(siteUrl: string): Promise<boolean>;
	updateFeed(feed: Feed): Promise<void>;

	putYips(yips: StoredYip[]): Promise<{ added: number }>;
	listYips(query?: YipQuery): Promise<StoredYip[]>;
	/** Every cached record, including undated items omitted by the publishedAt index. */
	listAllYips(): Promise<StoredYip[]>;
	countUnread(): Promise<{ yips: number; people: number }>;
	markRead(keys: string | string[]): Promise<void>;
	markAllRead(): Promise<void>;
	clearYips(): Promise<void>;

	readRing(): Promise<RingCacheRecord | null>;
	writeRing(record: RingCacheRecord): Promise<void>;

	readPeaks(key: string): Promise<PeaksRecord | null>;
	writePeaks(record: PeaksRecord): Promise<void>;

	getSetting<T>(key: SettingKey): Promise<T | null>;
	setSetting<T>(key: SettingKey, value: T): Promise<void>;
}
