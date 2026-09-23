import {
	fetchRing,
	filterRing,
	heroImage,
	next as nextInRing,
	nodeOfTheDay,
	positionOf,
	prev as prevInRing,
	shuffle,
	typeFacets,
	type RingEntry,
	type RingSource
} from '@yipden/ring-client';
import { httpFetch } from './platform/http.js';
import { store } from './store/index.js';

/**
 * Discover's state: the ring, where the reader is in it, and what they have filtered to.
 *
 * The rotation itself lives in `@yipden/ring-client` rather than here, so the website and any
 * other client land on the same member on the same day. This file is only the part that is
 * about this app: loading, caching, and which chip is pressed.
 */

/** The filter chips, mapped onto what the ring actually publishes. */
export const RING_FILTERS = [
	{ key: 'all', label: 'All' },
	{ key: 'music', label: 'Music', type: 'audio', form: 'music' },
	{ key: 'spoken', label: 'Spoken', type: 'audio', form: 'spoken' },
	{ key: 'art', label: 'Art', type: 'art' },
	{ key: 'comics', label: 'Comics', type: 'comic' },
	{ key: 'words', label: 'Words', type: 'text' },
	{ key: 'games', label: 'Games', type: 'game' }
] as const;

export type RingFilterKey = (typeof RING_FILTERS)[number]['key'];

class RingState {
	/** Every discoverable member, in the order every client agrees on. */
	all = $state<RingEntry[]>([]);
	status = $state<'loading' | RingSource>('loading');
	error = $state<string | null>(null);
	fetchedAt = $state<string | null>(null);

	filter = $state<RingFilterKey>('all');
	/** The member on screen. An index into `visible`. */
	index = $state(0);
	/** True while the reader is walking their own shuffled order. */
	shuffled = $state(false);

	/** Site URLs this reader already follows, so the hero button tells the truth. */
	following = $state<Set<string>>(new Set());

	private shuffledOrder = $state<RingEntry[]>([]);

	visible = $derived.by(() => {
		const source = this.shuffled ? this.shuffledOrder : this.all;
		const chip = RING_FILTERS.find((entry) => entry.key === this.filter);
		if (!chip || chip.key === 'all') return source;

		return filterRing(source, {
			types: [chip.type],
			...('form' in chip && chip.form ? { forms: [chip.form] } : {})
		});
	});

	current = $derived(this.visible[Math.min(this.index, this.visible.length - 1)] ?? null);

	/** "Node of the day" only when the reader has not moved or filtered away from it. */
	isNodeOfTheDay = $derived(
		this.filter === 'all' && !this.shuffled && this.index === 0 && this.current !== null
	);

	position = $derived.by(() => {
		if (!this.current) return { index: 0, total: 0 };
		if (this.filter === 'all' && !this.shuffled) return positionOf(this.all, this.current.id);
		return { index: this.index + 1, total: this.visible.length };
	});

	heroImage = $derived(this.current ? heroImage(this.current) : null);

	/** Which chips to show: a chip that would empty the screen is not offered. */
	chips = $derived.by(() => {
		const counts = new Map(typeFacets(this.all).map((facet) => [facet.type, facet.count]));
		return RING_FILTERS.filter((chip) => chip.key === 'all' || (counts.get(chip.type) ?? 0) > 0);
	});

	/**
	 * Load the ring, from the network when it can and from the last good copy when it cannot.
	 *
	 * Discover must render offline, so nothing here throws: a failed fetch leaves the cached
	 * ring on screen and records why, and an empty ring is a state the screen can draw.
	 */
	async load(): Promise<void> {
		await store.init();

		const result = await fetchRing({
			fetch: httpFetch,
			cache: {
				read: () => store.readRing(),
				write: (record) => store.writeRing(record)
			}
		});

		this.all = result.document.entries.filter(
			(entry) => entry.discoverable !== false && entry._placeholder !== true
		);
		this.status = result.source;
		this.error = result.error?.message ?? null;
		this.fetchedAt = result.fetchedAt;

		// Open on the member every client sees today, then let the reader walk from there.
		const today = nodeOfTheDay(this.all);
		if (today) {
			const at = this.all.findIndex((entry) => entry.id === today.id);
			this.all = at > 0 ? [...this.all.slice(at), ...this.all.slice(0, at)] : this.all;
		}

		await this.refreshFollowing();
	}

	async refreshFollowing(): Promise<void> {
		const people = await store.listPeople();
		this.following = new Set(people.map((person) => person.siteUrl));
	}

	isFollowing(entry: RingEntry | null): boolean {
		return entry ? this.following.has(entry.source_url) : false;
	}

	next(): void {
		if (!this.visible.length) return;
		this.index = (this.index + 1) % this.visible.length;
	}

	prev(): void {
		if (!this.visible.length) return;
		this.index = (this.index - 1 + this.visible.length) % this.visible.length;
	}

	setFilter(key: RingFilterKey): void {
		this.filter = key;
		this.index = 0;
	}

	/**
	 * A shuffle the reader can walk and come back to.
	 *
	 * Seeded from the clock once rather than reshuffling on every step, so going back one lands
	 * where they just were instead of somewhere new.
	 */
	shuffle(): void {
		this.shuffledOrder = shuffle(this.all, Date.now());
		this.shuffled = true;
		this.index = 0;
	}
}

export const ring = new RingState();

/** Used by the hero when a member has no image at all: a wash derived from their id. */
export function washFor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	const hue = hash % 360;
	return `linear-gradient(160deg, hsl(${hue} 46% 24%), hsl(${(hue + 38) % 360} 52% 12%))`;
}

export { nextInRing, prevInRing };
