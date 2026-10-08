import { expect, test, type Page } from '@playwright/test';

/**
 * Following a site by its feed and reading it as a digest in Feeds, through the real pipeline:
 * Follow's Sites side finds the feed on the page, the follow checks it at once, and its posts
 * arrive under Sites, apart from the people's panes. Dates are made at run time so the age limit
 * never empties the digest as this recording ages.
 */

const SITE = 'https://medjed.example';
const PAGE = `<!doctype html><html><head><title>Medjed Notes</title>
	<link rel="alternate" type="application/rss+xml" title="Notes" href="/feed.xml">
</head><body></body></html>`;

function feed(): string {
	const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toUTCString();
	return `<?xml version="1.0"?><rss version="2.0"><channel>
		<title>Medjed Notes</title><link>${SITE}/</link><description>Notes.</description>
		<item><title>Shrine redesign</title><link>${SITE}/shrine</link>
			<pubDate>${hoursAgo(2)}</pubDate><description>Rebuilt the shrine from scratch.</description></item>
		<item><title>Guestbook cleanup</title><link>${SITE}/guestbook</link>
			<pubDate>${hoursAgo(30)}</pubDate><description>Removed the spam.</description></item>
	</channel></rss>`;
}

async function routes(page: Page) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: '{"version":"1.0","entries":[]}'
		})
	);
	await page.route(`${SITE}/`, (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: PAGE })
	);
	await page.route(`${SITE}/feed.xml`, (route) =>
		route.fulfill({ status: 200, contentType: 'application/rss+xml', body: feed() })
	);
	await page.addInitScript(() => {
		(window as unknown as { opened: string[] }).opened = [];
		window.open = (url) => {
			(window as unknown as { opened: string[] }).opened.push(String(url));
			return null;
		};
	});
}

async function followMedjed(page: Page) {
	await page.goto('/follow');
	await page.getByLabel('Creator, website, or profile').fill('medjed.example');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await expect(page.getByText('Blog', { exact: true })).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: 'Just follow its posts as a site' }).click();
	await expect(page.getByText(/^Following /)).toBeVisible();
}

test.describe('following sites', () => {
	test.setTimeout(60_000);

	test('a site is followed by its feed and its posts read as cards under Sites', async ({
		page
	}) => {
		await routes(page);
		await followMedjed(page);

		await page.getByRole('button', { name: 'See its posts' }).click();
		const sites = page.getByRole('tabpanel', { name: 'All' });
		await expect(sites.getByText('Shrine redesign')).toBeVisible({ timeout: 10_000 });
		await expect(sites.getByText('Guestbook cleanup')).toBeVisible();

		// Newest first, never mixed into the people's panes.
		const titles = await sites.locator('.ttl').allTextContents();
		expect(titles).toEqual(['Shrine redesign', 'Guestbook cleanup']);

		await sites.getByRole('button', { name: /^Shrine redesign/ }).click();
		await expect
			.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened))
			.toEqual([`${SITE}/shrine`]);
		await expect(sites.locator('.post.unread')).toHaveCount(1);
	});

	test('is managed on You, and unfollowing takes its posts with it', async ({ page }) => {
		await routes(page);
		await followMedjed(page);

		await page.goto('/you/sites');
		await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
		await expect(page.getByText('Medjed Notes')).toBeVisible();
		await page.getByRole('button', { name: 'Unfollow Medjed Notes' }).click();
		await page.getByRole('button', { name: 'Unfollow', exact: true }).click();
		await expect(page.getByText('No sites yet.')).toBeVisible();

		await page.goto('/feeds?pane=sites');
		await expect(
			page.getByRole('tabpanel', { name: 'All' }).getByText(/^Nothing here yet\./)
		).toBeVisible();
	});

	test('a page with no feed says so and offers nothing to follow', async ({ page }) => {
		await routes(page);
		await page.route(`${SITE}/`, (route) =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<html><head></head></html>' })
		);
		// Discovery also tries the usual feed paths, so the feed is gone too.
		await page.route(`${SITE}/feed.xml`, (route) => route.fulfill({ status: 404, body: '' }));
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('medjed.example');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await expect(page.getByText('No feeds found on that page.')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('button', { name: 'Just follow its posts as a site' })).toHaveCount(
			0
		);
	});
});
