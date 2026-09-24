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

	test('the indicator answers on finger down, and takes it back if the finger slides off', async ({
		page
	}) => {
		await page.goto('/');
		await page.waitForTimeout(600);
		const ind = page.locator('.tabbar .ind');
		const start = (await ind.boundingBox())!.x;
		const feeds = (await page.getByRole('link', { name: 'Feeds' }).boundingBox())!;

		await page.mouse.move(feeds.x + feeds.width / 2, feeds.y + feeds.height / 2);
		await page.mouse.down();
		// Nothing has been clicked or navigated yet, and the indicator is already on its way.
		await expect.poll(async () => (await ind.boundingBox())!.x).toBeGreaterThan(start + 20);
		await expect(page).toHaveURL(/\/$/);

		// Sliding off the tab before lifting cancels the click, and the answer with it.
		await page.mouse.move(feeds.x + feeds.width / 2, feeds.y - 200, { steps: 4 });
		await page.mouse.up();
		await expect.poll(async () => (await ind.boundingBox())!.x).toBeCloseTo(start, 0);
		await expect(page).toHaveURL(/\/$/);
	});

	test('a touch tap does not flash the indicator back before navigating', async ({ browser }) => {
		const context = await browser.newContext({
			hasTouch: true,
			viewport: { width: 390, height: 844 }
		});
		const page = await context.newPage();
		await page.goto('/');
		await page.waitForTimeout(600);
		const feeds = page.getByRole('link', { name: 'Feeds' });
		const target = (await feeds.locator('.ic').boundingBox())!.x;
		// Record every position the indicator is ever laid out at, from finger down onwards.
		await page.evaluate(() => {
			const ind = document.querySelector('.tabbar .ind') as HTMLElement;
			const w = window as unknown as { xs: number[] };
			w.xs = [];
			const poll = () => {
				w.xs.push(ind.getBoundingClientRect().x);
				requestAnimationFrame(poll);
			};
			poll();
		});
		await feeds.tap();
		await expect(page).toHaveURL(/\/feeds/);
		await page.waitForTimeout(800);
		const xs = await page.evaluate(() => (window as unknown as { xs: number[] }).xs);
		const start = xs[0]!;
		// The indicator only ever moves toward Feeds: it never goes back below where it began.
		expect(Math.min(...xs)).toBeGreaterThanOrEqual(start - 1);
		expect(xs[xs.length - 1]).toBeCloseTo(target, 0);
		await context.close();
	});

	test('a tab tapped soon after a swipe on Discover still navigates', async ({ browser }) => {
		// Chromium does not always make a click of a tap that follows a swipe closely; the tab bar
		// navigates on the lift itself so it never depends on that click. Real touch, at several gaps.
		const ring = {
			version: '1.0',
			entries: ['a', 'b', 'c'].map((id) => ({
				id,
				creator: `Creator ${id}`,
				type: 'audio',
				source_url: `https://${id}.example.com/`,
				why: 'x'
			}))
		};
		for (const gap of [0, 150, 300]) {
			const context = await browser.newContext({
				hasTouch: true,
				viewport: { width: 390, height: 844 }
			});
			const page = await context.newPage();
			await page.route('https://ring.indienodes.us/ring.json', (route) =>
				route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ring) })
			);
			await page.goto('/');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await page.waitForTimeout(800);

			const box = (await page.locator('.discover').boundingBox())!;
			const cdp = await context.newCDPSession(page);
			const at = (x: number) => [{ x, y: box.y + box.height * 0.4 }];
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: at(box.width * 0.8)
			});
			for (let i = 1; i <= 10; i += 1) {
				await cdp.send('Input.dispatchTouchEvent', {
					type: 'touchMove',
					touchPoints: at(box.width * (0.8 - 0.065 * i))
				});
			}
			await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await page.waitForTimeout(gap);

			await page.getByRole('link', { name: 'Feeds', exact: true }).tap();
			await expect(page, `gap ${gap}ms`).toHaveURL(/\/feeds/);
			await context.close();
		}
	});

	test('one tap on a tab makes exactly one history entry', async ({ page }) => {
		await page.goto('/');
		const before = await page.evaluate(() => history.length);
		await page.getByRole('link', { name: 'Feeds', exact: true }).click();
		await expect(page).toHaveURL(/\/feeds/);
		await page.waitForTimeout(800);
		expect(await page.evaluate(() => history.length)).toBe(before + 1);
	});
});
