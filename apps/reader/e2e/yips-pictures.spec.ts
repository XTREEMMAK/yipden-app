import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/**
 * A big photo behind a card is shrunk before it is drawn, and a small one is left alone. The slow
 * frames on a phone landed on the cards with the biggest pictures (2026-10-08).
 */

/** A plain grey PNG of the given size, made by hand so the test needs no image library. */
function png(width: number, height: number): Buffer {
	const crc = (buffer: Buffer) => {
		let value = ~0;
		for (const byte of buffer) {
			value ^= byte;
			for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
		}
		return ~value >>> 0;
	};
	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const check = Buffer.alloc(4);
		check.writeUInt32BE(crc(body));
		return Buffer.concat([length, body, check]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 2;
	const row = Buffer.alloc(1 + width * 3, 0x80);
	row[0] = 0;
	const raw = Buffer.concat(Array.from({ length: height }, () => row));
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

test('a big picture on a card is shrunk, a small one is not', async ({ page }) => {
	test.setTimeout(120_000);
	const big = png(3002, 4000);
	const small = png(600, 400);
	const now = new Date().toUTCString();
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: '' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: '{"version":"1.0","entries":[]}'
		})
	);
	await page.route('https://lenaofori.com/', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/html',
			body: '<html><head><title>Lena</title><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>'
		})
	);
	await page.route('https://lenaofori.com/feed.xml', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/rss+xml',
			body: `<?xml version="1.0"?><rss version="2.0"><channel><title>Lena</title><link>https://lenaofori.com/</link><description>x</description>
				<item><title>Big</title><link>https://lenaofori.com/b</link><pubDate>${now}</pubDate><enclosure url="https://lenaofori.com/big.png" type="image/png"/><description>big</description></item>
				<item><title>Small</title><link>https://lenaofori.com/s</link><pubDate>${now}</pubDate><enclosure url="https://lenaofori.com/small.png" type="image/png"/><description>small</description></item>
			</channel></rss>`
		})
	);
	await page.route('https://lenaofori.com/big.png', (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: big })
	);
	await page.route('https://lenaofori.com/small.png', (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', body: small })
	);

	await page.goto('/follow');
	await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await page.getByRole('button', { name: /^Follow Lena/ }).click();
	await expect(page.getByText(/^Following Lena/)).toBeVisible();

	await page.goto('/feeds');
	const pane = page.locator('#pane-everything');
	await expect(pane.locator('.art canvas.pic')).toHaveCount(1, { timeout: 20_000 });
	await expect(pane.locator('.art span.pic')).toHaveCount(1);
	const [width, height] = await pane
		.locator('.art canvas.pic')
		.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height] as const);
	// About a megapixel, not twelve.
	expect(width * height).toBeLessThan(1_400_000);
	expect(width / height).toBeCloseTo(3002 / 4000, 1);
});
