import { describe, expect, it } from 'vitest';
import { embedOf, embedSrc, youtubeLinkIn } from './source.js';

describe('embedOf', () => {
	it('reads a YouTube video from every address shape it comes in', () => {
		for (const url of [
			'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=30',
			'https://youtu.be/M7lc1UVf-VE',
			'https://m.youtube.com/watch?v=M7lc1UVf-VE',
			'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0',
			'https://www.youtube.com/shorts/M7lc1UVf-VE'
		]) {
			expect(embedOf(url)).toEqual({ provider: 'youtube', videoId: 'M7lc1UVf-VE' });
		}
	});

	it('leaves a YouTube channel or a malformed id alone', () => {
		expect(embedOf('https://www.youtube.com/@someone')).toBeNull();
		expect(embedOf('https://www.youtube.com/watch?v=short')).toBeNull();
	});

	it('reads a SoundCloud track or set page, and the widget address of one', () => {
		expect(embedOf('https://soundcloud.com/forss/flickermood?in=x')).toEqual({
			provider: 'soundcloud',
			url: 'https://soundcloud.com/forss/flickermood'
		});
		expect(embedOf('https://soundcloud.com/forss/sets/soulhack')).toEqual({
			provider: 'soundcloud',
			url: 'https://soundcloud.com/forss/sets/soulhack'
		});
		expect(
			embedOf(
				'https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F293&auto_play=false'
			)
		).toEqual({ provider: 'soundcloud', url: 'https://api.soundcloud.com/tracks/293' });
	});

	it('leaves a SoundCloud profile, or a widget pointing anywhere else, alone', () => {
		expect(embedOf('https://soundcloud.com/forss')).toBeNull();
		expect(embedOf('https://soundcloud.com/forss/tracks')).toBeNull();
		expect(
			embedOf('https://w.soundcloud.com/player/?url=https%3A%2F%2Fevil.example%2Fx')
		).toBeNull();
	});

	it("reads Bandcamp's own player, but not a track page, which needs a browser for its ids", () => {
		expect(
			embedOf('https://bandcamp.com/EmbeddedPlayer/v=2/album=1234/track=5678/size=large/')
		).toEqual({ provider: 'bandcamp', album: '1234', track: '5678' });
		expect(embedOf('https://artist.bandcamp.com/track/night')).toBeNull();
		expect(embedOf('https://bandcamp.com/EmbeddedPlayer/size=large/')).toBeNull();
	});

	it('leaves files, other sites and plain http alone', () => {
		expect(embedOf('https://lena.example/night.mp3')).toBeNull();
		expect(embedOf('http://www.youtube.com/watch?v=M7lc1UVf-VE')).toBeNull();
		expect(embedOf('not a url')).toBeNull();
	});
});

describe('embedSrc', () => {
	it('builds each player address from what was read, never from the raw address', () => {
		expect(embedSrc({ provider: 'youtube', videoId: 'M7lc1UVf-VE' }, 'https://localhost')).toMatch(
			/^https:\/\/www\.youtube-nocookie\.com\/embed\/M7lc1UVf-VE\?enablejsapi=1&.*origin=https%3A%2F%2Flocalhost/
		);
		expect(embedSrc({ provider: 'bandcamp', track: '5678' }, '')).toMatch(
			/^https:\/\/bandcamp\.com\/EmbeddedPlayer\/track=5678\/size=large\//
		);
	});
});

describe('youtubeLinkIn', () => {
	it('finds the first video a post links or embeds, as a plain watch address', () => {
		expect(
			youtubeLinkIn(
				'<p>New video!</p><iframe src="https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0"></iframe>'
			)
		).toBe('https://www.youtube.com/watch?v=M7lc1UVf-VE');
		expect(youtubeLinkIn(null, 'watch this youtu.be/x and https://youtu.be/M7lc1UVf-VE!')).toBe(
			'https://www.youtube.com/watch?v=M7lc1UVf-VE'
		);
		expect(
			youtubeLinkIn('<a href="https://www.youtube.com/watch?amp;v=M7lc1UVf-VE">x</a>')
		).toBeNull();
		expect(youtubeLinkIn('https://www.youtube.com/@channel', 'no video here')).toBeNull();
	});
});
