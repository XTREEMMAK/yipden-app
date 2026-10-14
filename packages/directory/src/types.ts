import type { KnownFeedType } from '@yipden/ring-client';

/**
 * A person as a source lists them, ready to show in Discover.
 *
 * Not the reader's followed person: the app stores that as its own `Person`, so the app always
 * imports this one as `DirectoryPerson`. A person with no website and only a YouTube channel or a
 * Bluesky account is as complete as anyone: `siteUrl` is optional.
 */
export interface Person {
	/** Stable and source-prefixed: `indienodes:<id>`, `yipden:<id>`, `list:<list id>:<id>`. */
	id: string;
	name: string;
	/** The ring's `why`, or the curator's note. */
	note?: string;
	/** The creator's own image, never re-hosted. */
	thumbUrl?: string;
	thumbPosition?: { x: number; y: number };
	tags: string[];
	/**
	 * What they make, in the ring's own words (`audio`, `comic`, `art`, `text`, `game`), and for
	 * audio whether it is `music` or `spoken`: the same values Discover's chips filter ring members
	 * by. Optional in the directory.
	 */
	type?: string;
	form?: string;
	siteUrl?: string;
	feeds: PersonFeed[];
	tracks?: { label: string; mediaUrl: string }[];
	/** Which source listed them: `indienodes`, `yipden`, or `list:<id>` for a list a reader added. */
	source: string;
	/** The source's name for a label: "IndieNodes", "YipDen", or the list's own name. */
	sourceName: string;
	listing: Listing;
	discoverable: boolean;
	/**
	 * Every normalized form this person is known by (see `identity.ts`): dedupe joins people who
	 * share one, and an opt-out matches any of them.
	 */
	identities: string[];
}

/**
 * Why they are listed. `member`: they joined the IndieNodes ring (opted in). `confirmed`: they
 * told YipDen "yes, that's me". `curated`: YipDen listed them, with an opt-out. `list`: a list the
 * reader added names them; its publisher answers for it.
 */
export type Listing = 'member' | 'confirmed' | 'curated' | 'list';

export type FeedType = KnownFeedType | (string & {});

export interface PersonFeed {
	type: FeedType;
	url: string;
	/**
	 * True only for a two-way `rel="me"` link, or a Bluesky handle that is the person's own domain.
	 * Verified shows a small check; unverified shows nothing, never a warning.
	 */
	verified: boolean;
}

/** One entry of YipDen's `people.json`, as published. Additive: unknown fields are kept. */
export interface DirectoryEntry {
	id: string;
	name: string;
	note?: string;
	thumb_url?: string;
	thumb_position?: { x: number; y: number };
	tags?: string[];
	type?: string;
	form?: string;
	site_url?: string;
	feeds?: { type: string; url: string; verified?: boolean }[];
	tracks?: { label: string; media_url: string }[];
	listing?: 'curated' | 'confirmed';
	discoverable?: boolean;
	/** Extra normalized identities found by `directory:resolve` (a Bluesky account ID, say). */
	identities?: string[];
	added_at?: string;
	[unknownField: string]: unknown;
}

export interface DirectoryDocument {
	version: string;
	generated_at?: string;
	entries: DirectoryEntry[];
	[unknownField: string]: unknown;
}

/** `optouts.json`: hashes of the identities of people who asked not to be listed. */
export interface OptOutDocument {
	version: string;
	hashes: string[];
	[unknownField: string]: unknown;
}
