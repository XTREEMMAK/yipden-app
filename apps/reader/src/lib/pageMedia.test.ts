import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MESSAGE_TYPE, readFound, readFoundMedia, SCAN_SCRIPT } from './pageMedia.js';

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

describe('SCAN_SCRIPT in a real page', () => {
	const posted: Array<{ detail: Record<string, unknown> }> = [];
	const last = () => posted[posted.length - 1]!.detail;

	beforeAll(() => {
		vi.useFakeTimers();
		document.body.innerHTML = `
			<img id="art" src="https://ash.example/comic/1.png" alt="Page one">
			<p id="text">Before the passage. The fox went down to the river. After it.</p>
			<img id="other" src="https://ash.example/comic/2.png" alt="">`;
		(window as unknown as { mobileApp: unknown }).mobileApp = {
			postMessage: (value: { detail: Record<string, unknown> }) => posted.push(value)
		};
		new Function(SCAN_SCRIPT)();
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it('notes a long-pressed picture, through contextmenu, without stopping the page’s own', () => {
		const event = new Event('contextmenu', { bubbles: true, cancelable: true });
		document.getElementById('art')!.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(last().image).toMatchObject({ url: 'https://ash.example/comic/1.png', alt: 'Page one' });
	});

	it('notes a picture held down, and not one the finger moved away from', () => {
		const other = document.getElementById('other')!;
		const press = (x: number) =>
			other.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: 0 })
			);
		press(0);
		document.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 0 })
		);
		vi.advanceTimersByTime(600);
		expect((last().image as { url: string }).url).toBe('https://ash.example/comic/1.png');

		press(0);
		vi.advanceTimersByTime(600);
		expect((last().image as { url: string }).url).toBe('https://ash.example/comic/2.png');
	});

	it('notes the selected passage with a little text either side, sent with the next scan', () => {
		const node = document.getElementById('text')!.firstChild!;
		const content = node.textContent!;
		const start = content.indexOf('The fox');
		const range = document.createRange();
		range.setStart(node, start);
		range.setEnd(node, start + 'The fox went down to the river.'.length);
		document.getSelection()!.removeAllRanges();
		document.getSelection()!.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		vi.advanceTimersByTime(350);

		(window as unknown as { __yipdenScan: (playing: null) => void }).__yipdenScan(null);
		expect(last().passage).toMatchObject({
			exact: 'The fox went down to the river.',
			prefix: 'Before the passage. ',
			suffix: ' After it.'
		});
	});
});

describe('readFound', () => {
	const page = 'https://ash.example/comic';

	it('keeps a safe picture and passage, cleaned', () => {
		const found = readFound({
			type: MESSAGE_TYPE,
			items: [],
			image: { url: 'https://ash.example/1.png', alt: 'One‮', page },
			passage: { exact: '  The fox\n\twent​ down. ', prefix: 'x', suffix: '', page }
		});
		expect(found.image).toEqual({ url: 'https://ash.example/1.png', alt: 'One', page });
		expect(found.passage).toEqual({ exact: 'The fox went down.', prefix: 'x', page });
		expect(found.passageTooLong).toBe(false);
	});

	it('drops an unsafe picture or one without its page, and an empty passage', () => {
		const found = readFound({
			type: MESSAGE_TYPE,
			image: { url: 'http://ash.example/1.png', alt: '', page },
			passage: { exact: '   ', page }
		});
		expect(found.image).toBeNull();
		expect(found.passage).toBeNull();
		expect(
			readFound({ type: MESSAGE_TYPE, image: { url: 'https://ash.example/1.png' } }).image
		).toBeNull();
		expect(
			readFound({ type: 'other', image: { url: 'https://a.example/1.png', page } }).image
		).toBeNull();
	});

	it('says when a selection is longer than a passage, rather than cutting it short', () => {
		const found = readFound({ type: MESSAGE_TYPE, passage: { exact: 'word '.repeat(150), page } });
		expect(found.passage).toBeNull();
		expect(found.passageTooLong).toBe(true);
	});
});
