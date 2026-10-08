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
	noThumbs: 'yipden:diag:noThumbs',
	noCardGlass: 'yipden:diag:noCardGlass',
	eagerCards: 'yipden:diag:eagerCards',
	noLibraryThumbs: 'yipden:diag:noLibraryThumbs',
	noPredecode: 'yipden:diag:noPredecode'
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
	/** Feeds: no glass behind a post that shares a video. */
	noCardGlass = $state(read('noCardGlass'));
	/** Feeds: every card drawn up front, instead of as it nears the screen. */
	eagerCards = $state(read('eagerCards'));
	/** Library: an icon in place of each kept picture. */
	noLibraryThumbs = $state(read('noLibraryThumbs'));
	/** Feeds: do not decode pictures ahead of the screen. */
	noPredecode = $state(read('noPredecode'));

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
	/**
	 * Where the worst frame went, when the WebView says (Chrome's long-animation-frame, frames over
	 * 50ms): running script, style and drawing work, and everything else, which is waiting for the
	 * picture decoder, the GPU and the compositor.
	 */
	split?: { script: number; render: number; other: number };
}

/**
 * Times every animation frame while `pane` is scrolling, and reports once it has been still for
 * a moment. Main-thread frames only, which is where a judder from style, layout, decode or script
 * shows up; it cannot see a compositor-only hitch.
 */
export function frameMeter(pane: HTMLElement | Window, onReport: (report: ScrollReport) => void) {
	let raf = 0;
	let last = 0;
	let quietSince = 0;
	let frames: number[] = [];
	let longest: PerformanceEntry | null = null;
	let observer: PerformanceObserver | null = null;
	try {
		observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (!longest || entry.duration > longest.duration) longest = entry;
			}
		});
		observer.observe({ type: 'long-animation-frame', buffered: false });
	} catch {
		// Not supported by this WebView: the report just has no split.
	}
	const splitOf = (entry: PerformanceEntry | null): ScrollReport['split'] | undefined => {
		const frame = entry as
			(PerformanceEntry & { renderStart?: number; scripts?: Array<{ duration: number }> }) | null;
		if (!frame || !frame.scripts) return undefined;
		const script = frame.scripts.reduce((sum, item) => sum + item.duration, 0);
		const render = frame.renderStart ? frame.startTime + frame.duration - frame.renderStart : 0;
		return {
			script: Math.round(script),
			render: Math.round(render),
			other: Math.max(0, Math.round(frame.duration - script - render))
		};
	};

	const tick = (now: number) => {
		if (last) frames.push(now - last);
		last = now;
		if (now - quietSince > 400) {
			raf = 0;
			last = 0;
			if (frames.length > 5) {
				const split = splitOf(longest);
				onReport({
					...(split ? { split } : {}),
					frames: frames.length,
					slow: frames.filter((frame) => frame > 20).length,
					worst: Math.round(Math.max(...frames)),
					stack:
						'classList' in pane && pane.classList.contains('stack-sda')
							? 'css'
							: 'classList' in pane && pane.classList.contains('stack')
								? 'js'
								: 'off'
				});
			}
			frames = [];
			longest = null;
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
		observer?.disconnect();
		pane.removeEventListener('scroll', onScroll);
		cancelAnimationFrame(raf);
	};
}
