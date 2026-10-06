import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbedEngine, EmbedEvents } from './embeds/engines.js';

/**
 * The player driving a platform's own player instead of its audio element. The platforms'
 * scripts never load here: `mountEmbed` is replaced by a fake that records what it was asked and
 * hands the test the events, so the test can play the platform's part.
 */

const mounts: Array<{
	provider: string;
	autoplay: boolean;
	events: EmbedEvents;
	engine: EmbedEngine;
}> = [];

vi.mock('./embeds/engines.js', () => ({
	mountEmbed: vi.fn(
		async (
			source: { provider: string },
			_host: HTMLElement,
			events: EmbedEvents,
			opts: { autoplay: boolean }
		) => {
			const engine: EmbedEngine = {
				play: vi.fn(),
				pause: vi.fn(),
				seek: vi.fn(),
				destroy: vi.fn()
			};
			mounts.push({ provider: source.provider, autoplay: opts.autoplay, events, engine });
			return engine;
		}
	)
}));

const { player } = await import('./player.svelte.js');
type QueueItem = (typeof player.queue)[number];

function item(id: string, mediaUrl: string): QueueItem {
	return {
		id,
		title: id,
		creator: 'Ada Reed',
		url: 'https://ada.example.com/',
		siteUrl: 'https://ada.example.com/',
		artUrl: null,
		mediaUrl
	};
}

const VIDEO = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
const SC = 'https://soundcloud.com/forss/flickermood';
const BANDCAMP = 'https://bandcamp.com/EmbeddedPlayer/track=5678/';
const FILE = 'https://ada.example.com/low-tide.mp3';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let detach: () => void = () => {};

beforeEach(() => {
	detach();
	player.clear();
	mounts.length = 0;
	player.sheet = 'hidden';
});

describe('a track on a platform', () => {
	it('loads into the slot once it is there, and the audio element is left alone', async () => {
		player.play([item('v', VIDEO)], 0);
		expect(player.source).toEqual({ provider: 'youtube', videoId: 'M7lc1UVf-VE' });
		expect(mounts).toHaveLength(0);
		detach = player.attachEmbedHost(document.createElement('div'));
		await settle();
		expect(mounts).toEqual([expect.objectContaining({ provider: 'youtube', autoplay: true })]);
		expect(player.audio.getAttribute('src')).toBeNull();
	});

	it('takes play, pause and seek from our buttons, and hears back what the platform did', async () => {
		detach = player.attachEmbedHost(document.createElement('div'));
		player.play([item('s', SC)], 0);
		await settle();
		const { events, engine } = mounts[0]!;
		events.duration(200);
		events.playing(true);
		expect(player.playing).toBe(true);
		player.toggle();
		expect(engine.pause).toHaveBeenCalled();
		events.playing(false);
		player.toggle();
		expect(engine.play).toHaveBeenCalled();
		player.seek(50);
		expect(engine.seek).toHaveBeenCalledWith(50);
		events.time(51);
		expect(player.currentTime).toBe(51);
	});

	it('moves on when the platform says it ended, letting the old player go', async () => {
		detach = player.attachEmbedHost(document.createElement('div'));
		player.play([item('v', VIDEO), item('s', SC)], 0);
		await settle();
		mounts[0]!.events.ended();
		await settle();
		expect(player.current?.id).toBe('s');
		expect(mounts[0]!.engine.destroy).toHaveBeenCalled();
		expect(mounts[1]?.provider).toBe('soundcloud');
	});

	it('ignores an old player still reporting after the track changed', async () => {
		detach = player.attachEmbedHost(document.createElement('div'));
		player.play([item('v', VIDEO), item('f', FILE)], 0);
		await settle();
		const old = mounts[0]!.events;
		player.advance();
		expect(player.source).toBeNull();
		old.time(99);
		old.ended();
		expect(player.currentTime).toBe(0);
		expect(player.current?.id).toBe('f');
	});

	it('contacts no platform for a restored queue until play is pressed', async () => {
		detach = player.attachEmbedHost(document.createElement('div'));
		player.hydrate([item('b', BANDCAMP)], 0);
		await settle();
		expect(mounts).toHaveLength(0);
		expect(player.embedStarted).toBe(false);
		player.toggle();
		await settle();
		expect(mounts).toEqual([expect.objectContaining({ provider: 'bandcamp', autoplay: true })]);
		expect(player.embedStarted).toBe(true);
	});

	it('tells anyone listening when it starts, so a preview stops', async () => {
		const heard = vi.fn();
		const off = player.onStart(heard);
		detach = player.attachEmbedHost(document.createElement('div'));
		player.play([item('v', VIDEO)], 0);
		await settle();
		mounts[0]!.events.playing(true);
		expect(heard).toHaveBeenCalledTimes(1);
		off();
	});
});
