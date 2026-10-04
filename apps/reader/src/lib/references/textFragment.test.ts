import { describe, expect, it } from 'vitest';
import { textFragmentUrl } from './textFragment.js';

describe('textFragmentUrl', () => {
	it('gives a short passage whole, after the page without its own fragment', () => {
		expect(
			textFragmentUrl('https://lena.example/story#chapter-2', { exact: 'The fox went down.' })
		).toBe('https://lena.example/story#:~:text=The%20fox%20went%20down.');
	});

	it('encodes the characters a text directive uses as syntax', () => {
		expect(textFragmentUrl('https://lena.example/s', { exact: 'well-made, & done' })).toBe(
			'https://lena.example/s#:~:text=well%2Dmade%2C%20%26%20done'
		);
	});

	it('gives a long passage as its first and last words', () => {
		const exact =
			'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.';
		expect(textFragmentUrl('https://lena.example/s', { exact })).toBe(
			'https://lena.example/s#:~:text=One%20two%20three%20four,fourteen%20fifteen%20sixteen%20seventeen.'
		);
	});
});
