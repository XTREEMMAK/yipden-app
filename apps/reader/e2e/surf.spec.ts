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

/** Discover's ring button is where the webrings and Surf are chosen, one segment each. */
async function choose(page: Page, kind: 'Webrings' | 'Surf', name: RegExp) {
	await page.getByRole('button', { name: /^What to discover/ }).click();
	await page
		.getByRole('radiogroup', { name: 'What to discover' })
		.getByRole('radio', { name: kind })
		.click();
	await page.getByRole('radiogroup', { name: kind }).getByRole('radio', { name }).click();
}

async function search(page: Page, text: string) {
	await page.getByRole('button', { name: 'Search sites' }).click();
	await page.getByRole('searchbox', { name: 'Search sites' }).fill(text);
}

test('Surf is chosen beside the rings, takes only the bar above its cards, and is remembered', async ({
	page
}) => {
	await openDiscover(page);
	const switcher = page.getByRole('button', { name: /^What to discover/ });
	await expect(switcher).toHaveAttribute('aria-label', 'What to discover: IndieNodes');

	await choose(page, 'Surf', /^All sites/);
	await expect(surf(page)).toBeVisible();
	await expect(switcher).toHaveAttribute('aria-label', 'What to discover: Surf');
	await expect(surf(page).getByRole('heading', { name: 'Medjed' })).toBeVisible();
	// The ring's own controls are not on top of Surf; Surf's search and filter are, in their place.
	await expect(page.getByRole('button', { name: 'Shuffle the ring' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Filter sites' })).toBeVisible();

	// Nothing of Surf's own sits between the bar and the list.
	const bar = (await switcher.boundingBox())!;
	const list = (await surf(page).locator('.scroll').boundingBox())!;
	expect(list.y).toBeLessThan(bar.y + bar.height + 12);

	await page.reload();
	await expect(surf(page)).toBeVisible();

	await choose(page, 'Webrings', /IndieNodes/);
	await expect(surf(page)).toBeHidden();
	await expect(page.getByRole('button', { name: 'Shuffle the ring' })).toBeVisible();
});

test('a category narrows Surf, from the row or the sheet, and search finds a site by its tags', async ({
	page
}) => {
	await openDiscover(page);
	await choose(page, 'Surf', /^All sites/);

	const categories = surf(page).getByRole('radiogroup', { name: 'Category' });
	await categories.getByRole('radio', { name: /^Webrings/ }).click();
	await expect(surf(page).getByRole('heading', { level: 3 })).toHaveText(['Deltaring']);
	await expect(page.getByRole('button', { name: 'Filter sites: on' })).toBeVisible();

	await page.getByRole('button', { name: /^Filter sites/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Filter sites' });
	await sheet.getByRole('radio', { name: /^All sites/ }).click();
	await sheet.getByRole('button', { name: 'Done' }).click();

	await search(page, 'neopets');
	await expect(surf(page).getByRole('heading', { level: 3 })).toHaveText(['shishka shrines']);
	await page.getByRole('button', { name: 'Close search' }).click();
	await expect(surf(page).getByRole('heading', { name: 'Medjed' })).toBeVisible();
});

test('Not for me takes a site out of Surf, with a way back named', async ({ page }) => {
	await openDiscover(page);
	await choose(page, 'Surf', /^All sites/);
	// Alone on screen: a card further down can sit under the next one in the stack.
	await search(page, 'medjed');
	await surf(page).getByRole('button', { name: 'Not for me: Medjed' }).click();
	await expect(surf(page).getByRole('heading', { name: 'Medjed' })).toBeHidden();
	await expect(surf(page).getByText('1 hidden as not for me.')).toBeVisible();
});

test('one clip plays at a time, and none under reduced motion', async ({ page, browser }) => {
	await openDiscover(page);
	await choose(page, 'Surf', /^All sites/);
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
	await choose(calm, 'Surf', /^All sites/);
	await expect(surf(calm).getByRole('heading', { name: 'Medjed' })).toBeVisible();
	await calm.waitForTimeout(500);
	await expect(surf(calm).locator('video')).toHaveCount(0);
	await calm.close();
});

test('a category can be chosen straight from the sheet', async ({ page }) => {
	await openDiscover(page);
	await choose(page, 'Surf', /^Shrines/);
	await expect(surf(page).getByRole('heading', { level: 3 })).toHaveText([
		'shishka shrines',
		'daydream'
	]);
});

test("a card's picture opens its whole preview, which Close and Back both shut", async ({
	page
}) => {
	await openDiscover(page);
	await choose(page, 'Surf', /^All sites/);
	await search(page, 'medjed');
	await surf(page).getByRole('button', { name: 'Preview Medjed' }).click();
	const preview = page.getByRole('dialog', { name: 'Preview of Medjed' });
	await expect(preview).toBeVisible();
	await expect(preview.locator('video')).toHaveCount(1);
	// The preview's clip is the only one: the card under it stops.
	await expect(surf(page).locator('video')).toHaveCount(0);
	await expect(preview.getByRole('button', { name: 'Visit' })).toBeVisible();

	// The button, not the backdrop, which is also a way to close.
	await preview.locator('.acts').getByRole('button', { name: 'Close' }).click();
	await expect(preview).toBeHidden();

	await surf(page).getByRole('button', { name: 'Preview Medjed' }).click();
	await expect(preview).toBeVisible();
	await page.goBack();
	await expect(preview).toBeHidden();
	await expect(surf(page)).toBeVisible();
});
