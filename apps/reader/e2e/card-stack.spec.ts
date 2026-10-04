import { expect, test, type Page } from '@playwright/test';
import { stableYipId } from '@yipden/feeds';

/** The first post's key: its stable id, from the feed's address and the post's link. */
const FIRST_KEY = stableYipId('https://lenaofori.com/feed.xml', 'https://lenaofori.com/post-0');

/**
 * Feeds' card stack: enough yips to actually scroll, so cards genuinely enter and pin rather
 * than all fitting on screen at once.
 */

const LENA_PAGE = `<!doctype html><html><head>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Lena Ofori</title>
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head></html>`;

function feedWithPosts(count: number): string {
	const items = Array.from(
		{ length: count },
		(_unused, i) => `<item><title>Post ${i}</title><link>https://lenaofori.com/post-${i}</link>
			<pubDate>Mon, ${21 - Math.floor(i / 4)} Sep 2026 ${10 + (i % 12)}:00:00 GMT</pubDate>
			<description>Body of post ${i}.</description></item>`
	).join('\n');
	return `<?xml version="1.0"?><rss version="2.0"><channel>
		<title>Lena Ofori</title><link>https://lenaofori.com/</link><description>Posts.</description>
		${items}
	</channel></rss>`;
}

async function seed(page: Page, count = 12) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://lenaofori.com/', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: LENA_PAGE })
	);
	await page.route('https://lenaofori.com/feed.xml', (route) =>
		route.fulfill({ status: 200, contentType: 'application/rss+xml', body: feedWithPosts(count) })
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
	await page
		.locator('#pane-everything')
		.getByRole('button', { name: /Post 0\b/ })
		.waitFor({ timeout: 10_000 });
}

test.describe('The card stack', () => {
	test('is on by default: the pane carries the stack class', async ({ page }) => {
		await seed(page);
		await expect(page.locator('#pane-everything')).toHaveClass(/\bstack\b/);
	});

	test('is off under reduced motion: the pane stays a flat list', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await seed(page);
		await expect(page.locator('#pane-everything')).not.toHaveClass(/\bstack\b/);
	});

	test('a card scrolled past the top is marked behind and stops taking taps', async ({ page }) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		// The stack layer is the `.yip-stack` wrapper around a card (it also carries a grouped card's
		// source bar), so `behind` lands there, not on the card's own button.
		// By its key, not its button: once folded away the card's content is hidden, button included.
		const firstCard = pane.locator(`.yip-stack[data-key="${FIRST_KEY}"]`);

		await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
		// The IntersectionObserver reports asynchronously; give it a moment to settle.
		await expect(firstCard).toHaveClass(/\bbehind\b/, { timeout: 5000 });
	});

	test('the front card still opens on tap after scrolling', async ({ page, context }) => {
		await seed(page);
		const pane = page.locator('#pane-everything');

		await pane.evaluate((el) => el.scrollTo({ top: 300, behavior: 'instant' }));
		await page.waitForTimeout(300);

		const visibleCard = pane.locator('.yip:not(.behind)').last();
		const [popup] = await Promise.all([
			context.waitForEvent('page'),
			visibleCard.click({ timeout: 5000 })
		]);
		await popup.close();
	});

	test('scrolling the whole way through does not error or leave the pane unscrollable', async ({
		page
	}) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		for (let i = 0; i < 5; i += 1) {
			await pane.evaluate((el, step) => el.scrollTo({ top: step, behavior: 'instant' }), i * 200);
			await page.waitForTimeout(100);
		}

		expect(errors).toEqual([]);
	});

	test('a card that scrolls back into view sheds its behind state', async ({ page }) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		// The stack layer is the `.yip-stack` wrapper around a card (it also carries a grouped card's
		// source bar), so `behind` lands there, not on the card's own button.
		// By its key, not its button: once folded away the card's content is hidden, button included.
		const firstCard = pane.locator(`.yip-stack[data-key="${FIRST_KEY}"]`);

		await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
		await expect(firstCard).toHaveClass(/\bbehind\b/, { timeout: 5000 });

		await pane.evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
		await expect(firstCard).not.toHaveClass(/\bbehind\b/, { timeout: 5000 });
	});

	test('the last card scrolls all the way to the top, with the one before it folded away', async ({
		page
	}) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		await pane.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));

		await expect
			.poll(() =>
				pane.evaluate((el) => {
					const cards = el.querySelectorAll<HTMLElement>('.yip-stack');
					const last = cards[cards.length - 1]!;
					const before = cards[cards.length - 2]!;
					return {
						// Layout position, not the drawn one: the stack transforms a card as it moves.
						lastFromTop: last.offsetTop - el.offsetTop - el.scrollTop,
						// The drawn card is `.yip-fold`; `.yip-stack` is only its place in the list.
						beforeOpacity: Number(getComputedStyle(before.querySelector('.yip-fold')!).opacity)
					};
				})
			)
			.toEqual({ lastFromTop: 6, beforeOpacity: 0 });
	});

	test('a card is pinned by the scroller and folded by hand, and stays gone once folded', async ({
		page
	}) => {
		await seed(page);
		const pane = page.locator('#pane-everything');
		await expect(pane).toHaveClass(/\bstack-pin\b/);
		await expect(pane).not.toHaveClass(/\bstack-sda\b/);

		await pane.evaluate((el) => el.scrollTo({ top: 90, behavior: 'instant' }));
		const fold = pane.locator('.yip-fold').first();
		await expect(fold).toHaveCSS('position', 'sticky');
		// Tipped back and fading: an inline transform, not an animation.
		await expect
			.poll(() => fold.evaluate((el) => (el as HTMLElement).style.transform))
			.toContain('rotateX');
		expect(await fold.evaluate((el) => el.getAnimations().length)).toBe(0);

		// Several cards further on, every folded card is still held at the top by its rail. None
		// may show: put back to their resting style, they stacked up there as ghosts.
		await pane.evaluate((el) => el.scrollTo({ top: 700, behavior: 'instant' }));
		await expect
			.poll(() =>
				pane.evaluate((el) => {
					const top = el.getBoundingClientRect().top;
					return [...el.querySelectorAll<HTMLElement>('.yip-stack')]
						.filter((card) => card.getBoundingClientRect().bottom <= top)
						.map((card) => getComputedStyle(card.querySelector('.yip-fold')!).visibility);
				})
			)
			.toEqual(['hidden', 'hidden', 'hidden']);
	});

	test('the scroll-driven CSS fold is still there behind its debug switch', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('yipden:diag:cssStack', '1'));
		await seed(page);
		await expect(page.locator('#pane-everything')).toHaveClass(/\bstack-sda\b/);
	});
});
