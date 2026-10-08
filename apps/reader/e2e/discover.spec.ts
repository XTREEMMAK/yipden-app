import { expect, test, type Page } from '@playwright/test';
import { openActions, ringNext, ringPrev } from './support.js';

/**
 * Discover, against a fixed ring.
 *
 * The real ring is intercepted so these tests are deterministic and work offline. A test that
 * depends on someone else's server is a test that fails on a train, and this one would also
 * change its answer whenever a member joins.
 */

const RING = {
	version: '1.0',
	generated_at: '2026-09-22T17:32:39.000Z',
	entries: [
		{
			id: 'audio-one',
			creator: 'Ada Reed',
			type: 'audio',
			form: 'music',
			why: 'Synth music made on broken hardware.',
			tags: ['music', 'synth'],
			thumb_url: 'https://example.com/ada.jpg',
			source_url: 'https://ada.example.com/',
			feeds: [
				{ type: 'rss', url: 'https://ada.example.com/feed.xml', verified: true },
				{ type: 'bluesky', url: 'https://bsky.app/profile/ada/rss', verified: false }
			],
			verification_token: 'a',
			joined_at: '2026-01-01T00:00:00.000Z'
		},
		{
			id: 'comic-two',
			creator: 'Bo Quill',
			type: 'comic',
			why: 'A weekly comic about commuting.',
			tags: ['comic'],
			pages: [{ image_url: 'https://example.com/bo-1.png' }],
			source_url: 'https://bo.example.com/',
			verification_token: 'b',
			joined_at: '2026-02-01T00:00:00.000Z'
		},
		{
			id: 'text-three',
			creator: 'Cy Marsh',
			type: 'text',
			why: 'Essays, slowly.',
			tags: ['writing'],
			excerpts: [{ text: 'A sample.' }],
			source_url: 'https://cy.example.com/',
			verification_token: 'c',
			joined_at: '2026-03-01T00:00:00.000Z'
		}
	]
};

async function withRing(page: Page, body: unknown = RING, status = 200) {
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status,
			contentType: 'application/json',
			headers: { etag: 'W/"test"' },
			body: JSON.stringify(body)
		})
	);
	// Creator images live on creators' own servers. Never fetched in a test.
	await page.route('https://example.com/**', (route) => route.abort());
}

/** Opens the filter sheet and picks one option, same as a reader tapping the Filter button. */
async function chooseFilter(page: Page, label: string) {
	await page.getByRole('button', { name: /^Filter the ring/ }).click();
	await page.getByRole('radio', { name: label, exact: true }).click();
}

