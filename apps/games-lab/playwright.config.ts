import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.GAME_E2E_PORT ?? 4188);
const profile = process.env.YIPDEN_GAMES ?? 'realm';
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: { baseURL: `http://127.0.0.1:${port}`, trace: 'on-first-retry' },
	projects: [
		{ name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
		{ name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }
	],
	webServer: {
		command: `YIPDEN_GAMES=${profile} pnpm build && pnpm preview --host 127.0.0.1 --port ${port}`,
		port,
		reuseExistingServer: false,
		timeout: 120000
	}
});
