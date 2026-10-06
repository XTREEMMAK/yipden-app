import type { Item } from '@yipden/feeds';
import type { RingCacheRecord, SiteLayout } from '@yipden/ring-client';
import type { Reference } from '../references/types.js';

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
	/**
	 * How their site is built to be read, when known: declared by the ring, or guessed once from
	 * the page discovery fetched. Absent means unknown, which is treated as mobile friendly.
	 */
	layout?: SiteLayout;
	followedAt: string;
	/** The reader's own folder for them, one at most. See `folders.ts`. */
	folder?: string;
	/** Only keep posts newer than this many days. Absent uses the reader's default. */
	maxAgeDays?: number;
}

/** How a source entered this reader; this is provenance, not an identity guarantee. */
export type FeedProvenance = 'ring' | 'discovered' | 'manual' | 'opml';

export type AddFeedResult =
	| { status: 'added' }
	| { status: 'already-attached' }
	| { status: 'belongs-to-other'; personId: string };

/**
 * What kind of failure a check hit, so You can say whether to wait, retry or replace the address
 * rather than one undifferentiated "failed".
 *
 * - `offline`: no answer at all (no connection, DNS, timeout). Usually temporary.
 * - `gone`: 404 or 410. The feed most likely moved.
 * - `refused`: 401, 403 or 451. The site answered and said no.
 * - `server`: any other HTTP error, 5xx and 429 included. Usually temporary.
 * - `blocked`: the site's robots.txt disallows the path, and YipDen honors that.
 * - `not-a-feed`: the address answered, but with something that does not parse as a feed.
 * - `unreadable`: YipDen's own safety limits refused it (unsafe address, redirect loop, too big).
 */
export type FeedProblem =
	'offline' | 'gone' | 'refused' | 'server' | 'blocked' | 'not-a-feed' | 'unreadable';

export interface FeedError {
	kind: FeedProblem;
	/** The HTTP status, when the site answered with one. */
	status?: number;
}

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
	/**
	 * What the `FeedSource` returned last time, handed back on the next fetch so an unchanged
	 * feed costs its host nothing. Opaque here: only the source that wrote it reads it.
	 */
	cursor?: string;
	/**
	 * The validators a fetch kept before `cursor` existed. Read once to build a first cursor and
	 * dropped on the next successful check; the move to the encrypted store converts the rest.
	 */
	etag?: string;
	lastModified?: string;
	/** The feed's WebSub hub, when it announces one. Recorded for v2.0's poller, unused here. */
	hubUrl?: string;
	lastFetchedAt?: string;
	/** Consecutive failures, so a dead feed can be backed off rather than retried forever. */
	failures: number;
	/** Why the most recent check failed. Cleared by the next successful one. */
	lastError?: FeedError;
	/** False keeps the feed but stops fetching it. */
	enabled: boolean;
	/**
	 * The feed's own picture where it differs from its person's: a YouTube channel's avatar,
	 * shown on that channel's cards. Empty once looked for and not found, so it is asked once.
	 */
	iconUrl?: string;
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
	/**
	 * The yip's stable `id`. Records stored as `${feedId}::${entryId}` before 2026-10-04 were
	 * moved to it by `rekey.ts`, on the move into the encrypted store or on a backup import.
	 */
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

/**
 * A link a reader set aside to open on a bigger screen. It is local until the reader exports it,
 * and it is only a link: what it points at stays on its creator's own site.
 */
export interface ShelfItem {
	/** The saved address, which is also its identity: saving one page twice is one entry. */
	id: string;
	url: string;
	title: string;
	/** Whose it is, when known: a person the reader follows, or a ring member. */
	creator?: string;
	/** A partner ring's name, when the link came to the reader through one. */
	via?: string;
	/** The member's badge or picture, when the ring had one, shown beside it in You. */
	thumbUrl?: string;
	/** Which screen it was saved from. */
	from: 'discover' | 'feeds';
	savedAt: string;
}

/**
 * What a reader thinks of a creator they have not followed: liked, or not for me.
 *
 * Keyed by the creator's site, not by which ring showed them, so the same creator seen in the
 * IndieNodes ring and in a partner ring is one verdict. Private to this device like the rest.
 */
export type Verdict = 'liked' | 'hidden';

