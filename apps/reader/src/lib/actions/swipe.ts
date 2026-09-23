import { gesture } from '../motion.js';

/**
 * The one swipe implementation in the app, built on Pointer Events with no library.
 *
 * Three rules it exists to enforce, from the brief:
 *
 * 1. Content follows the finger one to one during a drag. Not eased, not damped: the thing
 *    under the finger is under the finger.
 * 2. A release commits if it passed 30% of the axis or was a fast flick, and settles on the
 *    shared easing either way.
 * 3. A swipe is interruptible. A new touch during the settle takes over rather than queueing
 *    behind it, which is the difference between a gesture and an animation.
 *
 * Every swipe in the app also has a visible button equivalent. Swiping is a shortcut, never
 * the only way to do something.
 */

export interface SwipeResult {
	/** Whether the drag went far enough or fast enough to count. */
	commit: boolean;
	/** -1 for a drag towards the start of the axis, 1 towards the end, 0 for neither. */
	direction: -1 | 0 | 1;
	delta: number;
	/** Pixels per millisecond at release. */
	velocity: number;
}

export interface SwipeOptions {
	axis?: 'x' | 'y';
	/** Only these directions commit. Used by the player, which collapses down but not up. */
	allow?: Array<-1 | 1>;
	onStart?: () => void;
	onMove?: (delta: number, fraction: number) => void;
	onEnd?: (result: SwipeResult) => void;
	/** False turns the gesture off without the caller having to remove the action. */
	enabled?: () => boolean;
	/**
	 * A selector for descendants that own their own gestures, such as a chip row that scrolls
	 * sideways. A drag starting inside one of these is theirs, not ours.
	 */
	exclude?: string;
	/** The axis length a drag is measured against. Defaults to the element's own size. */
	size?: () => number;
}

export function swipe(node: HTMLElement, options: SwipeOptions = {}) {
	let current = options;

	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	/** The previous sample, so release velocity is a flick rather than a gesture average. */
	let prevPosition = 0;
	let prevTime = 0;
	let lastPosition = 0;
	let lastTime = 0;
	let axisLocked = false;
	let dragging = false;

	const axisOf = () => current.axis ?? 'x';
	const sizeOf = () =>
		current.size?.() ?? (axisOf() === 'x' ? node.clientWidth : node.clientHeight) ?? 1;

	function positionOf(event: PointerEvent): number {
		return axisOf() === 'x' ? event.clientX : event.clientY;
	}

	function onPointerDown(event: PointerEvent): void {
		if (current.enabled && !current.enabled()) return;
		if (pointerId !== null) return;
		// Mouse right and middle buttons are not gestures.
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (current.exclude && (event.target as Element | null)?.closest(current.exclude)) return;

		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		lastPosition = positionOf(event);
		prevPosition = lastPosition;
		lastTime = event.timeStamp;
		prevTime = event.timeStamp;
		axisLocked = false;
		dragging = false;
	}

	function onPointerMove(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;

		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		const along = axisOf() === 'x' ? dx : dy;
		const across = axisOf() === 'x' ? dy : dx;

		if (!axisLocked) {
			// Below the slop this is still a tap, so buttons inside the area keep working.
			if (Math.abs(dx) < gesture.slopPx && Math.abs(dy) < gesture.slopPx) return;
			// The first decisive movement decides whether this gesture is ours at all. A drag
			// that started across our axis belongs to whatever scrolls that way.
			if (Math.abs(across) > Math.abs(along)) {
				pointerId = null;
				return;
			}
			axisLocked = true;
			dragging = true;
			node.setPointerCapture(event.pointerId);
			current.onStart?.();
		}

		prevPosition = lastPosition;
		prevTime = lastTime;
		lastPosition = positionOf(event);
		lastTime = event.timeStamp;
		// The browser must not also scroll or select while the finger is ours.
		event.preventDefault();
		current.onMove?.(along, along / Math.max(1, sizeOf()));
	}

	function finish(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		pointerId = null;

		if (!dragging) return;
		dragging = false;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);

		const end = positionOf(event);
		const delta = end - (axisOf() === 'x' ? startX : startY);

		/*
		 * Velocity from the last sample rather than the whole gesture. Averaging over the
		 * gesture misses the case this threshold exists for: a slow drag that ends in a flick,
		 * which reads as a deliberate throw and should commit however short it was.
		 */
		const recentTime = Math.max(1, (event.timeStamp || lastTime) - prevTime);
		const velocity = Math.abs(end - prevPosition) / recentTime;
		const fraction = Math.abs(delta) / Math.max(1, sizeOf());
		const direction: -1 | 0 | 1 = delta === 0 ? 0 : delta > 0 ? 1 : -1;

		const allowed = !current.allow || (direction !== 0 && current.allow.includes(direction));
		const far = fraction >= gesture.commitFraction;
		const fast = velocity >= gesture.flickVelocity && fraction > 0.05;

		current.onEnd?.({ commit: allowed && (far || fast), direction, delta, velocity });
	}

	function onPointerCancel(event: PointerEvent): void {
		if (event.pointerId !== pointerId) return;
		pointerId = null;
		if (!dragging) return;
		dragging = false;
		current.onEnd?.({ commit: false, direction: 0, delta: 0, velocity: 0 });
	}

	node.addEventListener('pointerdown', onPointerDown, { passive: true });
	node.addEventListener('pointermove', onPointerMove, { passive: false });
	node.addEventListener('pointerup', finish);
	node.addEventListener('pointercancel', onPointerCancel);

	return {
		update(next: SwipeOptions) {
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
