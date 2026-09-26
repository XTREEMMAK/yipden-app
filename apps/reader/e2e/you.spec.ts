import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LENA_PAGE = `<!doctype html><html><head>
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
			page.getByRole('button', { name: /Lena Ofori 1 of 1 sources active/ })
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
		await page.getByRole('button', { name: /Lena Ofori.*sources active/ }).click();
		await page.getByRole('button', { name: '+ Add source' }).click();
		await expect(page.getByText(/Manual sources stay unverified/)).toBeVisible();
		await page.getByLabel('Feed, website, or profile link').fill('youtube.com/keyjayhd');
		await page.getByRole('button', { name: 'Find', exact: true }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		await expect(page.getByRole('status')).toContainText('YouTube was added and checked');
		await expect(page.getByText(/Added manually/)).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Lena Ofori 2 of 2 sources active/ })
		).toBeVisible();

		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		await page.getByRole('button', { name: 'Remove', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Removed YouTube and its cached yips');
		await expect(
			page.getByRole('button', { name: /Lena Ofori 1 of 1 sources active/ })
		).toBeVisible();
	});

	test('pauses and resumes every source for one creator', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');
		await page.getByRole('button', { name: /Lena Ofori.*sources active/ }).click();

		await page.getByRole('button', { name: 'Pause all' }).click();
		await expect(
			page.getByRole('switch', { name: 'Enable Website for Lena Ofori' })
		).not.toBeChecked();
		await expect(
			page.getByRole('button', { name: /Lena Ofori 0 of 1 sources active/ })
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
		await page.goto('/you');

		await page.getByRole('radio', { name: 'Dark' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

		await page.getByRole('radio', { name: 'Light' }).click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	});

	test('theme choice survives a reload', async ({ page }) => {
		await page.goto('/you');
		await page.getByRole('radio', { name: 'Dark' }).click();

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
	});

	test('switches color skin and keeps it across reloads', async ({ page }) => {
		await page.goto('/you');
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
		await page.goto('/you');
		await page.getByText('Lena Ofori').waitFor();

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
		await page.goto('/you');
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
		await page.goto('/you');

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
		await expect(page.getByText('Cy Marsh')).toBeVisible();
	});

	test('exports a versioned full backup', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');

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
		await page.goto('/you');
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
		await expect(page.getByText('Cy Marsh')).toHaveCount(0);
		await page.getByRole('button', { name: 'Restore', exact: true }).click();
		await expect(page.getByRole('status')).toContainText('Restored');
		await expect(page.getByText('Cy Marsh')).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await expect(page.locator('html')).toHaveAttribute('data-skin', 'forest');
	});

	test('clearing cached yips confirms without touching the follow list', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');
		await page.getByText('Lena Ofori').waitFor();

		await page.getByRole('button', { name: 'Clear cached yips' }).click();
		await expect(page.getByRole('status')).toContainText('Cleared cached yips');
		await expect(page.getByText('Lena Ofori')).toBeVisible();
	});

	test('every seg control and unfollow button clears the 44px minimum', async ({ page }) => {
		await followLena(page);
		await page.goto('/you');
		await page.getByText('Lena Ofori').waitFor();

		for (const control of [
			...(await page.getByRole('radio').all()),
			...(await page.getByRole('button', { name: /Unfollow/ }).all())
		]) {
			const box = await control.boundingBox();
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		}
	});

	test('About opens as a complete modal and closes with Escape or Back', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/you');
		const trigger = page.getByRole('button', { name: 'About YipDen' });
		await expect(trigger).toBeVisible();
		await expect(page.getByRole('dialog', { name: 'YipDen' })).toHaveCount(0);

		await trigger.click();
		await page.waitForTimeout(100);
		expect(errors).toEqual([]);
		const dialog = page.getByRole('dialog', { name: 'YipDen' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText(/v0\.0\.1 · build/)).toBeVisible();
		await expect(
			dialog.getByText(/Everyone in Discover comes from the IndieNodes webring/)
		).toBeVisible();
		await expect(
			dialog.getByRole('heading', { name: 'Your den stays on your device.' })
		).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'What changed' })).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'Built with and around' })).toBeVisible();
		await expect(dialog.getByText('@capgo/capacitor-media-session', { exact: true })).toBeVisible();
		await expect(dialog.getByText('MPL 2.0')).toBeVisible();

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
