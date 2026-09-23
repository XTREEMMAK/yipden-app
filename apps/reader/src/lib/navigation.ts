/**
 * Which way a screen change should move.
 *
 * Tabs slide horizontally in tab order, so going from Discover to You slides one way and
 * coming back slides the other. Anything that is not a tab is a detail view, which pushes in
 * from the right and reverses on the way back.
 */

const TAB_ORDER = ['/', '/feeds', '/follow', '/you'] as const;

function tabIndex(pathname: string): number {
	const normalized = pathname.replace(/\/+$/, '') || '/';
	return TAB_ORDER.findIndex((tab) => tab === normalized);
}

export type NavDirection = 'forward' | 'back' | 'none';

export function directionBetween(from: string | null | undefined, to: string): NavDirection {
	if (!from) return 'none';

	const fromTab = tabIndex(from);
	const toTab = tabIndex(to);

	if (fromTab !== -1 && toTab !== -1) {
		if (fromTab === toTab) return 'none';
		return toTab > fromTab ? 'forward' : 'back';
	}

	// Into a detail view pushes forward; back out of one reverses.
	if (fromTab !== -1 && toTab === -1) return 'forward';
	if (fromTab === -1 && toTab !== -1) return 'back';
	return 'forward';
}
