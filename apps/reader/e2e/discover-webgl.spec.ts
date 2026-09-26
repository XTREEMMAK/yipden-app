import { deflateSync } from 'node:zlib';
import { expect, test, type Page, type Route } from '@playwright/test';

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

/** A 4x4 solid-color PNG built by hand, so the wipe test has real, readable photo pixels. */
function solidPng(r: number, g: number, b: number): Buffer {
	return pixelPng(4, 4, () => [r, g, b]);
}

/** A PNG built by hand from a per-pixel color function. */
function pixelPng(
	width: number,
	height: number,
	color: (x: number, y: number) => [number, number, number]
): Buffer {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buf: Buffer) => {
		let c = 0xffffffff;
		for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const out = Buffer.alloc(12 + data.length);
		out.writeUInt32BE(data.length, 0);
		body.copy(out, 4);
		out.writeUInt32BE(crc(body), 8 + data.length);
		return out;
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	const rows: Buffer[] = [];
	for (let y = 0; y < height; y += 1) {
		const pixels: number[] = [0];
		for (let x = 0; x < width; x += 1) pixels.push(...color(x, y));
		rows.push(Buffer.from(pixels));
	}
	const raw = Buffer.concat(rows);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

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
		return !!canvas && canvas.classList.contains('active');
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

	test('keeps the cover in the snapshot without retaining Discover in live layout', async ({
		page
	}) => {
		await withRing(page, { 'access-control-allow-origin': '*' });
		await page.goto('/');
		await expect.poll(() => canvasIsActive(page)).toBe(true);

		/*
		 * The cover must be present when the old snapshot is captured, but the live Discover route
		 * must be removed before that transition is ready to animate the incoming page. A global
		 * creator outro used to retain the full-height route for ~400ms and displace the next page.
		 */
		await page.evaluate(() => {
			const original = document.startViewTransition!.bind(document);
			const win = window as unknown as {
				navMeasure?: {
					artDisplay: string;
					canvasDisplay: string;
					removedAfter?: number;
					readyAfter?: number;
				};
			};
			const intercept = (update: () => void | Promise<void>) => {
				const started = performance.now();
				const art = document.querySelector('.art');
				const canvas = document.querySelector('canvas.gl');
				const measure = (win.navMeasure = {
					artDisplay: art ? getComputedStyle(art).display : 'missing',
					canvasDisplay: canvas ? getComputedStyle(canvas).display : 'missing'
				});
				const observer = new MutationObserver(() => {
					if (!document.querySelector('.discover')) {
						measure.removedAfter = performance.now() - started;
						observer.disconnect();
					}
				});
				observer.observe(document.body, { childList: true, subtree: true });
				const transition = original(update);
				void transition.ready.then(() => {
					measure.readyAfter = performance.now() - started;
				});
				return transition;
			};
			Object.defineProperty(document, 'startViewTransition', {
				configurable: true,
				value: intercept
			});
		});

		await page.getByRole('link', { name: 'Feeds', exact: true }).click();
		await expect(page).toHaveURL(/feeds/);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window as unknown as {
								navMeasure?: { removedAfter?: number; readyAfter?: number };
							}
						).navMeasure
				)
			)
			.toMatchObject({ removedAfter: expect.any(Number), readyAfter: expect.any(Number) });

		const measure = await page.evaluate(
			() =>
				(
					window as unknown as {
						navMeasure: {
							artDisplay: string;
							canvasDisplay: string;
							removedAfter: number;
							readyAfter: number;
						};
					}
				).navMeasure
		);
		expect(measure.artDisplay).not.toBe('none');
		expect(measure.canvasDisplay).not.toBe('none');
		expect(measure.removedAfter).toBeLessThan(measure.readyAfter);
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

	test('a photo the canvas cannot draw is shown by the CSS layer, never a flat stand-in', async ({
		page
	}) => {
		/*
		 * `route.abort()` fails the request at the network level, which reliably exercises the
		 * unreadable-photo path a real host with no CORS headers takes. The cover must stay
		 * visible (the CSS background needs no CORS), so the canvas stays hidden for it.
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
		await page.waitForTimeout(300);

		expect(await canvasIsActive(page)).toBe(false);

		await page.getByRole('button', { name: 'Next in the ring' }).click();
		await expect(heading).not.toHaveText(first ?? '');
		expect(await canvasIsActive(page)).toBe(false);
		await expect(page.locator('.art')).toBeVisible();
		expect(errors).toEqual([]);
	});

	test('the next member photo is preloaded, so a slow photo host still gets the wipe', async ({
		page
	}) => {
		// Photos take ~700ms, like a phone on a real connection. Without preloading, the wipe
		// would run and finish before the photo arrived, and the canvas would only pop in after.
		const cors = { 'access-control-allow-origin': '*' };
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
		);
		await page.route('https://example.com/*.jpg', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 700));
			await route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: cors,
				body: solidPng(200, 40, 40)
			});
		});

		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect.poll(() => canvasIsActive(page), { timeout: 5000 }).toBe(true);
		await page.waitForTimeout(1200); // the neighbour has had time to arrive

		await page.getByRole('button', { name: 'Next in the ring' }).click();
		// Immediately after the press, not after a wait: the canvas already holds the new photo.
		expect(await canvasIsActive(page)).toBe(true);
	});

	test('a slow current cover replaces the old creator and appears as soon as it loads', async ({
		page
	}) => {
		const cors = { 'access-control-allow-origin': '*' };
		let releaseAda = () => {};
		let releaseBo = () => {};
		const adaReady = new Promise<void>((resolve) => (releaseAda = resolve));
		const boReady = new Promise<void>((resolve) => (releaseBo = resolve));
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
		);
		const delayCover = async (route: Route) => {
			const isAda = route.request().url().endsWith('/ada.jpg');
			await (isAda ? adaReady : boReady);
			await route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: cors,
				body: isAda ? solidPng(200, 40, 40) : solidPng(40, 40, 200)
			});
		};
		await page.route('https://example.com/ada.jpg', delayCover);
		await page.route('https://example.com/bo.jpg', delayCover);

		await page.goto('/');
		const heading = page.getByRole('heading', { level: 1 });
		await expect(heading).toBeVisible();
		const first = await heading.textContent();
		const firstIsAda = first === 'Ada Reed';
		const firstUrl = firstIsAda ? 'https://example.com/ada.jpg' : 'https://example.com/bo.jpg';
		const secondUrl = firstIsAda ? 'https://example.com/bo.jpg' : 'https://example.com/ada.jpg';

		(firstIsAda ? releaseAda : releaseBo)();
		await expect.poll(() => canvasIsActive(page), { timeout: 5000 }).toBe(true);
		await expect
			.poll(() =>
				page
					.locator('.art .layer')
					.evaluateAll(
						(layers, url) =>
							layers.some((layer) => (layer as HTMLElement).style.backgroundImage.includes(url)),
						firstUrl
					)
			)
			.toBe(true);

		await page.getByRole('button', { name: 'Next in the ring' }).click();
		await expect(heading).not.toHaveText(first ?? '');
		// Metadata may change immediately, but an old creator's cover must never remain behind it.
		await expect(page.locator('.art .layer')).toHaveCount(0);
		expect(await canvasIsActive(page)).toBe(false);

		(firstIsAda ? releaseBo : releaseAda)();
		// A late completion updates the current creator in place; no extra swipe is needed.
		await expect.poll(() => canvasIsActive(page), { timeout: 5000 }).toBe(true);
		await expect
			.poll(() =>
				page
					.locator('.art .layer')
					.evaluateAll(
						(layers, url) =>
							layers.some((layer) => (layer as HTMLElement).style.backgroundImage.includes(url)),
						secondUrl
					)
			)
			.toBe(true);
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
		// Two flat, clearly different, CORS-readable photos, so the canvas draws real pixels.
		const cors = { 'access-control-allow-origin': '*' };
		await page.route('https://example.com/ada.jpg', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: cors,
				body: solidPng(200, 40, 40)
			})
		);
		await page.route('https://example.com/bo.jpg', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: cors,
				body: solidPng(40, 40, 200)
			})
		);

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

test.describe('Returning to Discover', () => {
	test('the cover does not blink: no fade in on arrival, and the canvas is never shown before it has painted', async ({
		page
	}) => {
		const cors = { 'access-control-allow-origin': '*' };
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
		);
		// A photo that takes a moment, like a phone's: the hand off from the CSS cover to the canvas
		// then happens after the screen change, which is when the blink was seen.
		await page.route('https://example.com/*.jpg', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 400));
			await route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: cors,
				body: solidPng(200, 40, 40)
			});
		});
		// A return visit, which is what the blink was seen on: Discover, away to You, and back.
		await page.goto('/');
		await expect.poll(() => canvasIsActive(page), { timeout: 5000 }).toBe(true);
		await page.getByRole('link', { name: 'You', exact: true }).click();
		await expect(page).toHaveURL(/\/you/);
		await page.waitForTimeout(800);

		// From the click on, look at every frame for the two things that make a blink.
		await page.evaluate(() => {
			const w = window as unknown as { bad: string[]; fades: number };
			w.bad = [];
			w.fades = 0;
			const look = () => {
				const canvas = document.querySelector('canvas.gl') as HTMLCanvasElement | null;
				if (canvas?.classList.contains('active') && canvas.dataset.painted !== 'true') {
					w.bad.push('canvas shown before it painted');
				}
				// The canvas belongs to swiping between members, not to the screen change itself.
				if (document.documentElement.dataset.nav && canvas?.dataset.painted === 'true') {
					w.bad.push('canvas painted during the screen change');
				}
				for (const layer of document.querySelectorAll('.art .layer')) {
					if (getComputedStyle(layer).animationName !== 'none') w.fades += 1;
				}
				requestAnimationFrame(look);
			};
			look();
		});
		await page.getByRole('link', { name: 'Discover', exact: true }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect.poll(() => canvasIsActive(page), { timeout: 5000 }).toBe(true);
		await page.waitForTimeout(500);

		const seen = await page.evaluate(() => {
			const w = window as unknown as { bad: string[]; fades: number };
			return { bad: [...new Set(w.bad)], fades: w.fades };
		});
		expect(seen.bad).toEqual([]);
		expect(seen.fades).toBe(0);
	});

	test('the canvas is exactly the size of the cover, and takes over by fading in', async ({
		page
	}) => {
		const cors = { 'access-control-allow-origin': '*' };
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
		);
		await page.route('https://example.com/*.jpg', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 300));
			await route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: cors,
				body: solidPng(200, 40, 40)
			});
		});
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await page.evaluate(() => {
			const w = window as unknown as { opacities: number[] };
			w.opacities = [];
			const look = () => {
				const canvas = document.querySelector('canvas.gl');
				if (canvas) w.opacities.push(Number(getComputedStyle(canvas).opacity));
				requestAnimationFrame(look);
			};
			look();
		});
		await expect.poll(() => canvasIsActive(page), { timeout: 5000 }).toBe(true);
		await page.waitForTimeout(600);

		// Same box: a difference of size is what made the cover jump when the canvas took over.
		const boxes = await page.evaluate(() => {
			const r = (selector: string) => {
				const b = document.querySelector(selector)!.getBoundingClientRect();
				return [b.x, b.y, b.width, b.height];
			};
			return { art: r('.art'), canvas: r('canvas.gl') };
		});
		for (let i = 0; i < 4; i += 1) expect(boxes.canvas[i]!).toBeCloseTo(boxes.art[i]!, 0);

		// And it arrived through intermediate opacities, not from 0 to 1 in one frame.
		const seen = await page.evaluate(
			() => (window as unknown as { opacities: number[] }).opacities
		);
		expect(seen.some((o) => o > 0.05 && o < 0.95)).toBe(true);
		expect(seen[seen.length - 1]).toBe(1);
	});

	test('the canvas crops a photo about the same focal point as the CSS cover', async ({ page }) => {
		// A wide two-tone photo, left half red and right half blue, on a tall screen, so the cover
		// crop shows only a narrow slice of it. With the focal point at the right edge that slice
		// is entirely blue; cropped about the centre (what the shader used to do) it straddles the
		// red and blue halves.
		const cors = { 'access-control-allow-origin': '*' };
		const ring = {
			version: '1.0',
			entries: [{ ...RING.entries[0], id: 'focal-one', thumb_position: { x: 100, y: 50 } }]
		};
		await page.route('https://ring.indienodes.us/ring.json', (route) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ring) })
		);
		await page.route('https://example.com/*.jpg', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'image/png',
				headers: cors,
				body: pixelPng(8, 4, (x) => (x < 4 ? [220, 30, 30] : [30, 30, 220]))
			})
		);
		await page.goto('/');
		await expect.poll(() => canvasIsActive(page), { timeout: 5000 }).toBe(true);
		await page.waitForTimeout(500);
		// What is actually on screen, not the canvas's own buffer: at rest the canvas no longer
		// draws, so its buffer is empty by the time anything reads it back.
		const shot = await page.screenshot({ clip: { x: 0, y: 380, width: 390, height: 40 } });
		const edges = await page.evaluate(async (base64) => {
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bitmap, 0, 0);
			const px = (x: number) => Array.from(ctx.getImageData(x, 10, 1, 1).data);
			const scale = bitmap.width / 390;
			return { left: px(Math.round(4 * scale)), right: px(Math.round(385 * scale)) };
		}, shot.toString('base64'));
		expect(edges.left[2]!).toBeGreaterThan(edges.left[0]! + 25);
		expect(edges.right[2]!).toBeGreaterThan(edges.right[0]! + 25);
	});
});
