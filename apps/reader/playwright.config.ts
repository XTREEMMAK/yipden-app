import { defineConfig, devices } from '@playwright/test';

/**
 * End to end tests run against the real static build, at the size every screen is designed
 * for. 390x844 is not a convenience: it is the viewport the reference prototype is drawn at,
 * and comparing against it is part of finishing a screen.
 *
 * Nothing here touches the network. Feeds come from fixtures.
 */
// Override when 4173 belongs to something else, or the suite will reuse that server.
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'on-first-retry'
	},
	// Discovery does real, sequential round trips per host it checks (robots.txt, then the
	// page itself), which routinely takes longer than the 5s default even fully mocked.
	expect: { timeout: 10_000 },
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
		// The flag compiles in the made-up partner ring (a bundled fixture, no network) so the tab
		// and its "via" label can be tested. A release build never sets it, and even here a test
		// has to opt in. Reusing a preview server built without it will fail shelf.spec.ts.
		command: `VITE_YIPDEN_PARTNER_FIXTURE=1 pnpm build && pnpm preview --port ${PORT}`,
		port: PORT,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
