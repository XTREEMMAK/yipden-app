import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { FeedHttp, type FetchLike, type HttpResponse } from '@yipden/feeds';
import { testStore } from '../store/testing/memory.js';
import { reference } from '../store/testing/fixtures.js';
import { feed, person } from '../store/testing/fixtures.js';
import type { Store } from '../store/types.js';
import { assessCapture, canRecheck, recheck, type CaptureDeps } from './capture.js';

/**
 * The capture rules against fixture pages. Every response is made up here; nothing reaches the
 * network. A route answers with a status, a body and headers, or throws to stand for no
 * connection at all.
 */

interface Route {
	status?: number;
	body?: string;
	headers?: Record<string, string>;
	offline?: boolean;
}

function server(routes: Record<string, Route>) {
	const calls: Array<{ method: string; url: string }> = [];
	const fetch: FetchLike = async (url, init) => {
		calls.push({ method: init?.method ?? 'GET', url });
		const route = routes[url];
		if (route?.offline) throw new TypeError('Failed to fetch');
		const status = route ? (route.status ?? 200) : 404;
		const headers = Object.fromEntries(
			Object.entries(route?.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value])
		);
		const response: HttpResponse = {
			status,
			url,
			headers: { get: (name) => headers[name.toLowerCase()] ?? null },
			text: async () => route?.body ?? ''
		};
		return response;
	};
	return { fetch, calls };
}

function deps(
	routes: Record<string, Route>,
	store: Store = testStore()
): CaptureDeps & { calls: Array<{ method: string; url: string }> } {
	const { fetch, calls } = server({ 'https://lena.example/robots.txt': { body: '' }, ...routes });
	return {
		http: new FeedHttp({ fetch, minHostIntervalMs: 0 }),
		store,
		now: () => new Date('2026-10-04T12:00:00.000Z'),
		calls
	};
}

const PAGE = 'https://lena.example/music';
const FILE = 'https://lena.example/audio/night.mp3';
const LINKING = `<html><body><audio src="/audio/night.mp3"></audio></body></html>`;
const CREATOR = 'https://lena.example/';

