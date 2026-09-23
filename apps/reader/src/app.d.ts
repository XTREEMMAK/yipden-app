declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}

	interface Document {
		/** Not in lib.dom yet in every target. Used for screen transitions, always guarded. */
		startViewTransition?: (callback: () => Promise<void> | void) => {
			finished: Promise<void>;
			ready: Promise<void>;
			updateCallbackDone: Promise<void>;
		};
	}
}

export {};
