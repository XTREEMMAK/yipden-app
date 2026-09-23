import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { formatTime, player, RATES, type QueueItem } from './player.svelte.js';
import { store } from './store/index.js';

function item(overrides: Partial<QueueItem> = {}): QueueItem {
	return {
		id: 'a',
		title: 'Low Tide',
		creator: 'Ada Reed',
		url: 'https://ada.example.com/low-tide',
		siteUrl: 'https://ada.example.com/low-tide',
		artUrl: null,
		mediaUrl: 'https://ada.example.com/low-tide.mp3',
		...overrides
	};
}

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	await store.init();
	// Reset player state between tests; it is a module singleton, same as `store`.
	player.queue = [];
	player.currentIndex = -1;
	player.playing = false;
	player.currentTime = 0;
	player.duration = 0;
	player.rate = 1;
	player.sheet = 'hidden';
});

describe('formatTime', () => {
	it.each([
		[0, '0:00'],
		[5, '0:05'],
		[65, '1:05'],
		[3723, '62:03']
	])('formats %i seconds as %s', (seconds, expected) => {
		expect(formatTime(seconds)).toBe(expected);
	});

	it('refuses a negative or non-finite value rather than showing garbage', () => {
		expect(formatTime(-5)).toBe('0:00');
		expect(formatTime(Number.NaN)).toBe('0:00');
		expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
	});
});

describe('play and the queue', () => {
	it('starts at the given index and opens the full sheet', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1);
		expect(player.current?.id).toBe('b');
		expect(player.sheet).toBe('full');
	});

	it('reports the next item, wrapping at the end', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1);
		expect(player.next?.id).toBe('a');
	});

	it('reports no next item alone in the queue', () => {
		player.play([item({ id: 'a' })], 0);
		expect(player.next).toBeNull();
	});

	it('advances forward and wraps around', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })], 2);
		player.advance();
		expect(player.current?.id).toBe('a');
	});

	it('steps back and wraps the other way', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 0);
		player.back();
		expect(player.current?.id).toBe('b');
	});

	it('does nothing on back or advance alone in the queue, beyond stopping playback', () => {
		player.play([item({ id: 'a' })], 0);
		const before = player.current?.id;
		player.back();
		expect(player.current?.id).toBe(before);
	});

	it('resets the clock when loading a new item', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 0);
		player.currentTime = 42;
		player.duration = 100;
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1);
		expect(player.currentTime).toBe(0);
		expect(player.duration).toBe(0);
	});
});

describe('the sheet', () => {
	it('collapses full to mini and no further', () => {
		player.play([item()], 0);
		player.collapse();
		expect(player.sheet).toBe('mini');
		player.collapse();
		expect(player.sheet).toBe('mini');
	});

	it('expands back to full when something is loaded', () => {
		player.play([item()], 0);
		player.collapse();
		player.expand();
		expect(player.sheet).toBe('full');
	});

	it('does not expand with nothing loaded', () => {
		player.expand();
		expect(player.sheet).toBe('hidden');
	});
});

describe('cycleRate', () => {
	it('walks the fixed rates and wraps', () => {
		expect(player.rate).toBe(1);
		for (const expected of [1.25, 1.5, 2, 1]) {
			player.cycleRate();
			expect(player.rate).toBe(expected);
		}
	});

	it('only ever lands on a declared rate', () => {
		for (let i = 0; i < RATES.length * 2; i += 1) {
			player.cycleRate();
			expect(RATES).toContain(player.rate);
		}
	});
});

describe('seek and skip', () => {
	it('does nothing with nothing loaded', () => {
		player.seek(30);
		expect(player.currentTime).toBe(0);
	});
});

describe('peaks caching', () => {
	// player wraps the app's one long-lived store singleton, same as production, so its
	// IndexedDB connection outlives any single test's reset of the global indexedDB factory.
	// Each test below uses its own media URL rather than fighting that, the same way two real
	// tracks never collide with each other.

	it('returns null for a track never cached', async () => {
		expect(await player.readPeaks('https://example.com/never-cached.mp3')).toBeNull();
	});

	it('round trips peaks for a track', async () => {
		await player.writePeaks('https://example.com/round-trip.mp3', [0.1, 0.9, 0.4], 183);
		const record = await player.readPeaks('https://example.com/round-trip.mp3');
		expect(record?.duration).toBe(183);
		expect(record?.peaks).toEqual([0.1, 0.9, 0.4]);
	});

	it('keys by ETag as well as URL, so a re-encoded file is not served stale peaks', async () => {
		await player.writePeaks('https://example.com/etag.mp3', [0.1], 10, 'W/"v1"');
		expect(await player.readPeaks('https://example.com/etag.mp3', 'W/"v2"')).toBeNull();
		expect((await player.readPeaks('https://example.com/etag.mp3', 'W/"v1"'))?.duration).toBe(10);
	});

	it('treats no ETag as its own key, distinct from any specific one', async () => {
		await player.writePeaks('https://example.com/no-etag.mp3', [0.1], 10);
		expect(await player.readPeaks('https://example.com/no-etag.mp3', 'W/"v1"')).toBeNull();
		expect(await player.readPeaks('https://example.com/no-etag.mp3')).not.toBeNull();
	});

	it('treats peaks older than the cache ceiling as absent', async () => {
		await store.writePeaks({
			key: 'https://example.com/stale.mp3',
			peaks: [0.1],
			duration: 10,
			cachedAt: '2020-01-01T00:00:00.000Z'
		});
		expect(await player.readPeaks('https://example.com/stale.mp3')).toBeNull();
	});
});
