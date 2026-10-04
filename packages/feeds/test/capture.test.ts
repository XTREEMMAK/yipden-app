import { describe, expect, it } from 'vitest';
import {
	bareHost,
	headerNoIndex,
	isOnOwnSite,
	linkedOnPage,
	metaNoIndex,
	textOnPage
} from '../src/capture.js';
import { FeedHttp, HttpError } from '../src/http.js';
import { fakeServer } from './server.js';

describe('isOnOwnSite', () => {
	const sites = ['https://www.lena.example/', 'https://keyjay.neocities.org/'];

	it('accepts the creator’s host and its subdomains, with or without www', () => {
		expect(isOnOwnSite('https://lena.example/a.mp3', sites)).toBe(true);
		expect(isOnOwnSite('https://media.lena.example/a.mp3', sites)).toBe(true);
		expect(isOnOwnSite('https://keyjay.neocities.org/comic/1.png', sites)).toBe(true);
	});

	it('refuses another host, a parent host and a look-alike', () => {
		expect(isOnOwnSite('https://reupload.example/a.mp3', sites)).toBe(false);
		expect(isOnOwnSite('https://neocities.org/a.png', sites)).toBe(false);
		expect(isOnOwnSite('https://notlena.example/a.mp3', sites)).toBe(false);
		expect(isOnOwnSite('https://lena.example.evil.test/a.mp3', sites)).toBe(false);
		expect(isOnOwnSite('not a url', sites)).toBe(false);
	});

	it('reads hosts without case or www', () => {
		expect(bareHost('https://WWW.Lena.Example/x')).toBe('lena.example');
	});
});

describe('linkedOnPage', () => {
	const page = 'https://lena.example/music/';
	const html = `<html><head><meta property="og:audio" content="/audio/og.mp3"></head><body>
		<a href="../audio/linked.mp3">Download</a>
		<audio><source src="https://lena.example/audio/source.ogg"></audio>
		<img srcset="/comic/1-small.png 480w, /comic/1.png 1200w" src="/comic/1-small.png">
		<p>https://lena.example/audio/just-text.mp3</p>
	</body></html>`;

	it('finds a link, a source, a srcset entry and a meta tag, resolved against the page', () => {
		for (const target of [
			'https://lena.example/audio/linked.mp3',
			'https://lena.example/audio/source.ogg',
			'https://lena.example/comic/1.png',
			'https://lena.example/audio/og.mp3'
		]) {
			expect(linkedOnPage(html, page, target)).toBe(true);
		}
	});

	it('does not count an address that only appears as text, or one not there at all', () => {
		expect(linkedOnPage(html, page, 'https://lena.example/audio/just-text.mp3')).toBe(false);
		expect(linkedOnPage(html, page, 'https://lena.example/audio/removed.mp3')).toBe(false);
	});
});

describe('textOnPage', () => {
	it('finds a passage across line breaks and markup, and not one that is gone', () => {
		const html = '<article><p>The fox went\n   down to the <em>river</em>.</p></article>';
		expect(textOnPage(html, 'the fox went down to the river.')).toBe(true);
		expect(textOnPage(html, 'The fox went up the hill.')).toBe(false);
		expect(textOnPage(html, '   ')).toBe(false);
	});
});

describe('robots signals', () => {
	it('reads noindex and none from robots meta tags, and ignores other meta', () => {
		expect(metaNoIndex('<meta name="robots" content="noindex, nofollow">')).toBe(true);
		expect(metaNoIndex('<meta name="ROBOTS" content="none">')).toBe(true);
		expect(metaNoIndex('<meta name="yipden" content="noindex">')).toBe(true);
		expect(metaNoIndex('<meta name="robots" content="index, follow">')).toBe(false);
		expect(metaNoIndex('<meta name="description" content="noindex">')).toBe(false);
		expect(metaNoIndex('<meta name="googlebot" content="noindex">')).toBe(false);
	});

	it('reads X-Robots-Tag for everyone, or for YipDen, but not for another agent', () => {
		expect(headerNoIndex('noindex')).toBe(true);
		expect(headerNoIndex('nofollow, noindex')).toBe(true);
		expect(headerNoIndex('googlebot: noindex')).toBe(false);
		expect(headerNoIndex('googlebot: noindex, otherbot: nofollow')).toBe(false);
		expect(headerNoIndex('yipden: none')).toBe(true);
		expect(headerNoIndex('unavailable_after: 25 Jun 2010 15:00:00 PST, noindex')).toBe(true);
		expect(headerNoIndex('unavailable_after: 25 Jun 2010 15:00:00 PST')).toBe(false);
		expect(headerNoIndex(null)).toBe(false);
	});
});

describe('FeedHttp.head', () => {
	const quiet = { respectRobots: true, minHostIntervalMs: 0 };

	it('follows redirects to where a file lives, without reading it, ignoring robots.txt', async () => {
		const server = fakeServer({
			'https://neo.example/robots.txt': { body: 'User-agent: *\nDisallow: /' },
			'https://neo.example/a.mp3': {
				status: 302,
				headers: { location: 'https://keyjay.neocities.org/a.mp3' }
			},
			'https://keyjay.neocities.org/a.mp3': { body: 'BYTES', headers: { etag: 'W/"1"' } }
		});
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });

		const response = await http.head('https://neo.example/a.mp3');
		expect(response.url).toBe('https://keyjay.neocities.org/a.mp3');
		expect(response.etag).toBe('W/"1"');
		expect(response.body).toBe('');
		expect(server.calls).not.toContain('https://neo.example/robots.txt');
	});

	it('reports a missing file as an HttpError with its status, and a 304 as not modified', async () => {
		const server = fakeServer({ 'https://lena.example/b.mp3': { status: 304 } });
		const http = new FeedHttp({ ...quiet, fetch: server.fetch });
		await expect(http.head('https://lena.example/gone.mp3')).rejects.toMatchObject({
			status: 404
		});
		await expect(http.head('https://lena.example/gone.mp3')).rejects.toBeInstanceOf(HttpError);
		expect((await http.head('https://lena.example/b.mp3', { etag: 'W/"1"' })).notModified).toBe(
			true
		);
	});
});
