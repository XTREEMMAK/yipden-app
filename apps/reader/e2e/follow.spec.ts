import { expect, test, type Page } from '@playwright/test';

/**
 * Follow, against a fixed page rather than the real web.
 *
 * The suite runs against the built preview server, where the browser fetch goes direct rather
 * than through the dev only proxy (see src/lib/platform/http.ts). So these intercept the real
 * target URLs, which is what a production build actually requests, and never touch the network.
 */

const LENA_PAGE = `<!doctype html><html><head>
	<title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head><body>
	<a rel="me" href="https://mastodon.social/@lena">Mastodon</a>
</body></html>`;

const MASTODON_PAGE = `<!doctype html><html><head><title>Lena</title>
	<link rel="me" href="https://lenaofori.com/"></head></html>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Photos.</description>
	<item><title>A photo</title><link>https://lenaofori.com/1</link>
	<pubDate>Mon, 15 Sep 2026 14:02:00 GMT</pubDate></item>
</channel></rss>`;

async function mockUpstream(
	page: Page,
	routes: Record<string, { body: string; type?: string }>,
	ring = { version: '1.0', entries: [] as unknown[] }
) {
	/*
	 * These tests run against the built preview server, the same as the rest of the e2e suite
	 * (see docs/ci-cd.md). A production build's browser fetch goes direct, not through the dev
	 * only proxy, so the mock has to intercept the real target URL rather than /__dev/fetch.
	 */
	/*
	 * A catch-all first, so anything discovery legitimately reaches but this fixture did not
	 * anticipate -- a rel=me profile being checked for a backlink, a fallback path being
	 * probed when nothing was announced -- fails fast instead of hanging against a sandbox
	 * with no real network egress. Playwright resolves overlapping routes last registered
	 * first, so the specific mocks registered after this one win.
	 */
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	// discoverFeeds checks robots.txt on every host it reaches. Allow everything, so the tests
	// are about discovery, not about a robots.txt this fixture never bothered to write.
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	for (const [url, match] of Object.entries(routes)) {
		await page.route(url, (route) =>
			route.fulfill({ status: 200, contentType: match.type ?? 'text/html', body: match.body })
		);
	}
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(ring)
		})
	);
}

