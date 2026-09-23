import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFeed } from '../src/parse/index.js';

const fixture = (name: string) =>
	readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

describe('RSS 2.0', () => {
	const feed = parseFeed(fixture('rss2.xml'), { feedUrl: 'https://keyjay.neocities.org/feed.xml' });

	it('reads the channel', () => {
		expect(feed.title).toBe('Key Jay');
		expect(feed.siteUrl).toBe('https://keyjay.neocities.org/');
		expect(feed.format).toBe('rss');
		expect(feed.iconUrl).toBe('https://keyjay.neocities.org/icon.png');
	});

	it('drops the item with nowhere to send a reader', () => {
		expect(feed.items).toHaveLength(2);
		expect(feed.items.map((item) => item.title)).not.toContain('No link at all');
	});

	it('prefers the guid as an id and the link as a destination', () => {
		const item = feed.items[0];
		expect(item?.id).toBe('tag:keyjay.neocities.org,2026:calypso');
		expect(item?.url).toBe('https://keyjay.neocities.org/posts/calypso');
	});

	it('resolves a relative link against the feed', () => {
		expect(feed.items[1]?.url).toBe('https://keyjay.neocities.org/posts/relative');
	});

	it('reads dc:creator as the author', () => {
		expect(feed.items[0]?.author).toBe('Key Jay');
	});

	it('parses an RFC 822 date into ISO', () => {
		expect(feed.items[0]?.publishedAt).toBe('2026-09-15T14:02:00.000Z');
	});

	it('sanitizes content:encoded and keeps its structure', () => {
		const html = feed.items[0]?.contentHtml ?? '';
		expect(html).toContain('<strong>bass line</strong>');
		expect(html.toLowerCase()).not.toContain('<script');
	});

	it('sorts newest first', () => {
		expect(feed.items[0]?.publishedAt).not.toBeNull();
		const [first, second] = feed.items;
		expect((first?.publishedAt ?? '') > (second?.publishedAt ?? '')).toBe(true);
	});
});

describe('a podcast feed', () => {
	const feed = parseFeed(fixture('podcast.xml'), {
		feedUrl: 'https://podcast.example.com/feed.xml'
	});

	it('is recognized as a podcast by its enclosures, not its URL', () => {
		expect(feed.kind).toBe('podcast');
	});

	it('reads the enclosure as playable audio', () => {
		const media = feed.items[0]?.media[0];
		expect(media).toMatchObject({
			url: 'https://podcast.example.com/audio/12.mp3',
			kind: 'audio',
			mimeType: 'audio/mpeg',
			sizeBytes: 42000000
		});
	});

	it('reads a clock duration and a seconds duration the same way', () => {
		expect(feed.items[0]?.media[0]?.durationSeconds).toBe(3723);
		expect(feed.items[1]?.media[0]?.durationSeconds).toBe(3723);
	});
});

describe('Atom', () => {
	const feed = parseFeed(fixture('atom.xml'), { feedUrl: 'https://frammyjammy.com/atom.xml' });

	it('reads the feed, ignoring rel=self when looking for the site', () => {
		expect(feed.title).toBe('Frammy Jammy');
		expect(feed.siteUrl).toBe('https://frammyjammy.com/');
		expect(feed.format).toBe('atom');
	});

	it('follows rel=alternate to the entry, not the feed', () => {
		expect(feed.items[0]?.url).toBe('https://frammyjammy.com/suzu-and-jack/30');
	});

	it('treats a link with no rel as alternate, which Atom says it is', () => {
		expect(feed.items[1]?.url).toBe('https://frammyjammy.com/notes/1');
	});

	it('prefers published over updated', () => {
		expect(feed.items[0]?.publishedAt).toBe('2026-09-18T11:30:00.000Z');
	});

	it('reads the author name from the author element', () => {
		expect(feed.items[0]?.author).toBe('Nori Jammy');
	});

	it('reads an enclosure link as media', () => {
		expect(feed.items[0]?.media[0]).toMatchObject({
			url: 'https://frammyjammy.com/pages/30.png',
			kind: 'image'
		});
	});

	it('decodes escaped HTML content', () => {
		expect(feed.items[0]?.contentHtml).toBe('<p>The lights go <em>out</em>.</p>');
	});
});

describe('YouTube', () => {
	const feed = parseFeed(fixture('youtube.xml'), {
		feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCexample0123456789abcd'
	});

	it('is labeled youtube from its feed URL', () => {
		expect(feed.kind).toBe('youtube');
	});

	it('reads the watch page as the destination', () => {
		expect(feed.items[0]?.url).toBe('https://www.youtube.com/watch?v=abc12345678');
	});

	it('keeps the thumbnail from the media group', () => {
		expect(feed.items[0]?.media.some((media) => media.kind === 'image')).toBe(true);
	});
});

