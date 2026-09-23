import { cubicInOut } from 'svelte/easing';

/**
 * The motion system, in one file.
 *
 * Motion is part of this product rather than polish added later, and the way it stays coherent
 * is that there is exactly one curve and three durations. Every component imports them from
 * here. A different easing written inline is a bug: the app should feel like one hand made it.
 */

/** The curve, matching the CSS token `--ease`. Do not write another one. */
export const ease = cubicInOut;

/** The same curve as a CSS value, for anything animated in a stylesheet. */
export const EASE_CSS = 'cubic-bezier(0.65, 0, 0.35, 1)';

export const duration = {
	/** Chips, toggles, pressed states. */
	s: 200,
	/** Cards, fly ins, sheets. */
	m: 320,
	/** Screen transitions. */
	l: 420,
	/** Discover's image transition, and nothing else. */
	xl: 640
} as const;

/** Lists stagger by this much per item. */
export const STAGGER_MS = 40;

/**
 * Only the first few items in a list stagger.
 *
 * A long feed that staggers every card feels slow, and the reader is waiting on the bottom of
 * the screen rather than reading the top of it. After this many, everything arrives together.
 */
export const STAGGER_LIMIT = 8;

export function staggerDelay(index: number): number {
	return index < STAGGER_LIMIT ? index * STAGGER_MS : STAGGER_LIMIT * STAGGER_MS;
}

/** Whether the reader asked the system to reduce motion. False during server rendering. */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface FlyOptions {
	y?: number;
	delay?: number;
	duration?: number;
}

/**
 * The standard entrance: things fly in rather than appear.
 *
 * Under reduced motion this becomes a plain fade of the same shape, so callers never branch.
 */
export function flyIn(options: FlyOptions = {}) {
	const reduced = prefersReducedMotion();
	return {
		y: reduced ? 0 : (options.y ?? 18),
		duration: reduced ? duration.s : (options.duration ?? duration.m),
		delay: options.delay ?? 0,
		opacity: 0,
		easing: ease
	};
}

/** The gesture thresholds the prototype uses, shared by every swipe in the app. */
export const gesture = {
	/** Past this fraction of the axis, a release commits rather than snapping back. */
	commitFraction: 0.3,
	/** Pixels per millisecond past which a flick commits whatever the distance. */
	flickVelocity: 0.5,
	/** Movement below this is a tap, not a drag, so buttons still work inside a swipe area. */
	slopPx: 8
} as const;
