import { expect, test, type Page } from '@playwright/test';

/**
 * A post that shares a YouTube video, without being one: the card stays the post, and a strip
 * under it plays the video in the app's own player. Nothing reaches the network.
 */

const PAGE = `<!doctype html><html><head><title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body></body></html>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Notes.</description>
	<item><link>https://lenaofori.com/notes/1</link><guid>note-1</guid>
		<pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate>
		<description><![CDATA[<p>Made a little video about the zine: <a href="https://youtu.be/M7lc1UVf-VE">watch</a></p>]]></description></item>
</channel></rss>`;

async function seed(page: Page) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://lenaofori.com/', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: PAGE })
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
	await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
	await page.getByText('Following Lena Ofori').waitFor();
}

test('a shared YouTube video plays from a strip under the post, which stays the post', async ({
	page
}) => {
	await seed(page);
	await page.goto('/feeds');
	const pane = page.locator('#pane-everything');
	await expect(pane.getByText(/Made a little video about the zine/)).toBeVisible({
		timeout: 10_000
	});
	const strip = pane.getByRole('button', { name: 'Play the YouTube video Lena Ofori shared' });
	await expect(strip).toBeVisible();
	await strip.click();
	await expect(page.getByRole('region', { name: 'Now playing' })).toBeVisible();
	await expect(page.locator('.pl-embed.youtube')).toBeAttached();
});
