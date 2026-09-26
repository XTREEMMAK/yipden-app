import { describe, expect, it } from 'vitest';
import { discoverFeeds } from '../src/discover.js';
import { fakeServer, HTML, MINIMAL_RSS, page, XML, type Route } from './server.js';

const quiet = { respectRobots: false, minHostIntervalMs: 0 };

function discover(routes: Record<string, Route>, url: string, extra = {}) {
	const server = fakeServer(routes);
	return {
		server,
		result: discoverFeeds(url, { ...quiet, fetch: server.fetch, ...extra })
	};
}

describe('when the pasted URL is already a feed', () => {
	it('takes it at face value and asks nothing else', async () => {
		const { server, result } = discover(
			{ 'https://example.com/feed.xml': { body: MINIMAL_RSS, headers: XML } },
			'https://example.com/feed.xml'
		);
		const found = await result;

		expect(found.feeds).toHaveLength(1);
		expect(found.feeds[0]).toMatchObject({ url: 'https://example.com/feed.xml', via: 'direct' });
		expect(found.title).toBe('A Feed');
		expect(server.calls).toHaveLength(1);
	});
});

describe('when the page announces its own feed', () => {
	const routes = {
		'https://writer.example.com/': page(
			`<title>A Writer</title>
			 <link rel="alternate" type="application/rss+xml" title="Posts" href="/feed.xml">
			 <link rel="icon" href="/icon.png">`
		),
		'https://writer.example.com/feed.xml': { body: MINIMAL_RSS, headers: XML }
	};

	it('believes the page', async () => {
		const { result } = discover(routes, 'https://writer.example.com/');
		const found = await result;

		expect(found.feeds).toHaveLength(1);
		expect(found.feeds[0]).toMatchObject({
			url: 'https://writer.example.com/feed.xml',
			via: 'alternate-link',
			title: 'Posts'
		});
		expect(found.title).toBe('A Writer');
		expect(found.iconUrl).toBe('https://writer.example.com/icon.png');
	});

	it('does not then go guessing at paths it was never told about', async () => {
		const { server, result } = discover(routes, 'https://writer.example.com/');
		await result;
		expect(server.calls).toEqual(['https://writer.example.com/']);
	});
});

describe('when the page links to profiles', () => {
	const routes: Record<string, Route> = {
		'https://lena.example.com/': {
			body: `<!doctype html><html><head><title>Lena</title></head><body>
				<a rel="me" href="https://bsky.app/profile/lena.bsky.social">Bluesky</a>
				<a rel="me" href="https://mastodon.social/@lena">Mastodon</a>
				<a href="https://example.org/unrelated">Something else</a>
				</body></html>`,
			headers: HTML
		},
		'https://bsky.app/profile/lena.bsky.social': page('<title>Lena on Bluesky</title>'),
		'https://mastodon.social/@lena': page(
			'<title>Lena</title><link rel="me" href="https://lena.example.com/">'
		)
	};

	it('finds the feed behind each known platform', async () => {
		const { result } = discover(routes, 'https://lena.example.com/');
		const found = await result;

		expect(found.feeds.map((feed) => feed.url)).toEqual([
			'https://bsky.app/profile/lena.bsky.social/rss',
			'https://mastodon.social/@lena.rss'
		]);
		expect(found.feeds.every((feed) => feed.via === 'known-pattern')).toBe(true);
	});

	it('marks a feed verified only when the profile links back', async () => {
		const { result } = discover(routes, 'https://lena.example.com/');
		const found = await result;

		expect(found.feeds.find((feed) => feed.kind === 'mastodon')?.verified).toBe(true);
		expect(found.feeds.find((feed) => feed.kind === 'bluesky')?.verified).toBe(false);
	});

	it('skips the backlink checks when asked to', async () => {
		const { server, result } = discover(routes, 'https://lena.example.com/', {
			verifyBacklinks: false
		});
		const found = await result;

		expect(found.feeds).toHaveLength(2);
		expect(found.feeds.every((feed) => feed.verified === false)).toBe(true);
		expect(server.calls).toEqual(['https://lena.example.com/']);
	});

	it('ignores links that match no platform', async () => {
		const { server, result } = discover(routes, 'https://lena.example.com/');
		await result;
		expect(server.calls).not.toContain('https://example.org/unrelated');
	});
});

describe('YouTube, which cannot be answered from the URL alone', () => {
	it('reads the channel id off the channel page', async () => {
		const { result } = discover(
			{
				'https://maker.example.com/': {
					body: `<!doctype html><html><body>
						<a rel="me" href="https://www.youtube.com/@maker">YouTube</a></body></html>`,
					headers: HTML
				},
				'https://www.youtube.com/@maker': {
					body: '<html><head><link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"></head></html>',
					headers: HTML
				}
			},
			'https://maker.example.com/'
		);
		const found = await result;

		expect(found.feeds[0]).toMatchObject({
			url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv',
			kind: 'youtube'
		});
	});

	it('reads the id out of the embedded data when there is no canonical link', async () => {
		const { result } = discover(
			{
				'https://maker.example.com/': {
					body: '<html><body><a rel="me" href="https://www.youtube.com/@maker">yt</a></body></html>',
					headers: HTML
				},
				'https://www.youtube.com/@maker': {
					body: '<html><script>var x = {"channelId":"UCzyxwvutsrqponmlkjihgf1","other":1};</script></html>',
					headers: HTML
				}
			},
			'https://maker.example.com/'
		);
		expect((await result).feeds[0]?.url).toContain('channel_id=UCzyxwvutsrqponmlkjihgf1');
	});

	it('says so rather than guessing when the page will not give it up', async () => {
		const { result } = discover(
			{
				'https://maker.example.com/': {
					body: '<html><body><a rel="me" href="https://www.youtube.com/@maker">yt</a></body></html>',
					headers: HTML
				},
				'https://www.youtube.com/@maker': page('<title>Nothing useful here</title>')
			},
			'https://maker.example.com/'
		);
		const found = await result;

		expect(found.feeds).toHaveLength(0);
		expect(found.unresolved[0]?.url).toBe('https://www.youtube.com/@maker');
		expect(found.unresolved[0]?.reason).toContain('channel id');
	});
});

