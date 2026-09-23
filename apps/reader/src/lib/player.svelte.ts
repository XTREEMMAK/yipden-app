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
}

export const RATES = [1, 1.25, 1.5, 2] as const;

/** Peaks past this age are worth recomputing: a re-encoded file could change without an ETag. */
const PEAKS_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

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

	/** 'full' is the screen over every tab; 'mini' is the dock; 'hidden' is neither. */
	sheet = $state<'hidden' | 'mini' | 'full'>('hidden');

	current = $derived(this.currentIndex >= 0 ? (this.queue[this.currentIndex] ?? null) : null);
	next = $derived(
		this.queue.length > 1 ? (this.queue[(this.currentIndex + 1) % this.queue.length] ?? null) : null
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
			});
			element.addEventListener('pause', () => {
				this.playing = false;
				this.updateMediaSessionState();
			});
			element.addEventListener('ended', () => this.advance());
			this._audio = element;
			this.wireMediaSession();
		}
		return this._audio;
	}

	/** Replace the queue and start playing at `startIndex`. */
	play(queue: QueueItem[], startIndex: number): void {
		this.queue = queue;
		this.load(startIndex);
	}

	private load(index: number): void {
		const item = this.queue[index];
		if (!item) return;
		this.currentIndex = index;
		this.currentTime = 0;
		this.duration = 0;
		this.pendingSeek = null;

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
	}

	collapse(): void {
		if (this.sheet === 'full') this.sheet = 'mini';
	}

	expand(): void {
		if (this.current) this.sheet = 'full';
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

	private setMediaSessionMetadata(item: QueueItem): void {
		if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
		navigator.mediaSession.metadata = new MediaMetadata({
			title: item.title,
			artist: item.creator,
			artwork: item.artUrl ? [{ src: item.artUrl, sizes: '512x512' }] : []
		});
		this.updateMediaSessionState();
	}

	private updateMediaSessionState(): void {
		if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
		navigator.mediaSession.playbackState = this.playing ? 'playing' : 'paused';
	}

	private wireMediaSession(): void {
		if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
		const session = navigator.mediaSession;
		session.setActionHandler('play', () => this.toggle());
		session.setActionHandler('pause', () => this.toggle());
		session.setActionHandler('seekbackward', () => this.skip(-15));
		session.setActionHandler('seekforward', () => this.skip(30));
		session.setActionHandler('previoustrack', () => this.back());
		session.setActionHandler('nexttrack', () => this.advance());
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
