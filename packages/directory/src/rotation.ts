import { dayKey } from '@yipden/ring-client';
import type { Person } from './types.js';

/**
 * The order every client walks the merged list in, so two phones that loaded at different
 * moments agree on what "next" means and on who is featured today: sorted by id, never by the
 * documents' own array order. `ring-client`'s own rotation stays as it is for other clients.
 */
export function rotationOrder(people: readonly Person[]): Person[] {
	return people.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** FNV-1a, 32 bit: the same as `ring-client`'s, so the same day picks the same way everywhere. */
function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

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

/** Who is featured today: one person a day, the same on every device (a deterministic day seed). */
export function featuredToday(people: readonly Person[], date: Date = new Date()): Person | null {
	const order = rotationOrder(people);
	if (!order.length) return null;
	return order[hashString(dayKey(date)) % order.length] ?? null;
}

function step(people: readonly Person[], id: string, by: number): Person | null {
	const order = rotationOrder(people);
	if (!order.length) return null;
	const at = order.findIndex((person) => person.id === id);
	if (at < 0) return order[0] ?? null;
	return order[(at + by + order.length) % order.length] ?? null;
}

export function next(people: readonly Person[], id: string): Person | null {
	return step(people, id, 1);
}

export function prev(people: readonly Person[], id: string): Person | null {
	return step(people, id, -1);
}

/** A shuffled order from a seed: the same seed gives the same order on every device. */
export function shuffle(people: readonly Person[], seed: number | string = Date.now()): Person[] {
	const order = rotationOrder(people);
	const random = seededRandom(typeof seed === 'number' ? seed : hashString(seed));
	for (let i = order.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[order[i], order[j]] = [order[j]!, order[i]!];
	}
	return order;
}
