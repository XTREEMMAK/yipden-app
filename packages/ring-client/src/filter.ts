import type { RingEntry } from './types.js';
import { entriesOf, type Ring } from './rotation.js';

export interface RingFilter {
	types?: string[];
	forms?: string[];
	tags?: string[];
	/** 'any' matches entries carrying at least one tag, 'all' requires every tag. */
	tagMode?: 'any' | 'all';
	/**
	 * Explicit entries are self declared and hidden unless the reader opts in, matching the
	 * ring's own rule. Nothing about this is a quality judgement; it is the creator's flag.
	 */
	includeExplicit?: boolean;
}

function matches(entry: RingEntry, filter: RingFilter): boolean {
	if (entry.explicit === true && filter.includeExplicit !== true) return false;
	if (filter.types?.length && !filter.types.includes(entry.type)) return false;
	if (filter.forms?.length && !(entry.form && filter.forms.includes(entry.form))) return false;

	if (filter.tags?.length) {
		const wanted = filter.tags.map((tag) => tag.toLowerCase());
		const has = new Set(entry.tags ?? []);
		const hits = wanted.filter((tag) => has.has(tag)).length;
		if (filter.tagMode === 'all' ? hits < wanted.length : hits === 0) return false;
	}

	return true;
}

export function filterRing(ring: Ring, filter: RingFilter = {}): RingEntry[] {
	return entriesOf(ring).filter((entry) => matches(entry, filter));
}

/** Every tag in the ring with its count, most used first, for the Discover chip row. */
export function tagFacets(ring: Ring): Array<{ tag: string; count: number }> {
	const counts = new Map<string, number>();
	for (const entry of entriesOf(ring)) {
		for (const tag of entry.tags ?? []) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1));
}

export function typeFacets(ring: Ring): Array<{ type: string; count: number }> {
	const counts = new Map<string, number>();
	for (const entry of entriesOf(ring)) {
		counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([type, count]) => ({ type, count }))
		.sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1));
}
