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
		const first = await h.textContent();
		await page.mouse.move(box.x + box.width * from, box.y + box.height * 0.5);
		await page.mouse.down();
		await page.mouse.move(box.x + (box.width * (from + to)) / 2, box.y + box.height * 0.5, {
			steps: 4
		});
		await page.mouse.move(box.x + box.width * to, box.y + box.height * 0.5, { steps: 4 });
		await page.mouse.up();
		const xs: number[] = [];
		for (let i = 0; i < 12; i++) {
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
