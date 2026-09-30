import { describe, expect, it } from 'vitest';
import { youtubeVideoId } from '../src/kind.js';

describe('youtubeVideoId', () => {
	it('reads the id from the link shapes YouTube uses', () => {
		expect(youtubeVideoId('https://www.youtube.com/watch?v=abc12345678')).toBe('abc12345678');
		expect(youtubeVideoId('https://youtu.be/abc12345678?t=4')).toBe('abc12345678');
		expect(youtubeVideoId('https://www.youtube.com/shorts/abc12345678')).toBe('abc12345678');
		expect(youtubeVideoId('https://m.youtube.com/embed/abc12345678')).toBe('abc12345678');
	});

	it('refuses anything that is not a plain 11 character id on YouTube', () => {
		expect(youtubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
		expect(youtubeVideoId('https://www.youtube.com/watch?v=abc12345678"><script>')).toBeNull();
		expect(youtubeVideoId('https://evil.example/watch?v=abc12345678')).toBeNull();
		expect(youtubeVideoId('not a url')).toBeNull();
	});
});
