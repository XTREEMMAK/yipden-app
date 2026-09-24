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

/**
 * Reads the average color of a small block near the canvas's left and right edges. With both
 * members' photos forced to fail (see `withAbortedImages`), the hero paints a single flat
 * placeholder color per member, so the whole canvas is one uniform color outside of a
 * transition, and a transition's wipe front is the only thing that can make the two edges
 * differ. `readPixels` is safe here: a flat color uploaded via `texImage2D` from a plain byte
 * array never taints the canvas the way a real cross-origin image would.
 *
 * Reading from a plain `page.evaluate()` call reliably comes back black: this context has no
 * `preserveDrawingBuffer`, so the browser is free to clear the drawing buffer once a frame has
 * been presented, and by the time a separate macrotask runs, it usually has been. A read from
 * inside `requestAnimationFrame` lands in the same frame the hero's own ambient loop just drew,
 * before any of that clearing happens.
 */
async function edgeColors(page: Page): Promise<{ left: number[]; right: number[] }> {
	return page.evaluate(() => {
		return new Promise<{ left: number[]; right: number[] }>((resolve) => {
			requestAnimationFrame(() => {
				const canvas = document.querySelector('canvas.gl') as HTMLCanvasElement;
				const gl = canvas.getContext('webgl') as WebGLRenderingContext;
				const read = (x: number) => {
					const size = 4;
					const y = Math.max(0, Math.floor(canvas.height / 2) - size / 2);
					const out = new Uint8Array(size * size * 4);
					gl.readPixels(x, y, size, size, gl.RGBA, gl.UNSIGNED_BYTE, out);
					let r = 0;
					let g = 0;
					let b = 0;
					for (let i = 0; i < size * size; i += 1) {
						r += out[i * 4];
						g += out[i * 4 + 1];
						b += out[i * 4 + 2];
					}
					return [r / (size * size), g / (size * size), b / (size * size)];
				};
				resolve({ left: read(1), right: read(Math.max(1, canvas.width - 5)) });
			});
		});
	});
}

function distance(a: number[], b: number[]): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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

	test('a photo that fails to load at all still wipes to a solid fallback, every time', async ({
		page
	}) => {
		/*
		 * Real device testing found the case Playwright's mocked routes cannot reproduce (a
		 * mocked cross-origin response loads even with no CORS headers in this engine, unlike a
		 * real browser against a real host): a member photo host that refuses the request
		 * outright. `route.abort()` fails the request at the network level regardless of CORS,
		 * which reliably exercises `onerror`, the path a real unreachable or CORS-refusing host
		 * actually takes.
		 *
		 * Every real ring member photo failing this way used to disable the hero for the rest of
		 * the session after the first failure. It no longer does: a photo that will not load
		 * paints its member's own wash color instead and the wipe keeps running on every member
		 * change, which is what this test now exercises across two consecutive failures.
		 */
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
		);
		await page.route('https://example.com/**', (route) => route.abort());

		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		await expect(heading).toBeVisible();
		const first = await heading.textContent();

		// A failed photo does not disable the hero: the canvas stays up, painted with a fallback.
		await expect.poll(() => canvasIsActive(page)).toBe(true);

		// A second member, whose photo also never loads, still gets its own wipe.
		await page.getByRole('button', { name: 'Next in the ring' }).click();
		await expect(heading).not.toHaveText(first ?? '');
		expect(await canvasIsActive(page)).toBe(true);

		await page.getByRole('button', { name: 'Previous in the ring' }).click();
		await expect(heading).toHaveText(first ?? '');
		expect(await canvasIsActive(page)).toBe(true);

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

	test('the wipe travels from the right for next and the left for previous, matching the text', async ({
		page
	}) => {
		/*
		 * The text ("From the right for next, from the left for previous") was already known to
		 * be correct; the shader's own `dir` uniform was not, since HeroArt.svelte used to hand
		 * it this app's `direction` prop directly, the opposite sign from what the prototype's
		 * wipe math expects. Sampling real pixels mid-transition is the only way to see the
		 * wipe's own direction rather than assuming it from the code, the same reasoning that
		 * drove the boundingBox sampling used elsewhere for the text.
		 *
		 * These two ids are not the shared `RING` fixture's: their wash colors (derived from a
		 * hash of the id) need to be clearly distinct for the color-distance assertions below to
		 * mean anything, and the shared fixture's two ids happen to hash close enough in hue to
		 * be a poor fit for that, coincidentally rather than by any defect.
		 */
		const wipeRing = {
			version: '1.0',
			entries: [
				{ ...RING.entries[0], id: 'member-a-1002' },
				{ ...RING.entries[1], id: 'member-b-1002' }
			]
		};
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(wipeRing)
			})
		);
		await page.route('https://example.com/**', (route) => route.abort());

		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect.poll(() => canvasIsActive(page)).toBe(true);

		const before = await edgeColors(page);
		// At rest the canvas is one flat color; confirms the sampling itself is working.
		expect(distance(before.left, before.right)).toBeLessThan(5);

		/*
		 * Headless Chromium's compositor is not paced to a real display, so the notional 640ms
		 * transition duration (measured against `performance.now()`, the same clock its own rAF
		 * timestamps use) can finish in well under 640ms of real wall time here. A fixed wait
		 * picked to land "mid-transition" is a guess this environment does not honor, so this
		 * polls in short bursts right after the click instead and asks which edge moved away
		 * from its starting color first, which is a real-time-independent question.
		 */
		async function firstDivergence(startColor: number[]): Promise<{ left: number; right: number }> {
			let left = -1;
			let right = -1;
			for (let i = 0; i < 40 && (left < 0 || right < 0); i += 1) {
				const sample = await edgeColors(page);
				// A near-black reading is the known readPixels-from-a-cleared-buffer artifact,
				// not a real frame; every wash color here is far enough from black to tell apart.
				if (
					left < 0 &&
					distance(sample.left, [0, 0, 0]) > 15 &&
					distance(sample.left, startColor) > 20
				) {
					left = i;
				}
				if (
					right < 0 &&
					distance(sample.right, [0, 0, 0]) > 15 &&
					distance(sample.right, startColor) > 20
				) {
					right = i;
				}
				await page.waitForTimeout(10);
			}
			return { left, right };
		}

		await page.getByRole('button', { name: 'Next in the ring' }).click();
		const next = await firstDivergence(before.left);
		expect(next.right).toBeGreaterThanOrEqual(0);
		expect(next.left).toBeGreaterThanOrEqual(0);
		// Next: the right edge is where the incoming color shows up first.
		expect(next.right).toBeLessThanOrEqual(next.left);

		await expect
			.poll(async () => distance((await edgeColors(page)).left, before.left))
			.toBeGreaterThan(20);
		const afterNext = await edgeColors(page);

		await page.getByRole('button', { name: 'Previous in the ring' }).click();
		const prev = await firstDivergence(afterNext.left);
		expect(prev.left).toBeGreaterThanOrEqual(0);
		expect(prev.right).toBeGreaterThanOrEqual(0);
		// Previous is the reverse: the left edge leads, back toward the original color.
		expect(prev.left).toBeLessThanOrEqual(prev.right);
	});
});
