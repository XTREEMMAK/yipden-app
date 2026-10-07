import { expect, test, type Page } from '@playwright/test';

/**
 * Discover's Surf side (the sites-surf experiment), against the seed bundled with the app.
 *
 * The ring is intercepted as in discover.spec.ts. Surf itself needs no network: its seed, posters
 * and clips are all part of the build.
 */

const RING = {
	version: '1.0',
	entries: [
		{
			id: 'audio-one',
			creator: 'Ada Reed',
			type: 'audio',
			form: 'music',
			why: 'Synth music made on broken hardware.',
			tags: ['music'],
			source_url: 'https://ada.example.com/'
		},
		{
			id: 'comic-two',
			creator: 'Bo Quill',
			type: 'comic',
			why: 'A weekly comic about commuting.',
			tags: ['comic'],
			source_url: 'https://bo.example.com/'
		}
	]
};

async function openDiscover(page: Page) {
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
	);
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

const surf = (page: Page) => page.getByRole('region', { name: 'Surf: sites' });

test('People | Surf switches between the ring and the sites, and is remembered', async ({
	page
}) => {
	await openDiscover(page);
	const switcher = page.getByRole('radiogroup', { name: 'What to discover' });
	await expect(switcher.getByRole('radio', { name: 'People' })).toHaveAttribute(
		'aria-checked',
		'true'
	);

	await switcher.getByRole('radio', { name: 'Surf' }).click();
	await expect(surf(page)).toBeVisible();
	await expect(surf(page).getByRole('heading', { name: 'Medjed' })).toBeVisible();
	// The ring's own controls are not on top of Surf, and the ring does not move under it.
	await expect(page.getByRole('button', { name: 'Shuffle the ring' })).toBeHidden();

	await page.reload();
	await expect(surf(page)).toBeVisible();

	await page.getByRole('radio', { name: 'People' }).click();
	await expect(surf(page)).toBeHidden();
	await expect(page.getByRole('button', { name: 'Shuffle the ring' })).toBeVisible();
});

test('a category narrows Surf, and search finds a site by its tags', async ({ page }) => {
	await openDiscover(page);
	await page.getByRole('radio', { name: 'Surf' }).click();

	const categories = surf(page).getByRole('radiogroup', { name: 'Category' });
	await categories.getByRole('radio', { name: /^Webrings/ }).click();
	await expect(surf(page).getByRole('heading', { level: 3 })).toHaveText(['Deltaring']);

	await categories.getByRole('radio', { name: 'All' }).click();
	await surf(page).getByRole('searchbox', { name: 'Search sites' }).fill('neopets');
	await expect(surf(page).getByRole('heading', { level: 3 })).toHaveText(['shishka shrines']);
});

test('Not for me takes a site out of Surf, with a way back named', async ({ page }) => {
	await openDiscover(page);
	await page.getByRole('radio', { name: 'Surf' }).click();
	// Alone on screen: a card further down can sit under the next one in the stack.
	await surf(page).getByRole('searchbox', { name: 'Search sites' }).fill('medjed');
	await surf(page).getByRole('button', { name: 'Not for me: Medjed' }).click();
	await expect(surf(page).getByRole('heading', { name: 'Medjed' })).toBeHidden();
	await expect(surf(page).getByText('1 hidden as not for me.')).toBeVisible();
});

test('one clip plays at a time, and none under reduced motion', async ({ page, browser }) => {
	await openDiscover(page);
	await page.getByRole('radio', { name: 'Surf' }).click();
	// The first site has no clip; the next one plays once its preview is mostly on screen.
	await expect(surf(page).getByRole('heading', { name: 'I Have a New Hobby' })).toBeVisible();
	await surf(page)
		.locator('.scroll')
		.evaluate((el) => el.scrollBy(0, 420));
	await expect(surf(page).locator('video')).toHaveCount(1);
	await surf(page)
		.locator('.scroll')
		.evaluate((el) => el.scrollBy(0, 500));
	await expect(surf(page).locator('video')).toHaveCount(1);

	const calm = await browser.newPage({ reducedMotion: 'reduce' });
	await openDiscover(calm);
	await calm.getByRole('radio', { name: 'Surf' }).click();
	await expect(surf(calm).getByRole('heading', { name: 'Medjed' })).toBeVisible();
	await calm.waitForTimeout(500);
	await expect(surf(calm).locator('video')).toHaveCount(0);
	await calm.close();
});
