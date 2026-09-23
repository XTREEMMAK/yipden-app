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
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'jsdom'
	}
});
