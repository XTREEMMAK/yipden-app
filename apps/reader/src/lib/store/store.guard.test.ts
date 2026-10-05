import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../../capacitor.config.js';

/**
 * Guards the settings the encrypted store's promises rest on but that live outside its code
 * (docs/security.md, "Encrypted at rest"), so a config or manifest edit fails here instead of
 * quietly undoing them.
 */

// From the app's root, where vitest runs: jsdom gives `import.meta.url` no file path.
const manifest = readFileSync(
	join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
	'utf8'
);

describe('the encrypted store, around its code', () => {
	it('keeps native logging off, so plugin calls (the key, SQL values) never reach logcat', () => {
		expect(config.loggingBehavior).toBe('none');
		expect(config.android?.loggingBehavior ?? 'none').toBe('none');
	});

	it('has the sqlite plugin encrypting, with no biometric prompt', () => {
		expect(config.plugins?.CapacitorSQLite).toMatchObject({ androidIsEncryption: true });
	});

	it('keeps every backup and transfer of app data off', () => {
		expect(manifest).toContain('android:allowBackup="false"');
		expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
		expect(manifest).toContain('android:fullBackupContent="@xml/full_backup_content"');
	});
});

describe('the Android activity', () => {
	it('holds portrait on phones and, through Android 16’s opt-out, on tablets too', () => {
		expect(manifest).toContain('android:screenOrientation="portrait"');
		expect(manifest).toMatch(
			/android:name="android\.window\.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY"\s+android:value="true"/
		);
	});
});
