import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { gameBuild } from '@yipden/game-contracts/vite';
import { devFetchProxy } from './vite-plugins/dev-fetch-proxy.js';

const packageJson = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

function buildCommit(): string {
	// A debug APK also carries its own build number (scripts/stamp-apk.mjs), since several are
	// made from one commit and the phone has no other way to say which one is installed.
	const debugBuild = process.env.YIPDEN_DEBUG_BUILD;
	return debugBuild ? `${commit()} · debug build ${debugBuild}` : commit();
}

function commit(): string {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
	try {
		return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
			cwd: new URL('../..', import.meta.url),
			encoding: 'utf8'
		}).trim();
	} catch {
		return 'development';
	}
}

/**
 * Whether this build carries the debugging tools: the age limit switch and the scroll
 * diagnostics in Settings (and the age limit starting off).
 *
 * On for the dev server (live reload included), for Vitest, and for any build made with
 * `VITE_YIPDEN_DEBUG=1`, which `android:apk`/`android:install` and the end to end suite set. Off for
 * a plain `pnpm build`, which is what a release is made from. It is a `define`, replaced by a
 * literal at every use, so in a release every branch behind it is dead code that the bundler
 * removes: the tools are absent from the build, not just hidden.
 */
function debugTools(command: string): boolean {
	return (
		command === 'serve' || Boolean(process.env.VITEST) || process.env.VITE_YIPDEN_DEBUG === '1'
	);
}

export default defineConfig(({ command }) => ({
	plugins: [gameBuild({ surface: 'reader', fallback: 'thin' }), sveltekit(), devFetchProxy()],
	define: {
		__APP_VERSION__: JSON.stringify(packageJson.version),
		__BUILD_COMMIT__: JSON.stringify(buildCommit()),
		__YIPDEN_DEBUG__: JSON.stringify(debugTools(command))
	},
	server: {
		// The viewport every screen is designed and compared against.
		port: 5173,
		strictPort: false
	},
	// Without this, Vitest resolves `svelte` through its server export condition, which is meant
	// for SSR and silently no-ops client-only APIs such as `flushSync`. The reader is a client
	// app; its tests should run against the same client build the browser gets.
	...(process.env.VITEST ? { resolve: { conditions: ['browser'] } } : {}),
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'jsdom',
		setupFiles: ['./src/test-setup.ts']
	}
}));
