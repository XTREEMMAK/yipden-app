import { describe, expect, it, vi } from 'vitest';
import { FeedHttp, parseRobots } from '../src/http.js';
import { fakeServer, MINIMAL_RSS, XML } from './server.js';

/** Tests run with robots off unless they are about robots, and with no waiting between hosts. */
const quiet = { respectRobots: false, minHostIntervalMs: 0 };

describe('FeedHttp.get', () => {
	it('fetches a document and reports where it came from', async () => {
		const server = fakeServer({
			'https://example.com/feed.xml': { body: MINIMAL_RSS, headers: XML }
		});
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });

		const response = await http.get('https://example.com/feed.xml');
		expect(response.status).toBe(200);
		expect(response.url).toBe('https://example.com/feed.xml');
		expect(response.body).toContain('A Feed');
		expect(response.notModified).toBe(false);
	});

	it('names itself honestly in every request', async () => {
		const server = fakeServer({ 'https://example.com/feed.xml': { body: MINIMAL_RSS } });
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });

		await http.get('https://example.com/feed.xml');
		expect(server.headersSeen[0]?.['user-agent']).toMatch(/^YipDen\//);
		expect(server.headersSeen[0]?.['user-agent']).toContain('https://');
	});

	it('sends the validators it was given', async () => {
		const server = fakeServer({ 'https://example.com/feed.xml': { status: 304 } });
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });

		const response = await http.get('https://example.com/feed.xml', {
			etag: 'W/"abc"',
			lastModified: 'Tue, 22 Sep 2026 17:32:39 GMT'
		});

		expect(server.headersSeen[0]?.['if-none-match']).toBe('W/"abc"');
		expect(server.headersSeen[0]?.['if-modified-since']).toBe('Tue, 22 Sep 2026 17:32:39 GMT');
		expect(response.notModified).toBe(true);
		expect(response.body).toBe('');
	});

	it('returns the etag and last-modified for next time', async () => {
		const server = fakeServer({
			'https://example.com/feed.xml': {
				body: MINIMAL_RSS,
				headers: { etag: 'W/"v2"', 'last-modified': 'Mon, 21 Sep 2026 00:00:00 GMT' }
			}
		});
		const response = await new FeedHttp({ ...quiet, fetch: server.fetch }).get(
			'https://example.com/feed.xml'
		);
		expect(response.etag).toBe('W/"v2"');
		expect(response.lastModified).toBe('Mon, 21 Sep 2026 00:00:00 GMT');
	});
});

describe('redirects', () => {
	it('follows them by hand and reports the address it landed on', async () => {
		const server = fakeServer({
			'https://neo.keyjayonline.com/': {
				status: 302,
				headers: { location: 'https://keyjay.neocities.org/' }
			},
			'https://keyjay.neocities.org/': { body: MINIMAL_RSS, headers: XML }
		});
		const response = await new FeedHttp({ ...quiet, fetch: server.fetch }).get(
			'https://neo.keyjayonline.com/'
		);
		expect(response.url).toBe('https://keyjay.neocities.org/');
	});

	it('resolves a relative Location header', async () => {
		const server = fakeServer({
			'https://example.com/old': { status: 301, headers: { location: '/new' } },
			'https://example.com/new': { body: MINIMAL_RSS }
		});
		const response = await new FeedHttp({ ...quiet, fetch: server.fetch }).get(
			'https://example.com/old'
		);
		expect(response.url).toBe('https://example.com/new');
	});

	it.each([
		['a private address', 'https://192.168.1.1/admin'],
		['loopback', 'https://127.0.0.1/'],
		['cloud metadata', 'https://169.254.169.254/latest/meta-data/'],
		['plain http', 'http://example.com/']
	])('refuses a redirect to %s', async (_label, location) => {
		const server = fakeServer({
			'https://example.com/start': { status: 302, headers: { location } }
		});
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });
		await expect(http.get('https://example.com/start')).rejects.toThrow(/refusing to follow/);
	});

	it('gives up rather than looping forever', async () => {
		const server = fakeServer({
			'https://example.com/a': { status: 302, headers: { location: 'https://example.com/b' } },
			'https://example.com/b': { status: 302, headers: { location: 'https://example.com/a' } }
		});
		const http = new FeedHttp({ ...quiet, fetch: server.fetch, maxRedirects: 3 });
		await expect(http.get('https://example.com/a')).rejects.toThrow(/too many redirects/);
	});

	it('refuses a redirect with no destination', async () => {
		const server = fakeServer({ 'https://example.com/a': { status: 302 } });
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });
		await expect(http.get('https://example.com/a')).rejects.toThrow(/no location/);
	});
});

