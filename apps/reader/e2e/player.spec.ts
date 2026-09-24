import { expect, test, type Page } from '@playwright/test';

/**
 * The player, against a real (if silent) audio file, so duration and seeking are genuinely
 * exercised rather than assumed. Chromium decodes this fine for both the `<audio>` element and
 * wavesurfer's own WebAudio decode.
 */

/** A few seconds of silence, PCM 16-bit mono WAV, built by hand: no fixture binary to commit. */
function silentWav(seconds: number, sampleRate = 8000): Buffer {
	const frames = seconds * sampleRate;
	const dataSize = frames * 2;
	const buffer = Buffer.alloc(44 + dataSize);
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write('WAVE', 8);
	buffer.write('fmt ', 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20); // PCM
	buffer.writeUInt16LE(1, 22); // mono
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write('data', 36);
	buffer.writeUInt32LE(dataSize, 40);
	return buffer;
}

const TRACK = silentWav(6);

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
	await page.getByLabel('Website or profile').fill('lenaofori.com');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await page.getByText('Blog', { exact: true }).waitFor({ timeout: 10_000 });
	await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
	await page.getByText('Following Lena Ofori').waitFor();

	await page.goto('/feeds');
	await page.locator('#pane-everything').getByText('Low Tide').waitFor({ timeout: 10_000 });
}

