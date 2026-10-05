import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	categoryIdFromUrl,
	firstUnreadUrl,
	FORUM_HOST_INTERVAL_MS,
	forumHttp,
	listCategories,
	listTopics,
	probeForum,
	readForumPage,
	type Forum
} from '../src/forum.js';
import { FeedHttp } from '../src/http.js';
import { fakeServer, type Route } from './server.js';

/**
 * Discourse, against responses recorded from a real public forum (meta.discourse.org, 2026-10-05)
 * and trimmed to a few entries each. Shapes are Discourse's own; nothing here reaches a network.
 */

const fixture = (name: string) =>
	readFileSync(fileURLToPath(new URL(`./fixtures/discourse/${name}`, import.meta.url)), 'utf8');

const BASE = 'https://meta.discourse.org';
const JSON_HEADERS = { 'content-type': 'application/json' };
const HTML_HEADERS = { 'content-type': 'text/html' };

const forum: Forum = {
	baseUrl: BASE,
	title: 'Discourse Meta',
	description: '',
	logoUrl: null
};

function client(routes: Record<string, Route>) {
	const server = fakeServer({
		[`${BASE}/robots.txt`]: { body: 'User-agent: *\nDisallow: /admin/' },
		...routes
	});
	return {
		server,
		http: new FeedHttp({ fetch: server.fetch, minHostIntervalMs: 0 })
	};
}

const page = (html: string): Route => ({ body: html, headers: HTML_HEADERS });
const json = (body: string): Route => ({ body, headers: JSON_HEADERS });

