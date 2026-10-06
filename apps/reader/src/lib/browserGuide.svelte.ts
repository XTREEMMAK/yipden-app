import { store } from './store/index.js';

/**
 * The in-app browser's guide: what can be found and kept on a creator's site, and that YipDen
 * keeps links, never copies (phone feedback, 2026-10-06). Shown once before the first site opens
 * in the app, and whenever the reader asks for it again.
 */
class BrowserGuideState {
	visible = $state(false);
	private closed: (() => void) | null = null;

	show(): Promise<void> {
		this.visible = true;
		return new Promise((resolve) => {
			this.closed = resolve;
		});
	}

	close(): void {
		this.visible = false;
		void store.setSetting('browserGuideSeen', true).catch(() => {});
		this.closed?.();
		this.closed = null;
	}

	/** Before a site opens in the app: the guide the first time, nothing after that. */
	async beforeFirstVisit(): Promise<void> {
		const seen = await store.getSetting<boolean>('browserGuideSeen').catch(() => true);
		if (!seen) await this.show();
	}
}

export const browserGuide = new BrowserGuideState();
