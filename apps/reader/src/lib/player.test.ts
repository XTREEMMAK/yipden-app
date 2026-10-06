import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { formatTime, player, RATES, type QueueItem } from './player.svelte.js';
import { store } from './store/index.js';

function item(overrides: Partial<QueueItem> = {}): QueueItem {
	return {
		id: 'a',
		title: 'Low Tide',
		creator: 'Ada Reed',
		url: 'https://ada.example.com/low-tide',
		siteUrl: 'https://ada.example.com/low-tide',
		artUrl: null,
		mediaUrl: 'https://ada.example.com/low-tide.mp3',
		...overrides
	};
}

beforeEach(async () => {
	globalThis.indexedDB = new IDBFactory();
	await store.init();
	// Reset player state between tests; it is a module singleton, same as `store`.
	player.queue = [];
	player.currentIndex = -1;
	player.playing = false;
	player.currentTime = 0;
	player.duration = 0;
	player.rate = 1;
	player.sheet = 'hidden';
	player.loop = true;
	player.ended = false;
});

describe('formatTime', () => {
	it.each([
		[0, '0:00'],
		[5, '0:05'],
		[65, '1:05'],
		[3723, '62:03']
	])('formats %i seconds as %s', (seconds, expected) => {
		expect(formatTime(seconds)).toBe(expected);
	});

	it('refuses a negative or non-finite value rather than showing garbage', () => {
		expect(formatTime(-5)).toBe('0:00');
		expect(formatTime(Number.NaN)).toBe('0:00');
		expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
	});
});

describe('play and the queue', () => {
	it('starts at the given index and opens the full sheet', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1);
		expect(player.current?.id).toBe('b');
		expect(player.sheet).toBe('full');
	});

	it('reports the next item, wrapping at the end', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1);
		expect(player.next?.id).toBe('a');
	});

	it('reports no next item alone in the queue', () => {
		player.play([item({ id: 'a' })], 0);
		expect(player.next).toBeNull();
	});

	it('advances forward and wraps around', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })], 2);
		player.advance();
		expect(player.current?.id).toBe('a');
	});

	it('steps back and wraps the other way', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 0);
		player.back();
		expect(player.current?.id).toBe('b');
	});

	it('does nothing on back or advance alone in the queue, beyond stopping playback', () => {
		player.play([item({ id: 'a' })], 0);
		const before = player.current?.id;
		player.back();
		expect(player.current?.id).toBe(before);
	});

	it('resets the clock when loading a new item', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 0);
		player.currentTime = 42;
		player.duration = 100;
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1);
		expect(player.currentTime).toBe(0);
		expect(player.duration).toBe(0);
	});
});

describe('a non-looping queue', () => {
	it('stops rather than wrapping once the last item finishes', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1, undefined, { loop: false });
		expect(player.next).toBeNull();
		player.advance();
		expect(player.current?.id).toBe('b');
		expect(player.ended).toBe(true);
	});

	it('still wraps by default, unaffected by another queue having opted out', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1, undefined, { loop: false });
		player.play([item({ id: 'c' }), item({ id: 'd' })], 1);
		player.advance();
		expect(player.current?.id).toBe('c');
	});

	it('clears `ended` the moment it moves again', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1, undefined, { loop: false });
		player.advance();
		expect(player.ended).toBe(true);
		player.back();
		expect(player.ended).toBe(false);
	});
});

describe('addToQueue', () => {
	it('starts playing immediately when nothing was queued', () => {
		player.addToQueue([item({ id: 'a' })]);
		expect(player.current?.id).toBe('a');
	});

	it('appends without disturbing what is already playing', () => {
		player.play([item({ id: 'a' })], 0, undefined, { loop: false });
		player.addToQueue([item({ id: 'b' })]);
		expect(player.current?.id).toBe('a');
		expect(player.next?.id).toBe('b');
	});

	it('resumes into the new items when the queue had already run off its end', () => {
		player.play([item({ id: 'a' })], 0, undefined, { loop: false });
		player.advance();
		expect(player.ended).toBe(true);
		player.addToQueue([item({ id: 'b' }), item({ id: 'c' })]);
		expect(player.ended).toBe(false);
		expect(player.current?.id).toBe('b');
		expect(player.next?.id).toBe('c');
	});
});

describe('move', () => {
	it('keeps the playhead on the same track after moving it earlier', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })], 2);
		player.move(2, 0);
		expect(player.queue.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
		expect(player.current?.id).toBe('c');
	});

	it('keeps the playhead on the same track when something else moves around it', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })], 0);
		player.move(2, 0);
		expect(player.queue.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
		expect(player.current?.id).toBe('a');
	});
});

describe('removeAt', () => {
	it('shifts the playhead down when removing something before it', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })], 2);
		player.removeAt(0);
		expect(player.queue.map((entry) => entry.id)).toEqual(['b', 'c']);
		expect(player.current?.id).toBe('c');
	});

	it('jumps to the next surviving track when the playing one is removed', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })], 1);
		player.removeAt(1);
		expect(player.current?.id).toBe('c');
	});

	it('stops and marks the queue ended when the last item, and the one playing, is removed', () => {
		player.play([item({ id: 'a' }), item({ id: 'b' })], 1);
		player.removeAt(1);
		expect(player.current?.id).toBe('a');
		expect(player.ended).toBe(true);
	});

	it('empties out and stops entirely once the only item is removed', () => {
		player.play([item({ id: 'a' })], 0);
		player.removeAt(0);
		expect(player.current).toBeNull();
		expect(player.queue).toHaveLength(0);
	});
});

