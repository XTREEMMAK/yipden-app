import { flushSync } from 'svelte';
import { MediaSession, type MediaSessionAction } from '@capgo/capacitor-media-session';
import { prefersReducedMotion } from './motion.js';
import { store, type PeaksRecord } from './store/index.js';

/**
 * The player: one shared `HTMLAudioElement` for the whole app, a queue, and the state every
 * screen that shows playback reads from.
 *
 * Playback runs on this element alone. `wavesurfer.js` is handed it through its `media` option
 * elsewhere and only ever draws; it never gets to own play, pause or the current time. That
 * split is what keeps a decoding failure from ever becoming a playback failure, and it is why
 * this file has no dependency on wavesurfer at all.
 */

export interface QueueItem {
	/** Stable across the queue: a yip's own key, or a ring track's media URL. */
	id: string;
	title: string;
	creator: string;
	url: string;
	/** Where playback opens the creator's page, distinct from the media file itself. */
	siteUrl: string;
	artUrl: string | null;
	mediaUrl: string;
	/**
	 * Groups items from the same source, such as one ring member's tracks. Optional: most
	 * queues (a followed feed's yips) have no natural grouping and leave it unset. Used for
	 * `removeBatch` and for a continuous-play session to tell whose tracks just finished.
	 */
	batchKey?: string;
}

export const RATES = [1, 1.25, 1.5, 2] as const;

/** Peaks past this age are worth recomputing: a re-encoded file could change without an ETag. */
const PEAKS_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The full screen player's own elements, matched to the view-transition-name each one carries
 * during the card-to-player morph. `yip-art` and `yip-title` are shared with the tapped card, so
 * the browser morphs one into the other; the rest are unique to the player, so they simply fade
 * or rise in on their own.
 */
const PLAYER_MORPH_TARGETS: readonly [selector: string, name: string][] = [
	['.pl-art', 'yip-art'],
	['.pl-title', 'yip-title'],
	['.pl-shade', 'pl-shade'],
	['.pl-top', 'pl-top'],
	['.pl-body', 'pl-body']
];

/**
 * Some environments return `undefined` from `HTMLMediaElement.play()` instead of a rejectable
 * promise: jsdom in tests, and some older WebViews on real devices. Guard rather than assume,
 * since a bare `.catch()` on a non-promise throws a TypeError that would otherwise surface as
 * an unrelated crash the moment autoplay is refused.
 */
function safePlay(audio: HTMLAudioElement): void {
	const result = audio.play();
	if (result && typeof result.catch === 'function') {
		result.catch(() => {
			// Autoplay refused by the platform. The reader presses play themselves.
		});
	}
}

class PlayerState {
	/**
	 * Created lazily, once, in the browser. Never recreated: every screen that ever plays
	 * anything reaches for this same element.
	 */
	private _audio: HTMLAudioElement | null = null;
	/** A seek requested before the browser knows the track's real duration, applied once it does. */
	private pendingSeek: number | null = null;

	queue = $state<QueueItem[]>([]);
	currentIndex = $state(-1);
	playing = $state(false);
	currentTime = $state(0);
	duration = $state(0);
	rate = $state<(typeof RATES)[number]>(1);
	/**
	 * Whether reaching the end of the queue wraps back to the start (every queue built from
	 * `play()`'s default) or stops (a continuous-play session, so it can prompt instead of
	 * silently restarting). See `ended`.
	 */
	loop = $state(true);
	/** True once playback has run off the end of a non-looping queue. Reset by anything that
	 *  starts, extends or replaces the queue. */
	ended = $state(false);

	/** 'full' is the screen over every tab; 'mini' is the dock; 'hidden' is neither. */
	sheet = $state<'hidden' | 'mini' | 'full'>('hidden');

	current = $derived(this.currentIndex >= 0 ? (this.queue[this.currentIndex] ?? null) : null);
	/** `null` past the last track of a non-looping queue, matching what `advance()` will actually
	 *  do: nothing here promises a wrap the queue itself has stopped offering. */
	next = $derived(
		this.queue.length > 1 && (this.loop || this.currentIndex < this.queue.length - 1)
			? (this.queue[(this.currentIndex + 1) % this.queue.length] ?? null)
			: null
	);

