import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEmbed, type EmbedEvents } from './engines.js';
import { embedControllable } from './source.js';

/**
 * The Bandcamp engine with and without the Android host's bridge. The bridge itself runs inside
 * Bandcamp's frame on the phone (assets/yipden/bandcamp-bridge.js); here the test plays its part,
 * posting what it would from that frame.
 */

const SOURCE = { provider: 'bandcamp' as const, album: '2474933565' };
const flag = window as unknown as { __yipdenBandcampBridge?: number };

function events(): EmbedEvents & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		playing: (on) => calls.push(`playing:${on}`),
		time: (s) => calls.push(`time:${s}`),
		duration: (s) => calls.push(`duration:${s}`),
		ended: () => calls.push('ended'),
		error: () => calls.push('error'),
		meta: () => {}
	};
}

function fromFrame(frame: HTMLIFrameElement, data: unknown, origin = 'https://bandcamp.com') {
	window.dispatchEvent(new MessageEvent('message', { data, origin, source: frame.contentWindow }));
}

let host: HTMLElement;
beforeEach(() => {
	host = document.createElement('div');
	document.body.append(host);
});
afterEach(() => {
	delete flag.__yipdenBandcampBridge;
	host.remove();
});

describe('without the bridge', () => {
	it('is its own player: not controllable, and our buttons do nothing', async () => {
		expect(embedControllable('bandcamp')).toBe(false);
		const engine = await mountEmbed(SOURCE, host, events(), { autoplay: true, title: 'x' });
		const frame = host.querySelector('iframe')!;
		const post = vi.spyOn(frame.contentWindow!, 'postMessage');
		engine.play();
		expect(post).not.toHaveBeenCalled();
	});
});

describe('with the bridge', () => {
	beforeEach(() => {
		flag.__yipdenBandcampBridge = 1;
	});

	it('is controllable, plays once the player is ready, and hears what it says', async () => {
		expect(embedControllable('bandcamp')).toBe(true);
		const heard = events();
		await mountEmbed(SOURCE, host, heard, { autoplay: true, title: 'x' });
		const frame = host.querySelector('iframe')!;
		const post = vi.spyOn(frame.contentWindow!, 'postMessage');

		fromFrame(frame, { yipdenBandcamp: 1, type: 'ready' });
		expect(post).toHaveBeenCalledWith(
			{ yipdenBandcamp: 1, command: 'play', value: undefined },
			'https://bandcamp.com'
		);

		fromFrame(frame, { yipdenBandcamp: 1, type: 'playing', value: true });
		fromFrame(frame, { yipdenBandcamp: 1, type: 'duration', value: 272 });
		fromFrame(frame, { yipdenBandcamp: 1, type: 'time', value: 8 });
		fromFrame(frame, { yipdenBandcamp: 1, type: 'ended' });
		expect(heard.calls).toEqual(['playing:true', 'duration:272', 'time:8', 'ended']);
	});

	it('sends pause and seek, and ignores anything not from that Bandcamp frame', async () => {
		const heard = events();
		const engine = await mountEmbed(SOURCE, host, heard, { autoplay: false, title: 'x' });
		const frame = host.querySelector('iframe')!;
		const post = vi.spyOn(frame.contentWindow!, 'postMessage');
		engine.pause();
		engine.seek(42);
		expect(post.mock.calls.map(([data]) => (data as { command: string }).command)).toEqual([
			'pause',
			'seek'
		]);

		fromFrame(frame, { yipdenBandcamp: 1, type: 'ended' }, 'https://evil.example');
		window.dispatchEvent(
			new MessageEvent('message', {
				data: { yipdenBandcamp: 1, type: 'ended' },
				origin: 'https://bandcamp.com',
				source: window
			})
		);
		fromFrame(frame, { type: 'ended' });
		expect(heard.calls).toEqual([]);
	});
});
