import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Discover's people from more than the ring (DECISIONS.md, 2026-10-14), with the directory's real
 * test seed served from yipden.com's address: Jericho George, and an example person who opted out
 * and must never appear. Also the start page, and a creator list added in Settings.
 */

const seed = (name: string) =>
	readFileSync(new URL(`../../../directory/seed/${name}`, import.meta.url), 'utf8');

const RING = {
	version: '1.0',
	entries: [
		{
			id: 'comic-ada',
			creator: 'Ada Reed',
			type: 'comic',
			why: 'Comics about the sea.',
			source_url: 'https://ada.example.com/',
			feeds: [{ type: 'rss', url: 'https://ada.example.com/feed.xml' }],
			verification_token: 't1',
			joined_at: '2026-01-01T00:00:00.000Z'
		}
	]
};

async function routes(page: Page, extra: (page: Page) => Promise<void> = async () => {}) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: '' }));
	const json = (body: string) => ({ status: 200, contentType: 'application/json', body });
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill(json(JSON.stringify(RING)))
	);
	await page.route('https://yipden.com/directory/people.json', (route) =>
		route.fulfill(json(seed('people.test.json')))
	);
	await page.route('https://yipden.com/directory/optouts.json', (route) =>
		route.fulfill(json(seed('optouts.test.json')))
	);
	await page.route('https://example.com/**', (route) => route.abort());
	await extra(page);
}

async function filterTo(page: Page, label: string) {
	await page.getByRole('button', { name: /^Filter Discover/ }).click();
	await page.getByRole('radio', { name: label, exact: true }).click();
}

test.describe('Discover’s people', () => {
	test('a person YipDen listed is labelled, can say “Is this you?”, and the opted-out never shows', async ({
		page
	}) => {
		await routes(page);
		await page.goto('/');
		await filterTo(page, 'Watch');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Jericho George/);
		await expect(page.getByText('Listed by YipDen')).toBeVisible();
		await expect(
			page.getByRole('button', { name: /^Is this you, Jericho George\?/ })
		).toBeVisible();

		// Walk everyone: the example who opted out is never among them.
		await filterTo(page, 'Any');
		await page.getByRole('button', { name: 'Browse people' }).click();
		const list = page.getByRole('dialog');
		await expect(list.getByText('Jericho George')).toBeVisible();
		await expect(list.getByText('Ada Reed')).toBeVisible();
		await expect(list.getByText('Opted Out Example')).toHaveCount(0);
	});

	test('a debug build places a cover live and gives the line to paste', async ({ page }) => {
		await routes(page);
		await page.goto('/');
		await filterTo(page, 'Watch');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Jericho George/);
		await page.getByRole('button', { name: 'Place cover' }).click();

		const panel = page.getByRole('group', { name: /Place Jericho George.s cover/ });
		// Starts from the listing's own position (the seed's), not the centre.
		await expect(panel.locator('code')).toHaveText('"thumb_position": { "x": 78, "y": 35 }');
		await panel.getByRole('slider').first().fill('20');
		await expect(panel.locator('code')).toHaveText('"thumb_position": { "x": 20, "y": 35 }');
		await panel.getByRole('button', { name: 'Centre' }).click();
		await expect(panel.locator('code')).toHaveText('"thumb_position": { "x": 50, "y": 50 }');

		await panel.getByRole('button', { name: 'Done' }).click();
		await expect(panel).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Place cover' })).toBeVisible();
	});

	test('a ring member says so, and offers no removal link', async ({ page }) => {
		await routes(page);
		await page.goto('/');
		await filterTo(page, 'Comics');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Ada Reed/);
		await expect(page.getByText('IndieNodes member')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Is this you/ })).toHaveCount(0);
	});

	test('nobody from the directory shows when the opt-out list cannot be read', async ({ page }) => {
		await routes(page, async (p) => {
			await p.route('https://yipden.com/directory/optouts.json', (route) =>
				route.fulfill({ status: 500, body: '' })
			);
		});
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Ada Reed/);
		await expect(page.getByText('Jericho George')).toHaveCount(0);
	});
});

test.describe('the start page', () => {
	test('opens Discover while following no one, Yips after, and the setting wins next launch', async ({
		page
	}) => {
		await routes(page);
		await page.goto('/');
		await expect(page).toHaveURL(/\/$/);

		await filterTo(page, 'Comics');
		await page.getByRole('button', { name: /Follow all/ }).click();
		await expect(page.getByRole('button', { name: /Following/ })).toBeVisible({ timeout: 15_000 });

		await page.goto('/');
		await expect(page).toHaveURL(/\/feeds/);

		await page.goto('/you/settings?s=discover');
		const start = page.getByRole('radiogroup', { name: 'Start on' });
		await start.getByRole('radio', { name: 'Discover' }).click();
		await expect(page).toHaveURL(/\/you\/settings/);

		await page.goto('/');
		await page.waitForTimeout(500);
		await expect(page).toHaveURL(/\/$/);
	});
});

test.describe('pictures', () => {
	test('a followed person’s avatar is drawn with no referrer, which YouTube’s avatar host needs', async ({
		page
	}) => {
		await routes(page);
		await page.goto('/');
		await filterTo(page, 'Watch');
		await page.getByRole('button', { name: /Follow all/ }).click();
		await expect(page.getByRole('button', { name: /Following/ })).toBeVisible({ timeout: 15_000 });

		await page.goto('/you');
		// In the app the page is https://localhost/, and yt3.googleusercontent.com refuses that
		// referrer (429). A CSS background cannot drop it; an <img> can.
		const avatar = page.locator('img[src="https://jerichords.carrd.co/assets/images/card.jpg"]');
		await expect(avatar.first()).toHaveAttribute('referrerpolicy', 'no-referrer');
	});
});

test.describe('creator lists a reader adds', () => {
	test('a list added in Settings brings its people into Discover, labelled with its name', async ({
		page
	}) => {
		const LIST = 'https://friend.example.org/creators.json';
		const people = {
			version: '1.0',
			entries: [
				{
					id: 'mo-kim',
					name: 'Mo Kim',
					site_url: 'https://mo.example.org/',
					tags: ['games'],
					feeds: [
						{ type: 'youtube', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCmokim' }
					]
				}
			]
		};
		await routes(page, async (p) => {
			await p.route(LIST, (route) =>
				route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(people)
				})
			);
		});

		await page.goto('/you/settings?s=discover');
		await page.getByLabel('Address').fill(LIST);
		await page.getByLabel('Name (optional)').fill('A friend’s picks');
		await page.getByRole('button', { name: 'Add list' }).click();
		await expect(page.getByRole('switch', { name: 'A friend’s picks' })).toBeVisible();

		await page.goto('/');
		await page.getByRole('button', { name: 'Browse people' }).click();
		await expect(page.getByRole('dialog').getByText('Mo Kim')).toBeVisible();
		await page.getByRole('dialog').getByText('Mo Kim').click();
		await expect(page.getByText('From A friend’s picks')).toBeVisible();

		// A wrong address is said at once.
		await page.goto('/you/settings?s=discover');
		await page.getByLabel('Address').fill('https://nothing.example.org/list.json');
		await page.getByRole('button', { name: 'Add list' }).click();
		await expect(page.getByRole('alert')).toBeVisible();
	});
});
