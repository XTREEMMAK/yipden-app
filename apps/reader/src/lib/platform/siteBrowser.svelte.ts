import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { safeUrl, type SiteLayout } from '@yipden/ring-client';
import {
	readFound,
	SCAN_SCRIPT,
	type FoundImage,
	type FoundMedia,
	type FoundPassage
} from '../pageMedia.js';
import { openExternal } from './external.js';
import type { RingOrigin } from '../references/types.js';

/**
 * A creator's site, opened inside the app (Android, `@capgo/capacitor-inappbrowser`), with YipDen's own button in the toolbar.
 *
 * It is a separate WebView with its own origin, never the app's: the creator's page has no way
 * into the app beyond posting a message, and every message is treated as untrusted (see
 * `pageMedia.ts`). Our scan reads what audio the page shows or plays; it never downloads it.
 *
 * The toolbar button is the trust anchor: a page can fake a message, but not a tap on native
 * chrome. Tapping it hides the page (still open, still where the reader was) and shows the app's
 * own "Found on their page" sheet, where the reader decides what, if anything, to keep; closing
 * that sheet brings the page back. Back steps through the site's own history first and only closes
 * the page from its first one. Off Android (the web build) and when the reader
 * has turned it off, sites open in the system browser as before.
 */

export interface SiteCreator {
	url: string;
	name: string;
	artUrl?: string | null;
	/** What the ring declared, so the reader's layout choice can say what it overrules. */
	layout?: SiteLayout | undefined;
	/** The ring they were found through, recorded on anything kept from their pages. */
	ring?: RingOrigin | null;
	/** What a long-pressed picture is kept as by default: a comic page, or a game screenshot. */
	imageKind?: 'image' | 'screenshot';
}

export interface SiteSession {
	creator: SiteCreator;
	/** The page the reader was on when they tapped the button. */
	pageUrl: string;
	found: FoundMedia[];
	/** The last picture long-pressed, and the last passage selected, on any of their pages. */
	image: FoundImage | null;
	passage: FoundPassage | null;
	passageTooLong: boolean;
}

class SiteBrowser {
	/** Set while the page is hidden behind the app's "Found on their page" sheet. */
	reviewing = $state<SiteSession | null>(null);

	private session: SiteSession | null = null;
	private handles: PluginListenerHandle[] = [];

	get available(): boolean {
		return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
	}

	/** Opens in the app when it can, in the system browser otherwise. */
	async open(url: string, creator: SiteCreator, inApp: boolean): Promise<void> {
		const target = safeUrl(url);
		if (!target) return;
		if (!inApp || !this.available) {
			openExternal(target.toString());
			return;
		}
		await this.end();
		const { InAppBrowser, ToolBarType } = await import('@capgo/capacitor-inappbrowser');
		this.session = {
			creator,
			pageUrl: target.toString(),
			found: [],
			image: null,
			passage: null,
			passageTooLong: false
		};

		this.handles = await Promise.all([
			InAppBrowser.addListener('browserPageLoaded', () => {
				void InAppBrowser.executeScript({ code: SCAN_SCRIPT });
			}),
			InAppBrowser.addListener('urlChangeEvent', (event) => {
				const next = safeUrl(event.url);
				if (this.session && next) this.session.pageUrl = next.toString();
			}),
			InAppBrowser.addListener('messageFromWebview', (event) => {
				if (!this.session) return;
				const { media, image, passage, passageTooLong } = readFound(event.detail);
				// The latest pick wins; a scan that carries none leaves the last one standing.
				if (image) this.session.image = image;
				if (passage) {
					this.session.passage = passage;
					this.session.passageTooLong = false;
				} else if (passageTooLong) {
					this.session.passageTooLong = true;
				}
				if (!media.length) return;
				const byUrl = new Map(this.session.found.map((item) => [item.url, item]));
				for (const item of media) if (!byUrl.has(item.url)) byUrl.set(item.url, item);
				this.session.found = [...byUrl.values()].slice(0, 50);
			}),
			InAppBrowser.addListener('buttonNearDoneClick', () => {
				void this.finish();
			}),
			InAppBrowser.addListener('closeEvent', () => {
				this.reviewing = null;
				void this.end();
			})
		]);

		await InAppBrowser.openWebView({
			url: target.toString(),
			title: creator.name,
			// Compact: close, the page title, and YipDen's own button (the only type that shows it).
			toolbarType: ToolBarType.COMPACT,
			toolbarColor: '#1F1410',
			toolbarTextColor: '#F3EAE3',
			// No intent:, file: or app links out of a stranger's page.
			preventDeeplink: true,
			// Back goes back a page on the site, and closes it only from the first page.
			activeNativeNavigationForWebview: true,
			ignoreUntrustedSSLError: false,
			// Pinch to zoom: a site laid out for a desktop is unreadable on a phone without it.
			enableZoom: true,
			isInspectable: __YIPDEN_DEBUG__,
			buttonNearDone: {
				ios: { iconType: 'sf-symbol', icon: 'tray.and.arrow.down' },
				android: { iconType: 'vector', icon: 'ic_yipden_found', width: 24, height: 24 }
			}
		});
	}

	/** YipDen's toolbar button: one last scan, then the page steps aside for the app's sheet. */
	private async finish(): Promise<void> {
		const session = this.session;
		if (!session || this.reviewing) return;
		const { InAppBrowser } = await import('@capgo/capacitor-inappbrowser');
		await InAppBrowser.executeScript({ code: SCAN_SCRIPT }).catch(() => {});
		await new Promise((resolve) => setTimeout(resolve, 250));
		await InAppBrowser.hide().catch(() => {});
		this.reviewing = { ...session, found: [...session.found] };
	}

	/** The sheet closed: back to the page, as the reader left it. */
	async resume(): Promise<void> {
		this.reviewing = null;
		if (!this.session) return;
		const { InAppBrowser } = await import('@capgo/capacitor-inappbrowser');
		await InAppBrowser.show().catch(() => {});
	}

	/** Done with this site: close the page for good. */
	async close(): Promise<void> {
		this.reviewing = null;
		if (!this.session) return;
		const { InAppBrowser } = await import('@capgo/capacitor-inappbrowser');
		await InAppBrowser.close().catch(() => {});
		await this.end();
	}

	private async end(): Promise<void> {
		this.session = null;
		const handles = this.handles;
		this.handles = [];
		await Promise.all(handles.map((handle) => handle.remove().catch(() => {})));
	}
}

export const siteBrowser = new SiteBrowser();