describe('RSS 1.0 over RDF', () => {
	const feed = parseFeed(fixture('rss1.xml'), { feedUrl: 'https://oldschool.example.com/feed' });

	it('finds items that sit beside the channel rather than inside it', () => {
		expect(feed.title).toBe('An RSS 1.0 feed');
		expect(feed.items).toHaveLength(1);
		expect(feed.items[0]?.url).toBe('https://oldschool.example.com/a');
		expect(feed.items[0]?.publishedAt).toBe('2026-08-01T12:00:00.000Z');
	});
});

describe('JSON Feed', () => {
	const feed = parseFeed(fixture('jsonfeed.json'), {
		feedUrl: 'https://jsonfeed.example.com/feed.json',
		contentType: 'application/feed+json'
	});

	it('reads the feed', () => {
		expect(feed.format).toBe('jsonfeed');
		expect(feed.title).toBe('A JSON Feed');
		expect(feed.siteUrl).toBe('https://jsonfeed.example.com/');
	});

	it('drops an item with no url', () => {
		expect(feed.items).toHaveLength(2);
	});

	it('reads an attachment with its duration and size', () => {
		expect(feed.items[0]?.media[0]).toMatchObject({
			url: 'https://jsonfeed.example.com/audio/1.mp3',
			kind: 'audio',
			durationSeconds: 1800,
			sizeBytes: 1234567,
			title: 'Read aloud'
		});
	});

	it('drops an attachment served over plain http', () => {
		expect(feed.items[1]?.media).toEqual([]);
	});

	it('sanitizes content_html', () => {
		expect(feed.items[0]?.contentHtml).toBe('<p>Hello <b>world</b>.</p>');
	});

	it('parses an offset date into UTC', () => {
		expect(feed.items[0]?.publishedAt).toBe('2026-09-21T14:00:00.000Z');
	});
});

describe('hostile feeds', () => {
	it('does not resolve an external entity', () => {
		const feed = parseFeed(fixture('hostile-xxe.xml'), {
			feedUrl: 'https://hostile.example.com/feed.xml'
		});
		const everything = JSON.stringify(feed);
		expect(everything).not.toContain('root:');
		expect(everything).not.toContain('169.254');
		expect(everything).not.toContain('/etc/passwd');
	});

	it('does not expand an entity bomb', () => {
		const started = Date.now();
		const feed = parseFeed(fixture('hostile-billion-laughs.xml'), {
			feedUrl: 'https://hostile.example.com/feed.xml'
		});
		expect(Date.now() - started).toBeLessThan(2000);
		expect(feed.title.length).toBeLessThan(1000);
	});

	it('renders hostile item content inert', () => {
		const feed = parseFeed(fixture('hostile-content.xml'), {
			feedUrl: 'https://hostile.example.com/feed.xml'
		});
		const everything = JSON.stringify(feed).toLowerCase();
		expect(everything).not.toContain('<script');
		expect(everything).not.toContain('javascript:');
		expect(everything).not.toContain('onerror');
		expect(everything).not.toContain('<iframe');
	});

	it('drops an item pointing at the reader own network', () => {
		const feed = parseFeed(fixture('hostile-content.xml'), {
			feedUrl: 'https://hostile.example.com/feed.xml'
		});
		expect(feed.items.map((item) => item.url)).not.toContain('https://192.168.0.1/admin');
	});

	it('refuses a date far in the future rather than letting a feed pin itself to the top', () => {
		const feed = parseFeed(fixture('hostile-content.xml'), {
			feedUrl: 'https://hostile.example.com/feed.xml'
		});
		const future = feed.items.find((item) => item.title.includes('far future'));
		expect(future?.publishedAt).toBeNull();
		expect(feed.items[feed.items.length - 1]).toBe(future);
	});
});

describe('parseFeed refuses what it cannot read', () => {
	it.each([
		['an empty body', ''],
		['HTML', '<html><body><h1>Not a feed</h1></body></html>'],
		['broken JSON', '{"items": ['],
		['unclosed XML', '<rss><channel><title>oops']
	])('throws on %s', (_label, body) => {
		expect(() => parseFeed(body, { feedUrl: 'https://example.com/feed' })).toThrow();
	});

	it('refuses a document past the size cap', () => {
		const huge = `<rss><channel><title>${'a'.repeat(6_000_000)}</title></channel></rss>`;
		expect(() => parseFeed(huge, { feedUrl: 'https://example.com/feed' })).toThrow(/exceeds/);
	});
});