describe('when the site announces nothing', () => {
	it('tries the well known paths, in order, and stops at the first that works', async () => {
		const { server, result } = discover(
			{
				'https://quiet.example.com/': page('<title>A Quiet Site</title>'),
				'https://quiet.example.com/feed.xml': { body: MINIMAL_RSS, headers: XML }
			},
			'https://quiet.example.com/'
		);
		const found = await result;

		expect(found.feeds[0]).toMatchObject({
			url: 'https://quiet.example.com/feed.xml',
			via: 'fallback-path'
		});
		expect(server.calls).toEqual([
			'https://quiet.example.com/',
			'https://quiet.example.com/feed',
			'https://quiet.example.com/feed.xml'
		]);
	});

	it('gives up honestly when there is nothing to find', async () => {
		const { result } = discover(
			{ 'https://empty.example.com/': page('<title>Nothing</title>') },
			'https://empty.example.com/'
		);
		const found = await result;

		expect(found.feeds).toEqual([]);
		expect(found.title).toBe('Nothing');
	});
});

describe('redirects and identity', () => {
	it('reports the address the site actually resolved to, so one person is one person', async () => {
		const { result } = discover(
			{
				'https://neo.keyjayonline.com/': {
					status: 302,
					headers: { location: 'https://keyjay.neocities.org/' }
				},
				'https://keyjay.neocities.org/': page(
					'<title>Key Jay</title><link rel="alternate" type="application/rss+xml" href="/feed.xml">'
				)
			},
			'https://neo.keyjayonline.com/'
		);
		const found = await result;

		expect(found.canonicalUrl).toBe('https://keyjay.neocities.org/');
		expect(found.feeds[0]?.url).toBe('https://keyjay.neocities.org/feed.xml');
	});
});

describe('discoverFeeds refuses what it should not fetch', () => {
	it.each(['http://example.com/', 'https://192.168.1.1/', 'javascript:alert(1)', 'not a url'])(
		'refuses %s',
		async (input) => {
			await expect(discoverFeeds(input, quiet)).rejects.toThrow(/https address/);
		}
	);
});

describe('an h-card', () => {
	it('is preferred over the page title for the person name', async () => {
		const { result } = discover(
			{
				'https://card.example.com/': {
					body: `<!doctype html><html><head><title>card.example.com</title></head>
						<body><div class="h-card"><span class="p-name">Real Name</span>
						<a class="u-url" href="https://card.example.com/"></a></div></body></html>`,
					headers: HTML
				},
				'https://card.example.com/feed': { body: MINIMAL_RSS, headers: XML }
			},
			'https://card.example.com/'
		);
		expect((await result).title).toBe('Real Name');
	});
});

describe('profile discovery regressions', () => {
	it('accepts a pasted YouTube handle without requiring a website first', async () => {
		const { result } = discover(
			{
				'https://www.youtube.com/@maker': {
					body: '<html><head><link href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv" rel="canonical"></head></html>',
					headers: HTML
				}
			},
			'https://www.youtube.com/@maker'
		);

		expect((await result).feeds[0]).toMatchObject({
			url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv',
			kind: 'youtube',
			verified: false
		});
	});

	it('finds a legacy custom YouTube URL declared through Schema.org sameAs', async () => {
		const { result } = discover(
			{
				'https://maker.example.com/': page(`<script type="application/ld+json">
					{"@type":"Person","sameAs":["https://www.youtube.com/keyjayhd"]}
				</script>`),
				'https://www.youtube.com/keyjayhd': {
					body: '<script>var data={"channelId":"UCzyxwvutsrqponmlkjihgf1","externalId":"UCabcdefghijklmnopqrstuv"}</script>',
					headers: HTML
				}
			},
			'https://maker.example.com/',
			{ verifyBacklinks: false }
		);

		expect((await result).feeds[0]).toMatchObject({
			url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv',
			kind: 'youtube',
			verified: false
		});
	});

	it('keeps looking for profiles after ordinary links', async () => {
		const ordinary = Array.from(
			{ length: 40 },
			(_, index) => `<a href="https://example.org/page-${index}">ordinary</a>`
		).join('');
		const { result } = discover(
			{
				'https://maker.example.com/': page(
					`${ordinary}<a href="https://bsky.app/profile/maker.bsky.social">Bluesky</a>`
				)
			},
			'https://maker.example.com/',
			{ verifyBacklinks: false }
		);

		expect((await result).feeds[0]?.url).toBe('https://bsky.app/profile/maker.bsky.social/rss');
	});
});
