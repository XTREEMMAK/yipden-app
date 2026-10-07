import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedOldStore } from './support.js';

/** The version About must show: the app's own, read the way the build reads it. */
const APP_VERSION = (
	JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
		version: string;
	}
).version;

const LENA_PAGE = `<!doctype html><html><head>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head></html>`;
const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Photos.</description>
	<item><title>A post</title><link>https://lenaofori.com/1</link>
		<pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

/** Follows Lena Ofori through the real /follow flow, same as the other suites. */
async function followLena(page: Page) {
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
	await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await page.getByText('Blog', { exact: true }).waitFor({ timeout: 10_000 });
	await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
	await page.getByText('Following Lena Ofori').waitFor();
}

test.describe('You', () => {
	test('shows an empty state with nobody followed', async ({ page }) => {
		await page.goto('/you');
		await expect(
			page.getByText('You are not following anyone yet. Discover is a good place to start.')
		).toBeVisible();
		await expect(page.getByText('0 people', { exact: false })).toBeVisible();
	});

	test('lists a followed person with their feed count', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');

		await expect(page.getByText('Lena Ofori')).toBeVisible();
		await expect(
			page.getByRole('link', { name: /Lena Ofori 1 of 1 sources active/ })
		).toBeVisible();
	});

	test('adds and removes a manually supplied creator source', async ({ page }) => {
		await followLena(page);
		await page.route('https://youtube.com/keyjayhd', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<link href="https://www.youtube.com/channel/UCLCemz-Z5S_hLjZ7PPEbj8Q" rel="canonical">'
			})
		);
		await page.route(
			'https://www.youtube.com/feeds/videos.xml?channel_id=UCLCemz-Z5S_hLjZ7PPEbj8Q',
			(route) =>
				route.fulfill({
					status: 200,
					contentType: 'application/atom+xml',
					body: '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>KeyJay HD</title></feed>'
				})
		);

		await page.goto('/you');
		await page.getByRole('button', { name: 'Settings for Lena Ofori' }).click();
		await page.getByRole('button', { name: '+ Add source' }).click();
		await expect(page.getByText(/Manual sources stay unverified/)).toBeVisible();
		await page.getByLabel('Feed, website, or profile link').fill('youtube.com/keyjayhd');
		await page.getByRole('button', { name: 'Find', exact: true }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		await expect(page.getByRole('status')).toContainText('YouTube was added and checked');
		await expect(page.getByText(/Added manually/)).toBeVisible();
		await expect(
			page.getByRole('link', { name: /Lena Ofori 2 of 2 sources active/ })
		).toBeVisible();

		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Removed YouTube and its cached yips');
		await expect(
			page.getByRole('link', { name: /Lena Ofori 1 of 1 sources active/ })
		).toBeVisible();
	});

	test('says why a source failed, and replaces a moved feed with where it went', async ({
		page
	}) => {
		await followLena(page);
		// The blog moves its feed: the old address now 404s, and the site points somewhere new.
		await page.route('https://lenaofori.com/feed.xml', (route) =>
			route.fulfill({ status: 404, body: 'gone' })
		);
		await page.route('https://lenaofori.com/', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: LENA_PAGE.replace('/feed.xml', '/posts/feed.xml')
			})
		);
		await page.route('https://lenaofori.com/posts/feed.xml', (route) =>
			route.fulfill({ status: 200, contentType: 'application/rss+xml', body: FEED })
		);

		await page.goto('/you');
		await page.getByRole('button', { name: 'Settings for Lena Ofori' }).click();
		await page.getByRole('button', { name: 'Check now' }).click();
		await expect(
			page.getByText('Not found (404); it may have moved · 1 failure in a row')
		).toBeVisible();

		await page.getByRole('button', { name: 'Replace the address for Website' }).click();
		const field = page.getByLabel('Where it moved: a feed, website or profile link');
		await expect(field).toHaveValue(/lenaofori\.com/);
		await page.getByRole('button', { name: 'Find', exact: true }).click();
		await page.getByRole('button', { name: 'Use this', exact: true }).click();

		await expect(page.getByRole('status')).toContainText('Website now reads from lenaofori.com');
		await expect(page.getByText(/Not found/)).toHaveCount(0);
		await expect(page.getByText(/Added manually/)).toBeVisible();
		await expect(
			page.getByRole('link', { name: /Lena Ofori 1 of 1 sources active/ })
		).toBeVisible();
	});

	test('a connection failure offers Retry, not Replace, until checks give up', async ({ page }) => {
		await followLena(page);
		await page.route('https://lenaofori.com/feed.xml', (route) =>
			route.abort('internetdisconnected')
		);

		await page.goto('/you');
		await page.getByRole('button', { name: 'Settings for Lena Ofori' }).click();
		await page.getByRole('button', { name: 'Check now' }).click();
		await expect(page.getByText('Could not connect · 1 failure in a row')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Replace the address/ })).toHaveCount(0);
	});

	test('opens on Following, with the Library and the lists one tab away', async ({ page }) => {
		await page.goto('/you');
		const tabs = page.getByRole('tablist', { name: 'Your den' });
		await expect(tabs.getByRole('tab', { name: /^Following/ })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(page.getByRole('tabpanel', { name: /^Following/ })).toBeVisible();
		await expect(page.getByRole('region', { name: /^Library/ })).toHaveCount(0);

		await tabs.getByRole('tab', { name: /^Library/ }).click();
		await expect(page.getByRole('region', { name: /^Library/ })).toBeVisible();

		// Arrow keys move along the tabs, as a tablist should.
		await tabs.getByRole('tab', { name: /^Library/ }).press('ArrowRight');
		await expect(tabs.getByRole('tab', { name: /^Liked & Not Liked/ })).toBeFocused();
		await expect(page.getByRole('tab', { name: /^Not for me/ })).toBeVisible();

		for (const tab of await tabs.getByRole('tab').all()) {
			expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
	});

	test('Liked shows badges and the first 25, then more in place, with a filter', async ({
		page
	}) => {
		const BADGE =
			'data:image/svg+xml,' +
			encodeURIComponent(
				'<svg xmlns="http://www.w3.org/2000/svg" width="88" height="31"><rect width="88" height="31" fill="red"/></svg>'
			);
		const records = Array.from({ length: 30 }, (_, i) => ({
			id: `creator${i}.example.com`,
			url: `https://creator${i}.example.com/`,
			name: `Creator ${i}`,
			verdict: 'liked',
			source: 'partner',
			via: 'Musicians Webring',
			...(i === 0 ? { thumbUrl: BADGE } : {}),
			at: new Date(Date.UTC(2026, 8, 1, 0, 30 - i)).toISOString()
		}));
		records.push({
			id: 'nope.example.com',
			url: 'https://nope.example.com/',
			name: 'Nope',
			verdict: 'hidden',
			source: 'indienodes',
			at: '2026-09-01T00:00:00.000Z'
		} as (typeof records)[number]);
		await seedOldStore(page, { verdicts: records });
		await page.goto('/you?tab=lists');
		await expect(page.getByRole('tab', { name: /^Liked \d/ })).toBeVisible();
		// Moved into the encrypted store, and the plaintext database is gone.
		await expect
			.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)))
			.toEqual(['yipden-sealed']);

		const panel = page.getByRole('tabpanel');
		await page.getByRole('tab', { name: /^Liked \d/ }).click();
		await expect(page.getByRole('tab', { name: /^Liked \d/ })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(panel.getByRole('button', { name: /^Open Creator/ })).toHaveCount(25);
		await expect(panel.locator('img.badge')).toHaveCount(1);

		await panel.getByRole('button', { name: /^Show 5 more/ }).click();
		await expect(panel.getByRole('button', { name: /^Open Creator/ })).toHaveCount(30);
		await expect(panel.getByRole('button', { name: /more/ })).toHaveCount(0);

		await panel.getByRole('searchbox', { name: 'Filter Liked' }).fill('creator 2');
		// Creator 2, and 20 through 29.
		await expect(panel.getByRole('button', { name: /^Open Creator/ })).toHaveCount(11);

		await page.getByRole('tab', { name: /^Not for me/ }).click();
		await expect(panel.getByRole('button', { name: 'Open Nope' })).toBeVisible();
		await expect(panel.getByRole('searchbox')).toHaveCount(0);
	});

	test('Send hands a saved link on, copying it where there is no share sheet', async ({
		page,
		context
	}) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await seedOldStore(page, {
			shelf: [
				{
					id: 'https://wide.example.com/',
					url: 'https://wide.example.com/',
					title: 'Wide Screen',
					from: 'discover',
					savedAt: '2026-10-01T00:00:00.000Z'
				}
			]
		});
		await page.goto('/you?tab=library');
		await expect(page.getByRole('region', { name: /^Library/ })).toBeVisible();
		// Headless Chromium has no share sheet; take it away explicitly so this tests the fallback.
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
		);

		const panel = page.getByRole('region', { name: /^Library/ });
		await panel.getByRole('button', { name: 'Send Wide Screen to another device or app' }).click();
		await expect(page.getByRole('status')).toContainText('Link copied.');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			'https://wide.example.com/'
		);
	});

	test('pauses and resumes every source for one creator', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');
		await page.getByRole('button', { name: 'Settings for Lena Ofori' }).click();

		await page.getByRole('button', { name: 'Pause all' }).click();
		await expect(
			page.getByRole('switch', { name: 'Enable Website for Lena Ofori' })
		).not.toBeChecked();
		await expect(
			page.getByRole('link', { name: /Lena Ofori 0 of 1 sources active/ })
		).toBeVisible();

		await page.getByRole('button', { name: 'Enable all' }).click();
		await expect(page.getByRole('switch', { name: 'Pause Website for Lena Ofori' })).toBeChecked();
	});

	test('unfollow needs a confirm, and Keep cancels it', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');
		await page.getByText('Lena Ofori').waitFor();

		await page.getByRole('button', { name: 'Unfollow Lena Ofori' }).click();
		await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible();

		await page.getByRole('button', { name: 'Keep' }).click();
		await expect(page.getByText('Lena Ofori')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Keep' })).toHaveCount(0);
	});

	test('confirming removes the row and says so', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');
		await page.getByText('Lena Ofori').waitFor();

		await page.getByRole('button', { name: 'Unfollow Lena Ofori' }).click();
		await page.getByRole('button', { name: 'Unfollow', exact: true }).click();

		await expect(page.getByRole('status')).toContainText('Unfollowed Lena Ofori');
		await expect(page.getByText('Lena Ofori')).toHaveCount(0);
		await expect(
			page.getByText('You are not following anyone yet. Discover is a good place to start.')
		).toBeVisible();
	});

	test('switches theme and the document reflects it', async ({ page }) => {
		await page.goto('/you/settings');

		await page.getByRole('radio', { name: 'Dark' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

		await page.getByRole('radio', { name: 'Light' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	});

	test('theme choice survives a reload', async ({ page }) => {
		await page.goto('/you/settings');
		await page.getByRole('radio', { name: 'Dark' }).click();

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
	});

	test('switches color skin and keeps it across reloads', async ({ page }) => {
		await page.goto('/you/settings');
		await page.getByRole('radio', { name: 'Blue glass' }).click();

		await expect(page.locator('html')).toHaveAttribute('data-skin', 'glass');
		await expect(page.getByRole('radio', { name: 'Blue glass' })).toHaveAttribute(
			'aria-checked',
			'true'
		);

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-skin', 'glass');
		await expect(page.getByRole('radio', { name: 'Blue glass' })).toHaveAttribute(
			'aria-checked',
			'true'
		);

		await page.getByRole('radio', { name: 'Forest earth' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-skin', 'forest');
	});

	test('exports a real OPML file naming the followed feed', async ({ page }) => {
		await followLena(page);
		await page.goto('/you/settings');
		await expect(page.getByRole('button', { name: 'Export as OPML' })).toBeEnabled();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Export as OPML' }).click()
		]);

		expect(download.suggestedFilename()).toBe('yipden-follows.opml');
		const downloadPath = await download.path();
		const contents = downloadPath ? await readFile(downloadPath, 'utf8') : '';
		expect(contents).toContain('xmlUrl="https://lenaofori.com/feed.xml"');
		expect(contents).toContain('Lena Ofori');
	});

	test('the export button is disabled with nobody to export', async ({ page }) => {
		await page.goto('/you/settings');
		await expect(page.getByRole('button', { name: 'Export as OPML' })).toBeDisabled();
	});

	test('imports an OPML file and follows what it names', async ({ page }) => {
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: '{"version":"1.0","entries":[]}'
			})
		);
		await page.goto('/you/settings');

		const opml =
			'<?xml version="1.0"?><opml version="2.0"><body>' +
			'<outline text="Cy Marsh"><outline type="rss" text="Essays" ' +
			'xmlUrl="https://cy.example.com/feed.xml" htmlUrl="https://cy.example.com/"/></outline>' +
			'</body></opml>';

		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser'),
			page.getByRole('button', { name: 'Import OPML' }).click()
		]);

		const dir = await mkdtemp(join(tmpdir(), 'yipden-opml-'));
		const file = join(dir, 'import.opml');
		await writeFile(file, opml);
		await chooser.setFiles(file);

		await expect(page.getByRole('status')).toContainText('Imported 1 person, 1 feed');

		await page.goto('/you');
		await expect(page.getByText('Cy Marsh')).toBeVisible();
	});

	test('exports a versioned full backup', async ({ page }) => {
		await followLena(page);
		await page.goto('/you/settings');

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Export full backup' }).click()
		]);
		const downloadPath = await download.path();
		const backup = JSON.parse(downloadPath ? await readFile(downloadPath, 'utf8') : '{}');
		expect(backup).toMatchObject({ format: 'yipden-backup', version: 1 });
		expect(backup.people).toHaveLength(1);
		expect(backup.feeds[0].url).toBe('https://lenaofori.com/feed.xml');
	});

	test('previews a full backup before restoring it', async ({ page }) => {
		await page.goto('/you/settings');
		const backup = {
			format: 'yipden-backup',
			version: 1,
			exportedAt: '2026-09-25T12:00:00.000Z',
			people: [
				{
					id: 'person-cy',
					name: 'Cy Marsh',
					siteUrl: 'https://cy.example.com/',
					followedAt: '2026-09-25T12:00:00.000Z'
				}
			],
			feeds: [
				{
					id: 'https://cy.example.com/feed.xml',
					personId: 'person-cy',
					url: 'https://cy.example.com/feed.xml',
					kind: 'blog',
					title: 'Cy Marsh',
					verified: false,
					provenance: 'manual',
					failures: 0,
					enabled: true
				}
			],
			yips: [],
			settings: { shuffleMusic: false },
			appearance: { theme: 'dark', skin: 'forest' }
		};
		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser'),
			page.getByRole('button', { name: 'Preview backup import' }).click()
		]);
		const dir = await mkdtemp(join(tmpdir(), 'yipden-backup-'));
		const file = join(dir, 'backup.json');
		await writeFile(file, JSON.stringify(backup));
		await chooser.setFiles(file);

		await expect(page.getByText('Ready to restore')).toBeVisible();
		await page.getByRole('button', { name: 'Restore', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Restored');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.locator('html')).toHaveAttribute('data-skin', 'forest');

		await page.goto('/you');
		await expect(page.getByText('Cy Marsh')).toBeVisible();
	});

	test('clearing cached yips confirms without touching the follow list', async ({ page }) => {
		await followLena(page);
		await page.goto('/you/settings');

		await page.getByRole('button', { name: 'Clear cached yips' }).click();
		await expect(page.getByRole('status')).toContainText('Cleared cached yips');

		await page.goto('/you');
		await expect(page.getByText('Lena Ofori')).toBeVisible();
	});

	test('every unfollow button clears the 44px minimum', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');
		await page.getByText('Lena Ofori').waitFor();

		for (const control of await page.getByRole('button', { name: /Unfollow/ }).all()) {
			const box = await control.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
	});

	test('every theme and skin radio clears the 44px minimum', async ({ page }) => {
		await page.goto('/you/settings');

		for (const control of await page.getByRole('radio').all()) {
			const box = await control.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
	});

	test('a gear icon on You reaches Settings, and Back returns', async ({ page }) => {
		await page.goto('/you');
		await page.getByRole('link', { name: 'Settings' }).click();
		await expect(page).toHaveURL(/\/you\/settings\/?$/);
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

		await page.getByRole('button', { name: 'Back to You' }).click();
		await expect(page).toHaveURL(/\/you\/?$/);
	});

	test('About opens as a complete modal and closes with Escape or Back', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/you/settings');
		const trigger = page.getByRole('button', { name: 'About YipDen' });
		await expect(trigger).toBeVisible();
		await expect(page.getByRole('dialog', { name: 'YipDen' })).toHaveCount(0);

		await trigger.click();
		await page.waitForTimeout(100);
		expect(errors).toEqual([]);
		const dialog = page.getByRole('dialog', { name: 'YipDen' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(`v${APP_VERSION} · build`, { exact: false })).toBeVisible();
		await expect(
			dialog.getByText(/Everyone in Discover comes from the IndieNodes webring/)
		).toBeVisible();
		await expect(
			dialog.getByRole('heading', { name: 'A doorway, not a destination.' })
		).toBeVisible();
		await expect(dialog.getByText(/Every yip links out to its creator’s own site/)).toBeVisible();
		await expect(
			dialog.getByRole('heading', { name: 'Your den stays on your device.' })
		).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'What changed' })).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'Built with and around' })).toBeVisible();
		await expect(dialog.getByText('@capgo/capacitor-media-session', { exact: true })).toBeVisible();
		// Both Capgo plugins are MPL 2.0.
		await expect(dialog.getByText('MPL 2.0', { exact: true })).toHaveCount(2);
		await expect(dialog.getByText('@capacitor-community/sqlite', { exact: true })).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(trigger).toBeFocused();

		await trigger.click();
		await expect(dialog).toBeVisible();
		await page.goBack();
		await expect(dialog).toHaveCount(0);
		await expect(trigger).toBeFocused();
	});
});

test('a followed person’s row opens their profile; their settings are a sheet of their own', async ({
	page
}) => {
	await followLena(page);
	await page.goto('/you');
	await page.getByRole('link', { name: /Lena Ofori.*sources active/ }).click();
	await expect(page).toHaveURL(/\/creator/);

	await page.goto('/you');
	await page.getByRole('button', { name: 'Settings for Lena Ofori' }).click();
	const sheet = page.getByRole('dialog', { name: 'Settings for Lena Ofori' });
	await expect(sheet.getByRole('button', { name: 'Check now' })).toBeVisible();
	await expect(sheet.getByText('Kept from them')).toHaveCount(0);
	await page.goBack();
	await expect(sheet).toBeHidden();
});