describe('recognizing a forum', () => {
	it('reads Discourse’s own generator tag and where the forum’s root is', () => {
		expect(readForumPage(fixture('topic-page.html'), `${BASE}/t/a-topic/12345`)).toEqual({
			isDiscourse: true,
			baseUrl: BASE
		});
		expect(
			readForumPage('<meta name="generator" content="WordPress 6.8">', 'https://x.example/')
		).toEqual({
			isDiscourse: false,
			baseUrl: null
		});
	});

	it('finds a forum installed in a subfolder by its search description', () => {
		const html = `<meta name="generator" content="Discourse 3.4"><link rel="search" type="application/opensearchdescription+xml" href="/forum/opensearch.xml">`;
		expect(readForumPage(html, 'https://club.example/forum/t/x/1').baseUrl).toBe(
			'https://club.example/forum'
		);
	});

	for (const [kind, path] of [
		['the front page', '/'],
		['a category', '/c/contribute/feature/2'],
		['a topic', '/t/a-topic/12345'],
		['a profile', '/u/someone']
	] as const) {
		it(`from ${kind}`, async () => {
			const { http } = client({
				[`${BASE}${path}`]: page(fixture('topic-page.html')),
				[`${BASE}/site/basic-info.json`]: json(fixture('basic-info.json'))
			});
			const probe = await probeForum(`${BASE}${path}`, http);
			expect(probe.status).toBe('forum');
			if (probe.status !== 'forum') return;
			expect(probe.forum).toMatchObject({ baseUrl: BASE, title: 'Discourse Meta' });
			expect(probe.forum.logoUrl).toMatch(/^https:\/\/global\.discourse-cdn\.com\//);
			// A category link offers that category first; nothing else does.
			expect(probe.categoryId).toBe(kind === 'a category' ? 2 : null);
		});
	}

	it('follows a redirect to the forum’s canonical host', async () => {
		const { http } = client({
			'https://forum.example/': { status: 301, headers: { location: `${BASE}/latest` } },
			'https://forum.example/robots.txt': { body: '' },
			[`${BASE}/latest`]: page(fixture('topic-page.html')),
			[`${BASE}/site/basic-info.json`]: json(fixture('basic-info.json'))
		});
		const probe = await probeForum('https://forum.example/', http);
		expect(probe).toMatchObject({ status: 'forum', forum: { baseUrl: BASE } });
	});

	it('says a members-only forum is one, without asking anything more of it', async () => {
		const { http, server } = client({
			[`${BASE}/`]: page(fixture('topic-page.html')),
			[`${BASE}/site/basic-info.json`]: json(fixture('basic-info-members-only.json'))
		});
		const probe = await probeForum(`${BASE}/`, http);
		expect(probe).toMatchObject({ status: 'members-only', forum: { title: 'Members Club' } });
		expect(server.calls.some((call) => call.includes('/latest.json'))).toBe(false);
	});

	it('takes a forum that refuses even its pages to anyone signed out as members-only', async () => {
		const { http } = client({
			[`${BASE}/t/x/1`]: { status: 403 },
			[`${BASE}/site/basic-info.json`]: { status: 403 }
		});
		expect(await probeForum(`${BASE}/t/x/1`, http)).toMatchObject({ status: 'members-only' });
	});

	it('says plainly when a page is not a forum', async () => {
		const { http } = client({
			[`${BASE}/blog`]: page('<html><head><title>Blog</title></head></html>')
		});
		expect(await probeForum(`${BASE}/blog`, http)).toEqual({ status: 'not-a-forum' });
	});

	it('reads a category id from any category address', () => {
		expect(categoryIdFromUrl(`${BASE}/c/feature/2`, BASE)).toBe(2);
		expect(categoryIdFromUrl(`${BASE}/c/contribute/feature/2`, BASE)).toBe(2);
		expect(categoryIdFromUrl(`${BASE}/c/feature/2/l/latest`, BASE)).toBe(2);
		expect(categoryIdFromUrl(`${BASE}/t/a-topic/12345`, BASE)).toBeNull();
	});
});

describe('categories', () => {
	it('lists public categories, each subcategory after its parent, and never a restricted one', async () => {
		const { http } = client({
			[`${BASE}/categories.json?include_subcategories=true`]: json(fixture('categories.json'))
		});
		const categories = await listCategories(forum, http);
		expect(categories).not.toBe('members-only');
		if (categories === 'members-only') return;
		expect(categories.map((category) => [category.id, category.parentId])).toEqual([
			[207, null],
			[67, 207],
			[13, 207],
			[65, null],
			[148, 65],
			[35, 65],
			[124, null]
		]);
		expect(categories.some((category) => category.name === 'Staff')).toBe(false);
		expect(categories[0]).toMatchObject({ name: 'News and Events', slug: 'news-and-events' });
	});

	it('reports a members-only forum', async () => {
		const { http } = client({
			[`${BASE}/categories.json?include_subcategories=true`]: { status: 403 }
		});
		expect(await listCategories(forum, http)).toBe('members-only');
	});
});

describe('topics', () => {
	it('reads the latest list into topics with replies, newest post and activity', async () => {
		const { http } = client({ [`${BASE}/latest.json`]: json(fixture('latest.json')) });
		const result = await listTopics(forum, null, http);
		expect(result.status).toBe('ok');
		if (result.status !== 'ok') return;
		expect(result.via).toBe('json');
		expect(result.topics).toHaveLength(4);
		const [first] = result.topics;
		expect(first!.url).toMatch(new RegExp(`^${BASE}/t/[^/]+/\\d+$`));
		for (const topic of result.topics) {
			expect(topic.replyCount).toBeGreaterThanOrEqual(0);
			expect(topic.highestPostNumber).toBeGreaterThanOrEqual(1);
			expect(topic.lastActivityAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		}
	});

	it('reads one category’s list, following its redirect to the slugged address', async () => {
		const { http, server } = client({
			[`${BASE}/c/2.json`]: {
				status: 301,
				headers: { location: `${BASE}/c/contribute/feature/2.json` }
			},
			[`${BASE}/c/contribute/feature/2.json`]: json(fixture('latest.json'))
		});
		const result = await listTopics(forum, 2, http);
		expect(result.status).toBe('ok');
		expect(server.calls).toContain(`${BASE}/c/contribute/feature/2.json`);
	});

	it('falls back to the list’s RSS when its JSON is not JSON', async () => {
		const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Latest</title><link>${BASE}</link>
			<item><title>A topic</title><link>${BASE}/t/a-topic/77</link><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate></item>
			</channel></rss>`;
		const { http } = client({
			[`${BASE}/latest.json`]: page('<html>a proxy page</html>'),
			[`${BASE}/latest.rss`]: { body: rss, headers: { 'content-type': 'application/rss+xml' } }
		});
		const result = await listTopics(forum, null, http);
		expect(result).toMatchObject({ status: 'ok', via: 'rss' });
		if (result.status !== 'ok') return;
		expect(result.topics[0]).toMatchObject({ id: 77, title: 'A topic', replyCount: 0 });
	});

	it('reports members-only and gone, rather than failing', async () => {
		const refused = client({ [`${BASE}/c/9.json`]: { status: 403 } });
		expect(await listTopics(forum, 9, refused.http)).toEqual({ status: 'members-only' });
		const gone = client({
			[`${BASE}/c/9.json`]: { status: 404 },
			[`${BASE}/c/9.rss`]: { status: 404 }
		});
		expect(await listTopics(forum, 9, gone.http)).toEqual({ status: 'gone' });
	});

	it('asks again with the validators it was given, and says when nothing changed', async () => {
		const { http, server } = client({ [`${BASE}/latest.json`]: { status: 304 } });
		const cursor = JSON.stringify({ etag: 'W/"abc"' });
		expect(await listTopics(forum, null, http, cursor)).toEqual({ status: 'not-modified', cursor });
		expect(server.headersSeen.at(-1)?.['if-none-match']).toBe('W/"abc"');
	});

	it('opens a topic at the first post not yet seen', () => {
		const topic = {
			id: 5,
			title: 't',
			url: `${BASE}/t/t/5`,
			categoryId: null,
			replyCount: 9,
			highestPostNumber: 10,
			lastActivityAt: null,
			createdAt: null,
			pinned: false,
			closed: false
		};
		expect(firstUnreadUrl(topic, null)).toBe(`${BASE}/t/t/5`);
		expect(firstUnreadUrl(topic, 4)).toBe(`${BASE}/t/t/5/5`);
		expect(firstUnreadUrl(topic, 10)).toBe(`${BASE}/t/t/5`);
	});
});

describe('pace', () => {
	it('is slower per host for forums than for feeds', () => {
		expect(FORUM_HOST_INTERVAL_MS).toBeGreaterThan(1_000);
		expect(forumHttp()).toBeInstanceOf(FeedHttp);
	});
});
