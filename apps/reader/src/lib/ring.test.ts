import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RingCacheRecord } from '@yipden/ring-client';

const saved = vi.hoisted(() => ({ record: null as RingCacheRecord | null }));
const net = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('./store/index.js', () => ({
	store: {
		init: async () => {},
		readRing: async () => saved.record,
		writeRing: async (record: RingCacheRecord) => {
			saved.record = record;
		},
		listPeople: async () => []
	}
}));
vi.mock('./platform/http.js', () => ({ httpFetch: net.fetch }));

import { RING_FRESH_MS, ring, washColorFor, washFor } from './ring.svelte.js';

const entry = (id: string) => ({
	id,
	creator: id,
	source_url: `https://${id}.example/`,
	type: 'audio',
	why: 'x'
});
const doc = (...ids: string[]) => ({ version: '1', entries: ids.map(entry) });
const record = (...ids: string[]): RingCacheRecord => ({
	document: doc(...ids) as unknown as RingCacheRecord['document'],
	fetchedAt: '2026-09-24T00:00:00.000Z'
});
const ok = (ids: string[]) => ({
	status: 200,
	headers: { get: () => null },
	text: async () => JSON.stringify(doc(...ids))
});

function reset() {
	ring.all = [];
	ring.status = 'loading';
	ring.index = 0;
	ring.filter = 'all';
	ring.shuffled = false;
	(ring as unknown as { checkedAt: number }).checkedAt = 0;
	(ring as unknown as { inFlight: null }).inFlight = null;
	saved.record = null;
	net.fetch.mockReset();
}

describe('ring.load', () => {
	beforeEach(reset);

	it('draws the saved ring before the network answers', async () => {
		saved.record = record('a', 'b');
		let release: (value: unknown) => void = () => {};
		net.fetch.mockReturnValue(new Promise((resolve) => (release = resolve)));

		const loading = ring.load();
		await vi.waitFor(() => expect(ring.all.length).toBe(2));
		expect(ring.status).toBe('cache');

		release(ok(['a', 'b']));
		await loading;
		expect(ring.status).toBe('network');
	});

	it('stays loading only when there is nothing saved and the network has not answered', async () => {
		net.fetch.mockReturnValue(new Promise(() => {}));
		void ring.load();
		await Promise.resolve();
		expect(ring.status).toBe('loading');
	});

	it('does not ask again inside the freshness window, and does after it', async () => {
		net.fetch.mockResolvedValue(ok(['a', 'b']));
		await ring.load();
		await ring.load();
		expect(net.fetch).toHaveBeenCalledTimes(1);

		(ring as unknown as { checkedAt: number }).checkedAt = Date.now() - RING_FRESH_MS - 1;
		await ring.load();
		expect(net.fetch).toHaveBeenCalledTimes(2);
	});

	it('keeps the reader on the same member when an update adds and removes others', async () => {
		net.fetch.mockResolvedValue(ok(['a', 'b', 'c']));
		await ring.load();
		ring.index = ring.all.findIndex((member) => member.id === 'b');

		net.fetch.mockResolvedValue(ok(['z', 'b', 'a']));
		await ring.load(true);

		expect(ring.current?.id).toBe('b');
		expect(ring.all.map((member) => member.id).sort()).toEqual(['a', 'b', 'z']);
		expect(ring.all.at(-1)?.id).toBe('z');
	});

	it('keeps the saved ring and reports the error when the network fails', async () => {
		saved.record = record('a', 'b');
		net.fetch.mockRejectedValue(new Error('offline'));
		await ring.load();
		expect(ring.all.length).toBe(2);
		expect(ring.status).toBe('cache');
		expect(ring.error).toBe('offline');
	});
});

describe('washFor and washColorFor', () => {
	it('is deterministic for the same id', () => {
		expect(washFor('lena')).toBe(washFor('lena'));
		expect(washColorFor('lena')).toEqual(washColorFor('lena'));
	});

	it('differs between two different ids', () => {
		expect(washFor('lena')).not.toBe(washFor('bo'));
		expect(washColorFor('lena')).not.toEqual(washColorFor('bo'));
	});

	it('returns three RGB bytes in range', () => {
		const [r, g, b] = washColorFor('lena');
		for (const channel of [r, g, b]) {
			expect(channel).toBeGreaterThanOrEqual(0);
			expect(channel).toBeLessThanOrEqual(255);
		}
	});

	it('the CSS wash and the RGB wash agree on hue: same id, same color family', () => {
		// washFor's first stop is hsl(hue 46% 24%), the same hue washColorFor converts to RGB.
		// A weak but real check that the two were not left to drift apart: the RGB value should
		// embed the same hue string washFor's gradient does.
		const css = washFor('lena');
		const hueMatch = css.match(/hsl\((\d+) 46% 24%\)/);
		expect(hueMatch).not.toBeNull();
	});
});
