import { expect, test, type Page } from '@playwright/test';

/**
 * A post that shares a YouTube video, without being one: the card stays the post, and a preview
 * inside it opens the video on YouTube (the app's player is for music). Nothing reaches the
 * network; what would open outside the app is recorded instead.
 */

const PAGE = `<!doctype html><html><head><title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body></body></html>`;

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Notes.</description>
	<item><link>https://lenaofori.com/notes/1</link><guid>note-1</guid>
		<pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate>
		<description><![CDATA[<p>Made a little video about the zine: <a href="https://youtu.be/M7lc1UVf-VE">watch</a></p>]]></description></item>
	<item><link>https://lenaofori.com/notes/2</link><guid>note-2</guid>
		<pubDate>Sun, 20 Sep 2026 10:00:00 GMT</pubDate>
		<description><![CDATA[<p>A long note. ${'Every line of this note matters to the one who reads it. '.repeat(4)}<a href="https://youtu.be/dQw4w9WgXcQ">The video</a></p>]]></description></item>
	<item><link>https://lenaofori.com/notes/3</link><guid>note-3</guid>
		<pubDate>Sat, 19 Sep 2026 10:00:00 GMT</pubDate>
		<description>A short one after it.</description></item>
</channel></rss>`;

async function seed(page: Page) {
	await page.addInitScript(() => {
		(window as unknown as { opened: string[] }).opened = [];
		window.open = (url) => {
			(window as unknown as { opened: string[] }).opened.push(String(url));
			return null;
		};
	});
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://lenaofori.com/', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: PAGE })
	);
	await page.route('https://lenaofori.com/feed.xml', (route) =>
		route.fulfill({ status: 200, contentType: 'application/rss+xml', body: FEED })
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
	await page.getByRole('button', { name: /Follow Lena Ofori in/ }).click();
	await page.getByText('Following Lena Ofori').waitFor();
}

test('a shared video waits behind its post, and opens on YouTube, not in the player', async ({
	page
}) => {
	await seed(page);
	await page.goto('/feeds');
	const pane = page.locator('#pane-everything');
	const card = pane.locator('.yip-stack', { hasText: 'Made a little video about the zine' });
	await expect(card).toBeVisible({ timeout: 10_000 });
	const watch = card.getByRole('button', { name: 'Watch the video Lena Ofori shared, on YouTube' });

	// Behind the post until asked for: the card is the post's own size, and the video not reachable.
	await expect(watch).toHaveCount(0);
	await card.getByRole('button', { name: 'Show the video Lena Ofori shared' }).click();
	await expect(watch).toBeFocused();
	await watch.click();
	expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([
		'https://www.youtube.com/watch?v=M7lc1UVf-VE'
	]);
	await expect(page.getByRole('region', { name: 'Now playing' })).toBeHidden();

	// Back to the post, which is still the post.
	await card.getByRole('button', { name: 'Back to the post' }).click();
	await expect(
		card.getByRole('button', { name: 'Show the video Lena Ofori shared' })
	).toBeFocused();
	await card
		.getByRole('button', { name: /Post by Lena Ofori/ })
		.click({ position: { x: 120, y: 70 } });
	expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([
		'https://www.youtube.com/watch?v=M7lc1UVf-VE',
		'https://lenaofori.com/notes/1'
	]);
});

test('a card taller than the screen is read to its end before it folds away', async ({ page }) => {
	await seed(page);
	await page.goto('/feeds');
	const pane = page.locator('#pane-everything');
	await expect(pane.getByText(/A long note/)).toBeVisible({ timeout: 10_000 });

	const measure = () =>
		pane.evaluate((el) => {
			const card = [...el.querySelectorAll<HTMLElement>('.yip-stack')].find((node) =>
				node.textContent?.includes('A long note')
			)!;
			const dock =
				parseFloat(getComputedStyle(el.closest('.app')!).getPropertyValue('--dock')) || 88;
			return {
				top: card.offsetTop,
				height: card.offsetHeight,
				viewport: el.clientHeight - dock
			};
		});
	const fold = () =>
		pane.evaluate((el) => {
			const card = [...el.querySelectorAll<HTMLElement>('.yip-stack')].find((node) =>
				node.textContent?.includes('A long note')
			)!;
			const drawn = card.querySelector<HTMLElement>('.yip-fold')!;
			return { transform: drawn.style.transform, top: drawn.style.top };
		});

	// A card made taller than the screen on purpose: what is at its foot must be reachable.
	await pane.evaluate((el) => {
		const card = [...el.querySelectorAll<HTMLElement>('.yip-stack')].find((node) =>
			node.textContent?.includes('A long note')
		)!;
		card.querySelector<HTMLElement>('.yip')!.style.minHeight = '900px';
	});
	const { top, height, viewport } = await measure();
	expect(height).toBeGreaterThan(viewport);
	const overflow = height - viewport;

	// Its bottom edge just reaching the bottom of the screen: all of it read, nothing folded yet.
	await pane.evaluate((el, at) => el.scrollTo({ top: at }), top + overflow);
	await expect.poll(fold).toEqual({ transform: '', top: `${-overflow}px` });
	const bottomGap = await pane.evaluate((el) => {
		const card = [...el.querySelectorAll<HTMLElement>('.yip-stack')].find((node) =>
			node.textContent?.includes('A long note')
		)!;
		const dock = parseFloat(getComputedStyle(el.closest('.app')!).getPropertyValue('--dock')) || 88;
		const visibleBottom = el.getBoundingClientRect().top + el.clientHeight - dock;
		return Math.abs(
			card.querySelector('.yip-fold')!.getBoundingClientRect().bottom - visibleBottom
		);
	});
	// Within a few pixels: the stack measures its place in the list, the eye sees the drawn card.
	expect(bottomGap).toBeLessThan(10);

	// Past that, it folds away like any other card.
	await pane.evaluate((el, at) => el.scrollTo({ top: at }), top + overflow + height / 2);
	await expect.poll(async () => (await fold()).transform).toContain('rotateX');
});
