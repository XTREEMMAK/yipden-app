import { describe, expect, it } from 'vitest';
import extended from './fixtures/ring-extended.json' with { type: 'json' };
import live from './fixtures/ring-live.json' with { type: 'json' };
import { validate } from '../src/validate.js';
import {
	dayKey,
	next,
	nodeOfTheDay,
	positionOf,
	prev,
	rotationOrder,
	shuffle
} from '../src/rotation.js';

const ring = validate(live).document;
const extendedRing = validate(extended).document;

describe('rotationOrder', () => {
	it('walks the ring by id, not by the order the document happened to arrive in', () => {
		const shuffledDocument = { ...ring, entries: [...ring.entries].reverse() };
		expect(rotationOrder(shuffledDocument).map((entry) => entry.id)).toEqual(
			rotationOrder(ring).map((entry) => entry.id)
		);
	});

	it('leaves out members who opted out and seed rows', () => {
		const ids = rotationOrder(extendedRing).map((entry) => entry.id);
		expect(ids).not.toContain('audio-george-r-powell');
		expect(ids).not.toContain('text-placeholder-seed');
	});
});

describe('nodeOfTheDay', () => {
	it('picks the same member for the same UTC day on any device', () => {
		const morning = nodeOfTheDay(ring, new Date('2026-09-22T00:00:01.000Z'));
		const evening = nodeOfTheDay(ring, new Date('2026-09-22T23:59:59.000Z'));
		expect(morning?.id).toBe(evening?.id);
	});

	it('turns over from one day to the next', () => {
		const days = new Set<string>();
		for (let offset = 0; offset < 30; offset += 1) {
			const date = new Date(Date.UTC(2026, 8, 1 + offset));
			days.add(nodeOfTheDay(ring, date)?.id ?? 'none');
		}
		expect(days.size).toBeGreaterThan(1);
	});

	it('is stable for a known date, so a client and a website agree', () => {
		expect(nodeOfTheDay(ring, new Date('2026-09-22T12:00:00.000Z'))?.id).toBe(
			nodeOfTheDay(ring, new Date('2026-09-22T12:00:00.000Z'))?.id
		);
	});

	it('returns null for an empty ring', () => {
		expect(nodeOfTheDay({ version: '1.0', entries: [] })).toBeNull();
	});
});

describe('dayKey', () => {
	it('is the UTC calendar day', () => {
		expect(dayKey(new Date('2026-09-22T23:59:59.000Z'))).toBe('2026-09-22');
	});
});

describe('next and prev', () => {
	const order = rotationOrder(ring).map((entry) => entry.id);

	it('steps forward and back through the rotation', () => {
		expect(next(ring, order[0] as string)?.id).toBe(order[1]);
		expect(prev(ring, order[1] as string)?.id).toBe(order[0]);
	});

	it('wraps at both ends', () => {
		expect(next(ring, order[order.length - 1] as string)?.id).toBe(order[0]);
		expect(prev(ring, order[0] as string)?.id).toBe(order[order.length - 1]);
	});

	it('falls back to the first member for an id the ring no longer carries', () => {
		expect(next(ring, 'who-is-this')?.id).toBe(order[0]);
	});
});

describe('positionOf', () => {
	it('reads one based, for the Ring N of M line', () => {
		const order = rotationOrder(ring);
		expect(positionOf(ring, order[2]?.id as string)).toEqual({ index: 3, total: order.length });
	});
});

describe('shuffle', () => {
	it('returns the same walk for the same seed', () => {
		expect(shuffle(ring, 'seed-a').map((e) => e.id)).toEqual(
			shuffle(ring, 'seed-a').map((e) => e.id)
		);
	});

	it('returns every member exactly once', () => {
		const ids = shuffle(ring, 7)
			.map((entry) => entry.id)
			.sort();
		expect(ids).toEqual(
			rotationOrder(ring)
				.map((entry) => entry.id)
				.sort()
		);
	});

	it('does not mutate the document it was given', () => {
		const before = ring.entries.map((entry) => entry.id);
		shuffle(ring, 12);
		expect(ring.entries.map((entry) => entry.id)).toEqual(before);
	});
});
