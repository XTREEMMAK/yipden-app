import type { Person } from './types.js';

/** The three kinds Discover filters by, matching Yips' Posts, Watch and Listen. */
export type FeedKind = 'posts' | 'watch' | 'listen';

const WATCH = new Set(['youtube', 'peertube', 'video', 'twitch']);
const LISTEN = new Set(['podcast', 'audio']);

export function kindOfFeed(type: string): FeedKind {
	const lower = type.toLowerCase();
	if (WATCH.has(lower)) return 'watch';
	if (LISTEN.has(lower)) return 'listen';
	return 'posts';
}

/** What a person can be followed for: their feeds' kinds, and Listen when they list tracks. */
export function kindsOf(person: Person): Set<FeedKind> {
	const kinds = new Set<FeedKind>(person.feeds.map((feed) => kindOfFeed(feed.type)));
	if (person.tracks?.length) kinds.add('listen');
	return kinds;
}

export interface PeopleFilter {
	/** Any of these tags. */
	tags?: readonly string[];
	kind?: FeedKind;
}

export function filterPeople(people: readonly Person[], filter: PeopleFilter = {}): Person[] {
	const tags = (filter.tags ?? []).map((tag) => tag.toLowerCase());
	return people.filter((person) => {
		if (tags.length && !person.tags.some((tag) => tags.includes(tag.toLowerCase()))) return false;
		if (filter.kind && !kindsOf(person).has(filter.kind)) return false;
		return true;
	});
}

/** Tags in use, most common first, for a filter's chips. */
export function tagCounts(people: readonly Person[]): { tag: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const person of people) {
		for (const tag of new Set(person.tags.map((t) => t.toLowerCase()))) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
