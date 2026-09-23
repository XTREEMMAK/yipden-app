import { defineConfig, devices } from '@playwright/test';

/**
 * End to end tests run against the real static build, at the size every screen is designed
 * for. 390x844 is not a convenience: it is the viewport the reference prototype is drawn at,
 * and comparing against it is part of finishing a screen.
 *
 * Nothing here touches the network. Feeds come from fixtures.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'phone',
			use: {
				...devices['Pixel 7'],
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true
			}
		}
	],
	webServer: {
		command: 'pnpm build && pnpm preview --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
