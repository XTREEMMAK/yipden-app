import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Following a public Discourse forum and reading it as a digest, against responses recorded from
 * meta.discourse.org (packages/feeds/test/fixtures/discourse). Topic times are moved to just now
 * at run time, so the quiet-topic window never empties the digest as the recording ages.
 */

const BASE = 'https://meta.discourse.org';
const fixture = (name: string) =>
	readFileSync(join(process.cwd(), '../../packages/feeds/test/fixtures/discourse', name), 'utf8');

function recentLatest(): string {
	const latest = JSON.parse(fixture('latest.json'));
	latest.topic_list.topics.forEach((topic: Record<string, unknown>, index: number) => {
		const at = new Date(Date.now() - (index + 1) * 60 * 60 * 1000).toISOString();
		topic.last_posted_at = at;
		topic.bumped_at = at;
	});
	return JSON.stringify(latest);
}

async function forumRoutes(page: Page, basicInfo = 'basic-info.json') {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: '{"version":"1.0","entries":[]}'
		})
	);
	await page.route(`${BASE}/robots.txt`, (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/plain',
			body: 'User-agent: *\nDisallow: /admin/'
		})
	);
	await page.route(`${BASE}/t/a-topic/12345`, (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: fixture('topic-page.html') })
	);
	const json = (body: string) => ({ status: 200, contentType: 'application/json', body });
	await page.route(`${BASE}/site/basic-info.json`, (route) =>
		route.fulfill(json(fixture(basicInfo)))
	);
	await page.route(`${BASE}/categories.json?include_subcategories=true`, (route) =>
		route.fulfill(json(fixture('categories.json')))
	);
	await page.route(`${BASE}/latest.json`, (route) => route.fulfill(json(recentLatest())));
}

/** Records what would have opened in the system browser, since a test has none. */
async function recordOpens(page: Page) {
	await page.addInitScript(() => {
		(window as unknown as { opened: string[] }).opened = [];
		window.open = (url) => {
			(window as unknown as { opened: string[] }).opened.push(String(url));
			return null;
		};
	});
}

async function findForum(page: Page) {
	await page.goto('/follow');
	await page.getByLabel('Creator, website, or profile').fill(`${BASE}/t/a-topic/12345`);
	await page.getByRole('button', { name: 'Find feeds' }).click();
}

test.describe('forums', () => {
	test.setTimeout(90_000);

	test('a thread link finds its forum, which is followed whole and read as one card per topic', async ({
		page
	}) => {
		await recordOpens(page);
		await forumRoutes(page);
		await findForum(page);

		await expect(page.getByText('This is a forum')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText('Discourse Meta').first()).toBeVisible();
		const whole = page.getByRole('switch', { name: 'Follow the whole forum' });
		await expect(whole).toBeChecked();
		await expect(page.getByText('News and Events')).toBeVisible({ timeout: 20_000 });
		// A restricted category is never offered, and the feed address never shows.
		await expect(page.getByText('Staff', { exact: true })).toHaveCount(0);
		await expect(page.getByText('latest.rss')).toHaveCount(0);
		await expect(page.getByText(/discourse/i).filter({ hasText: /^Discourse$/ })).toHaveCount(0);

		// Choosing a category turns the whole forum off; turning the whole forum back on clears it.
		await page.getByRole('switch', { name: 'Follow News and Events' }).click();
		await expect(whole).not.toBeChecked();
		await whole.click();
		await expect(page.getByRole('switch', { name: 'Follow News and Events' })).not.toBeChecked();

		await page.getByRole('button', { name: 'Follow Discourse Meta' }).click();
		await expect(page.getByText('Following Discourse Meta')).toBeVisible({ timeout: 30_000 });

		await page.getByRole('button', { name: 'See its topics in Feeds' }).click();
		await expect(page.getByRole('tab', { name: 'Forums' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		const pane = page.getByRole('tabpanel', { name: 'Forums' });
		const cards = pane.locator('.topic');
		await expect(cards).toHaveCount(4, { timeout: 20_000 });
		await expect(page.getByRole('heading', { level: 2 })).toContainText('active topics · 1 forum');
		await expect(cards.first()).toContainText('New topic');
		await expect(cards.first()).toContainText('Discourse Meta');

		const firstTitle = (await cards.first().locator('.ttl').textContent())!.trim();
		await cards.first().click();
		await expect
			.poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened))
			.toEqual([expect.stringMatching(new RegExp(`^${BASE}/t/[^/]+/\\d+$`))]);
		await expect(pane.locator('.topic', { hasText: firstTitle })).toContainText('No new replies');

		// Forum topics stay out of Everything unless asked for.
		await page.getByRole('tab', { name: 'Everything' }).click();
		await expect(page.getByRole('tabpanel', { name: 'Everything' }).locator('.topic')).toHaveCount(
			0
		);

		// ...and in it, by time, once the reader turns that on.
		await page.goto('/you/settings');
		await page.getByRole('switch', { name: 'Show forum topics in Everything' }).click();
		await page.goto('/feeds');
		await expect(page.getByRole('tabpanel', { name: 'Everything' }).locator('.topic')).toHaveCount(
			4
		);
	});

	test('says a members-only forum is one, and follows nothing', async ({ page }) => {
		await forumRoutes(page, 'basic-info-members-only.json');
		await findForum(page);
		await expect(page.getByText('This forum is members-only.')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByRole('button', { name: /^Follow / })).toHaveCount(0);
	});

	test('the forums screen sets how often a forum is checked, and unfollows it', async ({
		page
	}) => {
		await forumRoutes(page);
		await findForum(page);
		await page.getByRole('button', { name: 'Follow Discourse Meta' }).click({ timeout: 30_000 });
		await expect(page.getByText('Following Discourse Meta')).toBeVisible({ timeout: 30_000 });

		await page.goto('/you');
		await page.getByRole('link', { name: /^Forums/ }).click();
		await expect(page.getByRole('heading', { name: 'Forums', level: 2 })).toBeVisible();
		const forum = page.getByRole('region', { name: 'Discourse Meta' });
		await expect(forum).toContainText('The whole forum');
		await forum.getByLabel('Check for new topics').selectOption('24');
		await page.reload();
		await expect(
			page.getByRole('region', { name: 'Discourse Meta' }).getByLabel('Check for new topics')
		).toHaveValue('24');

		await page.getByRole('button', { name: 'Unfollow Discourse Meta' }).click();
		await page.getByRole('button', { name: 'Unfollow', exact: true }).click();
		await expect(page.getByText(/No forums yet/)).toBeVisible();
	});
});