describe('limits', () => {
	it('refuses an address that is not safe to request at all', async () => {
		const http = new FeedHttp({ ...quiet, fetch: fakeServer({}).fetch });
		await expect(http.get('https://10.0.0.1/feed')).rejects.toThrow(/refusing to request/);
		await expect(http.get('javascript:alert(1)')).rejects.toThrow(/refusing to request/);
	});

	it('refuses a declared length over the cap before reading the body', async () => {
		const server = fakeServer({
			'https://example.com/feed.xml': {
				body: MINIMAL_RSS,
				headers: { 'content-length': '9999999' }
			}
		});
		const http = new FeedHttp({ ...quiet, fetch: server.fetch, maxBytes: 1000 });
		await expect(http.get('https://example.com/feed.xml')).rejects.toThrow(/over the cap/);
	});

	it('refuses an oversized body that declared nothing', async () => {
		const server = fakeServer({ 'https://example.com/feed.xml': { body: 'a'.repeat(2000) } });
		const http = new FeedHttp({ ...quiet, fetch: server.fetch, maxBytes: 1000 });
		await expect(http.get('https://example.com/feed.xml')).rejects.toThrow(/size cap/);
	});

	it('reports a failing status rather than returning a body', async () => {
		const server = fakeServer({ 'https://example.com/feed.xml': { status: 500, body: 'oops' } });
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });
		await expect(http.get('https://example.com/feed.xml')).rejects.toThrow(/failed/);
	});

	it('gives up on a request that never answers', async () => {
		const http = new FeedHttp({
			...quiet,
			timeoutMs: 20,
			fetch: (_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
				})
		});
		await expect(http.get('https://example.com/feed.xml')).rejects.toThrow(/aborted/);
	});
});

describe('one request at a time per host', () => {
	it('waits the configured interval between requests to the same host', async () => {
		const server = fakeServer({
			'https://example.com/a': { body: MINIMAL_RSS },
			'https://example.com/b': { body: MINIMAL_RSS }
		});
		const slept: number[] = [];
		let clock = 0;
		const http = new FeedHttp({
			respectRobots: false,
			minHostIntervalMs: 1000,
			fetch: server.fetch,
			now: () => clock,
			sleep: async (ms) => {
				slept.push(ms);
				clock += ms;
			}
		});

		await http.get('https://example.com/a');
		await http.get('https://example.com/b');
		expect(slept).toEqual([1000]);
	});

	it('does not make one slow host hold up another', async () => {
		const server = fakeServer({
			'https://one.example.com/a': { body: MINIMAL_RSS },
			'https://two.example.com/a': { body: MINIMAL_RSS }
		});
		const slept: number[] = [];
		const http = new FeedHttp({
			respectRobots: false,
			minHostIntervalMs: 1000,
			fetch: server.fetch,
			now: () => 0,
			sleep: async (ms) => {
				slept.push(ms);
			}
		});

		await Promise.all([
			http.get('https://one.example.com/a'),
			http.get('https://two.example.com/a')
		]);
		expect(slept).toEqual([]);
	});

	it('keeps serving a host after one request to it failed', async () => {
		const server = fakeServer({
			'https://example.com/bad': { status: 500 },
			'https://example.com/good': { body: MINIMAL_RSS }
		});
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });

		await expect(http.get('https://example.com/bad')).rejects.toThrow();
		await expect(http.get('https://example.com/good')).resolves.toMatchObject({ status: 200 });
	});
});