describe('removeBatch', () => {
	it('removes every item sharing a batchKey in one call', () => {
		player.play(
			[
				item({ id: 'a', batchKey: 'ada' }),
				item({ id: 'b', batchKey: 'ada' }),
				item({ id: 'c', batchKey: 'bo' })
			],
			0
		);
		player.removeBatch('ada');
		expect(player.queue.map((entry) => entry.id)).toEqual(['c']);
		expect(player.current?.id).toBe('c');
	});
});

describe('removePerson', () => {
	it('removes only that creator and clears the player when none remain', () => {
		player.play(
			[item({ id: 'a', personId: 'person-ada' }), item({ id: 'b', personId: 'person-bo' })],
			0
		);

		player.removePerson('person-ada');
		expect(player.queue.map((entry) => entry.id)).toEqual(['b']);
		expect(player.current?.personId).toBe('person-bo');

		player.removePerson('person-bo');
		expect(player.current).toBeNull();
		expect(player.queue).toEqual([]);
		expect(player.sheet).toBe('hidden');

		player.play([item({ id: 'legacy' })], 0);
		player.removePerson('person-ada', 'https://ada.example.com/');
		expect(player.current).toBeNull();
	});
});

describe('hydrate', () => {
	it('restores the queue and position without starting playback', () => {
		player.hydrate([item({ id: 'a' }), item({ id: 'b' })], 1, { loop: false });
		expect(player.current?.id).toBe('b');
		expect(player.sheet).toBe('mini');
		expect(player.playing).toBe(false);
		expect(player.loop).toBe(false);
	});

	it('does nothing with an empty queue or an out of range index', () => {
		player.hydrate([], 0);
		expect(player.current).toBeNull();
		player.hydrate([item()], 5);
		expect(player.current).toBeNull();
	});
});

describe('the sheet', () => {
	it('collapses full to mini and no further', () => {
		player.play([item()], 0);
		player.collapse();
		expect(player.sheet).toBe('mini');
		player.collapse();
		expect(player.sheet).toBe('mini');
	});

	it('expands back to full when something is loaded', () => {
		player.play([item()], 0);
		player.collapse();
		player.expand();
		expect(player.sheet).toBe('full');
	});

	it('does not expand with nothing loaded', () => {
		player.expand();
		expect(player.sheet).toBe('hidden');
	});
});

