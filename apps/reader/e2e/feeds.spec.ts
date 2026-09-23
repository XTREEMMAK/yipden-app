import { expect, test, type Page } from '@playwright/test';

/**
 * Feeds, driven through the real pipeline: follow a person via /follow, let the first visit to
 * Feeds catch up and actually fetch their feed, then check what rendered. Nothing here pokes
 * storage directly, so this exercises the same path a person's phone would.
 */

const LENA_PAGE = `<!doctype html><html><head>
	<title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head></html>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Photos and sound.</description>
	<item><title>A plain post</title><link>https://lenaofori.com/post</link>
		<pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate>
		<description>Just some words about the week.</description></item>
	<item><title>A new track</title><link>https://lenaofori.com/track</link>
		<pubDate>Mon, 21 Sep 2026 12:00:00 GMT</pubDate>
		<description>New music.</description>
		<enclosure url="https://lenaofori.com/track.mp3" type="audio/mpeg"/></item>
	<item><title>A short film</title><link>https://lenaofori.com/film</link>
		<pubDate>Mon, 21 Sep 2026 14:00:00 GMT</pubDate>
		<description>Watch it.</description>
		<enclosure url="https://lenaofori.com/film.mp4" type="video/mp4"/></item>
</channel></rss>`;

async function seed(page: Page) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://lenaofori.com/', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: LENA_PAGE })
	);
	await page.route('https://lenaofori.com/feed.xml', (route) =>
		route.fulfill({ status: 200, contentType: 'application/rss+xml', body: FEED })
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
	await expect(page.getByText('Blog', { exact: true })).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
	await expect(page.getByText('Following Lena Ofori')).toBeVisible();
}

test.describe('Feeds', () => {
	test('catches up on first visit: follow now, see yips without a manual refresh', async ({
		page
	}) => {
		await seed(page);
		await page.goto('/feeds');

		await expect(page.locator('#pane-everything').getByText('A plain post')).toBeVisible({
			timeout: 10_000
		});
		const everything = page.locator('#pane-everything');
		await expect(everything.getByText('A new track')).toBeVisible();
		await expect(everything.getByText('A short film')).toBeVisible();
	});

	test('pressing down at the top of the list does not shift the cards', async ({ page }) => {
		/*
		 * The pull to refresh indicator used to be a normal flex sibling of .viewport, so the
		 * instant a pointer went down at the top of the scroll (pulling turning true, before any
		 * actual drag distance) its own height pushed every card down and then back up on
		 * release. A drag-distance-based check would miss this entirely, since scrollTop never
		 * moves; only the cards' own rendered position does.
		 */
		await seed(page);
		await page.goto('/feeds');
		const firstCard = page
			.locator('#pane-everything')
			.getByRole('button', { name: /A plain post/ });
		await expect(firstCard).toBeVisible({ timeout: 10_000 });

		const before = await firstCard.boundingBox();
		await firstCard.dispatchEvent('pointerdown', { pointerId: 1, clientY: before!.y + 10 });
		const during = await firstCard.boundingBox();
		await firstCard.dispatchEvent('pointerup', { pointerId: 1 });
		const after = await firstCard.boundingBox();

		expect(during?.y).toBe(before?.y);
		expect(after?.y).toBe(before?.y);
	});

	test('the headline counts unread yips and people', async ({ page }) => {
		await seed(page);
		await page.goto('/feeds');
		await expect(page.locator('#pane-everything').getByText('A plain post')).toBeVisible({
			timeout: 10_000
		});

		await expect(page.getByRole('heading', { level: 2 })).toContainText('3 new');
		await expect(page.getByRole('heading', { level: 2 })).toContainText('1 person');
	});

	test('filters sort a post, a track and a video into their own panes', async ({ page }) => {
		/*
		 * All four panes stay mounted side by side so each keeps its own scroll position (see
		 * the page's own comment); the inactive ones move off with a CSS transform rather than
		 * display:none. That is correct for the app, but it means Playwright's CSS-only
		 * toBeVisible() still finds text in a pane that has scrolled out of view, so these
		 * assertions are scoped to each pane's own id instead of asking the whole page.
		 */
		await seed(page);
		await page.goto('/feeds');
		await expect(page.locator('#pane-everything').getByText('A plain post')).toBeVisible({
			timeout: 10_000
		});

		const posts = page.locator('#pane-posts');
		const watch = page.locator('#pane-watch');
		const listen = page.locator('#pane-listen');

		await expect(posts.getByText('A plain post')).toBeVisible();
		await expect(posts.getByText('A new track')).toHaveCount(0);
		await expect(posts.getByText('A short film')).toHaveCount(0);

		await expect(listen.getByText('A new track')).toBeVisible();
		await expect(listen.getByText('A plain post')).toHaveCount(0);

		await expect(watch.getByText('A short film')).toBeVisible();
		await expect(watch.getByText('A new track')).toHaveCount(0);
	});

	test('the pill indicator marks the selected tab', async ({ page }) => {
		await seed(page);
		await page.goto('/feeds');
		await expect(page.locator('#pane-everything').getByText('A plain post')).toBeVisible({
			timeout: 10_000
		});

		await page.getByRole('tab', { name: 'Watch' }).click();
		await expect(page.getByRole('tab', { name: 'Watch' })).toHaveAttribute('aria-selected', 'true');
		await expect(page.getByRole('tab', { name: 'Everything' })).toHaveAttribute(
			'aria-selected',
			'false'
		);
	});

	test('opening a yip marks it read', async ({ page }) => {
		await seed(page);
		await page.goto('/feeds');
		await expect(page.locator('#pane-everything').getByText('A plain post')).toBeVisible({
			timeout: 10_000
		});

		const before = await page.getByRole('heading', { level: 2 }).textContent();
		expect(before).toContain('3 new');

		const [popup] = await Promise.all([
			page.waitForEvent('popup').catch(() => null),
			page
				.locator('#pane-everything')
				.getByRole('button', { name: /A plain post/ })
				.click()
		]);
		await popup?.close();

		await page.reload();
		await expect(page.getByRole('heading', { level: 2 })).toContainText('2 new');
	});

	test('says so honestly when nobody is followed yet', async ({ page }) => {
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: '{"version":"1.0","entries":[]}'
			})
		);
		await page.goto('/feeds');

		await expect(
			page.getByText('Nothing here yet. Follow someone to see their yips.')
		).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 })).toContainText('0 new');
	});

	test('every pill target meets the 44px minimum', async ({ page }) => {
		await seed(page);
		await page.goto('/feeds');
		await expect(page.locator('#pane-everything').getByText('A plain post')).toBeVisible({
			timeout: 10_000
		});

		for (const tab of await page.getByRole('tab').all()) {
			const box = await tab.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
	});
});