	get audio(): HTMLAudioElement {
		if (!this._audio) {
			const element = new Audio();
			// Track media hosted on a member's own site; playing it spends their bandwidth.
			element.preload = 'none';
			element.addEventListener('timeupdate', () => {
				this.currentTime = element.currentTime;
			});
			element.addEventListener('durationchange', () => {
				if (Number.isFinite(element.duration)) this.duration = element.duration;
				this.updateMediaSessionPosition();
			});
			element.addEventListener('loadedmetadata', () => {
				if (this.pendingSeek === null) return;
				const pending = this.pendingSeek;
				this.pendingSeek = null;
				this.seek(pending);
			});
			element.addEventListener('play', () => {
				this.playing = true;
				this.updateMediaSessionState();
				this.updateMediaSessionPosition();
			});
			element.addEventListener('pause', () => {
				this.playing = false;
				this.updateMediaSessionState();
				this.updateMediaSessionPosition();
			});
			element.addEventListener('ended', () => this.advance());
			this._audio = element;
			this.wireMediaSession();
		}
		return this._audio;
	}

	/**
	 * Replace the queue and start playing at `startIndex`.
	 *
	 * `fromEl` is the card or row that was tapped, if any. When the player is not already open,
	 * the browser supports view transitions and the reader has not asked for reduced motion,
	 * its `.art` and `.ttl` morph into the full screen player rather than the sheet simply
	 * sliding up over them.
	 *
	 * `loop` defaults to `true`, unchanged from every existing caller's own expectations
	 * (reaching the end of the queue wraps back to the start, exercised by `advance()`'s own
	 * tests). A continuous-play session passes `false`, so it can stop and prompt instead.
	 */
	play(
		queue: QueueItem[],
		startIndex: number,
		fromEl?: HTMLElement,
		opts?: { loop?: boolean }
	): void {
		this.loop = opts?.loop ?? true;
		this.ended = false;
		const opening = this.sheet !== 'full';
		if (opening && fromEl && !prefersReducedMotion() && typeof document !== 'undefined') {
			this.morphOpen(queue, startIndex, fromEl);
			return;
		}
		this.queue = queue;
		this.load(startIndex);
	}

	/**
	 * Appends items to the end of the queue without disturbing playback, unlike `play()`, which
	 * always replaces it. Used to grow a continuous-play session one member at a time, whether
	 * from an explicit "+Queue" tap or from accepting the "keep going?" suggestion. Starts
	 * playback when nothing was playing, or when the queue had already run off its end (that
	 * is what accepting the suggestion means); otherwise the reader keeps hearing what they
	 * were hearing, and the new items simply wait their turn.
	 */
	addToQueue(items: QueueItem[]): void {
		if (!items.length) return;
		const shouldStart = this.currentIndex < 0 || this.ended;
		const firstNew = this.queue.length;
		this.queue = [...this.queue, ...items];
		this.ended = false;
		if (shouldStart) this.load(firstNew);
	}

	/**
	 * Moves one queue item, keeping the playhead pointed at the same logical track rather than
	 * whatever now sits at its old numeric position.
	 */
	move(from: number, to: number): void {
		if (from === to || from < 0 || from >= this.queue.length) return;
		const target = Math.max(0, Math.min(this.queue.length - 1, to));
		const playingId = this.current?.id;
		const next = [...this.queue];
		const [item] = next.splice(from, 1);
		if (!item) return;
		next.splice(target, 0, item);
		this.queue = next;
		if (playingId !== undefined) {
			const at = next.findIndex((entry) => entry.id === playingId);
			if (at >= 0) this.currentIndex = at;
		}
	}

	/**
	 * Removes one item. Removing anything before the playhead shifts it to match; removing the
	 * playing item itself jumps to whatever now sits in its place, or stops if that was the end.
	 */
	removeAt(at: number): void {
		if (at < 0 || at >= this.queue.length) return;
		const wasCurrent = at === this.currentIndex;
		this.queue = this.queue.filter((_, index) => index !== at);

		if (!this.queue.length) {
			this.currentIndex = -1;
			this.audio.pause();
			return;
		}
		if (at < this.currentIndex) {
			this.currentIndex -= 1;
		} else if (wasCurrent) {
			if (this.currentIndex >= this.queue.length) {
				this.currentIndex = this.queue.length - 1;
				this.audio.pause();
				this.ended = true;
			} else {
				this.load(this.currentIndex);
			}
		}
	}

	/** Removes every item sharing a `batchKey` in one step, such as a whole member's tracks. */
	removeBatch(batchKey: string): void {
		for (let at = this.queue.length - 1; at >= 0; at -= 1) {
			if (this.queue[at]?.batchKey === batchKey) this.removeAt(at);
		}
	}

	/** Jumps straight to a position in the queue: the queue panel's own "playlist select." */
	jumpTo(index: number): void {
		if (index < 0 || index >= this.queue.length || index === this.currentIndex) return;
		this.load(index);
	}

