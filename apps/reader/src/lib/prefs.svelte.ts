import { store } from './store/index.js';
import { DEFAULT_MAX_AGE_DAYS } from './age.js';
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

	async hydrate(): Promise<void> {
		await store.init();
		const saved = await store.getSetting<boolean>('shuffleMusic');
		if (typeof saved === 'boolean') this.shuffleMusic = saved;
		const scroll = await store.getSetting<boolean>('markReadOnScroll');
		if (typeof scroll === 'boolean') this.markReadOnScroll = scroll;
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

	async setMaxAgeDays(days: number): Promise<void> {
		this.maxAgeDays = days;
		await store.setSetting('maxAgeDays', days);
		await pruneToMaxAge();
	}
}

export const prefs = new Prefs();
