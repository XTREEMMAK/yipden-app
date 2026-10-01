import { store } from './store/index.js';
import { DEFAULT_MAX_AGE_DAYS, isAgeLimitActive, setAgeLimitActive } from './age.js';
import { pruneToMaxAge } from './refresh.js';

/**
 * Reader preferences that are not the theme (which has to be readable before first paint and so
 * lives in localStorage, see theme.svelte.ts). Everything here goes through the `Store`.
 */

class Prefs {
	/** On by default: a ring member's tracks are queued in a shuffled order. See ringPlayer. */
	shuffleMusic = $state(true);

	/** Count a feed card as read once it scrolls off the top. Off by default. */
	markReadOnScroll = $state(false);

	/** How many days back a followed person's posts are kept, unless a follow says otherwise. */
	maxAgeDays = $state(DEFAULT_MAX_AGE_DAYS);

	/** A little yip and a buzz when a creator is liked. On by default. */
	sounds = $state(true);

	/** Debug builds only: whether the post age limit is enforced. See age.ts and vite.config.ts. */
	ageLimitEnabled = $state(isAgeLimitActive());

	async hydrate(): Promise<void> {
		await store.init();
		const saved = await store.getSetting<boolean>('shuffleMusic');
		if (typeof saved === 'boolean') this.shuffleMusic = saved;
		const scroll = await store.getSetting<boolean>('markReadOnScroll');
		if (typeof scroll === 'boolean') this.markReadOnScroll = scroll;
		const sounds = await store.getSetting<boolean>('sounds');
		if (typeof sounds === 'boolean') this.sounds = sounds;
		const enforce = await store.getSetting<boolean>('ageLimitEnabled');
		// A release build always enforces it, whatever a debug build once saved on this phone.
		if (__YIPDEN_DEBUG__ && typeof enforce === 'boolean') {
			this.ageLimitEnabled = enforce;
			setAgeLimitActive(enforce);
		}
		const days = await store.getSetting<number>('maxAgeDays');
		if (typeof days === 'number') this.maxAgeDays = days;
	}

	setShuffleMusic(on: boolean): void {
		this.shuffleMusic = on;
		void store.setSetting('shuffleMusic', on);
	}

	setMarkReadOnScroll(on: boolean): void {
		this.markReadOnScroll = on;
		void store.setSetting('markReadOnScroll', on);
	}

	setSounds(on: boolean): void {
		this.sounds = on;
		void store.setSetting('sounds', on);
	}

	/** TEMPORARY: turning it on prunes what is already saved, off keeps everything from now on. */
	async setAgeLimitEnabled(on: boolean): Promise<void> {
		if (!__YIPDEN_DEBUG__) return;
		this.ageLimitEnabled = on;
		setAgeLimitActive(on);
		await store.setSetting('ageLimitEnabled', on);
		if (on) await pruneToMaxAge();
	}

	async setMaxAgeDays(days: number): Promise<void> {
		this.maxAgeDays = days;
		await store.setSetting('maxAgeDays', days);
		await pruneToMaxAge();
	}
}

export const prefs = new Prefs();
