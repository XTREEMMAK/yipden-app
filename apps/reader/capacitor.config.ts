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
		androidScheme: 'https'
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