	/**
	 * Restores a queue saved from a previous session without starting playback: the mini player
	 * appears with the right track loaded and ready, paused until the reader presses play
	 * themselves, the same as autoplay would be refused on a cold launch anyway.
	 */
	hydrate(queue: QueueItem[], currentIndex: number, opts?: { loop?: boolean }): void {
		if (typeof window === 'undefined') return;
		if (!queue.length || currentIndex < 0 || currentIndex >= queue.length) return;
		const item = queue[currentIndex]!;

		this.queue = queue;
		this.currentIndex = currentIndex;
		this.loop = opts?.loop ?? true;
		this.ended = false;
		this.currentTime = 0;
		this.duration = 0;

		const audio = this.audio;
		if (audio.src !== item.mediaUrl) audio.src = item.mediaUrl;
		audio.playbackRate = this.rate;
		this.sheet = 'mini';
		this.setMediaSessionMetadata(item);
	}

	/**
	 * The shared element morph: the tapped card's art and title carry a `view-transition-name`
	 * into the transition's "before" snapshot, the state change is flushed synchronously so the
	 * player exists in its "after" snapshot, and the player's own art and title pick up those
	 * same two names so the browser interpolates position and size between them. The gradient,
	 * header and body get their own names purely so they fade and rise in on a delay, defined in
	 * app.css, rather than popping in the instant the art lands.
	 *
	 * Falls back to a plain open, no different from `play()` without a source element, wherever
	 * the browser lacks `startViewTransition` or the card has no `.art` to morph from.
	 */
	private morphOpen(queue: QueueItem[], startIndex: number, fromEl: HTMLElement): void {
		if (!document.startViewTransition) {
			this.queue = queue;
			this.load(startIndex);
			return;
		}

		const artEl = fromEl.querySelector<HTMLElement>('.art');
		const ttlEl = fromEl.querySelector<HTMLElement>('.ttl');
		if (!artEl) {
			this.queue = queue;
			this.load(startIndex);
			return;
		}

		artEl.style.viewTransitionName = 'yip-art';
		if (ttlEl) ttlEl.style.viewTransitionName = 'yip-title';

		const morphed: HTMLElement[] = [];
		const transition = document.startViewTransition(() => {
			artEl.style.viewTransitionName = '';
			if (ttlEl) ttlEl.style.viewTransitionName = '';

			flushSync(() => {
				this.queue = queue;
				this.load(startIndex);
			});

			const section = document.querySelector<HTMLElement>('.player');
			for (const [selector, name] of PLAYER_MORPH_TARGETS) {
				const el = section?.querySelector<HTMLElement>(selector);
				if (!el) continue;
				el.style.viewTransitionName = name;
				morphed.push(el);
			}
		});

		transition.finished
			.finally(() => {
				for (const el of morphed) el.style.viewTransitionName = '';
			})
			.catch(() => {
				// A skipped or interrupted transition. The names are still cleared above.
			});
	}

	private load(index: number): void {
		const item = this.queue[index];
		if (!item) return;
		this.currentIndex = index;
		this.currentTime = 0;
		this.duration = 0;
		this.pendingSeek = null;
		this.ended = false;

		const audio = this.audio;
		if (audio.src !== item.mediaUrl) audio.src = item.mediaUrl;
		audio.playbackRate = this.rate;
		safePlay(audio);

		this.sheet = 'full';
		this.setMediaSessionMetadata(item);
	}

	toggle(): void {
		if (this.playing) this.audio.pause();
		else safePlay(this.audio);
	}

	/**
	 * Move to a position in the track.
	 *
	 * `preload="none"` combined with a seek requested in the first instant after pressing play
	 * means the browser can still be at HAVE_NOTHING, with no real duration to clamp against
	 * yet. Rather than guess with an Infinity fallback, an early seek is held and applied the
	 * moment `loadedmetadata` reports a real duration to clamp against.
	 */
	seek(seconds: number): void {
		if (!this.current) return;
		const audio = this.audio;
		if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
			this.pendingSeek = seconds;
			return;
		}

