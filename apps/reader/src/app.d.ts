/// <reference types="@yipden/game-contracts/virtual" />
declare global {
	const __APP_VERSION__: string;
	const __BUILD_COMMIT__: string;
	/** Whether this build carries the debugging tools. See vite.config.ts. */
	const __YIPDEN_DEBUG__: boolean;
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
