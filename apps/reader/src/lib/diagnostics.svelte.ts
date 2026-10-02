/**
 * Debug-build switches for finding what makes a partner ring's scroll judder on a real phone,
 * where desktop profiling cannot reproduce it: each one turns a single suspect off, and the frame
 * meter says how many frames ran late during the last scroll. Every use is behind
 * `__YIPDEN_DEBUG__`, so a release build reads none of them.
 */

export const DIAG_KEYS = {
	meter: 'yipden:diag:meter',
	noStack: 'yipden:diag:noStack',
	cssStack: 'yipden:diag:cssStack',
	noBackdrop: 'yipden:diag:noBackdrop',
	noThumbs: 'yipden:diag:noThumbs'
} as const;

export type DiagKey = keyof typeof DIAG_KEYS;

function read(key: DiagKey): boolean {
	try {
		return localStorage.getItem(DIAG_KEYS[key]) === '1';
	} catch {
		return false;
	}
}

class Diagnostics {
	meter = $state(read('meter'));
	noStack = $state(read('noStack'));
	/** Fold the stack with scroll-driven CSS instead of from JavaScript each frame. */
	cssStack = $state(read('cssStack'));
	noBackdrop = $state(read('noBackdrop'));
	noThumbs = $state(read('noThumbs'));

	set(key: DiagKey, on: boolean): void {
		this[key] = on;
		try {
			if (on) localStorage.setItem(DIAG_KEYS[key], '1');
			else localStorage.removeItem(DIAG_KEYS[key]);
		} catch {
			// No storage: the switch still holds for this session.
		}
	}
}

/** Null in a release build, so the bundler drops the class, its keys and everything reading them. */
export const diagnostics: Diagnostics | null = __YIPDEN_DEBUG__ ? new Diagnostics() : null;

export interface ScrollReport {
	frames: number;
	/** Frames that took more than 20ms, roughly one missed refresh or worse at 60Hz. */
	slow: number;
	worst: number;
	/** Which card stack the pane is running: scroll-driven CSS, or the per-frame JS fallback. */
	stack: 'css' | 'js' | 'off';
}

/**
 * Times every animation frame while `pane` is scrolling, and reports once it has been still for
 * a moment. Main-thread frames only, which is where a judder from style, layout, decode or script
 * shows up; it cannot see a compositor-only hitch.
 */
export function frameMeter(pane: HTMLElement, onReport: (report: ScrollReport) => void) {
	let raf = 0;
	let last = 0;
	let quietSince = 0;
	let frames: number[] = [];

	const tick = (now: number) => {
		if (last) frames.push(now - last);
		last = now;
		if (now - quietSince > 400) {
			raf = 0;
			last = 0;
			if (frames.length > 5) {
				onReport({
					frames: frames.length,
					slow: frames.filter((frame) => frame > 20).length,
					worst: Math.round(Math.max(...frames)),
					stack: pane.classList.contains('stack-sda')
						? 'css'
						: pane.classList.contains('stack')
							? 'js'
							: 'off'
				});
			}
			frames = [];
			return;
		}
		raf = requestAnimationFrame(tick);
	};

	const onScroll = () => {
		quietSince = performance.now();
		if (!raf) raf = requestAnimationFrame(tick);
	};
	pane.addEventListener('scroll', onScroll, { passive: true });

	return () => {
		pane.removeEventListener('scroll', onScroll);
		cancelAnimationFrame(raf);
	};
}
