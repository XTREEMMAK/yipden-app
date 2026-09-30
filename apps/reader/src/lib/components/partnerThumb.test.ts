import { describe, expect, it } from 'vitest';
import { isPreviewable, PREVIEWABLE_MIN_SIZE } from './partnerThumb.js';

describe('isPreviewable', () => {
	it('is false for a classic 88x31 webring banner', () => {
		expect(isPreviewable(88, 31)).toBe(false);
	});

	it('is true for real 300x300 cover art', () => {
		expect(isPreviewable(300, 300)).toBe(true);
	});

	it('needs both dimensions past the threshold, not just one', () => {
		expect(isPreviewable(PREVIEWABLE_MIN_SIZE, 10)).toBe(false);
		expect(isPreviewable(10, PREVIEWABLE_MIN_SIZE)).toBe(false);
	});

	it('is true exactly at the threshold on both sides', () => {
		expect(isPreviewable(PREVIEWABLE_MIN_SIZE, PREVIEWABLE_MIN_SIZE)).toBe(true);
	});

	it('is false before any image has loaded, at 0x0', () => {
		expect(isPreviewable(0, 0)).toBe(false);
	});
});
