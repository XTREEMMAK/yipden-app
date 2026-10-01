import type { Person } from './store/index.js';

/** How far back a followed person's posts are kept, unless the reader says otherwise. */
export const DEFAULT_MAX_AGE_DAYS = 30;
export const MIN_MAX_AGE_DAYS = 7;
export const MAX_MAX_AGE_DAYS = 90;

const DAY = 24 * 60 * 60 * 1000;

/** A person's own limit wins over the reader's default. */
export function effectiveMaxAgeDays(
	person: Pick<Person, 'maxAgeDays'> | undefined,
	fallback: number
): number {
	return person?.maxAgeDays ?? fallback;
}

/** The ISO instant before which a post is too old to keep. */
export function ageCutoff(days: number, now: Date = new Date()): string {
	return new Date(now.getTime() - days * DAY).toISOString();
}

/*
 * Always enforced in a release build. A debug build (see vite.config.ts) starts with it off, so old saved
 * feeds can be used as test data, and Settings has a switch (prefs.ageLimitEnabled) to turn it on.
 * While off, refreshAll keeps every post and nothing is pruned; the setting and its sliders still
 * save, they just have no effect.
 */
let ageLimitActive = !__YIPDEN_DEBUG__;

export function isAgeLimitActive(): boolean {
	return ageLimitActive;
}

/** Tests turn the limit back on to check it. */
export function setAgeLimitActive(active: boolean): void {
	ageLimitActive = active;
}
