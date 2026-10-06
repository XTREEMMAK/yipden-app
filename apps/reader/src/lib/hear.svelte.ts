import { player } from './player.svelte.js';
import { toast } from './toast.svelte.js';

/**
 * Hearing a found track before keeping it, in "Found on their page". Its own audio element, apart
 * from the player: no queue, no mini or full player, no media session, nothing left behind once
 * the sheet closes.
 *
 * It used to go through the player as a queue of one (`player.preview`). That left the previewed
 * track as the player's current track, so the full player existed behind the in-app browser and
 * Back onto an old player history entry could slide it up there, part way (2026-10-06).
 *
 * Only one thing plays at a time: a preview pauses the player, and the player starting again
 * stops the preview.
 */
class HearState {
	/** The track being heard, playing or paused; null when there is none. */
	url = $state<string | null>(null);
	playing = $state(false);

	private element: HTMLAudioElement | null = null;

	private get audio(): HTMLAudioElement {
		if (!this.element) {
			const element = new Audio();
			element.preload = 'none';
			element.addEventListener('play', () => (this.playing = true));
			element.addEventListener('pause', () => (this.playing = false));
			element.addEventListener('ended', () => (this.playing = false));
			element.addEventListener('error', () => {
				if (!element.getAttribute('src') || element.error?.code === MediaError.MEDIA_ERR_ABORTED)
					return;
				this.playing = false;
				toast.show('This track would not play here. It may only play on their page.');
			});
			player.onStart(() => this.stop());
			this.element = element;
		}
		return this.element;
	}

	/** Hear `url`, or pause or resume it if it is already the one being heard. */
	toggle(url: string): void {
		const audio = this.audio;
		if (this.url === url && audio.paused) {
			this.start(audio);
			return;
		}
		if (this.url === url) {
			audio.pause();
			return;
		}
		this.url = url;
		audio.src = url;
		this.start(audio);
	}

	/** Silence it and forget it: the sheet closed, or the player started. */
	stop(): void {
		if (!this.element) return;
		this.element.pause();
		this.element.removeAttribute('src');
		this.element.load();
		this.url = null;
		this.playing = false;
	}

	private start(audio: HTMLAudioElement): void {
		if (player.playing) player.pause();
		const result = audio.play();
		if (result && typeof result.catch === 'function') result.catch(() => {});
	}
}

export const hear = new HearState();
