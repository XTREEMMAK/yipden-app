import {
	cachedRing,
	fetchRing,
	filterRing,
	heroImage,
	next as nextInRing,
	nodeOfTheDay,
	positionOf,
	prev as prevInRing,
	shuffle,
	typeFacets,
	type FetchRingResult,
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

/** How long a checked ring is trusted before Discover asks again. */
export const RING_FRESH_MS = 15 * 60 * 1000;

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

	/** When the network last answered, or the ring was last confirmed current. Not persisted. */
	private checkedAt = 0;
	private inFlight: Promise<void> | null = null;

	/**
	 * Load the ring: the saved copy first, then a check of the network in the background.
	 *
	 * Discover must render at once and offline, so nothing here throws and nothing waits on the
	 * network before drawing what it already has. A ring checked within `RING_FRESH_MS` is not
	 * asked about again (opening Discover, or coming back to the app, is not a reason to spend
	 * a request), and a check that finds nothing changed leaves the screen exactly as it was.
	 */
	load(force = false): Promise<void> {
		this.inFlight ??= this.run(force).finally(() => (this.inFlight = null));
		return this.inFlight;
	}

	private async run(force: boolean): Promise<void> {
		await store.init();

		if (!this.all.length) {
			const saved = await cachedRing({ read: () => store.readRing(), write: () => {} });
			if (saved) this.apply(saved);
		}

		if (!force && this.all.length && Date.now() - this.checkedAt < RING_FRESH_MS) {
			await this.refreshFollowing();
			return;
		}

		const result = await fetchRing({
			fetch: httpFetch,
			cache: {
				read: () => store.readRing(),
				write: (record) => store.writeRing(record)
			}
		});

		if (result.source === 'network') {
			this.apply(result);
		} else if (result.source === 'empty') {
			this.status = this.all.length ? this.status : 'empty';
		} else if (result.source === 'not-modified') {
			this.status = 'not-modified';
		}
		this.error = result.error?.message ?? null;
		// A failed check is not recorded, so the next visit or resume tries again.
		if (!result.error) this.checkedAt = Date.now();

		await this.refreshFollowing();
	}

	/**
	 * Take a ring document onto the screen. The first one opens on the member every client sees
	 * today; a later one keeps the reader's order and place, adding new members at the end and
	 * dropping any that left, so a background update never moves what they are looking at.
	 */
	private apply(result: FetchRingResult): void {
		const entries = result.document.entries.filter(
			(entry) => entry.discoverable !== false && entry._placeholder !== true
		);
		this.status = result.source;
		this.fetchedAt = result.fetchedAt;

		if (!this.all.length) {
			const today = nodeOfTheDay(entries);
			const at = today ? entries.findIndex((entry) => entry.id === today.id) : 0;
			this.all = at > 0 ? [...entries.slice(at), ...entries.slice(0, at)] : entries;
			return;
		}

		const currentId = this.current?.id;
		const fresh = new Map(entries.map((entry) => [entry.id, entry]));
		const kept = this.all.flatMap((entry) => fresh.get(entry.id) ?? []);
		const known = new Set(this.all.map((entry) => entry.id));
		this.all = [...kept, ...entries.filter((entry) => !known.has(entry.id))];
		if (this.shuffled) {
			this.shuffledOrder = this.shuffledOrder.flatMap((entry) => fresh.get(entry.id) ?? []);
		}
		const at = this.visible.findIndex((entry) => entry.id === currentId);
		this.index = at >= 0 ? at : 0;
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

function hueFor(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	return hash % 360;
}

/** Used by the hero when a member has no image at all: a wash derived from their id. */
export function washFor(id: string): string {
	const hue = hueFor(id);
	return `linear-gradient(160deg, hsl(${hue} 46% 24%), hsl(${(hue + 38) % 360} 52% 12%))`;
}

/**
 * The wash's own first color stop, as RGB bytes rather than CSS: what the WebGL hero paints
 * for a member whose photo will not load, so a reader who never gets to see a real photo still
 * gets a wipe that goes somewhere member-specific rather than the same flat placeholder brown
 * every time.
 */
export function washColorFor(id: string): [number, number, number] {
	return hslToRgb(hueFor(id), 46, 24);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const sFrac = s / 100;
	const lFrac = l / 100;
	const c = (1 - Math.abs(2 * lFrac - 1)) * sFrac;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = lFrac - c / 2;
	const [r, g, b] =
		h < 60
			? [c, x, 0]
			: h < 120
				? [x, c, 0]
				: h < 180
					? [0, c, x]
					: h < 240
						? [0, x, c]
						: h < 300
							? [x, 0, c]
							: [c, 0, x];
	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export { nextInRing, prevInRing };
