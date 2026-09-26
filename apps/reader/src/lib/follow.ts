import type { DiscoveredFeed, DiscoveryResult } from '@yipden/feeds';
import { discoverWithDeadline } from './discovery.js';
import { heroImage, type RingEntry } from '@yipden/ring-client';
import { store, type Feed, type Person } from './store/index.js';

/**
 * Following, which is the only thing in this app a reader does to someone else.
 *
 * It is private to the device: nothing is posted, nothing is announced, and the creator is not
 * notified. That is written on the Follow screen in plain words, so it has to be true here.
 */

export interface FollowOutcome {
	person: Person;
	feeds: Feed[];
	/** True when the feeds had to be discovered because the ring did not publish them. */
	discovered: boolean;
}

function personFromRing(entry: RingEntry): Person {
	const icon = heroImage(entry);
	return {
		id: `ring:${entry.id}`,
		name: entry.creator,
		siteUrl: entry.source_url,
		...(icon ? { iconUrl: icon } : {}),
		ringId: entry.id,
		followedAt: new Date().toISOString()
	};
}

/**
 * The minimal shape `feedsFrom` needs. `kind` is a plain string, not the closed `FeedKind`
 * union `@yipden/feeds` discovers with, because a ring entry's own `feeds[].type` is
 * documented as free text: a new platform never needs a client release to be followable.
 */
export interface FeedCandidate {
	url: string;
	kind: string;
	title: string;
	verified: boolean;
}

function feedsFrom(
	personId: string,
	found: FeedCandidate[],
	provenance: NonNullable<Feed['provenance']>
): Feed[] {
	return found.map((feed) => ({
		id: feed.url,
		personId,
		url: feed.url,
		kind: feed.kind,
		title: feed.title,
		verified: feed.verified,
		provenance,
		failures: 0,
		enabled: true
	}));
}

/** Save only the Ring sources the reader kept switched on in the Follow screen. */
export async function followRingSelection(
	entry: RingEntry,
	selected: FeedCandidate[]
): Promise<FollowOutcome> {
	const person = personFromRing(entry);
	const feeds = feedsFrom(person.id, selected, 'ring');
	await store.follow(person, feeds);
	return { person, feeds, discovered: false };
}

/**
 * Follow a ring member and everything they publish, in one tap.
 *
 * When the ring publishes their `feeds`, that is the answer and no network call is needed.
 * When it does not, discovery runs against their site, which is slower and finds less: it
 * cannot know about a Bluesky account their site never links to. See docs/ring-contract.md.
 */
export async function followRingEntry(entry: RingEntry): Promise<FollowOutcome> {
	const person = personFromRing(entry);

	if (entry.feeds?.length) {
		return followRingSelection(
			entry,
			entry.feeds.map((feed) => ({
				url: feed.url,
				kind: feed.type || 'blog',
				title: entry.creator,
				verified: feed.verified === true
			}))
		);
	}

	const found = await discoverWithDeadline(entry.source_url);
	const feeds = feedsFrom(person.id, found.feeds, 'discovered');
	await store.follow(person, feeds);
	return { person, feeds, discovered: true };
}

/**
 * Follow from the paste a link flow, with only the feeds the reader kept switched on.
 *
 * Never everything that was found: the toggles exist because a reader gets to decide which
 * parts of a person they want, and silently following all of them would make the list a
 * decoration.
 */
export async function followDiscovered(
	result: DiscoveryResult,
	selected: DiscoveredFeed[]
): Promise<FollowOutcome> {
	const person: Person = {
		id: `site:${result.canonicalUrl}`,
		name: result.title ?? new URL(result.canonicalUrl).hostname.replace(/^www\./, ''),
		siteUrl: result.canonicalUrl,
		...(result.iconUrl ? { iconUrl: result.iconUrl } : {}),
		followedAt: new Date().toISOString()
	};

	const feeds = feedsFrom(person.id, selected, 'discovered');
	await store.follow(person, feeds);
	return { person, feeds, discovered: true };
}

export async function unfollow(personId: string): Promise<void> {
	await store.unfollow(personId);
}