describe('keeping something', () => {
	it('keeps a file on their site that their page links, as host-verified and sharable', async () => {
		const result = await assessCapture(
			{ kind: 'audio', url: FILE, creatorUrl: CREATOR, foundOnPage: PAGE },
			deps({ [FILE]: { headers: { etag: 'W/"1"' } }, [PAGE]: { body: LINKING } })
		);
		expect(result).toEqual({
			ok: true,
			fields: {
				canonicalUrl: FILE,
				hostVerified: true,
				sharable: true,
				etag: 'W/"1"',
				linkedInMarkup: true,
				checkedAt: '2026-10-04T12:00:00.000Z'
			}
		});
	});

	it('only ever asks about the file with HEAD, never downloading it', async () => {
		const check = deps({ [FILE]: {}, [PAGE]: { body: LINKING } });
		await assessCapture(
			{ kind: 'audio', url: FILE, creatorUrl: CREATOR, foundOnPage: PAGE },
			check
		);
		expect(check.calls.filter((call) => call.url === FILE).map((call) => call.method)).toEqual([
			'HEAD'
		]);
	});

	it('refuses a copy on another host, even linked from their page', async () => {
		const copy = 'https://reupload.example/night.mp3';
		const result = await assessCapture(
			{ kind: 'audio', url: copy, creatorUrl: CREATOR, foundOnPage: PAGE },
			deps({ [copy]: {}, [PAGE]: { body: `<a href="${copy}">mirror</a>` } })
		);
		expect(result).toEqual({ ok: false, reason: 'not-own-site' });
	});

	it('refuses a file on their host that redirects somewhere else', async () => {
		const result = await assessCapture(
			{ kind: 'audio', url: FILE, creatorUrl: CREATOR },
			deps({
				[FILE]: { status: 302, headers: { location: 'https://reupload.example/n.mp3' } },
				'https://reupload.example/n.mp3': {}
			})
		);
		expect(result).toEqual({ ok: false, reason: 'not-own-site' });
	});

	it('follows the creator’s own address to where it lives (neo.keyjayonline.com, keyjay.neocities.org)', async () => {
		const art = 'https://keyjay.neocities.org/comic/1.png';
		const result = await assessCapture(
			{ kind: 'image', url: art, creatorUrl: 'https://neo.keyjay.example/' },
			deps({
				'https://neo.keyjay.example/': {
					status: 302,
					headers: { location: 'https://keyjay.neocities.org/' }
				},
				'https://keyjay.neocities.org/': {},
				[art]: {}
			})
		);
		expect(result.ok && result.fields.hostVerified).toBe(true);
	});

	it('counts a followed person’s verified blog feed host, but never a platform they post to', async () => {
		const store = testStore();
		await store.follow(person({ siteUrl: CREATOR }), [
			feed({
				id: 'https://blog.lena.example/feed',
				url: 'https://blog.lena.example/feed',
				kind: 'blog',
				verified: true
			}),
			feed({
				id: 'https://bsky.app/profile/lena/rss',
				url: 'https://bsky.app/profile/lena/rss',
				kind: 'bluesky',
				verified: true
			})
		]);
		const own = await assessCapture(
			{ kind: 'image', url: 'https://blog.lena.example/a.png', creatorUrl: CREATOR },
			deps({ 'https://blog.lena.example/a.png': {} }, store)
		);
		expect(own.ok).toBe(true);
		const platform = await assessCapture(
			{ kind: 'image', url: 'https://bsky.app/img/a.png', creatorUrl: CREATOR },
			deps({ 'https://bsky.app/img/a.png': {} }, store)
		);
		expect(platform).toEqual({ ok: false, reason: 'not-own-site' });
	});

	it('refuses a file that is not there', async () => {
		expect(
			await assessCapture({ kind: 'audio', url: FILE, creatorUrl: CREATOR }, deps({}))
		).toEqual({ ok: false, reason: 'missing' });
	});

	it('offline, keeps an own-host file on its address as given, unchecked and not sharable', async () => {
		const result = await assessCapture(
			{ kind: 'audio', url: FILE, creatorUrl: CREATOR, foundOnPage: PAGE },
			deps({ [CREATOR]: { offline: true }, [FILE]: { offline: true }, [PAGE]: { offline: true } })
		);
		expect(result).toEqual({
			ok: true,
			fields: { canonicalUrl: FILE, hostVerified: true, sharable: false }
		});
	});

	it('keeps a platform player found on their page as a link, never verified or sharable, without asking', async () => {
		const player = 'https://bandcamp.com/EmbeddedPlayer/album=123/size=large';
		const check = deps({});
		const result = await assessCapture(
			{ kind: 'audio', url: player, creatorUrl: CREATOR, foundOnPage: PAGE },
			check
		);
		expect(result).toEqual({
			ok: true,
			fields: { canonicalUrl: player, hostVerified: false, sharable: false }
		});
		expect(check.calls).toEqual([]);
	});

	describe('"no" signals keep it for the reader but make it not sharable', () => {
		const keep = (routes: Record<string, Route>) =>
			assessCapture(
				{ kind: 'audio', url: FILE, creatorUrl: CREATOR, foundOnPage: PAGE },
				deps({ [FILE]: {}, ...routes })
			);

		it('noindex in a robots meta tag', async () => {
			const result = await keep({
				[PAGE]: { body: `<meta name="robots" content="noindex">${LINKING}` }
			});
			expect(result).toMatchObject({
				ok: true,
				fields: { hostVerified: true, sharable: false, linkedInMarkup: true }
			});
		});

		it('noindex in an X-Robots-Tag header', async () => {
			const result = await keep({
				[PAGE]: { body: LINKING, headers: { 'x-robots-tag': 'noindex' } }
			});
			expect(result).toMatchObject({ ok: true, fields: { sharable: false } });
		});

		it('robots.txt disallowing the page, which is then not fetched at all', async () => {
			const check = deps({
				[FILE]: {},
				'https://lena.example/robots.txt': { body: 'User-agent: *\nDisallow: /music' },
				[PAGE]: { body: LINKING }
			});
			const result = await assessCapture(
				{ kind: 'audio', url: FILE, creatorUrl: CREATOR, foundOnPage: PAGE },
				check
			);
			expect(result).toMatchObject({ ok: true, fields: { hostVerified: true, sharable: false } });
			expect(result.ok && 'linkedInMarkup' in result.fields).toBe(false);
			expect(check.calls.some((call) => call.url === PAGE)).toBe(false);
		});

		it('a page whose script adds the file, so its markup cannot prove the link later', async () => {
			const result = await keep({ [PAGE]: { body: '<div id="player"></div>' } });
			expect(result).toMatchObject({
				ok: true,
				fields: { sharable: false, linkedInMarkup: false }
			});
		});
	});
});