test.describe('Discover', () => {
	test.beforeEach(async ({ page }) => {
		await withRing(page);
	});

	test('opens on a member with no input at all', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByRole('button', { name: /Follow all/ })).toBeVisible();
		await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible();
	});

	test('names the same member for everyone on the same day', async ({ page }) => {
		await page.goto('/');
		const first = await page.getByRole('heading', { level: 1 }).textContent();

		await page.reload();
		expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe(first);
	});

	test('walks the ring with the left and right arrow keys', async ({ page }) => {
		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();

		await ringNext(page);
		await expect(heading).not.toHaveText(first ?? '');

		await ringPrev(page);
		await expect(heading).toHaveText(first ?? '');
	});

	test('wraps around rather than dead ending', async ({ page }) => {
		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();

		for (let i = 0; i < 3; i += 1) {
			await ringNext(page);
		}
		await expect(heading).toHaveText(first ?? '');
	});

	test('filters the ring with the chips', async ({ page }) => {
		await page.goto('/');

		await chooseFilter(page, 'Comics');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bo Quill');
		await expect(page.getByRole('button', { name: /^Filter the ring/ })).toHaveAttribute(
			'aria-label',
			'Filter the ring: Comics'
		);
	});

	test('shows where a member publishes, from the feeds the ring gave', async ({ page }) => {
		await page.goto('/');
		await chooseFilter(page, 'Music');

		await expect(page.getByText('Blog', { exact: true })).toBeVisible();
		await expect(page.getByText('Bluesky', { exact: true })).toBeVisible();
	});

	test('follows a member and says so, then stays followed', async ({ page }) => {
		await page.goto('/');
		await chooseFilter(page, 'Music');
		await page.getByRole('button', { name: /Follow all/ }).click();

		await expect(
			page.getByRole('status').filter({ hasText: 'Following Ada Reed in 2 places' })
		).toBeVisible();
		await expect(page.getByRole('button', { name: /Following/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await page.reload();
		await chooseFilter(page, 'Music');
		await expect(page.getByRole('button', { name: /Following/ })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	test('the filter sheet closes on Escape, on a backdrop tap, and returns focus to the trigger', async ({
		page
	}) => {
		await page.goto('/');
		const trigger = page.getByRole('button', { name: /^Filter the ring/ });
		const sheet = page.getByRole('dialog', { name: 'Filter the ring' });

		await trigger.click();
		await expect(sheet).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(sheet).not.toBeVisible();
		await expect(trigger).toBeFocused();

		await trigger.click();
		await expect(sheet).toBeVisible();
		// The backdrop, not the sheet or one of its rows: a tap outside the sheet dismisses it.
		await page.mouse.click(10, 10);
		await expect(sheet).not.toBeVisible();
	});

	test('browses members and jumps straight to the one picked', async ({ page }) => {
		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		const trigger = page.getByRole('button', { name: 'Browse members' });
		const sheet = page.getByRole('dialog', { name: 'Browse members' });

		await trigger.click();
		await expect(sheet).toBeVisible();
		await expect(sheet.getByRole('button', { name: /Cy Marsh/ })).toBeVisible();

		await sheet.getByRole('button', { name: /Cy Marsh/ }).click();
		await expect(sheet).not.toBeVisible();
		await expect(heading).toHaveText('Cy Marsh');
	});

	test('the members sheet closes on Escape and returns focus to the trigger', async ({ page }) => {
		await page.goto('/');
		const trigger = page.getByRole('button', { name: 'Browse members' });
		const sheet = page.getByRole('dialog', { name: 'Browse members' });

		await trigger.click();
		await expect(sheet).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(sheet).not.toBeVisible();
		await expect(trigger).toBeFocused();
	});

	test('the shuffle button turns shuffle back off', async ({ page }) => {
		await page.goto('/');
		const shuffle = page.getByRole('button', { name: 'Shuffle the ring' });

		await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
		await shuffle.click();
		await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
		await shuffle.click();
		await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
	});

	test('the hero drifts slowly while idle', async ({ page }) => {
		await page.goto('/');
		const drift = page.locator('.drift');
		await expect(drift).toBeAttached();
		expect(await drift.evaluate((el) => getComputedStyle(el).animationName)).toBe('hero-drift');

		// It actually moves: the transform differs a moment apart.
		const pose = () => drift.evaluate((el) => getComputedStyle(el).transform);
		const first = await pose();
		await page.waitForTimeout(1500);
		expect(await pose()).not.toBe(first);
	});

	test('Not for me hides a creator, and You can bring them back', async ({ page }) => {
		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();

		await (await openActions(page)).getByRole('button', { name: 'Not for me' }).click();
		await expect(heading).not.toHaveText(first!);

		await page.goto('/you?tab=lists');
		await page.getByRole('tab', { name: /^Not for me/ }).click();
		const row = page.getByRole('button', { name: `Open ${first}` });
		await expect(row).toBeVisible();
		await page.getByRole('button', { name: 'Bring back' }).click();
		await expect(row).toHaveCount(0);
	});

	test('Like is remembered and shows under Liked in You', async ({ page }) => {
		await page.goto('/');
		const first = await page.getByRole('heading', { level: 1 }).textContent();
		await (await openActions(page)).getByRole('button', { name: 'Like', exact: true }).click();
		await expect(await openActions(page)).toContainText('Liked');
		await page.keyboard.press('Escape');

		await page.goto('/you?tab=lists');
		await page.getByRole('tab', { name: /^Liked \d/ }).click();
		await expect(page.getByRole('button', { name: `Open ${first}` })).toBeVisible();
	});

	test('double tapping the creator likes them, with a heart by the name', async ({ page }) => {
		await page.goto('/');
		const name = page.getByRole('heading', { level: 1 });
		const first = (await name.textContent())!.trim();
		await expect(name.getByRole('img', { name: 'Liked' })).toHaveCount(0);

		const box = (await page.locator('.discover').boundingBox())!;
		const at = { x: box.x + box.width / 2, y: box.y + box.height * 0.3 };
		await page.mouse.click(at.x, at.y, { clickCount: 2, delay: 40 });

		await expect(name.getByRole('img', { name: 'Liked' })).toBeVisible();
		await page.goto('/you?tab=lists');
		await page.getByRole('tab', { name: /^Liked \d/ }).click();
		await expect(page.getByRole('button', { name: `Open ${first}` })).toBeVisible();
	});

	test('a single tap does not like, and a double tap never unlikes', async ({ page }) => {
		await page.goto('/');
		const name = page.getByRole('heading', { level: 1 });
		const box = (await page.locator('.discover').boundingBox())!;
		const x = box.x + box.width / 2;
		const y = box.y + box.height * 0.3;

		await page.mouse.click(x, y);
		await page.waitForTimeout(500);
		await expect(name.getByRole('img', { name: 'Liked' })).toHaveCount(0);

		await page.mouse.click(x, y, { clickCount: 2, delay: 40 });
		await expect(name.getByRole('img', { name: 'Liked' })).toBeVisible();
		await page.waitForTimeout(500);
		await page.mouse.click(x, y, { clickCount: 2, delay: 40 });
		await expect(name.getByRole('img', { name: 'Liked' })).toBeVisible();
	});

	test('every control clears the 44px minimum', async ({ page }) => {
		await page.goto('/');

		for (const name of ['Shuffle the ring', 'Filter the ring', 'Browse members']) {
			const box = await page.getByRole('button', { name }).boundingBox();
			expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
			expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		}
	});

	test('white text on the hero is actually white, in both themes', async ({ page }) => {
		for (const scheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.goto('/');

			// The white pill is on a dark hero in both themes, so its label must stay dark.
			const color = await page
				.getByRole('button', { name: /Follow all/ })
				.evaluate((node) => getComputedStyle(node).color);
			expect(color, scheme).toBe('rgb(31, 20, 16)');
		}
	});
});

test.describe('Discover with no network', () => {
	test('says so rather than showing an empty screen', async ({ page }) => {
		await page.route('https://ring.indienodes.us/ring.json', (route) => route.abort());
		await page.goto('/');

		await expect(page.getByText('The ring is quiet.')).toBeVisible();
		await expect(page.getByText(/no saved copy on this phone/)).toBeVisible();
	});

	test('renders the last good copy when the ring cannot be reached', async ({ page }) => {
		await withRing(page);
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		const name = await page.getByRole('heading', { level: 1 }).textContent();

		// Same browser context, so the cached ring is still on the device.
		await page.unroute('https://ring.indienodes.us/ring.json');
		await page.route('https://ring.indienodes.us/ring.json', (route) => route.abort());
		await page.reload();

		await expect(page.getByRole('heading', { level: 1 })).toHaveText(name ?? '');
	});
});

test.describe('a followed member’s own picks', () => {
	test('are one tap from their row on You, and in it, played the way Discover plays them', async ({
		page
	}) => {
		const [ada, ...rest] = RING.entries;
		await withRing(page, {
			...RING,
			entries: [
				{ ...ada, tracks: [{ label: 'Broken Synth', media_url: 'https://example.com/synth.wav' }] },
				...rest
			]
		});
		await page.goto('/');
		await chooseFilter(page, 'Music');
		await page.getByRole('button', { name: /Follow all/ }).click();
		await expect(page.getByRole('status').filter({ hasText: 'Following Ada Reed' })).toBeVisible();

		await page.goto('/you');
		const quick = page.getByRole('button', { name: 'Play: Ada Reed’s own picks' });
		await expect(quick).toBeVisible();
		const box = await quick.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

		// Their settings no longer repeat the picks: the row's own button is the way to them.
		await page.getByRole('button', { name: 'Settings for Ada Reed' }).click();
		await expect(page.locator('.their-picks')).toHaveCount(0);
		await page.keyboard.press('Escape');

		await quick.click();
		await expect(page.getByText('Broken Synth').first()).toBeVisible();
	});

	test('show nothing for a member with nothing of their own to show', async ({ page }) => {
		await withRing(page);
		await page.goto('/');
		await chooseFilter(page, 'Music');
		await page.getByRole('button', { name: /Follow all/ }).click();
		await expect(page.getByRole('status').filter({ hasText: 'Following Ada Reed' })).toBeVisible();

		await page.goto('/you');
		await expect(page.getByRole('button', { name: /own picks$/ })).toHaveCount(0);
	});
});
