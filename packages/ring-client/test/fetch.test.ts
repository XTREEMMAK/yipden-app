import { describe, expect, it, vi } from 'vitest';
import live from './fixtures/ring-live.json' with { type: 'json' };
import {
	cachedRing,
	fetchRing,
	memoryCache,
	type FetchLike,
	type RingCacheRecord
} from '../src/fetch.js';
import { validate } from '../src/validate.js';

function response(
	status: number,
	body: string,
	headers: Record<string, string> = {}
): Awaited<ReturnType<FetchLike>> {
	const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	return {
		status,
		headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
		text: async () => body
	};
}

const liveBody = JSON.stringify(live);
const cachedRecord = (): RingCacheRecord => ({
	document: validate(live).document,
	etag: 'W/"abc"',
	lastModified: 'Tue, 22 Sep 2026 17:32:39 GMT',
	fetchedAt: '2026-09-22T17:40:00.000Z'
});

describe('fetchRing', () => {
	it('reads a fresh ring and writes it to the cache', async () => {
		const cache = memoryCache();
		const result = await fetchRing({
			fetch: async () => response(200, liveBody, { etag: 'W/"abc"' }),
			cache,
			now: () => new Date('2026-09-22T18:00:00.000Z')
		});

		expect(result.source).toBe('network');
		expect(result.document.entries).toHaveLength(live.entries.length);
		expect(result.fetchedAt).toBe('2026-09-22T18:00:00.000Z');
		expect((await cache.read())?.etag).toBe('W/"abc"');
	});

	it('sends the conditional headers it has and spends nothing on a 304', async () => {
		const seen: Record<string, string>[] = [];
		const result = await fetchRing({
			cache: memoryCache(cachedRecord()),
			fetch: async (_url, init) => {
				seen.push(init?.headers ?? {});
				return response(304, '');
			}
		});

		expect(seen[0]?.['if-none-match']).toBe('W/"abc"');
		expect(seen[0]?.['if-modified-since']).toBe('Tue, 22 Sep 2026 17:32:39 GMT');
		expect(result.source).toBe('not-modified');
		expect(result.document.entries).toHaveLength(live.entries.length);
	});

	it('falls back to the last good copy when the network is gone', async () => {
		const result = await fetchRing({
			cache: memoryCache(cachedRecord()),
			fetch: async () => {
				throw new Error('offline');
			}
		});

		expect(result.source).toBe('cache');
		expect(result.document.entries).toHaveLength(live.entries.length);
		expect(result.error?.message).toBe('offline');
	});

	it('returns an empty ring, not a throw, when there is no cache either', async () => {
		const result = await fetchRing({
			fetch: async () => {
				throw new Error('offline');
			}
		});

		expect(result.source).toBe('empty');
		expect(result.document.entries).toEqual([]);
		expect(result.error).toBeInstanceOf(Error);
	});

	it.each([404, 500, 503])('keeps the cached ring on a %i', async (status) => {
		const result = await fetchRing({
			cache: memoryCache(cachedRecord()),
			fetch: async () => response(status, 'nope')
		});
		expect(result.source).toBe('cache');
		expect(result.error?.message).toContain(String(status));
	});

	it('refuses a body that is not JSON', async () => {
		const result = await fetchRing({ fetch: async () => response(200, '<html>nope</html>') });
		expect(result.error?.message).toContain('not valid JSON');
	});

	it('refuses an oversized declared length before reading the body', async () => {
		const text = vi.fn(async () => liveBody);
		const result = await fetchRing({
			maxBytes: 100,
			fetch: async () => ({ ...response(200, liveBody, { 'content-length': '9999' }), text })
		});
		expect(result.error?.message).toContain('over the cap');
		expect(text).not.toHaveBeenCalled();
	});

	it('refuses an oversized body that declared no length', async () => {
		const result = await fetchRing({ maxBytes: 10, fetch: async () => response(200, liveBody) });
		expect(result.error?.message).toContain('size cap');
	});

	it('keeps the cached ring when the network hands back an empty one', async () => {
		const result = await fetchRing({
			cache: memoryCache(cachedRecord()),
			fetch: async () => response(200, JSON.stringify({ version: '1.0', entries: [] }))
		});
		expect(result.source).toBe('cache');
		expect(result.document.entries).toHaveLength(live.entries.length);
	});

	it('gives up on a request that never answers', async () => {
		const result = await fetchRing({
			timeoutMs: 20,
			fetch: (_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
				})
		});
		expect(result.source).toBe('empty');
		expect(result.error?.message).toBe('aborted');
	});

	it('still returns the ring when the cache refuses to write', async () => {
		const result = await fetchRing({
			cache: {
				read: () => null,
				write: () => {
					throw new Error('storage full');
				}
			},
			fetch: async () => response(200, liveBody)
		});
		expect(result.source).toBe('network');
	});
});

describe('cachedRing', () => {
	it('returns the saved copy without any network', async () => {
		const result = await cachedRing(memoryCache(cachedRecord()));
		expect(result?.source).toBe('cache');
		expect(result?.fetchedAt).toBe('2026-09-22T17:40:00.000Z');
		expect(result?.document.entries).toHaveLength(live.entries.length);
	});

	it('is null when nothing was ever saved', async () => {
		expect(await cachedRing(memoryCache())).toBeNull();
	});
});
