import { describe, expect, it } from 'vitest';
import { MESSAGE_TYPE, readFoundMedia, SCAN_SCRIPT } from './pageMedia.js';

const message = (items: unknown[]) => ({ type: MESSAGE_TYPE, items });

describe('readFoundMedia', () => {
	it('keeps safe audio, playing first, each address once', () => {
		const found = readFoundMedia(
			message([
				{ url: 'https://ash.example/a.mp3', title: 'A', how: 'link' },
				{ url: 'https://ash.example/b.ogg', title: 'B', how: 'playing' },
				{ url: 'https://ash.example/a.mp3', title: 'A again', how: 'element' }
			])
		);
		expect(found.map((item) => [item.url, item.how])).toEqual([
			['https://ash.example/b.ogg', 'playing'],
			['https://ash.example/a.mp3', 'element']
		]);
	});

	it('drops anything a page could use to reach somewhere it should not', () => {
		expect(
			readFoundMedia(
				message([
					{ url: 'http://ash.example/a.mp3', how: 'link' },
					{ url: 'https://127.0.0.1/a.mp3', how: 'link' },
					{ url: 'https://user:pass@ash.example/a.mp3', how: 'link' },
					{ url: 'javascript:alert(1)', how: 'link' },
					{ url: 'blob:https://ash.example/1', how: 'playing' },
					{ url: `https://ash.example/${'x'.repeat(3000)}.mp3`, how: 'link' },
					{ url: 'https://ash.example/a.mp3', how: 'download' },
					null,
					'nope'
				])
			)
		).toEqual([]);
	});

	it('only counts a loaded file when it is audio, and an embed only when it is a known player', () => {
		const found = readFoundMedia(
			message([
				{ url: 'https://ash.example/app.js', how: 'loaded' },
				{ url: 'https://ash.example/song.m4a', how: 'loaded' },
				{ url: 'https://ads.example/frame', how: 'embed' },
				{ url: 'https://bandcamp.com/EmbeddedPlayer/album=1/', how: 'embed' }
			])
		);
		expect(found.map((item) => [item.url, item.kind])).toEqual([
			['https://bandcamp.com/EmbeddedPlayer/album=1/', 'bandcamp'],
			['https://ash.example/song.m4a', 'file']
		]);
	});

	it('flattens a title to plain, short, single-line text', () => {
		const [item] = readFoundMedia(
			message([
				{ url: 'https://ash.example/a.mp3', how: 'link', title: '  Night\n\tdrive\u202e <b>x</b>' }
			])
		);
		expect(item?.title).toBe('Night drive <b>x</b>');
		const [long] = readFoundMedia(
			message([{ url: 'https://ash.example/b.mp3', how: 'link', title: 'y'.repeat(500) }])
		);
		expect(long?.title).toHaveLength(200);
	});

	it('ignores anything that is not a scan, and caps how many it keeps', () => {
		expect(readFoundMedia({ type: 'other', items: [] })).toEqual([]);
		expect(readFoundMedia('a string')).toEqual([]);
		const many = Array.from({ length: 300 }, (_, index) => ({
			url: `https://ash.example/${index}.mp3`,
			how: 'link'
		}));
		expect(readFoundMedia(message(many))).toHaveLength(50);
	});
});

describe('SCAN_SCRIPT', () => {
	it('is valid JavaScript that reports through the bridge and never throws', () => {
		const posted: unknown[] = [];
		const sandbox = {
			location: { href: 'https://ash.example/music' },
			document: {
				querySelectorAll: (selector: string) =>
					selector === 'a[href]'
						? [
								{
									getAttribute: (name: string) => (name === 'href' ? '/a.mp3' : null),
									textContent: 'Track A'
								}
							]
						: [],
				addEventListener: () => {}
			},
			performance: { getEntriesByType: () => [] },
			mobileApp: { postMessage: (value: unknown) => posted.push(value) }
		};
		const run = new Function(
			'window',
			'document',
			'location',
			'performance',
			SCAN_SCRIPT.replace(/^\(\(\) =>/, 'return (() =>')
		);
		run(sandbox, sandbox.document, sandbox.location, sandbox.performance);
		expect(readFoundMedia((posted[0] as { detail: unknown }).detail)).toEqual([
			{ url: 'https://ash.example/a.mp3', title: 'Track A', how: 'link', kind: 'file' }
		]);
	});
});
