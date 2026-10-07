import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Playing on by itself, and the car's and lock screen's controls (phone feedback, 2026-10-07).
 *
 * The media session plugin is replaced by a fake that keeps the handlers the player gives it and
 * what it was last told, so the test can press the car's buttons. The platforms' players never
 * load: embeds mount as a do-nothing engine.
 */

const session = vi.hoisted(() => ({
	handlers: new Map<string, (details: { seekTime?: number | null }) => void>(),
	positions: [] as Array<{ position?: number }>
}));

vi.mock('@capgo/capacitor-media-session', () => ({
	MediaSession: {
		setActionHandler: vi.fn(
			async (
				options: { action: string },
				handler: (details: { seekTime?: number | null }) => void
			) => {
				session.handlers.set(options.action, handler);
			}
		),
		setMetadata: vi.fn(async () => {}),
		setPlaybackState: vi.fn(async () => {}),
		setPositionState: vi.fn(async (state: { position?: number }) => {
			session.positions.push(state);
		})
	}
}));

vi.mock('./embeds/engines.js', () => ({
	mountEmbed: vi.fn(async () => ({
		play: vi.fn(),
		pause: vi.fn(),
		seek: vi.fn(),
		destroy: vi.fn()
	}))
}));

const { player } = await import('./player.svelte.js');
type QueueItem = (typeof player.queue)[number];

const file = (id: string): QueueItem => ({
	id,
	title: id,
	creator: 'Ada Reed',
	url: `https://ada.example.com/${id}`,
	siteUrl: 'https://ada.example.com/',
	artUrl: null,
	mediaUrl: `https://ada.example.com/${id}.mp3`
});
const bandcamp = (id: string): QueueItem => ({
	...file(id),
	mediaUrl: `https://bandcamp.com/EmbeddedPlayer/album=1234/track=${id.length}000/`
});

beforeEach(() => {
	player.queue = [];
	player.currentIndex = -1;
	player.playing = false;
	player.currentTime = 0;
	player.duration = 0;
	player.loop = false;
	player.ended = false;
	session.positions.length = 0;
	// The handlers are wired the first time the audio element is made.
	void player.audio;
});

describe('playing on by itself', () => {
	it('steps over a Bandcamp track to the next one that plays by itself', () => {
		player.play([file('a'), bandcamp('bc'), file('c')], 0);
		player.continueOn();
		expect(player.current?.id).toBe('c');
	});

	it('ends the queue when only Bandcamp is left after this', () => {
		player.play([file('a'), bandcamp('bc')], 0);
		player.continueOn();
		expect(player.current?.id).toBe('a');
		expect(player.ended).toBe(true);
	});

	it('still lands on a Bandcamp track from the player’s own Next', () => {
		player.play([file('a'), bandcamp('bc'), file('c')], 0);
		player.advance();
		expect(player.current?.id).toBe('bc');
	});

	it('goes back over a Bandcamp track from the car’s Previous', () => {
		player.play([file('a'), bandcamp('bc'), file('c')], 2);
		session.handlers.get('previoustrack')?.({});
		expect(player.current?.id).toBe('a');
	});
});

describe('the car and the lock screen', () => {
	it('Next skips what the car cannot start', () => {
		player.play([file('a'), bandcamp('bc'), file('c')], 0);
		session.handlers.get('nexttrack')?.({});
		expect(player.current?.id).toBe('c');
	});

	it('Play only ever plays, and Pause only ever pauses', () => {
		player.play([file('a')], 0);
		const toggle = vi.spyOn(player, 'toggle');
		player.playing = true;
		session.handlers.get('play')?.({});
		expect(toggle).not.toHaveBeenCalled();

		const pause = vi.spyOn(player, 'pause');
		player.playing = false;
		session.handlers.get('pause')?.({});
		expect(pause).toHaveBeenCalled();
		expect(toggle).not.toHaveBeenCalled();
		toggle.mockRestore();
		pause.mockRestore();
	});

	it('the scrubber moves the track, and ignores a missing time', () => {
		player.play([file('a')], 0);
		const seek = vi.spyOn(player, 'seek');
		session.handlers.get('seekto')?.({ seekTime: 42 });
		expect(seek).toHaveBeenCalledWith(42);
		session.handlers.get('seekto')?.({ seekTime: null });
		expect(seek).toHaveBeenCalledTimes(1);
		seek.mockRestore();
	});

	it('a seek in a platform’s player tells the car where it now is', () => {
		player.play([file('yt')], 0);
		player.queue = [{ ...file('yt'), mediaUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' }];
		player.currentIndex = 0;
		player.source = { provider: 'youtube', videoId: 'M7lc1UVf-VE' };
		player.duration = 200;
		session.positions.length = 0;
		player.seek(90);
		expect(session.positions.at(-1)?.position).toBe(90);
	});
});

describe('a lone Bandcamp track', () => {
	it('can be finished, which ends the queue and asks what next', () => {
		player.play([bandcamp('bc')], 0);
		expect(player.next).toBeNull();
		player.finish();
		expect(player.ended).toBe(true);
		expect(player.playing).toBe(false);
	});
});
