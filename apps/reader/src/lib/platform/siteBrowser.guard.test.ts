import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the security settings YipDen depends on but does not set itself (docs/security.md,
 * "Creators' sites in the app"). These read the installed plugin and the app manifest, so a plugin
 * upgrade that drops the patch, or a manifest edit that loses the camera removal, fails here
 * rather than shipping quietly.
 */

const require = createRequire(import.meta.url);
const pluginRoot = dirname(require.resolve('@capgo/capacitor-inappbrowser/package.json'));
const webViewDialog = readFileSync(
	join(pluginRoot, 'android/src/main/java/ee/forgr/capacitor_inappbrowser/WebViewDialog.java'),
	'utf8'
);

describe('the in-app browser plugin, as installed', () => {
	it('is the current package, not the deprecated @capgo/inappbrowser', () => {
		const pkg = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8')) as {
			name: string;
			deprecated?: string;
		};
		expect(pkg.name).toBe('@capgo/capacitor-inappbrowser');
		expect(pkg.deprecated).toBeUndefined();
	});

	it('never turns on file or content access for a page (patches/)', () => {
		expect(webViewDialog).toContain('setAllowFileAccess(false)');
		expect(webViewDialog).toContain('setAllowContentAccess(false)');
		expect(webViewDialog).not.toMatch(/setAllowFileAccess\(true\)/);
		expect(webViewDialog).not.toMatch(/setAllowContentAccess\(true\)/);
		expect(webViewDialog).not.toMatch(/setAllowUniversalAccessFromFileURLs\(true\)/);
		expect(webViewDialog).not.toMatch(/setAllowFileAccessFromFileURLs\(true\)/);
	});
});

describe('the app manifest', () => {
	it('removes the camera permission the plugin asks for', () => {
		const manifest = readFileSync(
			join(import.meta.dirname, '../../../android/app/src/main/AndroidManifest.xml'),
			'utf8'
		);
		expect(manifest).toMatch(
			/<uses-permission android:name="android\.permission\.CAMERA" tools:node="remove" \/>/
		);
	});
});

describe('how YipDen opens a site', () => {
	it('always blocks deep links and never ignores a TLS error', () => {
		const source = readFileSync(join(import.meta.dirname, 'siteBrowser.svelte.ts'), 'utf8');
		expect(source).toMatch(/preventDeeplink: true/);
		expect(source).toMatch(/ignoreUntrustedSSLError: false/);
		expect(source).toMatch(/activeNativeNavigationForWebview: true/);
		expect(source).toContain("import('@capgo/capacitor-inappbrowser')");
	});
});