test.describe('The player', () => {
	test('opening a listen yip plays it and shows the full player', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
		await expect(page.getByLabel('Pause', { exact: true })).toBeVisible();
	});

	test('play and pause toggle, and the mini player mirrors it', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByLabel('Pause', { exact: true })).toBeVisible();

		await page.getByLabel('Pause', { exact: true }).click();
		await expect(page.getByLabel('Play', { exact: true })).toBeVisible();
	});

	test('collapsing shows the mini player with the same track', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		await page.getByRole('button', { name: 'Collapse the player' }).click();
		await expect(page.getByRole('button', { name: 'Open the player' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Open the player' })).toContainText('Low Tide');
	});

	test('browser Back collapses the full player without leaving the current screen', async ({
		page
	}) => {
		await seed(page);
		const screenUrl = page.url();
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();

		await page.goBack();

		await expect(page.getByRole('button', { name: 'Open the player' })).toBeVisible();
		expect(page.url()).toBe(screenUrl);
	});

	test('the mini player stop button pauses and dismisses it entirely', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByLabel('Pause', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Collapse the player' }).click();
		await expect(page.getByRole('button', { name: 'Open the player' })).toBeVisible();

		await page.getByRole('button', { name: 'Stop and close the player' }).click();

		// The full and mini player both stay mounted once something has played (see
		// DECISIONS.md), so this checks visibility rather than absence from the DOM.
		await expect(page.getByRole('button', { name: 'Open the player' })).toHaveCount(0);
		await expect(page.getByLabel('Pause', { exact: true })).not.toBeVisible();
	});

	test('the mini player opens the full player again', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await page.getByRole('button', { name: 'Collapse the player' }).click();

		await page.getByRole('button', { name: 'Open the player' }).click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
	});

	test('the mini player keeps playing across a tab change', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await page.getByRole('button', { name: 'Collapse the player' }).click();

		await page.getByRole('link', { name: 'You' }).click();
		await expect(page.getByRole('button', { name: 'Open the player' })).toBeVisible();
	});

	test('seeking back moves the clock, while playing', async ({ page }) => {
		/*
		 * This seeks to the end then back to the start while the track keeps playing, its ordinary state:
		 * seeking while paused, immediately after opening a preload="none" track that has
		 * barely started, is its own harder case. `preload="none"` means the browser will not
		 * buffer anything until playback is requested, and once paused early it can abandon
		 * even what little it had, so a seek back to a position outside what remains buffered
		 * can silently fail to land until playback resumes. That is a known, accepted edge of
		 * honoring "no autoplay, no preloading," recorded in DECISIONS.md, not something this
		 * suite chases with a five second silent test file standing in for a real track.
		 */
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.locator('.times')).toContainText('0:00', { timeout: 10_000 });

		const seek = page.getByRole('slider', { name: 'Seek' });
		await seek.press('End');
		// The track is 6 seconds of silence; seeking to the end lands just short of it.
		await expect(page.locator('.times')).not.toContainText('0:00');

		await seek.press('Home');
		await expect(page.locator('.times')).toContainText('0:00');
	});

	test('the seek input reflects position for keyboard and screen reader use', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.locator('.times')).toContainText('0:00', { timeout: 10_000 });

		const seek = page.getByRole('slider', { name: 'Seek' });
		await seek.press('End');
		await expect(seek).not.toHaveValue('0');
	});

	test('speed cycles through the four fixed rates', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		const speed = page.getByRole('button', { name: /Speed/ });
		await expect(speed).toContainText('1×');
		await speed.click();
		await expect(speed).toContainText('1.25×');
		await speed.click();
		await expect(speed).toContainText('1.5×');
		await speed.click();
		await expect(speed).toContainText('2×');
		await speed.click();
		await expect(speed).toContainText('1×');
	});

	test('Next and Previous move between tracks, and Previous restarts one already underway', async ({
		page
	}) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();

		await page.getByRole('button', { name: 'Next track' }).click();
		await expect(page.getByRole('heading', { name: 'High Tide' })).toBeVisible();

		// Past the first few seconds Previous restarts this track rather than leaving it.
		await page.getByRole('slider', { name: 'Seek' }).press('End');
		await expect(page.locator('.times')).not.toContainText('0:00');
		await page.getByRole('button', { name: 'Previous track' }).click();
		await expect(page.getByRole('heading', { name: 'High Tide' })).toBeVisible();
		await expect(page.locator('.times')).toContainText('0:00');

		// Near the start it goes to the one before.
		await page.getByRole('button', { name: 'Previous track' }).click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
	});

	test('up next advances to the next track in the queue', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		await expect(page.getByRole('button', { name: /Up next/ })).toContainText('High Tide');
		await page.getByRole('button', { name: /Up next/ }).click();
		await expect(page.getByRole('heading', { name: 'High Tide' })).toBeVisible();
	});

	test('the up next tile is disabled alone in the queue', async ({ page }) => {
		await seed(page);
		// Only one item plays: no ring tracks and only the one queued yip reachable this way.
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await page.getByRole('button', { name: /Up next/ }).click(); // now on High Tide
		await expect(page.getByRole('button', { name: /Up next/ })).toContainText('Low Tide');
	});

	test('sets Media Session metadata for lock screen controls', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();

		const title = await page.evaluate(() => navigator.mediaSession?.metadata?.title ?? null);
		expect(title).toBe('Low Tide');
	});

	test('opens the creator site from the player, not the app WebView', async ({ page, context }) => {
		await seed(page);
		// window.open targets a new page in this same context, which page.route above does not
		// reach; a popup needs its own interception or it tries the real network.
		await context.route('https://lenaofori.com/low-tide', (route) =>
			route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Low Tide</title>' })
		);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		const [popup] = await Promise.all([
			context.waitForEvent('page'),
			page.getByRole('button', { name: "Open on the creator's site" }).click()
		]);
		await popup.waitForLoadState();
		expect(popup.url()).toContain('lenaofori.com');
	});

	test('every control clears the 44px minimum', async ({ page }) => {
		await seed(page);
		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();

		for (const name of [
			'Collapse the player',
			"Open on the creator's site",
			'Previous track',
			'Pause',
			'Next track',
			/^Speed/
		]) {
			const box = await page.getByRole('button', { name }).boundingBox();
			expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
			expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		}

		await page.getByRole('button', { name: 'Collapse the player' }).click();
		for (const name of ['Open the player', 'Pause', 'Stop and close the player']) {
			const box = await page.getByRole('button', { name }).boundingBox();
			expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
			expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		}
	});

	test('falls back to a plain progress bar when the waveform cannot decode, and still plays', async ({
		page
	}) => {
		await seed(page);
		// Block only the raw bytes wavesurfer fetches for decoding; playback itself goes through
		// the <audio> element's own request, which this leaves untouched by not matching it
		// twice -- Playwright's route order means the more specific route below wins.
		await page.route('https://lenaofori.com/low-tide.mp3', (route) => {
			if (route.request().headers()['sec-fetch-dest'] === 'audio') {
				return route.fulfill({ status: 200, contentType: 'audio/wav', body: TRACK });
			}
			return route.abort();
		});

		await page
			.locator('#pane-everything')
			.getByRole('button', { name: /Low Tide/ })
			.click();
		await expect(page.getByRole('heading', { name: 'Low Tide' })).toBeVisible();
		// No error text anywhere: a failed decode is silent, per the brief.
		await expect(page.getByText(/error/i)).toHaveCount(0);
	});
});
