/**
 * Screenshot the app beside the reference prototype, at the size both are designed for.
 *
 * The brief asks for this after every screen: build it, shoot it at 390x844 in both themes,
 * compare against docs/reference/yipden-prototype.html, and fix the differences before moving
 * on. This is that step, made repeatable.
 *
 *   node scripts/compare-prototype.mjs [route] [--out DIR] [--url BASE]
 *
 * It expects a server already running at --url (default http://localhost:4173).
 *
 * Restart that server after a rebuild. `vite preview` maps the build directory once at
 * startup, so a file written by a later build comes back as a 404 and the page renders blank.
 */

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const at = args.indexOf(`--${name}`);
	return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const route =
	args.find((arg) => !arg.startsWith('--') && !args[args.indexOf(arg) - 1]?.startsWith('--')) ??
	'/';
const baseUrl = flag('url', 'http://localhost:4173');
const outDir = flag('out', '/tmp/yipden-shots');
const prototypePath = fileURLToPath(
	new URL('../../../docs/reference/yipden-prototype.html', import.meta.url)
);

const VIEWPORT = { width: 390, height: 844 };

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

for (const scheme of ['light', 'dark']) {
	const context = await browser.newContext({
		viewport: VIEWPORT,
		deviceScaleFactor: 2,
		colorScheme: scheme,
		isMobile: true,
		hasTouch: true
	});

	const page = await context.newPage();
	await page.goto(`${baseUrl}${route}`);
	// The ring loads over the network and the hero crossfades in; wait for it to settle.
	await page.waitForTimeout(2500);

	const name = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'discover';
	await page.screenshot({ path: `${outDir}/app-${name}-${scheme}.png` });
	console.log(`app-${name}-${scheme}.png`);

	// The prototype renders a phone inside a page, so only the device frame is comparable.
	const reference = await context.newPage();
	await reference.goto(`file://${prototypePath}`);
	await reference.waitForTimeout(600);
	const device = reference.locator('.device');
	if (await device.count()) {
		await device.screenshot({ path: `${outDir}/prototype-${scheme}.png` });
		console.log(`prototype-${scheme}.png`);
	}

	await context.close();
}

await browser.close();
console.log(`\nwrote to ${outDir}`);
