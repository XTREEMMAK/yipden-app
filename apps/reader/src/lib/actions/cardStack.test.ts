import { describe, expect, it } from 'vitest';
import { cardPlacement, isBehind, pinOffset } from './cardStack.js';

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

		it('sinks a little below its pinned spot as it folds, never rising into the edge above', () => {
			const quarter = cardPlacement(-CARD_HEIGHT / 4, CARD_HEIGHT, VIEWPORT)!;
			const half = cardPlacement(-CARD_HEIGHT / 2, CARD_HEIGHT, VIEWPORT)!;
			expect(quarter.transform).toContain('translateY(8px)');
			expect(half.transform).toContain('translateY(16px)');
		});

		it('clamps at fully tipped back and faded rather than continuing past it', () => {
			const placement = cardPlacement(-CARD_HEIGHT * 5, CARD_HEIGHT, VIEWPORT)!;
			expect(placement).toBeNull();
		});

		it('reaches full tip and fade exactly at one card height past the edge', () => {
			const placement = cardPlacement(-CARD_HEIGHT, CARD_HEIGHT, VIEWPORT)!;
			expect(placement.opacity).toBe(0);
			expect(placement.dim).toBeCloseTo(0.6);
			expect(placement.transform).toContain('translateY(32px)');
			expect(placement.transform).toContain('rotateX(-10deg)');
		});

		it('can hold a pinned card whole before beginning its exit fold', () => {
			const hold = 24;
			expect(cardPlacement(-hold, CARD_HEIGHT, VIEWPORT, false, hold)?.transform).toBe('none');
			expect(
				cardPlacement(-hold - CARD_HEIGHT / 2, CARD_HEIGHT, VIEWPORT, false, hold)?.opacity
			).toBe(0.5);
			expect(isBehind(-CARD_HEIGHT / 2, CARD_HEIGHT, VIEWPORT, hold)).toBe(false);
			expect(isBehind(-hold - CARD_HEIGHT / 2 - 1, CARD_HEIGHT, VIEWPORT, hold)).toBe(true);
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

describe('isBehind', () => {
	it('lets a card that has just pinned, or is rising, keep taking taps', () => {
		expect(isBehind(400, 300)).toBe(false);
		expect(isBehind(0, 300)).toBe(false);
		expect(isBehind(-10, 300)).toBe(false);
		expect(isBehind(-150, 300)).toBe(false);
	});

	it('refuses taps once a card is more than half folded away', () => {
		expect(isBehind(-151, 300)).toBe(true);
		expect(isBehind(-300, 300)).toBe(true);
	});
});

describe('a card taller than the screen', () => {
	const TALL = 900;

	it('is pinned by its bottom edge: held once that reaches the bottom of the screen', () => {
		expect(pinOffset(TALL, VIEWPORT)).toBe(-300);
		expect(pinOffset(CARD_HEIGHT, VIEWPORT)).toBe(0);
	});

	it('scrolls past the top untouched until all of it has been seen', () => {
		// Its top is 200px above the screen, its bottom still 100px from the bottom of it.
		expect(cardPlacement(-200, TALL, VIEWPORT)?.transform).toBe('none');
		expect(isBehind(-200, TALL, VIEWPORT)).toBe(false);
	});

	it('only then folds away, over its own height', () => {
		const start = cardPlacement(-300, TALL, VIEWPORT)!;
		const half = cardPlacement(-300 - TALL / 2, TALL, VIEWPORT)!;
		expect(start.opacity).toBe(1);
		expect(half.transform).toContain('rotateX(-5deg)');
		expect(isBehind(-300 - TALL / 2 - 1, TALL, VIEWPORT)).toBe(true);
	});

	it('stands up over one screen from a hinge at its top, its bottom still out of sight', () => {
		const rising = cardPlacement(VIEWPORT / 2, TALL, VIEWPORT)!;
		expect(rising.transformOrigin).toBe('50% 0%');
		expect(rising.transform).toContain('rotateX(7deg)');
		expect(cardPlacement(0, TALL, VIEWPORT)?.transform).toBe('none');
	});
	it('brings a rising card up flat and opaque when the pane asks for a flat entry', () => {
		const rising = VIEWPORT - CARD_HEIGHT / 2;
		expect(cardPlacement(rising, CARD_HEIGHT, VIEWPORT)!.opacity).toBeLessThan(1);
		expect(cardPlacement(rising, CARD_HEIGHT, VIEWPORT, false)).toEqual({
			transformOrigin: '50% 0%',
			transform: 'none',
			opacity: 1,
			dim: 0
		});
		// The fold away at the top is the same either way.
		expect(cardPlacement(-CARD_HEIGHT / 2, CARD_HEIGHT, VIEWPORT, false)).toEqual(
			cardPlacement(-CARD_HEIGHT / 2, CARD_HEIGHT, VIEWPORT)
		);
	});
});
