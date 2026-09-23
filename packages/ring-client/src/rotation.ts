import type { RingDocument, RingEntry } from './types.js';

export type Ring = RingDocument | RingEntry[];

export function entriesOf(ring: Ring): RingEntry[] {
	return Array.isArray(ring) ? ring : ring.entries;
}

/**
 * The order every client walks the ring in.
 *
 * Sorted by id rather than trusting the document's array order, so two clients that fetched
 * the ring at different moments still agree on what "next" means and on which member is node
 * of the day. Hidden members are out: `discoverable: false` is the creator's own opt out, and
 * `_placeholder` marks seed rows that were never a real person.
 */
export function rotationOrder(ring: Ring): RingEntry[] {
	return entriesOf(ring)
		.filter((entry) => entry.discoverable !== false && entry._placeholder !== true)
		.slice()
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** FNV-1a, 32 bit. Small, dependency free, and identical in every language the ring reaches. */
function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** Mulberry32: one seed in, the same sequence out, on every device. */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** UTC calendar day, so the ring turns over at the same instant everywhere. */
export function dayKey(date: Date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

/**
 * The member Discover opens on today.
 *
 * Seeded from the UTC date alone, so every reader anywhere sees the same person without a
 * server telling them who it is. A reader whose own filters hide that member advances from
 * this position rather than seeing nothing.
 */
export function nodeOfTheDay(ring: Ring, date: Date = new Date()): RingEntry | null {
	const order = rotationOrder(ring);
	if (!order.length) return null;
	const index = hashString(dayKey(date)) % order.length;
	return order[index] ?? null;
}

function step(ring: Ring, id: string, delta: number): RingEntry | null {
	const order = rotationOrder(ring);
	if (!order.length) return null;
	const current = order.findIndex((entry) => entry.id === id);
	if (current === -1) return order[0] ?? null;
	const next = (current + delta + order.length) % order.length;
	return order[next] ?? null;
}

export function next(ring: Ring, id: string): RingEntry | null {
	return step(ring, id, 1);
}

export function prev(ring: Ring, id: string): RingEntry | null {
	return step(ring, id, -1);
}

/** Position of a member in the rotation, one based, for the "Ring 15 / 212" readout. */
export function positionOf(ring: Ring, id: string): { index: number; total: number } {
	const order = rotationOrder(ring);
	const index = order.findIndex((entry) => entry.id === id);
	return { index: index === -1 ? 0 : index + 1, total: order.length };
}

/**
 * A deterministic shuffle: the same seed always produces the same walk through the ring.
 *
 * Shuffle has to be reproducible so a reader can leave Discover and come back to the order
 * they were in, and so a test can assert on it.
 */
export function shuffle(ring: Ring, seed: number | string = Date.now()): RingEntry[] {
	const order = rotationOrder(ring);
	const random = seededRandom(typeof seed === 'number' ? seed : hashString(seed));
	for (let i = order.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		const a = order[i];
		const b = order[j];
		if (a && b) {
			order[i] = b;
			order[j] = a;
		}
	}
	return order;
}