		audio.currentTime = Math.max(0, Math.min(this.seekableEnd(), seconds));
		this.currentTime = audio.currentTime;
		this.updateMediaSessionPosition();
	}

	/**
	 * The latest position it is safe to seek to.
	 *
	 * Seeking to exactly `duration` is a known cross-browser edge case: some media engines
	 * silently reject it and reset the position to 0 rather than landing at the end, since a
	 * seek target equal to duration sits right on the boundary of "past the end." A hair short
	 * of it always lands cleanly, and reaching it during ordinary playback still ends the track
	 * and advances the queue exactly as it should.
	 */
	private seekableEnd(): number {
		return Math.max(0, this.duration - 0.25);
	}

	skip(deltaSeconds: number): void {
		this.seek((this.pendingSeek ?? this.currentTime) + deltaSeconds);
	}

	advance(): void {
		if (!this.loop && this.currentIndex >= this.queue.length - 1) {
			this.audio.pause();
			this.ended = true;
			return;
		}
		if (this.queue.length < 2) {
			this.audio.pause();
			return;
		}
		this.load((this.currentIndex + 1) % this.queue.length);
	}

	back(): void {
		if (this.queue.length < 2) return;
		this.load((this.currentIndex - 1 + this.queue.length) % this.queue.length);
	}

	cycleRate(): void {
		const at = RATES.indexOf(this.rate);
		this.rate = RATES[(at + 1) % RATES.length]!;
		this.audio.playbackRate = this.rate;
		this.updateMediaSessionPosition();
	}

	collapse(): void {
		if (this.sheet === 'full') this.sheet = 'mini';
	}

	expand(): void {
		if (this.current) this.sheet = 'full';
	}

	/** Stops playback outright and dismisses the mini player, unlike `collapse`, which keeps it. */
	stop(): void {
		this.audio.pause();
		this.sheet = 'hidden';
		void MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
	}

	/**
	 * The cached peaks for a track, keyed by its media URL and, when the server sent one, its
	 * ETag. Two different recordings landing at the same URL with no ETag to tell them apart is
	 * rare enough that the URL alone is an acceptable key in that case.
	 */
	async readPeaks(mediaUrl: string, etag?: string): Promise<PeaksRecord | null> {
		const record = await store.readPeaks(peaksKey(mediaUrl, etag));
		if (!record) return null;
		if (Date.now() - new Date(record.cachedAt).getTime() > PEAKS_MAX_AGE_MS) return null;
		return record;
	}

	async writePeaks(
		mediaUrl: string,
		peaks: number[],
		duration: number,
		etag?: string
	): Promise<void> {
		await store.writePeaks({
			key: peaksKey(mediaUrl, etag),
			peaks,
			duration,
			cachedAt: new Date().toISOString()
		});
	}

	// ---------- Media Session: lock screen and notification controls ----------

	/**
	 * `@capgo/capacitor-media-session` rather than `navigator.mediaSession` directly: the
	 * Android WebView never surfaces the Web Media Session API to the system lock screen or
	 * notification shade the way Chrome does, so without it there is nothing here for the OS
	 * to show at all, plugin or not. On the web and on iOS the plugin's own fallback wraps the
	 * same `navigator.mediaSession` this used to call directly, so this is one call site for
	 * every platform rather than two.
	 *
	 * Every call is fire-and-forget: a platform with no media session support (an older
	 * WebView, a browser without the API) rejects the promise, and playback itself must never
	 * depend on that succeeding.
	 */
	private setMediaSessionMetadata(item: QueueItem): void {
		void MediaSession.setMetadata({
			title: item.title,
			artist: item.creator,
			artwork: item.artUrl ? [{ src: item.artUrl, sizes: '512x512' }] : []
		}).catch(() => {});
		this.updateMediaSessionState();
		this.updateMediaSessionPosition();
	}

	private updateMediaSessionState(): void {
		void MediaSession.setPlaybackState({
			playbackState: this.playing ? 'playing' : 'paused'
		}).catch(() => {});
	}

	/** The lock screen's own scrubber, kept in step with seeks and rate changes, not every frame. */
	private updateMediaSessionPosition(): void {
		void MediaSession.setPositionState({
			duration: this.duration,
			position: this.currentTime,
			playbackRate: this.rate
		}).catch(() => {});
	}

	private wireMediaSession(): void {
		const bind = (action: MediaSessionAction, handler: () => void) => {
			void MediaSession.setActionHandler({ action }, handler).catch(() => {});
		};
		bind('play', () => this.toggle());
		bind('pause', () => this.toggle());
		bind('seekbackward', () => this.skip(-15));
		bind('seekforward', () => this.skip(30));
		bind('previoustrack', () => this.back());
		bind('nexttrack', () => this.advance());
		bind('stop', () => this.stop());
	}
}

function peaksKey(mediaUrl: string, etag?: string): string {
	return etag ? `${mediaUrl}::${etag}` : mediaUrl;
}

export const player = new PlayerState();

/** mm:ss, always, for the player's own time readouts. */
export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, '0')}`;
}
