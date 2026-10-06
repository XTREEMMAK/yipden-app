import { expect, test, type Page } from '@playwright/test';

/**
 * A creator's profile: assembled from what YipDen keeps about them plus their own site, read
 * once when it opens. Every response here is made up; nothing reaches the network.
 */

const LENA_PAGE = `<!doctype html><html><head>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Lena Ofori</title>
	<meta name="description" content="Lena's site">
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head><body>
	<div class="h-card">
		<span class="p-name">Lena Ofori</span>
		<p class="p-note">I make ambient music and zines.</p>
		<a rel="me" href="https://bsky.app/profile/lena.example">Bluesky</a>
		<a rel="me" href="https://www.instagram.com/lenaofori">Instagram</a>
	</div>
</body></html>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Sound.</description>
	<item><title>Low Tide</title><link>https://lenaofori.com/low-tide</link>
		<pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate><description>A new track.</description></item>
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
}

test.describe('A creator’s profile', () => {
	test('shows their own words, the places their site names, and what they posted lately', async ({
		page
	}) => {
		await seed(page);
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
		await page.getByText('Following Lena Ofori').waitFor();
		await page.goto('/feeds');
		await page.locator('#pane-everything').getByText('Low Tide').waitFor({ timeout: 10_000 });

		await page.goto('/you');
		await page
			.getByRole('button', { name: /Lena Ofori/ })
			.first()
			.click();
		await page.getByRole('link', { name: 'Open' }).click();

		await expect(page).toHaveURL(/\/creator\/?\?site=https%3A%2F%2Flenaofori\.com/);
		await expect(page.getByRole('heading', { level: 1, name: 'Lena Ofori' })).toBeVisible();
		await expect(page.getByText('I make ambient music and zines.')).toBeVisible();
		await expect(page.getByText('In their own words, from their site')).toBeVisible();

		const places = page.getByRole('region', { name: 'Where they are' });
		await expect(places.getByText('Bluesky')).toBeVisible();
		await expect(places.getByText('Instagram')).toBeVisible();
		await expect(places.getByText('Their site links it').first()).toBeVisible();

		await expect(page.getByRole('region', { name: 'Lately' }).getByText('Low Tide')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Following' })).toBeVisible();

		// Another address of theirs, linked by hand: it is listed, can be made home, and unlinked.
		await page.getByRole('button', { name: 'Same person as…' }).click();
		const sheet = page.getByRole('dialog', { name: 'Same person as Lena Ofori' });
		await sheet.getByLabel('Another address of theirs').fill('lena.itch.io');
		await sheet.getByRole('button', { name: 'Link' }).click();
		await expect(sheet).toHaveCount(0);
		await expect(places.getByText('Same person, linked by you')).toBeVisible();

		await places.getByRole('button', { name: 'Make lena.itch.io their home' }).click();
		await expect(page.getByText('No site of their own: a platform profile')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Open their itch.io' })).toBeVisible();

		await places.getByRole('button', { name: 'Make lenaofori.com their home' }).click();
		await expect(page.getByRole('button', { name: 'Visit their site' })).toBeVisible();
		await places.getByRole('button', { name: 'Unlink lena.itch.io' }).click();
		await expect(places.getByText('Same person, linked by you')).toHaveCount(0);

		// Keeping by link starts from what it is: a passage asks for the page and the words.
		const kept = page.getByRole('region', { name: 'Kept from them' });
		await kept.getByRole('radio', { name: 'Passage' }).click();
		await expect(kept.getByLabel('The page it is on')).toBeVisible();
		await expect(kept.getByLabel('The passage, as it appears on the page')).toBeVisible();
		await kept.getByRole('radio', { name: 'Picture' }).click();
		await expect(kept.getByLabel('A picture by link')).toBeVisible();

		await page.getByRole('button', { name: 'Back' }).click();
		await expect(page).toHaveURL(/\/you/);
	});

	test('opens from the picture on a card in Feeds', async ({ page }) => {
		await seed(page);
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
		await page.getByText('Following Lena Ofori').waitFor();
		await page.goto('/feeds');
		const pane = page.locator('#pane-everything');
		await pane.getByText('Low Tide').waitFor({ timeout: 10_000 });
		await pane.getByRole('button', { name: "Lena Ofori's profile" }).first().click();
		await expect(page.getByRole('heading', { level: 1, name: 'Lena Ofori' })).toBeVisible();
	});

	test('says so rather than failing for an address that is not a creator’s', async ({ page }) => {
		await seed(page);
		await page.goto('/creator?site=not-a-site');
		await expect(page.getByText('That is not a creator’s address YipDen can open.')).toBeVisible();
	});
});

test.describe('Follow, People or Forums', () => {
	test('a forum has its own heading and field, and a site that is not one is turned back', async ({
		page
	}) => {
		await seed(page);
		await page.goto('/follow?mode=forums');
		await expect(page.getByRole('heading', { name: /Follow a forum/ })).toBeVisible();
		await page.getByLabel('Forum link').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find forum' }).click();
		await expect(page.getByText(/is not a public forum YipDen can read/)).toBeVisible();

		await page.getByRole('radio', { name: 'People' }).click();
		await expect(page.getByRole('heading', { name: /Follow a person/ })).toBeVisible();
		await expect(page.getByLabel('Creator, website, or profile')).toBeVisible();
	});
});
