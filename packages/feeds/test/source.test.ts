import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, stableYipId } from '../src/hash.js';
import { FeedHttp, HttpError, linkHeaderUrl } from '../src/http.js';
import { parseFeed } from '../src/parse/index.js';
import { DirectFetchSource, directCursor, type FeedResult } from '../src/source.js';
import { FeedParseError } from '../src/xml.js';
import { fakeServer, MINIMAL_RSS, XML } from './server.js';

const quiet = { respectRobots: false, minHostIntervalMs: 0 };

async function collect(results: AsyncIterable<FeedResult>): Promise<FeedResult[]> {
	const all: FeedResult[] = [];
	for await (const result of results) all.push(result);
	return all;
}

describe('sha256Hex', () => {
	it('agrees with Node for empty, short, block-boundary and multibyte input', () => {
		const inputs = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(200)];
		inputs.push('Fuchs 🦊 und Höhle', 'x'.repeat(1_000));
		for (const input of inputs) {
			expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
		}
	});
});

describe('stableYipId', () => {
	it('is 32 hex characters, the same for the same feed and entry', () => {
		const id = stableYipId('https://example.com/feed.xml', 'tag:example.com,2026:one');
		expect(id).toMatch(/^[0-9a-f]{32}$/);
		expect(stableYipId('https://example.com/feed.xml', 'tag:example.com,2026:one')).toBe(id);
	});

	it('ignores how the feed URL was spelled, but not which feed it is', () => {
		const id = stableYipId('https://example.com/feed.xml', 'one');
		expect(stableYipId('HTTPS://EXAMPLE.com:443/feed.xml', 'one')).toBe(id);
		expect(stableYipId('https://example.com/other.xml', 'one')).not.toBe(id);
		expect(stableYipId('https://example.com/feed.xml', 'two')).not.toBe(id);
	});

	it('falls back to title and date only when there is no entry id at all', () => {
		const dated = { title: 'Hello', publishedAt: '2026-09-15T14:02:00.000Z' };
		const id = stableYipId('https://example.com/feed.xml', '', dated);
		expect(id).toBe(stableYipId('https://example.com/feed.xml', null, dated));
		expect(id).not.toBe(stableYipId('https://example.com/feed.xml', '', { ...dated, title: 'Hi' }));
	});

	it('is what the parsers stamp, from the canonical feed URL and the entry id', () => {
		const feed = parseFeed(MINIMAL_RSS, { feedUrl: 'https://example.com/feed.xml' });
		const item = feed.items[0]!;
		expect(item.entryId).toBe('https://example.com/1');
		expect(item.id).toBe(stableYipId('https://example.com/feed.xml', 'https://example.com/1'));
	});
});

describe('WebSub hubs', () => {
	it('are read from an Atom feed, an RSS channel and a JSON Feed', () => {
		const atom = parseFeed(
			`<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
			<link rel="hub" href="https://hub.example/"/><link rel="self" href="https://example.com/atom.xml"/>
			</feed>`,
			{ feedUrl: 'https://example.com/atom.xml' }
		);
		expect(atom.hubUrl).toBe('https://hub.example/');

		const rss = parseFeed(
			`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>R</title>
			<atom:link rel="hub" href="https://pubsubhubbub.appspot.com/"/></channel></rss>`,
			{ feedUrl: 'https://example.com/rss.xml' }
		);
		expect(rss.hubUrl).toBe('https://pubsubhubbub.appspot.com/');

		const json = parseFeed(
			JSON.stringify({
				version: 'https://jsonfeed.org/version/1.1',
				title: 'J',
				items: [],
				hubs: [
					{ type: 'rssCloud', url: 'https://cloud.example/' },
					{ type: 'WebSub', url: 'https://hub.example/j' }
				]
			}),
			{ feedUrl: 'https://example.com/feed.json' }
		);
		expect(json.hubUrl).toBe('https://hub.example/j');
	});

	it('are absent when a feed declares none, or an unsafe one', () => {
		expect(
			parseFeed(MINIMAL_RSS, { feedUrl: 'https://example.com/feed.xml' }).hubUrl
		).toBeUndefined();
		const insecure = parseFeed(
			`<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title><link rel="hub" href="http://hub.example/"/></feed>`,
			{ feedUrl: 'https://example.com/atom.xml' }
		);
		expect(insecure.hubUrl).toBeUndefined();
	});

	it('are read from a Link header, with relations and parameters in any order', () => {
		const base = 'https://example.com/feed.xml';
		expect(linkHeaderUrl('<https://hub.example/>; rel="hub"', 'hub', base)).toBe(
			'https://hub.example/'
		);
		expect(
			linkHeaderUrl(
				'<https://example.com/feed.xml>; rel=self, </hub>; title="x"; rel="self hub"',
				'hub',
				base
			)
		).toBe('https://example.com/hub');
		expect(linkHeaderUrl('<https://example.com/feed.xml>; rel="self"', 'hub', base)).toBeNull();
		expect(linkHeaderUrl('<http://hub.example/>; rel="hub"', 'hub', base)).toBeNull();
		expect(linkHeaderUrl(null, 'hub', base)).toBeNull();
	});
});

