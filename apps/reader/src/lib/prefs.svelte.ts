import { store } from './store/index.js';

/**
 * Reader preferences that are not the theme (which has to be readable before first paint and so
 * lives in localStorage, see theme.svelte.ts). Everything here goes through the `Store`.
 */

class Prefs {
	/** On by default: a ring member's tracks are queued in a shuffled order. See ringPlayer. */
	shuffleMusic = $state(true);

	async hydrate(): Promise<void> {
		await store.init();
		const saved = await store.getSetting<boolean>('shuffleMusic');
		if (typeof saved === 'boolean') this.shuffleMusic = saved;
	}

	setShuffleMusic(on: boolean): void {
		this.shuffleMusic = on;
		void store.setSetting('shuffleMusic', on);
	}
}

export const prefs = new Prefs();
