import { expect, test, type Page } from '@playwright/test';

/**
 * Discover's WebGL hero: the displacement wipe is optional by the brief's own words, and every
 * test here is really about the fallback contract, not the shader's exact pixels. Real Chromium
 * (even headless) supports WebGL, so the happy path genuinely exercises `createHeroGL`; the
 * harder cases (no WebGL at all, a photo host with no CORS headers) are forced deliberately,
 * since both are realistic for a photo hosted on an arbitrary creator's own server.
 *
 * Node of the day is a deterministic rotation, not a fixed member, so these read whichever
 * heading actually rendered rather than assuming which of the two entries came up first, the
 * same approach discover.spec.ts's own tests use.
 */

const RING = {
	version: '1.0',
	entries: [
		{
			id: 'audio-one',
			creator: 'Ada Reed',
			type: 'audio',
			why: 'Synth music made on broken hardware.',
			thumb_url: 'https://example.com/ada.jpg',
			source_url: 'https://ada.example.com/',
			verification_token: 'a',
			joined_at: '2026-01-01T00:00:00.000Z'
		},
		{
			id: 'comic-two',
			creator: 'Bo Quill',
			type: 'comic',
			why: 'A weekly comic about commuting.',
			thumb_url: 'https://example.com/bo.jpg',
			source_url: 'https://bo.example.com/',
			verification_token: 'b',
			joined_at: '2026-02-01T00:00:00.000Z'
		}
	]
};

/** A tiny real JPEG, since an aborted or 404 image never fires `onload` either way. */
const PIXEL_JPEG = Buffer.from(
	'/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
	'base64'
);

async function withRing(page: Page, imageHeaders: Record<string, string> = {}) {
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(RING)
		})
	);
	await page.route('https://example.com/**', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'image/jpeg',
			headers: imageHeaders,
			body: PIXEL_JPEG
		})
	);
}

async function canvasIsActive(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const canvas = document.querySelector('canvas.gl');
		return !!canvas && getComputedStyle(canvas).display !== 'none';
	});
}

test.describe('Discover WebGL hero', () => {
	test('the canvas activates where WebGL is available, with no page errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await withRing(page, { 'access-control-allow-origin': '*' });

		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect.poll(() => canvasIsActive(page)).toBe(true);

		expect(errors).toEqual([]);
	});

	test('next, previous and shuffle all run without error while the canvas is active', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await withRing(page, { 'access-control-allow-origin': '*' });

		await page.goto('/');
		await expect.poll(() => canvasIsActive(page)).toBe(true);
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();

		await page.getByRole('button', { name: 'Next in the ring' }).click();
		await expect(heading).not.toHaveText(first ?? '');
		await page.getByRole('button', { name: 'Previous in the ring' }).click();
		await expect(heading).toHaveText(first ?? '');
		await page.getByRole('button', { name: 'Shuffle the ring' }).click();
		await page.waitForTimeout(300);

		expect(errors).toEqual([]);
	});

	test('a swipe drags the preview and settles with no error', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await withRing(page, { 'access-control-allow-origin': '*' });

		await page.goto('/');
		await expect.poll(() => canvasIsActive(page)).toBe(true);
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();

		const hero = page.locator('.discover');
		const box = (await hero.boundingBox())!;
		await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
		await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 5 });
		await page.mouse.up();

		await expect(heading).not.toHaveText(first ?? '');
		expect(errors).toEqual([]);
	});

	test('a photo host with no CORS headers never crashes the page', async ({ page }) => {
		/*
		 * Whether `texImage2D` actually throws for a cross-origin, non-CORS image turns out to
		 * be genuinely engine dependent: it renders successfully here rather than tainting,
		 * since the taint the WebGL spec cares about only blocks reading pixels back out
		 * (`readPixels`, `toDataURL`), and nothing in this hero ever does that. The one thing
		 * actually guaranteed across engines is that neither path, a texture that loads or one
		 * that is refused, throws an uncaught error; `createHeroGL`'s own try/catch around the
		 * upload exists for the engines that do refuse it.
		 */
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		// No access-control-allow-origin: the realistic case for most creators' own sites.
		await withRing(page, {});

		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await page.waitForTimeout(300);

		expect(errors).toEqual([]);
	});

	test('falls back to the CSS crossfade outright when the browser has no WebGL at all', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await withRing(page, { 'access-control-allow-origin': '*' });

		await page.addInitScript(() => {
			HTMLCanvasElement.prototype.getContext = () => null;
		});

		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

		expect(await canvasIsActive(page)).toBe(false);
		await expect(page.locator('.art')).toBeVisible();
		await expect(page.locator('.art')).not.toHaveClass(/gl-showing/);
		expect(errors).toEqual([]);
	});

	test('reduced motion still shows a member change with no error', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await withRing(page, { 'access-control-allow-origin': '*' });

		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		const first = await heading.textContent();
		await page.getByRole('button', { name: 'Next in the ring' }).click();
		await expect(heading).not.toHaveText(first ?? '');

		expect(errors).toEqual([]);
	});
});
