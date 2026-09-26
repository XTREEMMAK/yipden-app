import { expect, test, type Page } from '@playwright/test';

/**
 * The card to player morph: tapping a listen yip's card should carry its art and title into
 * the full screen player through a real `document.startViewTransition`, not just open the
 * sheet. Chromium supports the API, so these run against the real thing rather than a stub.
 */

/** A couple of seconds of silence, PCM 16-bit mono WAV: enough for the audio element to open. */
function silentWav(seconds: number, sampleRate = 8000): Buffer {
	const frames = seconds * sampleRate;
	const dataSize = frames * 2;
	const buffer = Buffer.alloc(44 + dataSize);
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write('WAVE', 8);
	buffer.write('fmt ', 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36);
	buffer.writeUInt32LE(dataSize, 40);
	return buffer;
}

const TRACK = silentWav(4);

const LENA_PAGE = `<!doctype html><html><head>
	<title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head></html>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Sound.</description>
	<item><title>Low Tide</title><link>https://lenaofori.com/low-tide</link>
		<pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate>
		<description>A new track.</description>
		<enclosure url="https://lenaofori.com/low-tide.mp3" type="audio/wav"/></item>
	<item><title>High Tide</title><link>https://lenaofori.com/high-tide</link>
		<pubDate>Mon, 21 Sep 2026 12:00:00 GMT</pubDate>
		<description>Another one.</description>
		<enclosure url="https://lenaofori.com/high-tide.mp3" type="audio/wav"/></item>
</channel></rss>`;

/** Counts real `startViewTransition` calls without changing what they do. */
async function countViewTransitions(page: Page) {
	await page.addInitScript(() => {
		(window as unknown as { __vtCalls: number }).__vtCalls = 0;
		const real = document.startViewTransition?.bind(document);
		if (!real) return;
		document.startViewTransition = ((callback) => {
			(window as unknown as { __vtCalls: number }).__vtCalls += 1;
			return real(callback);
		}) as typeof document.startViewTransition;
	});
}

async function seed(page: Page) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://lenaofori.com/', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: LENA_PAGE })
	);
	await page.route('https://lenaofori.com/feed.xml', (route) =>
		route.fulfill({ status: 200, contentType: 'application/rss+xml', body: FEED })
	);
	await page.route('https://lenaofori.com/low-tide.mp3', (route) =>
		route.fulfill({ status: 200, contentType: 'audio/wav', body: TRACK })
	);
	await page.route('https://lenaofori.com/high-tide.mp3', (route) =>
		route.fulfill({ status: 200, contentType: 'audio/wav', body: TRACK })
	);
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: '{"version":"1.0","entries":[]}'
		})
	);

	await page.goto('/follow');
	await page.getByLabel('Creator, website, or profile').fill('lenaofori.com');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await page.getByText('Blog', { exact: true }).waitFor({ timeout: 10_000 });
	await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
	await page.getByText('Following Lena Ofori').waitFor();

	await page.goto('/feeds');
	await page.locator('#pane-everything').getByText('Low Tide').waitFor({ timeout: 10_000 });
}

test.describe('The card to player morph', () => {
	test('opening a yip starts exactly one view transition', async ({ page }) => {
		await countViewTransitions(page);
		await seed(page);

		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
		expect(await page.evaluate(() => (window as unknown as { __vtCalls: number }).__vtCalls)).toBe(
			1
		);
	});

	test('opens with no page errors', async ({ page }) => {
		await seed(page);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
		await page.waitForTimeout(500); // covers the delayed chrome fade-in, well past --dur-l + --dur-m

		expect(errors).toEqual([]);
	});

	test('leaves no transition names behind once it settles', async ({ page }) => {
		await seed(page);

		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
		// The player's chrome fades in on a delay (--dur-l) over --dur-m, and `finished` only
		// resolves once every named group's animation, including that delayed one, is done.
		await page.waitForTimeout(1000);

		const leftoverNames = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLElement>('.art, .ttl, .pl-art, .pl-title'))
				.map((el) => el.style.viewTransitionName)
				.filter(Boolean)
		);
		expect(leftoverNames).toEqual([]);
	});

	test('does not start a transition under reduced motion, and still opens', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await countViewTransitions(page);
		await seed(page);

		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
		expect(await page.evaluate(() => (window as unknown as { __vtCalls: number }).__vtCalls)).toBe(
			0
		);
	});

	test('reopening a different yip after collapsing morphs again', async ({ page }) => {
		await countViewTransitions(page);
		await seed(page);

		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
		await page.getByRole('button', { name: 'Collapse the player' }).click();

		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /High Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'High Tide' })).toBeVisible();

		expect(await page.evaluate(() => (window as unknown as { __vtCalls: number }).__vtCalls)).toBe(
			2
		);
	});
});
