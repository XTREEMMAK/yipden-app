import { expect, test, type Page } from '@playwright/test';

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

test.describe('Discover', () => {
	test.beforeEach(async ({ page }) => {
		await withRing(page);
	});

	test('opens on a member with no input at all', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByRole('button', { name: /Follow everything/ })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Visit site' })).toBeVisible();
	});

	test('names the same member for everyone on the same day', async ({ page }) => {
		await page.goto('/');
		const first = await page.getByRole('heading', { level: 1 }).textContent();

		await page.reload();
		expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe(first);
	});

	test('walks the ring with the next and previous buttons', async ({ page }) => {
		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();

		await page.getByRole('button', { name: 'Next in the ring' }).click();
		await expect(heading).not.toHaveText(first ?? '');

		await page.getByRole('button', { name: 'Previous in the ring' }).click();
		await expect(heading).toHaveText(first ?? '');
	});

	test('wraps around rather than dead ending', async ({ page }) => {
		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();

		for (let i = 0; i < 3; i += 1) {
			await page.getByRole('button', { name: 'Next in the ring' }).click();
		}
		await expect(heading).toHaveText(first ?? '');
	});

	/** Opens the filter sheet and picks one option, same as a reader tapping the Filter button. */
	async function chooseFilter(page: Page, label: string) {
		await page.getByRole('button', { name: /^Filter the ring/ }).click();
		await page.getByRole('radio', { name: label, exact: true }).click();
	}

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
		await page.getByRole('button', { name: /Follow everything/ }).click();

		await expect(page.getByRole('status')).toContainText('Following Ada Reed in 2 places');
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

	test('every control clears the 44px minimum', async ({ page }) => {
		await page.goto('/');

		for (const name of [
			'Shuffle the ring',
			'Next in the ring',
			'Previous in the ring',
			'Filter the ring'
		]) {
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
				.getByRole('button', { name: /Follow everything/ })
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