test.describe('Follow', () => {
	test('rejects an empty submission with an inline error, never a dialog', async ({ page }) => {
		await mockUpstream(page, {});
		await page.goto('/follow');

		await page.getByRole('button', { name: 'Find feeds' }).click();
		await expect(
			page.getByText('Type a creator name, website, or profile link first.')
		).toBeVisible();
	});

	test('suggests a Ring creator while typing and uses its feeds without visiting their site', async ({
		page
	}) => {
		const ring = {
			version: '1.0',
			entries: [
				{
					id: 'ada-ring',
					creator: 'Ada Reed',
					type: 'audio',
					tags: ['synth'],
					source_url: 'https://ada.example.com/',
					feeds: [
						{ type: 'rss', url: 'https://ada.example.com/feed.xml', verified: true },
						{ type: 'bluesky', url: 'https://bsky.app/profile/ada/rss' }
					],
					verification_token: 'ada',
					joined_at: '2026-01-01T00:00:00.000Z'
				}
			]
		};
		let creatorRequests = 0;
		page.on('request', (request) => {
			if (request.url().startsWith('https://ada.example.com/')) creatorRequests += 1;
		});
		await mockUpstream(page, {}, ring);
		await page.goto('/follow');

		await page.getByLabel('Creator, website, or profile').fill('Ada');
		await expect(page.getByText('Already in IndieNodes')).toBeVisible();
		await page.getByRole('button', { name: /Ada Reed.*2 known sources/ }).click();

		await expect(page.getByText('Found in the IndieNodes ring')).toBeVisible();
		await expect(page.getByText('Blog', { exact: true })).toBeVisible();
		await expect(page.getByText('Bluesky', { exact: true })).toBeVisible();
		expect(creatorRequests).toBe(0);

		await page.getByRole('button', { name: 'Follow Ada Reed in 2 places' }).click();
		await expect(page.getByText('Following Ada Reed')).toBeVisible();
		expect(creatorRequests).toBe(0);
	});

	test('finds a feed and a linked profile, verifying the two way link', async ({ page }) => {
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' },
			'https://mastodon.social/@lena.rss': { body: FEED, type: 'application/rss+xml' },
			'https://mastodon.social/@lena': { body: MASTODON_PAGE }
		});
		await page.goto('/follow');

		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();

		await expect(page.getByText('Lena Ofori', { exact: true })).toBeVisible();
		await expect(page.getByText('Blog', { exact: true })).toBeVisible();
		await expect(page.getByText('Mastodon', { exact: true })).toBeVisible();
		await expect(page.getByText('Links back to their site')).toBeVisible();
	});

	test('a person types a bare domain and the app fills in https', async ({ page }) => {
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' }
		});
		await page.goto('/follow');

		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await expect(page.getByText('Found from lenaofori.com')).toBeVisible();
	});

	test('disables the follow button at zero and enables it once something is on', async ({
		page
	}) => {
		// LENA_PAGE links to Mastodon too, so both switches have to go off to reach zero.
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' }
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await expect(page.getByText('Blog', { exact: true })).toBeVisible();

		const confirm = page.getByRole('button', { name: /Follow Lena Ofori in|Pick at least/ });
		await expect(confirm).toBeEnabled();

		for (const item of await page.getByRole('switch').all()) await item.click();
		await expect(page.getByRole('button', { name: 'Pick at least one place' })).toBeDisabled();

		await page.getByRole('switch', { name: 'Follow Blog' }).click();
		await expect(confirm).toBeEnabled();
	});

	test('follows only what was left switched on', async ({ page }) => {
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' },
			'https://mastodon.social/@lena.rss': { body: FEED, type: 'application/rss+xml' },
			'https://mastodon.social/@lena': { body: MASTODON_PAGE }
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await expect(page.getByText('Mastodon', { exact: true })).toBeVisible();

		await page.getByRole('switch', { name: 'Follow Mastodon' }).click();
		await page.getByRole('button', { name: 'Follow Lena Ofori in 1 place' }).click();

		await expect(page.getByText('Following Lena Ofori')).toBeVisible();
		await expect(page.getByText('1 place, saved on this phone')).toBeVisible();
	});

	test('says the follow stays private, before and after following', async ({ page }) => {
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' }
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();

		await expect(page.getByText(/stays on your phone/)).toBeVisible();
		await expect(page.getByText(/is not\s+notified/)).toBeVisible();

		await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
		await expect(page.getByText(/stays on your phone/)).toBeVisible();
	});

	test('offers Find someone else and starts clean', async ({ page }) => {
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' }
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();

		await page.getByRole('button', { name: 'Find someone else' }).click();
		await expect(page.getByLabel('Creator, website, or profile')).toHaveValue('');
		await expect(page.getByRole('button', { name: 'Find feeds' })).toBeVisible();
	});

	test('See their yips in Feeds goes to the Feeds tab', async ({ page }) => {
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' }
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
		await expect(page.getByText('Following Lena Ofori')).toBeVisible();

		await page.getByRole('button', { name: 'See their yips in Feeds' }).click();
		await expect(page).toHaveURL(/\/feeds/);
	});

	test('reports a site with no feed honestly rather than pretending', async ({ page }) => {
		await mockUpstream(page, {
			'https://quiet.example.com/': { body: '<!doctype html><title>Quiet</title>' }
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('quiet.example.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();

		await expect(page.getByText('No feeds found on that page.')).toBeVisible();
	});

	test('reports a network failure without crashing', async ({ page }) => {
		await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: '{"version":"1.0","entries":[]}'
			})
		);
		await page.route('**/robots.txt', (route) =>
			route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
		);
		await page.route('https://unreachable.example.com/**', (route) => route.abort());
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('unreachable.example.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();

		await expect(page.getByText(/Could not read/)).toBeVisible();
	});

	test('contains an unusually long feed address inside the results card', async ({ page }) => {
		const longPath = `${'deep-segment-'.repeat(30)}feed.xml`;
		await mockUpstream(page, {
			'https://long.example.com/': {
				body: `<!doctype html><title>Long Feed</title><link rel="alternate" type="application/rss+xml" title="A very long source" href="/${longPath}">`
			}
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('long.example.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await expect(page.getByText('Blog', { exact: true })).toBeVisible();

		const bounds = await page.locator('.found').evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				viewport: window.innerWidth,
				scrollWidth: element.scrollWidth,
				clientWidth: element.clientWidth
			};
		});
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
		expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
	});

	test('every switch clears the 44px minimum', async ({ page }) => {
		await mockUpstream(page, {
			'https://lenaofori.com/': { body: LENA_PAGE },
			'https://lenaofori.com/feed.xml': { body: FEED, type: 'application/rss+xml' }
		});
		await page.goto('/follow');
		await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
		await page.getByRole('button', { name: 'Find feeds' }).click();
		await expect(page.getByText('Blog', { exact: true })).toBeVisible();

		const row = page.locator('.frow').first();
		const box = await row.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	});
});