export interface VerdictRecord {
	/** `verdictKey(url)`: the site without scheme, `www.` or trailing slash. */
	id: string;
	url: string;
	name: string;
	verdict: Verdict;
	/** Which kind of ring it was found in. */
	source: 'indienodes' | 'partner';
	/** A partner ring's name, when it came from one. */
	via?: string;
	thumbUrl?: string;
	at: string;
}

/**
 * How strong a creator's home address is, strongest first: their own domain; a hand-made site on
 * a host (Neocities and the like); a profile they control on an open platform (Bluesky,
 * Mastodon, PeerTube); a profile on a closed one (Instagram, TikTok, Etsy).
 */
export type HomeKind = 'own-site' | 'hosted-site' | 'open-profile' | 'closed-profile';

/** Another address that is the same creator, as the reader linked it. */
export interface CreatorAlias {
	url: string;
	/** `verdictKey(url)`, how everything kept about that address is filed. */
	key: string;
	addedAt: string;
}

/**
 * One creator known by more than one address, or whose home the reader chose (the Creator
 * Database, step 2). Only written when that is so: a creator known by one address has no record,
 * and is simply their `verdictKey`.
 *
 * `id` is the key they were first known by and never changes, so everything already filed under
 * it (Liked, the Library, layout) stays where it is. Aliases are not moved under it either: a
 * profile gathers what is filed under each, which keeps unlinking one exact.
 */
export interface CreatorRecord {
	id: string;
	/** The address `id` was made from. */
	url: string;
	/** The best address known for them, shown as theirs. */
	home: string;
	homeKind: HomeKind;
	/** The reader picked the home, rather than it being the strongest address. */
	homeChosen?: boolean;
	aliases: CreatorAlias[];
	updatedAt: string;
}

/**
 * How sure YipDen is that a place is a creator's, strongest first (the Creator Database, step 3):
 * - `two-way`: their site names it as theirs (`rel=me`) and it names their site back.
 * - `their-site`: their site names it as theirs.
 * - `their-page`: their site links it, without saying it is theirs.
 * - `you`: the reader added it, and their site says nothing either way.
 * Ranked by this, never by how many people agree: the README's no-ranking rule.
 */
export type PlaceEvidence = 'two-way' | 'their-site' | 'their-page' | 'you';

/** What a place is for a creator. */
export type PlaceRole = 'profile' | 'site' | 'shop' | 'commissions' | 'support';

/** Somewhere a creator is: a profile, a shop, a second site. Never their content, only the link. */
export interface PlaceRecord {
	/** `${creatorKey}::${key}`. */
	id: string;
	/** The creator it belongs to: `creators.idFor` of their address when it was found. */
	creatorKey: string;
	url: string;
	/** `verdictKey(url)`. */
	key: string;
	role: PlaceRole;
	evidence: PlaceEvidence;
	/** The reader said it is not theirs: kept so their site cannot add it back. */
	hidden?: boolean;
	addedAt: string;
	/** When a two-way link was last looked for. */
	checkedAt?: string;
}

/**
 * A followed forum, or one category of it. Forums stand on their own: never a person's source,
 * never in the ring. Following a whole forum and a category of it at once is not offered.
 */
export interface ForumFollow {
	/** `forumUrl`, or `forumUrl#c<categoryId>` for one category. */
	id: string;
	/** The forum's root, no trailing slash. */
	forumUrl: string;
	title: string;
	description?: string;
	logoUrl?: string;
	/** Null for the whole forum. */
	categoryId: number | null;
	categoryName?: string;
	/** Names for the categories its topics come from, read when it was followed or edited. */
	categoryNames?: Record<string, string>;
	followedAt: string;
	/** How often it is checked by itself. A pull to refresh on Forums checks it regardless. */
	refreshHours: number;
	lastCheckedAt?: string;
	/** What the last check returned for the next one, unread here. */
	cursor?: string;
	status: 'ok' | 'members-only' | 'gone' | 'unreachable';
	failures: number;
}

/**
 * One topic in the forums digest, with what the reader has seen of it. Transient: dropped, with
 * its read state, once it has been quiet for the reader's window (14 days unless changed).
 */
