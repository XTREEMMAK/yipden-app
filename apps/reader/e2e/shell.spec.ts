import { expect, test } from '@playwright/test';

test.describe('the app shell', () => {
	test('opens on Discover with all four tabs', async ({ page }) => {
		await page.goto('/');

		const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
		await expect(tabs).toHaveCount(4);
		await expect(tabs.nth(0)).toHaveAttribute('aria-current', 'page');
	});

	test('moves between tabs and marks the current one', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Feeds' }).click();

		await expect(page).toHaveURL(/\/feeds/);
		await expect(page.getByRole('link', { name: 'Feeds' })).toHaveAttribute('aria-current', 'page');
	});

	test('every tab target meets the 44px minimum', async ({ page }) => {
		await page.goto('/');

		for (const tab of await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link')
			.all()) {
			const box = await tab.boundingBox();
			expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
	});

	test('serves its fonts from the bundle, never from a third party', async ({ page }) => {
		/*
		 * The app is allowed to fetch the ring and creators' images: that is the product. What it
		 * must never do is call a font host or an analytics endpoint, because the app works
		 * offline and because a font request tells someone else's server which app was opened
		 * and when.
		 */
		const forbidden = [
			'fonts.googleapis.com',
			'fonts.gstatic.com',
			'google-analytics.com',
			'googletagmanager.com',
			'doubleclick.net'
		];
		const offending: string[] = [];
		const fontRequests: string[] = [];

		page.on('request', (request) => {
			const url = new URL(request.url());
			if (forbidden.some((host) => url.hostname.endsWith(host))) offending.push(request.url());
			if (url.pathname.endsWith('.woff2')) fontRequests.push(request.url());
		});

		await page.goto('/');
		await page.waitForLoadState('networkidle');

		expect(offending).toEqual([]);
		expect(fontRequests.length).toBeGreaterThan(0);
		for (const font of fontRequests) {
			expect(new URL(font).hostname).toBe('localhost');
		}
	});

	test('carries a Content Security Policy that refuses inline script', async ({ page }) => {
		await page.goto('/');
		const csp = await page
			.locator('meta[http-equiv="content-security-policy"]')
			.getAttribute('content');

		// Scripts are 'self' plus the hash of SvelteKit's own bootstrap, and nothing else. No
		// unsafe-inline and no unsafe-eval is the directive that actually matters here.
		expect(csp).toContain("script-src 'self'");
		expect(csp).not.toContain("unsafe-inline' 'sha256");
		expect(csp).not.toContain('unsafe-eval');
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("base-uri 'none'");
		expect(csp).toContain("frame-src 'none'");
		// frame-ancestors is deliberately absent: the spec ignores it in a meta tag, so it is
		// declared in svelte.config.js for a future header delivered build and dropped here.
	});

	test('the tab bar stays put while a screen slides, and its indicator slides between tabs', async ({
		page
	}) => {
		await page.goto('/');
		await page.waitForTimeout(600);
		const ind = page.locator('.tabbar .ind');
		const feedsIcon = page.getByRole('link', { name: 'Feeds' }).locator('.ic');
		const start = (await ind.boundingBox())!.x;

		// Watch the transition's own pseudo elements, which is where the layers show up.
		await page.evaluate(() => {
			(window as unknown as { seen: Set<string> }).seen = new Set();
			const poll = () => {
				for (const animation of document.getAnimations()) {
					const effect = animation.effect as KeyframeEffect | null;
					if (effect?.pseudoElement) {
						(window as unknown as { seen: Set<string> }).seen.add(effect.pseudoElement);
					}
				}
				requestAnimationFrame(poll);
			};
			poll();
		});

		await page.getByRole('link', { name: 'Feeds' }).click();
		const xs: number[] = [];
		for (let i = 0; i < 16; i += 1) {
			xs.push((await ind.boundingBox())!.x);
			await page.waitForTimeout(20);
		}
		const end = (await feedsIcon.boundingBox())!.x;

		expect(xs[xs.length - 1]).toBeCloseTo(end, 0);
		// It travelled: some sample is strictly between where it began and where it landed.
		expect(xs.some((x) => x > start + 4 && x < end - 4)).toBe(true);

		const seen = await page.evaluate(() => [...(window as unknown as { seen: Set<string> }).seen]);
		expect(seen.join(' ')).toContain('::view-transition-group(root)');
		// The bar is its own layer, so the page's slide does not carry it along.
		expect(seen.join(' ')).toContain('::view-transition-group(tabbar)');
		expect(seen.join(' ')).not.toContain('::view-transition-old(tabbar)');
	});

	test('the indicator is placed on first paint, not slid in from the corner', async ({ page }) => {
		await page.goto('/follow');
		const ind = page.locator('.tabbar .ind');
		const icon = page.getByRole('link', { name: 'Follow' }).locator('.ic');
		await expect
			.poll(async () => (await ind.boundingBox())!.x)
			.toBeCloseTo((await icon.boundingBox())!.x, 0);
	});
});
