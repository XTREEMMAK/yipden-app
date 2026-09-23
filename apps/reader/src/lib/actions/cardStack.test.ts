import { describe, expect, it } from 'vitest';
import { cardPlacement } from './cardStack.js';

/**
 * The rAF fallback's geometry, checked as plain numbers: `relative` is a card's offset from
 * the top of the pane's visible area, `height` is the card's own height, `viewport` is the
 * pane's visible height (already excluding the dock). This is the same coordinate space
 * `layoutFallback` reads directly off the DOM.
 */

const CARD_HEIGHT = 200;
const VIEWPORT = 600;

describe('cardPlacement', () => {
	it('leaves a card resting in the middle of the viewport untouched', () => {
		const placement = cardPlacement(200, CARD_HEIGHT, VIEWPORT);
		expect(placement?.transform).toBe('none');
		expect(placement?.opacity).toBe(1);
		expect(placement?.dim).toBe(0);
	});

	it('is null for a card far below the viewport', () => {
		expect(cardPlacement(VIEWPORT + CARD_HEIGHT + 100, CARD_HEIGHT, VIEWPORT)).toBeNull();
	});

	it('is null for a card far above the viewport', () => {
		expect(cardPlacement(-CARD_HEIGHT - 200, CARD_HEIGHT, VIEWPORT)).toBeNull();
	});

	it('is null for a card with no measured height yet', () => {
		expect(cardPlacement(0, 0, VIEWPORT)).toBeNull();
	});

	describe('rising off the top', () => {
		it('starts untransformed the instant it reaches the top edge', () => {
			const placement = cardPlacement(0, CARD_HEIGHT, VIEWPORT);
			expect(placement?.dim).toBe(0);
			expect(placement?.opacity).toBe(1);
		});

		it('tips back, dims and fades as it rises further past the edge', () => {
			const quarter = cardPlacement(-CARD_HEIGHT / 4, CARD_HEIGHT, VIEWPORT)!;
			const half = cardPlacement(-CARD_HEIGHT / 2, CARD_HEIGHT, VIEWPORT)!;

			expect(quarter.transformOrigin).toBe('50% 0%');
			expect(half.opacity).toBeLessThan(quarter.opacity);
			expect(half.dim).toBeGreaterThan(quarter.dim);
			expect(half.transform).toContain('rotateX(-5deg)');
		});

		it('clamps at fully tipped back and faded rather than continuing past it', () => {
			const placement = cardPlacement(-CARD_HEIGHT * 5, CARD_HEIGHT, VIEWPORT)!;
			expect(placement).toBeNull();
		});

		it('reaches full tip and fade exactly at one card height past the edge', () => {
			const placement = cardPlacement(-CARD_HEIGHT, CARD_HEIGHT, VIEWPORT)!;
			expect(placement.opacity).toBe(0);
			expect(placement.dim).toBeCloseTo(0.6);
			expect(placement.transform).toContain('translateY(100%)');
			expect(placement.transform).toContain('rotateX(-10deg)');
		});
	});

	describe('rising from the bottom', () => {
		it('stands up as it nears the bottom of the viewport', () => {
			const nearBottom = cardPlacement(VIEWPORT - CARD_HEIGHT / 4, CARD_HEIGHT, VIEWPORT)!;
			const atBottom = cardPlacement(VIEWPORT, CARD_HEIGHT, VIEWPORT)!;

			expect(nearBottom.transformOrigin).toBe('50% 100%');
			expect(atBottom.opacity).toBeLessThan(nearBottom.opacity);
		});

		it('starts fully lying down at the very bottom edge of the viewport', () => {
			const placement = cardPlacement(VIEWPORT, CARD_HEIGHT, VIEWPORT)!;
			expect(placement.transform).toContain('translateY(24px)');
			expect(placement.transform).toContain('rotateX(14deg)');
			expect(placement.transform).toContain('scale(0.94)');
			expect(placement.opacity).toBe(0.5);
		});

		it('never carries the dim overlay while entering, only while exiting', () => {
			const placement = cardPlacement(VIEWPORT - 10, CARD_HEIGHT, VIEWPORT)!;
			expect(placement.dim).toBe(0);
		});
	});

	it('is continuous across the boundary between resting and entering', () => {
		const justInside = cardPlacement(VIEWPORT - CARD_HEIGHT - 1, CARD_HEIGHT, VIEWPORT)!;
		const justOutside = cardPlacement(VIEWPORT - CARD_HEIGHT + 1, CARD_HEIGHT, VIEWPORT)!;
		expect(justInside.opacity).toBeCloseTo(1, 1);
		expect(justOutside.opacity).toBeCloseTo(1, 1);
	});
});
