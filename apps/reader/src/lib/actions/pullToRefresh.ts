import { gesture } from '../motion.js';

/**
 * Pull to refresh, as a Svelte action rather than inline on one page.
 *
 * Feeds already had its own hand-rolled version of this gesture, grabbing the pointer the
 * instant a touch starts at the top of the scroll. That works there because nothing else on the
 * same element competes for a vertical drag. It does not work here: Discover's own hero swipes
 * horizontally on this exact surface, and a naive "claim it at pointerdown" pull would eat every
 * one of those swipes before `swipe.ts` ever saw the gesture, since a descendant's own pointerdown
 * listener runs before an ancestor's. This instead axis-locks on the first decisive movement,
 * the same rule `swipe.ts` already uses for exactly this kind of conflict: whichever direction
 * the drag actually turns out to be decides which gesture, if any, claims it, so this can sit on
 * the very same element as a horizontal `use:swipe` with neither one starving the other.
 */

export interface PullState {
	pullY: number;
	pulling: boolean;
}

export interface PullToRefreshOptions {
	/** A pull can only start when the surface is already at its own top. */
	atTop: () => boolean;
	onRefresh: () => void | Promise<void>;
	/** Fired on every change, so the caller renders its own spinner from `pullY`/`pulling`. */
	onChange: (state: PullState) => void;
	/** False turns the gesture off, e.g. while an unrelated sheet is open. */
	enabled?: () => boolean;
	threshold?: number;
}

const DEFAULT_THRESHOLD = 64;

export function pullToRefresh(node: HTMLElement, options: PullToRefreshOptions) {
	let current = options;

	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let axisDecided = false;
	let pulling = false;
	let pullY = 0;

	const thresholdOf = () => current.threshold ?? DEFAULT_THRESHOLD;

	function emit() {
		current.onChange({ pullY, pulling });
	}

	function reset() {
		pointerId = null;
		axisDecided = false;
		pulling = false;
		pullY = 0;
	}

	function onPointerDown(event: PointerEvent): void {
		if (current.enabled && !current.enabled()) return;
		if (pointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (!current.atTop()) return;

		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		axisDecided = false;
	}

	function onPointerMove(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;

		if (!axisDecided) {
			if (Math.abs(dx) < gesture.slopPx && Math.abs(dy) < gesture.slopPx) return;
			// Only a clearly downward drag is a pull; anything else, including upward, is not ours.
			if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
				pointerId = null;
				return;
			}
			axisDecided = true;
			pulling = true;
			node.setPointerCapture(event.pointerId);
		}

		event.preventDefault();
		const limit = thresholdOf();
		pullY = dy < limit ? dy : limit + (dy - limit) * 0.3;
		emit();
	}

	async function finish(event: PointerEvent): Promise<void> {
		if (event.pointerId !== pointerId) return;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
		const wasPulling = pulling;
		const shouldRefresh = wasPulling && pullY >= thresholdOf();
		reset();
		emit();
		if (shouldRefresh) await current.onRefresh();
	}

	function onPointerCancel(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
		reset();
		emit();
	}

	node.addEventListener('pointerdown', onPointerDown, { passive: true });
	node.addEventListener('pointermove', onPointerMove, { passive: false });
	node.addEventListener('pointerup', finish);
	node.addEventListener('pointercancel', onPointerCancel);

	return {
		update(next: PullToRefreshOptions) {
			current = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', finish);
			node.removeEventListener('pointercancel', onPointerCancel);
		}
	};
}
