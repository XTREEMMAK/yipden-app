import { store } from './store/index.js';

/**
 * Which tab YipDen opens on: Yips (the reader's own yips) or Discover. Stored through the Store.
 *
 * Someone who follows nobody always starts on Discover, since Yips would be empty. A change takes
 * effect the next time the app opens: nothing navigates away mid-session.
 */
export type StartPage = 'yips' | 'discover';

class StartPageState {
	value = $state<StartPage>('yips');

	async load(): Promise<void> {
		await store.init();
		this.value =
			(await store.getSetting<StartPage>('startOn')) === 'discover' ? 'discover' : 'yips';
	}

	async set(value: StartPage): Promise<void> {
		this.value = value;
		await store.setSetting('startOn', value);
	}

	/** Where this launch opens: Discover while following nobody, otherwise the setting. */
	async forLaunch(): Promise<StartPage> {
		await this.load();
		const people = await store.listPeople();
		return people.length ? this.value : 'discover';
	}
}

export const startPage = new StartPageState();
