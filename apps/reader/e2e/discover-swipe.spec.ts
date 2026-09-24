import { test, expect } from '@playwright/test';
/** After a committed swipe the text must enter from the side opposite the swipe, not ease back from the drag offset. */
test('meta enters from the side opposite the swipe', async ({ page }) => {
	const ring = {
		version: '1.0',
		entries: [
			{ id: 'a', creator: 'Ada', type: 'audio', source_url: 'https://a.example.com/', why: 'x' },
			{ id: 'b', creator: 'Bo', type: 'comic', source_url: 'https://b.example.com/', why: 'y' }
		]
	};
	await page.route('https://ring.indienodes.us/ring.json', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ring) })
	);
	await page.goto('/');
	const h = page.getByRole('heading', { level: 1 });
	await expect(h).toBeVisible();
	const box = (await page.locator('.discover').boundingBox())!;
	const swipe = async (from: number, to: number) => {
		await page.waitForTimeout(1200); // the previous entrance has settled
		const first = await h.textContent();
		await page.mouse.move(box.x + box.width * from, box.y + box.height * 0.5);
		await page.mouse.down();
		await page.mouse.move(box.x + (box.width * (from + to)) / 2, box.y + box.height * 0.5, {
			steps: 4
		});
		await page.mouse.move(box.x + box.width * to, box.y + box.height * 0.5, { steps: 4 });
		await page.mouse.up();
		const xs: number[] = [];
		for (let i = 0; i < 30; i++) {
			const b = await h.boundingBox();
			if (b) xs.push(b.x);
			await page.waitForTimeout(25);
		}
		await expect(h).not.toHaveText(first ?? '');
		return xs;
	};
	const left = await swipe(0.8, 0.2); // swipe left
	expect(Math.max(...left.slice(0, 3))).toBeGreaterThan(left[left.length - 1]); // starts right of rest
	const right = await swipe(0.2, 0.8); // swipe right
	expect(Math.min(...right.slice(0, 3))).toBeLessThan(right[right.length - 1]); // starts left of rest
});

/** The prototype's order: the old text leaves toward the swipe first, then the new text arrives. */
test('the outgoing text leaves toward the direction of travel and is hidden from assistive tech', async ({
	page
}) => {
	const ring = {
		version: '1.0',
		entries: [
			{ id: 'a', creator: 'Ada', type: 'audio', source_url: 'https://a.example.com/', why: 'x' },
			{ id: 'b', creator: 'Bo', type: 'comic', source_url: 'https://b.example.com/', why: 'y' }
		]
	};
	await page.route('https://ring.indienodes.us/ring.json', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ring) })
	);
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await page.waitForTimeout(1200);

	const leaving = page.locator('.body-inner[aria-hidden="true"] h1');
	const rest = (await page.getByRole('heading', { level: 1 }).boundingBox())!.x;

	await page.getByRole('button', { name: 'Next in the ring' }).click();
	const xs: number[] = [];
	for (let i = 0; i < 12; i += 1) {
		const b = await leaving.boundingBox({ timeout: 300 }).catch(() => null);
		if (b) xs.push(b.x);
		await page.waitForTimeout(25);
	}
	expect(xs.length).toBeGreaterThan(2);
	// Next travels left, so the old text ends far to the left of where it rested.
	expect(Math.min(...xs)).toBeLessThan(rest - 80);
	// Only one member's name is ever exposed to a screen reader.
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	// And once it has gone, it is gone from the DOM.
	await expect(leaving).toHaveCount(0);
});

test('a button press after a swipe the other way still exits in its own direction', async ({
	page
}) => {
	const ring = {
		version: '1.0',
		entries: [
			{ id: 'a', creator: 'Ada', type: 'audio', source_url: 'https://a.example.com/', why: 'x' },
			{ id: 'b', creator: 'Bo', type: 'comic', source_url: 'https://b.example.com/', why: 'y' },
			{ id: 'c', creator: 'Cy', type: 'art', source_url: 'https://c.example.com/', why: 'z' }
		]
	};
	await page.route('https://ring.indienodes.us/ring.json', (r) =>
		r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ring) })
	);
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await page.waitForTimeout(1200);

	// Swipe right (previous), leaving a rightward drag offset behind.
	const box = (await page.locator('.discover').boundingBox())!;
	await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
	await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 4 });
	await page.mouse.up();
	await page.waitForTimeout(1500);

	const rest = (await page.getByRole('heading', { level: 1 }).boundingBox())!.x;
	const leaving = page.locator('.body-inner[aria-hidden="true"] h1');
	await page.getByRole('button', { name: 'Next in the ring' }).click();
	const xs: number[] = [];
	for (let i = 0; i < 12; i += 1) {
		const b = await leaving.boundingBox({ timeout: 300 }).catch(() => null);
		if (b) xs.push(b.x);
		await page.waitForTimeout(25);
	}
	expect(xs.length).toBeGreaterThan(2);
	// Next goes left from where it rests; it never starts by moving right.
	expect(Math.max(...xs)).toBeLessThanOrEqual(rest + 2);
	expect(Math.min(...xs)).toBeLessThan(rest - 80);
});
