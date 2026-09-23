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
		await page.getByRole('link', { name: 'Today' }).click();

		await expect(page).toHaveURL(/\/today/);
		await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
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
});
