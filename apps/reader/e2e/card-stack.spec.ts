import { expect, test, type Page } from '@playwright/test';

/**
 * Feeds' card stack: enough yips to actually scroll, so cards genuinely enter and pin rather
 * than all fitting on screen at once.
 */

const LENA_PAGE = `<!doctype html><html><head>
	<title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head></html>`;

function feedWithPosts(count: number): string {
	const items = Array.from(
		{ length: count },
		(_unused, i) => `<item><title>Post ${i}</title><link>https://lenaofori.com/post-${i}</link>
			<pubDate>Mon, ${21 - Math.floor(i / 4)} Sep 2026 ${10 + (i % 12)}:00:00 GMT</pubDate>
			<description>Body of post ${i}.</description></item>`
	).join('\n');
	return `<?xml version="1.0"?><rss version="2.0"><channel>
		<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Posts.</description>
		${items}
	</channel></rss>`;
}

async function seed(page: Page, count = 12) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://lenaofori.com/', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: LENA_PAGE })
	);
	await page.route('https://lenaofori.com/feed.xml', (route) =>
		route.fulfill({ status: 200, contentType: 'application/rss+xml', body: feedWithPosts(count) })
	);
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: '{"version":"1.0","entries":[]}'
		})
	);

	await page.goto('/follow');
	await page.getByLabel('Website or profile').fill('lenaofori.com');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await page.getByText('Blog', { exact: true }).waitFor({ timeout: 10_000 });
	await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
	await page.getByText('Following Lena Ofori').waitFor();

	await page.goto('/feeds');
	await page
		.locator('#pane-everything')
		.getByRole('button', { name: /Post 0\b/ })
		.waitFor({ timeout: 10_000 });
}

test.describe('The card stack', () => {
	test('is on by default: the pane carries the stack class', async ({ page }) => {
		await seed(page);
		await expect(page.locator('#pane-everything')).toHaveClass(/\bstack\b/);
	});

	test('is off under reduced motion: the pane stays a flat list', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await seed(page);
		await expect(page.locator('#pane-everything')).not.toHaveClass(/\bstack\b/);
	});

	test('a card scrolled past the top is marked behind and stops taking taps', async ({ page }) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		const firstCard = pane.getByRole('button', { name: /Post 0\b/ });

		await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
		// The IntersectionObserver reports asynchronously; give it a moment to settle.
		await expect(firstCard).toHaveClass(/\bbehind\b/, { timeout: 5000 });
	});

	test('the front card still opens on tap after scrolling', async ({ page, context }) => {
		await seed(page);
		const pane = page.locator('#pane-everything');

		await pane.evaluate((el) => el.scrollTo({ top: 300, behavior: 'instant' }));
		await page.waitForTimeout(300);

		const visibleCard = pane.locator('.yip:not(.behind)').last();
		const [popup] = await Promise.all([
			context.waitForEvent('page'),
			visibleCard.click({ timeout: 5000 })
		]);
		await popup.close();
	});

	test('scrolling the whole way through does not error or leave the pane unscrollable', async ({
		page
	}) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		for (let i = 0; i < 5; i += 1) {
			await pane.evaluate((el, step) => el.scrollTo({ top: step, behavior: 'instant' }), i * 200);
			await page.waitForTimeout(100);
		}

		expect(errors).toEqual([]);
	});

	test('a card that scrolls back into view sheds its behind state', async ({ page }) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		const firstCard = pane.getByRole('button', { name: /Post 0\b/ });

		await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
		await expect(firstCard).toHaveClass(/\bbehind\b/, { timeout: 5000 });

		await pane.evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
		await expect(firstCard).not.toHaveClass(/\bbehind\b/, { timeout: 5000 });
	});
});
