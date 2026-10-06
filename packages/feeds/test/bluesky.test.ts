import { describe, expect, it } from 'vitest';
import { addBlueskyPictures, blueskyActor, picturesByPost } from '../src/bluesky.js';
import { FeedHttp } from '../src/http.js';
import { parseFeed } from '../src/parse/index.js';
import { fakeServer } from './server.js';

const FEED_URL = 'https://bsky.app/profile/lena.example/rss';
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>@lena.example - Bluesky</title>
<link>https://bsky.app/profile/lena.example</link>
<item><link>https://bsky.app/profile/lena.example/post/a1</link><description>A new page</description>
<pubDate>05 Oct 2026 16:39 +0000</pubDate><guid isPermaLink="false">at://did:plc:lena/app.bsky.feed.post/a1</guid></item>
<item><link>https://bsky.app/profile/lena.example/post/b2</link><description>Words only</description>
<pubDate>04 Oct 2026 16:39 +0000</pubDate><guid isPermaLink="false">at://did:plc:lena/app.bsky.feed.post/b2</guid></item>
</channel></rss>`;

const API_BODY = {
	feed: [
		{
			post: {
				uri: 'at://did:plc:lena/app.bsky.feed.post/a1',
				embed: {
					$type: 'app.bsky.embed.images#view',
					images: [{ fullsize: 'https://cdn.bsky.app/img/full/a1.jpg', alt: 'Page one' }]
				},
				labels: [{ val: 'nudity' }]
			}
		},
		{ post: { uri: 'at://did:plc:lena/app.bsky.feed.post/b2' } }
	]
};

describe('blueskyActor', () => {
	it('reads the handle from a Bluesky RSS address, and nothing else', () => {
		expect(blueskyActor(FEED_URL)).toBe('lena.example');
		expect(blueskyActor('https://bsky.app/profile/lena.example')).toBeNull();
		expect(blueskyActor('https://evil.example/profile/lena/rss')).toBeNull();
	});
});

describe('picturesByPost', () => {
	it('finds images, a quote with media, a video still and a link thumbnail', () => {
		const found = picturesByPost({
			feed: [
				{ post: { uri: 'at://x/1', embed: API_BODY.feed[0]!.post.embed } },
				{
					post: {
						uri: 'at://x/2',
						embed: {
							$type: 'app.bsky.embed.recordWithMedia#view',
							media: {
								$type: 'app.bsky.embed.images#view',
								images: [{ thumb: 'https://cdn.bsky.app/2.jpg' }]
							}
						}
					}
				},
				{
					post: {
						uri: 'at://x/3',
						embed: { $type: 'app.bsky.embed.video#view', thumbnail: 'https://video.bsky.app/3.jpg' }
					}
				},
				{
					post: {
						uri: 'at://x/4',
						embed: {
							$type: 'app.bsky.embed.external#view',
							external: { thumb: 'https://cdn.bsky.app/4.jpg' }
						}
					}
				},
				{
					post: {
						uri: 'at://x/5',
						embed: {
							$type: 'app.bsky.embed.images#view',
							images: [{ fullsize: 'javascript:alert(1)' }]
						}
					}
				}
			]
		});
		expect([...found.keys()]).toEqual(['at://x/1', 'at://x/2', 'at://x/3', 'at://x/4']);
	});

	it('gives nothing for anything not shaped like a feed', () => {
		expect(picturesByPost(null).size).toBe(0);
		expect(picturesByPost({ feed: 'no' }).size).toBe(0);
	});
});

describe('addBlueskyPictures', () => {
	it('puts each post’s picture on its RSS item, marking what Bluesky labels sensitive', async () => {
		const feed = parseFeed(RSS, { feedUrl: FEED_URL });
		const server = fakeServer({
			'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=lena.example&limit=50&filter=posts_no_replies':
				{ body: JSON.stringify(API_BODY), headers: { 'content-type': 'application/json' } }
		});
		await addBlueskyPictures(
			feed,
			FEED_URL,
			new FeedHttp({ fetch: server.fetch, respectRobots: false, minHostIntervalMs: 0 })
		);
		const [first, second] = feed.items;
		expect(first?.media).toEqual([
			{ url: 'https://cdn.bsky.app/img/full/a1.jpg', kind: 'image', alt: 'Page one' }
		]);
		expect(first?.sensitive).toBe(true);
		expect(second?.media).toEqual([]);
	});

	it('leaves the feed as it was when Bluesky cannot be reached', async () => {
		const feed = parseFeed(RSS, { feedUrl: FEED_URL });
		const server = fakeServer({});
		await addBlueskyPictures(
			feed,
			FEED_URL,
			new FeedHttp({ fetch: server.fetch, respectRobots: false, minHostIntervalMs: 0 })
		);
		expect(feed.items.every((item) => item.media.length === 0)).toBe(true);
	});
});
