import { expect, test, type Page } from '@playwright/test';

/**
 * Discover's per-type preview button: audio plays, comics, art and text open a viewer, a game
 * with a trailer links out, and a member with nothing to preview has no button at all.
 */

const member = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
	id,
	creator: `Creator ${id}`,
	type,
	why: `Why ${id}.`,
	tags: [],
	source_url: `https://${id}.example.com/`,
	verification_token: id,
	joined_at: '2026-01-01T00:00:00.000Z',
	...extra
});

const RING = {
	version: '1.0',
	entries: [
		member('aud', 'audio', {
			form: 'music',
			tracks: [{ label: 'Only Track', media_url: 'https://example.com/only.wav' }]
		}),
		member('cmc', 'comic', {
			pages: [
				{ image_url: 'https://example.com/p1.png', caption: 'First page' },
				{ image_url: 'https://example.com/p2.png', caption: 'Second page' }
			]
		}),
		member('art', 'art', {
			artworks: [
				{
					image_url: 'https://example.com/a1.png',
					alt: 'A pond',
					year: '2023',
					medium: 'pixel art'
				}
			]
		}),
		member('txt', 'text', { excerpts: [{ title: 'Opening', text: 'It was a quiet morning.' }] }),
		member('gmt', 'game', { trailer_url: 'https://example.com/trailer' }),
		member('gm0', 'game')
	]
};

async function seed(page: Page) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
	);
	await page.route('https://example.com/*.wav', (route) =>
		route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.alloc(44) })
	);
	await page.route('https://example.com/*.png', (route) => route.abort());
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Walks to a member by name with Next, since which one opens first depends on the day. */
async function showMember(page: Page, creator: string) {
	const heading = page.getByRole('heading', { level: 1 });
	for (let i = 0; i < RING.entries.length; i += 1) {
		// Wait for the name on screen to be a settled one: the outgoing text leaves first, then the
		// next arrives, so a read mid change can see nothing or the old name.
		await expect(heading).toHaveCount(1);
		await page.waitForTimeout(700);
		if ((await heading.textContent()) === creator) return;
		await page.getByRole('button', { name: 'Next in the ring' }).click();
	}
	await expect(heading).toHaveText(creator);
}

test.describe('Discover previews', () => {
	test('an audio member has a Play button that starts the player', async ({ page }) => {
		await seed(page);
		await showMember(page, 'Creator aud');
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Only Track' })).toBeVisible();
	});

	test('a comic opens a viewer of its pages, closed with Escape', async ({ page }) => {
		await seed(page);
		await showMember(page, 'Creator cmc');
		await page.getByRole('button', { name: 'Read a preview' }).click();

		const viewer = page.getByRole('dialog', { name: /preview/ });
		await expect(viewer).toBeVisible();
		await expect(viewer.getByText('1 / 2')).toBeVisible();
		await expect(viewer.getByText('First page')).toBeVisible();
		await expect(viewer.getByText('Second page')).toBeAttached();

		await page.keyboard.press('Escape');
		await expect(viewer).not.toBeVisible();
	});

	test('art shows its caption, and text shows its excerpt', async ({ page }) => {
		await seed(page);
		await showMember(page, 'Creator art');
		await page.getByRole('button', { name: 'View artwork' }).click();
		await expect(page.getByRole('dialog').getByText('pixel art · 2023')).toBeVisible();
		await page.getByRole('button', { name: 'Close preview' }).click();

		await showMember(page, 'Creator txt');
		await page.getByRole('button', { name: 'Read a sample' }).click();
		await expect(page.getByRole('dialog').getByText('It was a quiet morning.')).toBeVisible();
	});

	test('a game with a trailer offers it, and one with nothing has no preview button', async ({
		page
	}) => {
		await seed(page);
		await showMember(page, 'Creator gmt');
		await expect(page.getByRole('button', { name: 'Watch trailer' })).toBeVisible();

		await showMember(page, 'Creator gm0');
		await expect(page.getByRole('button', { name: 'Visit site' })).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Play|Read a|View artwork|Watch trailer|^Preview/ })
		).toHaveCount(0);
	});

	test('the position is shown once, with no origin chip', async ({ page }) => {
		await seed(page);
		await page.getByRole('button', { name: 'Next in the ring' }).click();
		await expect(page.getByText('IndieNodes webring')).toHaveCount(0);
		await expect(page.getByText(/^\d+ \/ 6$/)).toBeVisible();
		await expect(page.getByText(/Ring ·/)).toHaveCount(0);
		await expect(page.getByText(/in the ring/)).toHaveCount(0);
	});

	test('the preview and visit buttons are icons, and every control clears 44px', async ({
		page
	}) => {
		await seed(page);
		await showMember(page, 'Creator cmc');
		const button = page.getByRole('button', { name: 'Read a preview' });
		await expect(button).toHaveText('');
		await expect(page.getByRole('button', { name: 'Visit site' })).toHaveText('');
		for (const name of ['Read a preview', 'Visit site']) {
			const box = (await page.getByRole('button', { name }).boundingBox())!;
			expect(box.width, name).toBeGreaterThanOrEqual(44);
			expect(box.height, name).toBeGreaterThanOrEqual(44);
		}
		await button.click();
		await page.waitForTimeout(600); // the sheet has finished flying in; measure it at rest
		const close = (await page.getByRole('button', { name: 'Close preview' }).boundingBox())!;
		expect(close.width).toBeGreaterThanOrEqual(44);
		expect(close.height).toBeGreaterThanOrEqual(44);
	});

	test('a new member arrives line by line, each a beat after the one above', async ({ page }) => {
		await seed(page);
		const name = page.getByRole('heading', { level: 1 });
		const actions = page.locator('.body-inner:not([aria-hidden]) .actions');
		await page.getByRole('button', { name: 'Next in the ring' }).click();

		// While the lines fly in, the name is nearer its place than the actions row is.
		let lead = 0;
		for (let i = 0; i < 40; i += 1) {
			const n = await name.boundingBox({ timeout: 500 }).catch(() => null);
			const a = await actions.boundingBox({ timeout: 500 }).catch(() => null);
			if (n && a) lead = Math.max(lead, a.x - n.x);
			await page.waitForTimeout(25);
		}
		expect(lead).toBeGreaterThan(8);
	});

	test('dismissing the mini player eases the text down instead of popping it', async ({ page }) => {
		await seed(page);
		await showMember(page, 'Creator aud');
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await page.getByRole('button', { name: 'Collapse the player' }).click();
		await expect(page.getByRole('button', { name: 'Open the player' })).toBeVisible();
		await page.waitForTimeout(500);

		const count = page.locator('.count');
		const before = (await count.boundingBox())!.y;
		await page.getByRole('button', { name: 'Stop and close the player' }).click();
		const seen: number[] = [];
		for (let i = 0; i < 16; i += 1) {
			seen.push((await count.boundingBox())!.y);
			await page.waitForTimeout(25);
		}
		const after = seen[seen.length - 1]!;
		expect(after).toBeGreaterThan(before + 20); // the dock really did shrink
		// At least one sample sits strictly between start and end: it travelled, it did not jump.
		expect(seen.some((y) => y > before + 4 && y < after - 4)).toBe(true);
	});
});