describe('robots.txt', () => {
	const robots = (body: string) => ({
		'https://example.com/robots.txt': { body, headers: { 'content-type': 'text/plain' } },
		'https://example.com/feed.xml': { body: MINIMAL_RSS },
		'https://example.com/private/feed.xml': { body: MINIMAL_RSS }
	});

	it('honors a disallow', async () => {
		const server = fakeServer(robots('User-agent: *\nDisallow: /private/'));
		const http = new FeedHttp({ minHostIntervalMs: 0, fetch: server.fetch });

		await expect(http.get('https://example.com/private/feed.xml')).rejects.toThrow(/robots/);
		await expect(http.get('https://example.com/feed.xml')).resolves.toMatchObject({ status: 200 });
	});

	it('honors a rule written for this reader specifically', async () => {
		const server = fakeServer(robots('User-agent: YipDen\nDisallow: /\n\nUser-agent: *\nAllow: /'));
		const http = new FeedHttp({ minHostIntervalMs: 0, fetch: server.fetch });
		await expect(http.get('https://example.com/feed.xml')).rejects.toThrow(/robots/);
	});

	it('proceeds when there is no robots.txt', async () => {
		const server = fakeServer({ 'https://example.com/feed.xml': { body: MINIMAL_RSS } });
		const http = new FeedHttp({ minHostIntervalMs: 0, fetch: server.fetch });
		await expect(http.get('https://example.com/feed.xml')).resolves.toMatchObject({ status: 200 });
	});

	it('reads robots.txt once per host, not once per request', async () => {
		const server = fakeServer(robots('User-agent: *\nAllow: /'));
		const http = new FeedHttp({ minHostIntervalMs: 0, fetch: server.fetch });

		await http.get('https://example.com/feed.xml');
		await http.get('https://example.com/feed.xml');
		expect(server.calls.filter((call) => call.endsWith('robots.txt'))).toHaveLength(1);
	});
});

describe('parseRobots', () => {
	const agent = 'YipDen/0.0.1 (+https://yipden.com/about)';

	it('prefers the longest matching rule', () => {
		const rules = parseRobots('User-agent: *\nDisallow: /a/\nAllow: /a/b/', agent);
		expect(rules[0]).toEqual({ allow: true, path: '/a/b/' });
	});

	it('treats an empty disallow as permission', () => {
		expect(parseRobots('User-agent: *\nDisallow:', agent)).toEqual([{ allow: true, path: '/' }]);
	});

	it('ignores comments and blank lines', () => {
		expect(parseRobots('# nothing here\n\nUser-agent: *\nDisallow: /x # trailing', agent)).toEqual([
			{ allow: false, path: '/x' }
		]);
	});

	it('applies a rule to every agent named in the same group', () => {
		const rules = parseRobots('User-agent: YipDen\nUser-agent: OtherBot\nDisallow: /q', agent);
		expect(rules).toEqual([{ allow: false, path: '/q' }]);
	});

	it('returns nothing when no group applies', () => {
		expect(parseRobots('User-agent: SomeoneElse\nDisallow: /', agent)).toEqual([]);
	});
});

describe('the injected fetch', () => {
	it('is what actually gets called, so Capacitor can supply the native client', async () => {
		const spy = vi.fn(async () => ({
			status: 200,
			headers: { get: () => null },
			text: async () => MINIMAL_RSS
		}));
		await new FeedHttp({ ...quiet, fetch: spy }).get('https://example.com/feed.xml');
		expect(spy).toHaveBeenCalledOnce();
	});
});
