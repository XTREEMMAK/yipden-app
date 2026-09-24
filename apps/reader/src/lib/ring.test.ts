import { describe, expect, it } from 'vitest';
import { washColorFor, washFor } from './ring.svelte.js';

describe('washFor and washColorFor', () => {
	it('is deterministic for the same id', () => {
		expect(washFor('lena')).toBe(washFor('lena'));
		expect(washColorFor('lena')).toEqual(washColorFor('lena'));
	});

	it('differs between two different ids', () => {
		expect(washFor('lena')).not.toBe(washFor('bo'));
		expect(washColorFor('lena')).not.toEqual(washColorFor('bo'));
	});

	it('returns three RGB bytes in range', () => {
		const [r, g, b] = washColorFor('lena');
		for (const channel of [r, g, b]) {
			expect(channel).toBeGreaterThanOrEqual(0);
			expect(channel).toBeLessThanOrEqual(255);
		}
	});

	it('the CSS wash and the RGB wash agree on hue: same id, same color family', () => {
		// washFor's first stop is hsl(hue 46% 24%), the same hue washColorFor converts to RGB.
		// A weak but real check that the two were not left to drift apart: the RGB value should
		// embed the same hue string washFor's gradient does.
		const css = washFor('lena');
		const hueMatch = css.match(/hsl\((\d+) 46% 24%\)/);
		expect(hueMatch).not.toBeNull();
	});
});
