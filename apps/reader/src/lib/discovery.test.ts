import { describe, expect, it, vi } from 'vitest';
import type { FetchLike, HttpResponse } from '@yipden/feeds';
import { discoverWithDeadline, DiscoveryTimeoutError } from './discovery.js';

function response(url: string, body: string, contentType = 'text/html'): HttpResponse {
	return {
		status: 200,
		url,
		headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
		text: async () => body
	};
}

function hangUntilAborted(): FetchLike {
	return vi.fn(
		(_url, init) =>
			new Promise<HttpResponse>((_resolve, reject) => {
				const rejectAbort = () => reject(new DOMException('aborted', 'AbortError'));
				if (init?.signal?.aborted) rejectAbort();
				else init?.signal?.addEventListener('abort', rejectAbort, { once: true });
			})
	);
}

describe('discoverWithDeadline', () => {
	it('rejects a site that never responds instead of leaving search pending', async () => {
		const fetch = hangUntilAborted();

		await expect(
			discoverWithDeadline('https://slow.example/', {
				fetch,
				deadlineMs: 20,
				respectRobots: false,
				minHostIntervalMs: 0
			})
		).rejects.toBeInstanceOf(DiscoveryTimeoutError);
		expect(fetch).toHaveBeenCalledOnce();
	});

	it('returns feeds already found when an optional YouTube lookup reaches the deadline', async () => {
		const fetch: FetchLike = vi.fn((url, init) => {
			if (url === 'https://maker.example/') {
				return Promise.resolve(
					response(
						url,
						'<title>Maker</title><link rel="alternate" type="application/rss+xml" href="/feed.xml"><a rel="me" href="https://www.youtube.com/@maker">YouTube</a>'
					)
				);
			}
			return hangUntilAborted()(url, init);
		});

		const result = await discoverWithDeadline('https://maker.example/', {
			fetch,
			deadlineMs: 20,
			respectRobots: false,
			minHostIntervalMs: 0
		});

		expect(result.feeds).toEqual([
			expect.objectContaining({ url: 'https://maker.example/feed.xml', via: 'alternate-link' })
		]);
		expect(result.unresolved).toContainEqual(
			expect.objectContaining({ url: 'https://www.youtube.com/@maker' })
		);
	});
});
