import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { devFetchProxy } from './vite-plugins/dev-fetch-proxy.js';

const packageJson = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

function buildCommit(): string {
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

export default defineConfig({
	plugins: [sveltekit(), devFetchProxy()],
	define: {
		__APP_VERSION__: JSON.stringify(packageJson.version),
		__BUILD_COMMIT__: JSON.stringify(buildCommit())
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
});