describe('DirectFetchSource', () => {
	it('returns each feed by the id it was asked with, with a cursor for next time', async () => {
		const server = fakeServer({
			'https://example.com/feed.xml': {
				body: MINIMAL_RSS,
				headers: { ...XML, etag: 'W/"v1"', link: '<https://hub.example/>; rel="hub"' }
			}
		});
		const source = new DirectFetchSource({ http: new FeedHttp({ ...quiet, fetch: server.fetch }) });

		const [result] = await collect(
			source.fetchBatch([{ id: 'feed-1', url: 'https://example.com/feed.xml' }])
		);
		expect(result?.status).toBe('updated');
		if (result?.status !== 'updated') return;
		expect(result.id).toBe('feed-1');
		expect(result.url).toBe('https://example.com/feed.xml');
		expect(result.feed.items).toHaveLength(1);
		expect(result.hubUrl).toBe('https://hub.example/');
		expect(result.cursor).toBe(directCursor({ etag: 'W/"v1"' }));
	});

	it('sends the cursor back as validators, and keeps it when nothing changed', async () => {
		const server = fakeServer({ 'https://example.com/feed.xml': { status: 304 } });
		const source = new DirectFetchSource({ http: new FeedHttp({ ...quiet, fetch: server.fetch }) });
		const cursor = directCursor({ etag: 'W/"v1"', lastModified: 'Mon, 21 Sep 2026 00:00:00 GMT' });

		const [result] = await collect(
			source.fetchBatch([
				{ id: 'a', url: 'https://example.com/feed.xml', ...(cursor ? { cursor } : {}) }
			])
		);
		expect(server.headersSeen[0]?.['if-none-match']).toBe('W/"v1"');
		expect(server.headersSeen[0]?.['if-modified-since']).toBe('Mon, 21 Sep 2026 00:00:00 GMT');
		expect(result).toEqual({ id: 'a', status: 'not-modified', cursor });
	});

	it('treats a cursor it cannot read as none, rather than failing the feed', async () => {
		const server = fakeServer({
			'https://example.com/feed.xml': { body: MINIMAL_RSS, headers: XML }
		});
		const source = new DirectFetchSource({ http: new FeedHttp({ ...quiet, fetch: server.fetch }) });

		const [result] = await collect(
			source.fetchBatch([
				{ id: 'a', url: 'https://example.com/feed.xml', cursor: 'opaque:cache:42' }
			])
		);
		expect(result?.status).toBe('updated');
		expect(server.headersSeen[0]?.['if-none-match']).toBeUndefined();
	});

	it('reports one broken feed as failed and carries on with the rest', async () => {
		const server = fakeServer({
			'https://example.com/gone.xml': { status: 410 },
			'https://example.com/page.html': { body: '<html><body>not a feed</body></html>' },
			'https://example.com/feed.xml': { body: MINIMAL_RSS, headers: XML }
		});
		const source = new DirectFetchSource({ http: new FeedHttp({ ...quiet, fetch: server.fetch }) });

		const results = await collect(
			source.fetchBatch([
				{ id: 'gone', url: 'https://example.com/gone.xml' },
				{ id: 'page', url: 'https://example.com/page.html' },
				{ id: 'fine', url: 'https://example.com/feed.xml' }
			])
		);
		expect(results.map((result) => [result.id, result.status])).toEqual([
			['gone', 'failed'],
			['page', 'failed'],
			['fine', 'updated']
		]);
		const [gone, page] = results;
		expect(gone?.status === 'failed' && gone.error).toBeInstanceOf(HttpError);
		expect(page?.status === 'failed' && page.error).toBeInstanceOf(FeedParseError);
	});
});
