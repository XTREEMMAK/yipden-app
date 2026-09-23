import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native host.
 *
 * `appId` is a release level decision: changing it after publishing creates a different app,
 * with a different identity, that cannot update the one people installed. It is com.yipden.app
 * and it does not change.
 */
const config: CapacitorConfig = {
	appId: 'com.yipden.app',
	appName: 'YipDen',
	webDir: 'build',
	backgroundColor: '#120B08',
	android: {
		// No plain http, ever, including in development against real feeds.
		allowMixedContent: false,
		// Release builds are not inspectable. Debug builds are, which is the point of them.
		webContentsDebuggingEnabled: false
	},
	server: {
		// The WebView's own origin. https rather than a custom scheme so storage, service
		// workers and fetch all behave the way they do in a browser.
		androidScheme: 'https',
		/*
		 * Live reload, opt in only: with CAP_LIVE_RELOAD_URL set, the installed app loads the
		 * dev server directly instead of the bundled build, so a screen or style change reaches
		 * the device the moment Vite rebuilds it, with no further `cap sync` or reinstall.
		 * Never set for `android:apk`/`android:install`, which is what every real build and
		 * every device testing round before this one used, and is what a release build must
		 * keep using: this is exclusively for the "run instead of build every time" loop
		 * documented in docs/android-testing.md.
		 */
		...(process.env.CAP_LIVE_RELOAD_URL
			? { url: process.env.CAP_LIVE_RELOAD_URL, cleartext: true }
			: {})
	},
	plugins: {
		/*
		 * Route fetch and XMLHttpRequest through the native HTTP client.
		 *
		 * This is what makes the product possible on Android: a native request is not subject
		 * to CORS, so the app can read feeds from sites that never thought about a reader. It
		 * is part of Capacitor core, not an extra native dependency.
		 *
		 * It also means the safety checks in packages/feeds are the only thing standing between
		 * a feed and the device's network position, since the browser is no longer helping.
		 */
		CapacitorHttp: {
			enabled: true
		}
	}
};

export default config;