describe('the card to player morph', () => {
	function card(withArt = true): HTMLElement {
		const el = document.createElement('button');
		if (withArt) el.appendChild(tag('art'));
		el.appendChild(tag('ttl'));
		document.body.appendChild(el);
		return el;
	}

	function tag(className: string): HTMLElement {
		const el = document.createElement('span');
		el.className = className;
		return el;
	}

	/** The full screen player's own morph targets, exactly as `.player` in Player.svelte lays them out. */
	function mountPlayerSection(): Record<'art' | 'title' | 'shade' | 'top' | 'body', HTMLElement> {
		const section = document.createElement('section');
		section.className = 'player';
		const els = {
			art: tag('pl-art'),
			title: tag('pl-title'),
			shade: tag('pl-shade'),
			top: tag('pl-top'),
			body: tag('pl-body')
		};
		for (const el of Object.values(els)) section.appendChild(el);
		document.body.appendChild(section);
		return els;
	}

	/** The bits of a real `ViewTransition` this suite cares about; `types`/`skipTransition` unused. */
	function fakeTransition(finished: Promise<void>) {
		return {
			finished,
			ready: Promise.resolve(),
			updateCallbackDone: Promise.resolve(),
			types: new Set(),
			skipTransition: () => {}
		} as unknown as ViewTransition;
	}

	/** A `startViewTransition` stub that runs its callback synchronously, like the real thing. */
	function stubViewTransition() {
		let resolveFinished!: () => void;
		const finished = new Promise<void>((resolve) => {
			resolveFinished = resolve;
		});
		const spy = vi.fn((callback: () => void) => {
			callback();
			return fakeTransition(finished);
		});
		document.startViewTransition = spy as unknown as typeof document.startViewTransition;
		return { spy, resolveFinished };
	}

	afterEach(() => {
		// jsdom has no real `startViewTransition`; this just undoes what each test stubbed in.
		document.startViewTransition = undefined as unknown as typeof document.startViewTransition;
		document.body.innerHTML = '';
	});

	it('opens the sheet the plain way when no source element is given', () => {
		player.play([item()], 0);
		expect(player.sheet).toBe('full');
		expect(player.current?.id).toBe('a');
	});

	it('opens the sheet the plain way when the browser has no view transition support', () => {
		const source = card();
		player.play([item()], 0, source);
		expect(player.sheet).toBe('full');
		expect(player.current?.id).toBe('a');
	});

	it('starts a view transition when the browser supports one and a source element is given', () => {
		const { spy } = stubViewTransition();
		const source = card();
		player.play([item()], 0, source);
		expect(spy).toHaveBeenCalledOnce();
		expect(player.sheet).toBe('full');
	});

	it('names the source art and title only for the moment the transition is captured', () => {
		let nameAtCapture = '';
		const source = card();
		document.startViewTransition = vi.fn((callback: () => void) => {
			nameAtCapture = source.querySelector<HTMLElement>('.art')!.style.viewTransitionName;
			callback();
			return fakeTransition(Promise.resolve());
		}) as unknown as typeof document.startViewTransition;

		player.play([item()], 0, source);

		expect(nameAtCapture).toBe('yip-art');
		expect(source.querySelector<HTMLElement>('.art')!.style.viewTransitionName).toBe('');
		expect(source.querySelector<HTMLElement>('.ttl')!.style.viewTransitionName).toBe('');
	});

	it('hands the player its own elements the shared and its own transition names', () => {
		stubViewTransition();
		const source = card();
		const target = mountPlayerSection();

		player.play([item()], 0, source);

		expect(target.art.style.viewTransitionName).toBe('yip-art');
		expect(target.title.style.viewTransitionName).toBe('yip-title');
		expect(target.shade.style.viewTransitionName).toBe('pl-shade');
		expect(target.top.style.viewTransitionName).toBe('pl-top');
		expect(target.body.style.viewTransitionName).toBe('pl-body');
	});

	it('clears the player elements transition names once the transition finishes', async () => {
		const { resolveFinished } = stubViewTransition();
		const source = card();
		const target = mountPlayerSection();

		player.play([item()], 0, source);
		resolveFinished();
		await Promise.resolve();
		await Promise.resolve();

		expect(target.art.style.viewTransitionName).toBe('');
		expect(target.title.style.viewTransitionName).toBe('');
	});

	it('skips the transition when the source element has no art to morph', () => {
		const { spy } = stubViewTransition();
		const source = card(false);

		player.play([item()], 0, source);

		expect(spy).not.toHaveBeenCalled();
		expect(player.current?.id).toBe('a');
	});

	it('does not start a second transition while the sheet is already open', () => {
		const { spy } = stubViewTransition();
		player.play([item({ id: 'a' })], 0, card());
		player.play([item({ id: 'b' })], 0, card());

		expect(spy).toHaveBeenCalledOnce();
		expect(player.current?.id).toBe('b');
	});
});

describe('cycleRate', () => {
	it('walks the fixed rates and wraps', () => {
		expect(player.rate).toBe(1);
		for (const expected of [1.25, 1.5, 2, 1]) {
			player.cycleRate();
			expect(player.rate).toBe(expected);
		}
	});

	it('only ever lands on a declared rate', () => {
		for (let i = 0; i < RATES.length * 2; i += 1) {
			player.cycleRate();
			expect(RATES).toContain(player.rate);
		}
	});
});

describe('seek and skip', () => {
	it('does nothing with nothing loaded', () => {
		player.seek(30);
		expect(player.currentTime).toBe(0);
	});
});

describe('peaks caching', () => {
	// player wraps the app's one long-lived store singleton, same as production, so its
	// IndexedDB connection outlives any single test's reset of the global indexedDB factory.
	// Each test below uses its own media URL rather than fighting that, the same way two real
	// tracks never collide with each other.

	it('returns null for a track never cached', async () => {
		expect(await player.readPeaks('https://example.com/never-cached.mp3')).toBeNull();
	});

	it('round trips peaks for a track', async () => {
		await player.writePeaks('https://example.com/round-trip.mp3', [0.1, 0.9, 0.4], 183);
		const record = await player.readPeaks('https://example.com/round-trip.mp3');
		expect(record?.duration).toBe(183);
		expect(record?.peaks).toEqual([0.1, 0.9, 0.4]);
	});

	it('keys by ETag as well as URL, so a re-encoded file is not served stale peaks', async () => {
		await player.writePeaks('https://example.com/etag.mp3', [0.1], 10, 'W/"v1"');
		expect(await player.readPeaks('https://example.com/etag.mp3', 'W/"v2"')).toBeNull();
		expect((await player.readPeaks('https://example.com/etag.mp3', 'W/"v1"'))?.duration).toBe(10);
	});

	it('treats no ETag as its own key, distinct from any specific one', async () => {
		await player.writePeaks('https://example.com/no-etag.mp3', [0.1], 10);
		expect(await player.readPeaks('https://example.com/no-etag.mp3', 'W/"v1"')).toBeNull();
		expect(await player.readPeaks('https://example.com/no-etag.mp3')).not.toBeNull();
	});

	it('treats peaks older than the cache ceiling as absent', async () => {
		await store.writePeaks({
			key: 'https://example.com/stale.mp3',
			peaks: [0.1],
			duration: 10,
			cachedAt: '2020-01-01T00:00:00.000Z'
		});
		expect(await player.readPeaks('https://example.com/stale.mp3')).toBeNull();
	});
});