export interface ForumTopicRecord {
	/** `forumUrl#<topicId>`. */
	key: string;
	forumUrl: string;
	/** The follow whose check brought it in, so unfollowing takes it away. */
	followId: string;
	topicId: number;
	title: string;
	url: string;
	categoryId: number | null;
	replyCount: number;
	highestPostNumber: number;
	/** ISO. */
	lastActivityAt: string | null;
	pinned: boolean;
	closed: boolean;
	/** When YipDen first saw it. */
	firstSeenAt: string;
	/** The newest post the reader had when they last opened it; absent until they do. */
	seenPostNumber?: number;
	seenAt?: string;
}

export type SettingKey =
	| 'lastRefreshAt'
	| 'includeExplicit'
	| 'ringFilter'
	| 'ringQueue'
	| 'shuffleMusic'
	| 'maxAgeDays'
	| 'markReadOnScroll'
	| 'ageLimitEnabled'
	| 'sounds'
	| 'partnerCache'
	| 'ringCheckedAt'
	| 'explored'
	| 'ringViews'
	| 'readerTracks'
	| 'layoutOverrides'
	| 'sitesInApp'
	| 'forumQuietDays';

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
	updatePerson(person: Person): Promise<void>;

	putYips(yips: StoredYip[]): Promise<{ added: number }>;
	listYips(query?: YipQuery): Promise<StoredYip[]>;
	/** Every cached record, including undated items omitted by the publishedAt index. */
	listAllYips(): Promise<StoredYip[]>;
	countUnread(): Promise<{ yips: number; people: number }>;
	markRead(keys: string | string[]): Promise<void>;
	markAllRead(): Promise<void>;
	clearYips(): Promise<void>;
	/** Drop a person's dated yips published before `cutoff` (ISO). Undated ones are kept. */
	pruneYips(personId: string, cutoff: string): Promise<number>;

	readRing(): Promise<RingCacheRecord | null>;
	writeRing(record: RingCacheRecord): Promise<void>;

	readPeaks(key: string): Promise<PeaksRecord | null>;
	writePeaks(record: PeaksRecord): Promise<void>;

	/** Newest first. */
	listShelf(): Promise<ShelfItem[]>;
	/** Idempotent: saving an address already on the shelf keeps the first save. */
	saveToShelf(item: ShelfItem): Promise<void>;
	removeFromShelf(id: string): Promise<void>;

	/** Newest first. */
	listVerdicts(): Promise<VerdictRecord[]>;
	/** One verdict per creator: setting another replaces the first. */
	setVerdict(record: VerdictRecord): Promise<void>;
	removeVerdict(id: string): Promise<void>;

	/** One creator's places, or every place. */
	listPlaces(creatorKey?: string): Promise<PlaceRecord[]>;
	/** Replaces the place with the same id. */
	putPlace(record: PlaceRecord): Promise<void>;
	removePlace(id: string): Promise<void>;

	listCreators(): Promise<CreatorRecord[]>;
	/** Replaces the record with the same id. */
	putCreator(record: CreatorRecord): Promise<void>;
	removeCreator(id: string): Promise<void>;

	getSetting<T>(key: SettingKey): Promise<T | null>;
	setSetting<T>(key: SettingKey, value: T): Promise<void>;

	/** Oldest first, so a creator's tracks keep the order they were kept in. */
	listReferences(creatorId?: string): Promise<Reference[]>;
	/** Replaces a reference with the same id. */
	putReference(reference: Reference): Promise<void>;
	removeReference(id: string): Promise<void>;
	/** What a re-check found. Leaves everything else about the reference as it was. */
	updateReferenceCheck(id: string, check: ReferenceCheck): Promise<void>;

	listForumFollows(): Promise<ForumFollow[]>;
	putForumFollow(follow: ForumFollow): Promise<void>;
	/** The follow and the topics its checks brought in. */
	removeForumFollow(id: string): Promise<void>;
	/** Newest activity first. */
	listForumTopics(): Promise<ForumTopicRecord[]>;
	/** A topic seen again keeps what the reader had seen of it, and when YipDen first saw it. */
	putForumTopics(topics: ForumTopicRecord[]): Promise<void>;
	markForumTopicSeen(key: string, postNumber: number, at: string): Promise<void>;
	/** Drop topics quiet since before `cutoff` (ISO), and what was seen of them. */
	pruneForumTopics(cutoff: string): Promise<number>;
}

export type ReferenceCheck = Pick<Reference, 'status' | 'checkedAt'> &
	Partial<Pick<Reference, 'etag' | 'canonicalUrl' | 'hostVerified' | 'sharable' | 'contentHash'>>;