describe('checking again', () => {
	const KEPT = reference({
		url: FILE,
		canonicalUrl: FILE,
		creatorId: 'lena.example',
		foundOnPage: PAGE,
		hostVerified: true,
		sharable: true,
		linkedInMarkup: true,
		etag: 'W/"1"'
	});

	it('a file still there, unchanged, stays live and keeps its validators', async () => {
		const check = await recheck(KEPT, deps({ [FILE]: { status: 304 }, [PAGE]: { body: LINKING } }));
		expect(check).toMatchObject({
			status: 'live',
			hostVerified: true,
			sharable: true,
			etag: 'W/"1"',
			checkedAt: '2026-10-04T12:00:00.000Z'
		});
	});

	it('a file the host no longer has is gone, with no copy to fall back on', async () => {
		expect(await recheck(KEPT, deps({ [FILE]: { status: 410 } }))).toMatchObject({
			status: 'gone',
			sharable: false
		});
	});

	it('a page that no longer links it makes it gone', async () => {
		expect(
			await recheck(KEPT, deps({ [FILE]: {}, [PAGE]: { body: '<p>Moved on.</p>' } }))
		).toMatchObject({ status: 'gone' });
	});

	it('a page that says noindex now leaves it live but not sharable', async () => {
		const check = await recheck(
			KEPT,
			deps({ [FILE]: {}, [PAGE]: { body: LINKING, headers: { 'x-robots-tag': 'noindex' } } })
		);
		expect(check).toMatchObject({ status: 'live', sharable: false });
	});

	it('offline, says nothing rather than calling anything gone', async () => {
		expect(
			await recheck(
				KEPT,
				deps({ [FILE]: { offline: true }, [PAGE]: { offline: true }, [CREATOR]: { offline: true } })
			)
		).toBeNull();
	});

	it('never asks the page again about a file its markup never linked', async () => {
		const scripted = { ...KEPT, linkedInMarkup: false, sharable: false };
		const check = deps({ [FILE]: { status: 304 } });
		expect(await recheck(scripted, check)).toMatchObject({ status: 'live' });
		expect(check.calls.some((call) => call.url === PAGE)).toBe(false);
	});

	it('a writing snip whose passage has left the page is gone', async () => {
		const snip = reference({
			kind: 'text',
			url: PAGE,
			canonicalUrl: PAGE,
			creatorId: 'lena.example',
			hostVerified: true,
			selector: { exact: 'the fox went down to the river' }
		});
		expect(
			await recheck(snip, deps({ [PAGE]: { body: '<p>The fox went down to the river.</p>' } }))
		).toMatchObject({ status: 'live' });
		expect(await recheck(snip, deps({ [PAGE]: { body: '<p>Rewritten.</p>' } }))).toMatchObject({
			status: 'gone'
		});
	});
});

describe('passages', () => {
	const STORY = 'https://lena.example/story';
	const selector = { exact: 'the fox went down to the river' };

	it('keeps a passage from their page, sharable when the page shows it', async () => {
		const result = await assessCapture(
			{ kind: 'text', url: STORY, creatorUrl: CREATOR, foundOnPage: STORY, selector },
			deps({ [STORY]: { body: '<p>The fox went\n down to the river.</p>' } })
		);
		expect(result).toMatchObject({
			ok: true,
			fields: { hostVerified: true, sharable: true, linkedInMarkup: true }
		});
	});

	it('keeps one the page’s script wrote, but cannot share it', async () => {
		const result = await assessCapture(
			{ kind: 'text', url: STORY, creatorUrl: CREATOR, foundOnPage: STORY, selector },
			deps({ [STORY]: { body: '<div id="app"></div>' } })
		);
		expect(result).toMatchObject({ ok: true, fields: { sharable: false, linkedInMarkup: false } });
	});

	it('leaves alone a passage restored without its text, which has nothing to look for', async () => {
		const linkOnly = reference({
			kind: 'text',
			url: STORY,
			canonicalUrl: STORY,
			creatorId: 'lena.example'
		});
		expect(canRecheck(linkOnly)).toBe(false);
		expect(canRecheck({ ...linkOnly, selector })).toBe(true);
	});
});
