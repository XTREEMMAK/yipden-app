import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { devFetchProxy } from './vite-plugins/dev-fetch-proxy.js';

export default defineConfig({
	plugins: [sveltekit(), devFetchProxy()],
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
