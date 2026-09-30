import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ringNext } from './support.js';

/**
 * Layout awareness, the Shelf, and the partner ring surface.
 *
 * A site built for a big screen is not opened inline on a phone: Save for later leads, the site
 * is still one tap away, and what is saved is a local list that only leaves the phone when it is
 * exported. Partner rings never mix into Discover's own rotation.
 */

const RING = {
	version: '1.0',
	entries: [
		{
			id: 'comic-wide',
			creator: 'Wide Screen',
			type: 'comic',
			why: 'A comic drawn for a big monitor.',
			tags: ['comic'],
			layout: 'desktop-first',
			source_url: 'https://wide.example.com/',
			verification_token: 'a',
			joined_at: '2026-01-01T00:00:00.000Z'
		},
		{
			id: 'text-narrow',
			creator: 'Narrow Reads',
			type: 'text',
			why: 'Essays that fit a phone.',
			tags: ['writing'],
			source_url: 'https://narrow.example.com/',
			verification_token: 'b',
			joined_at: '2026-02-01T00:00:00.000Z'
		},
		{
			id: 'art-odd',
			creator: 'Odd Value',
			type: 'art',
			why: 'Declares a layout nobody knows.',
			tags: ['art'],
			layout: 'tablet-only',
			source_url: 'https://odd.example.com/',
			verification_token: 'c',
			joined_at: '2026-03-01T00:00:00.000Z'
		}
	]
};

async function withRing(page: Page) {
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			headers: { etag: 'W/"test"' },
			body: JSON.stringify(RING)
		})
	);
	await page.route('https://example.com/**', (route) => route.abort());
}

async function chooseFilter(page: Page, label: string) {
	await page.getByRole('button', { name: /^Filter the ring/ }).click();
	await page.getByRole('radio', { name: label, exact: true }).click();
}

/** Counts members through the Browse members sheet, the replacement for the old node counter. */
async function expectMemberCount(page: Page, count: number) {
	await page.getByRole('button', { name: 'Browse members' }).click();
	const sheet = page.getByRole('dialog', { name: 'Browse members' });
	await expect(sheet.locator('.sheet-row')).toHaveCount(count);
	await page.keyboard.press('Escape');
	await expect(sheet).not.toBeVisible();
}

/** Records what would have opened in the system browser, since a test has none. */
async function recordOpens(page: Page) {
	await page.addInitScript(() => {
		(window as unknown as { opened: string[] }).opened = [];
		window.open = (url) => {
			(window as unknown as { opened: string[] }).opened.push(String(url));
			return null;
		};
	});
}

const opened = (page: Page) =>
	page.evaluate(() => (window as unknown as { opened: string[] }).opened);

test.describe('a desktop first member in Discover', () => {
	test.beforeEach(async ({ page }) => {
		await withRing(page);
		await recordOpens(page);
	});

	test('leads with Save for later, keeps following and the site one tap away', async ({ page }) => {
		await page.goto('/');
		await chooseFilter(page, 'Comics');

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wide Screen');
		await expect(page.getByText('Best on desktop', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save for later' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Follow everything' })).toBeVisible();
		await page.getByRole('button', { name: 'Visit site' }).click();
		expect(await opened(page)).toEqual(['https://wide.example.com/']);
	});

	test('keeps the usual actions for a member who declared nothing, or something unknown', async ({
		page
	}) => {
		await page.goto('/');
		for (const label of ['Words', 'Art']) {
			await chooseFilter(page, label);
			await expect(page.getByRole('button', { name: /Follow everything/ })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Save for later' })).toHaveCount(0);
			await expect(page.getByText('Best on desktop', { exact: true })).toHaveCount(0);
		}
	});

	test('saves to the Shelf, shows it under You, and exports it with the follows file', async ({
		page
	}) => {
		await page.goto('/');
		await chooseFilter(page, 'Comics');
		await page.getByRole('button', { name: 'Save for later' }).click();
		await expect(page.getByText('Saved to your Shelf.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Saved' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await page.goto('/you');
		const shelf = page.getByRole('region', { name: /^Shelf/ });
		await expect(shelf.getByText('Wide Screen')).toBeVisible();
		await expect(shelf.getByText('wide.example.com')).toBeVisible();

		// Through the existing follows file, not a second export; the export tools live in
		// Settings, not on You itself.
		await page.goto('/you/settings');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: /Export as OPML/ }).click()
		]);
		expect(download.suggestedFilename()).toBe('yipden-follows.opml');
		const xml = await readFile((await download.path()) ?? '', 'utf8');
		expect(xml).toContain('yipdenShelf="true"');
		expect(xml).toContain('url="https://wide.example.com/"');

		// Through the full backup too.
		const [backupDownload] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: /Export full backup/ }).click()
		]);
		const backup = JSON.parse(await readFile((await backupDownload.path()) ?? '', 'utf8'));
		expect(backup.shelf.map((item: { url: string }) => item.url)).toEqual([
			'https://wide.example.com/'
		]);

		await page.goto('/you');
		await shelf.getByRole('button', { name: /^Open Wide Screen/ }).click();
		expect(await opened(page)).toEqual(['https://wide.example.com/']);

		await shelf.getByRole('button', { name: /^Remove Wide Screen/ }).click();
		await expect(shelf.getByText(/Nothing saved yet/)).toBeVisible();
		await page.reload();
		await expect(
			page.getByRole('region', { name: /^Shelf/ }).getByText(/Nothing saved yet/)
		).toBeVisible();
	});

	test('every new control clears the 44px minimum', async ({ page }) => {
		const tall = async (controls: ReturnType<Page['getByRole']>[]) => {
			for (const control of controls) {
				const box = await control.boundingBox();
				expect(box?.height ?? 0, (await control.textContent()) ?? '').toBeGreaterThanOrEqual(44);
			}
		};

		await page.goto('/');
		await chooseFilter(page, 'Comics');
		await page.getByRole('button', { name: 'Save for later' }).click();
		await tall([
			page.getByRole('button', { name: 'Saved' }),
			page.getByRole('button', { name: 'Follow everything' }),
			page.getByRole('button', { name: 'Visit site' })
		]);

		await page.goto('/you');
		const shelf = page.getByRole('region', { name: /^Shelf/ });
		await tall([
			shelf.getByRole('button', { name: /^Open / }),
			shelf.getByRole('button', { name: /^Remove / })
		]);
	});

	test('a save survives a reload, and saving twice keeps one', async ({ page }) => {
		await page.goto('/');
		await chooseFilter(page, 'Comics');
		await page.getByRole('button', { name: 'Save for later' }).click();
		await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

		await page.reload();
		await chooseFilter(page, 'Comics');
		await expect(page.getByRole('button', { name: 'Saved' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		await page.goto('/you');
		await expect(
			page.getByRole('region', { name: /^Shelf/ }).getByRole('button', { name: /^Open / })
		).toHaveCount(1);
	});
});

const PAGE_WITHOUT_VIEWPORT = `<!doctype html><html><head>
	<title>Wide Writer</title>
	<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">
</head></html>`;
const PAGE_WITH_VIEWPORT = PAGE_WITHOUT_VIEWPORT.replace(
	'<title>',
	'<meta name="viewport" content="width=device-width, initial-scale=1"><title>'
);
const FEED = `<?xml version="1.0"?><rss version="2.0"><channel>
	<title>Wide Writer</title><link>https://wide-writer.example/</link><description>Words.</description>
	<item><title>A long, wide post</title><link>https://wide-writer.example/post</link>
		<pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate><description>Words about the week.</description></item>
</channel></rss>`;

async function followWriter(page: Page, html: string) {
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('**/robots.txt', (route) =>
		route.fulfill({ status: 200, contentType: 'text/plain', body: 'User-agent: *\nAllow: /' })
	);
	await page.route('https://wide-writer.example/', (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: html })
	);
	await page.route('https://wide-writer.example/feed.xml', (route) =>
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
	await page.getByLabel('Creator, website, or profile').fill('wide-writer.example');
	await page.getByRole('button', { name: 'Find feeds' }).click();
	await expect(page.getByText('Blog', { exact: true })).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: /Follow Wide Writer in/ }).click();
	await expect(page.getByText('Following Wide Writer')).toBeVisible();
}

test.describe('a followed site that looks built for desktop', () => {
	test('offers Save for later under its yips, and the yip still links out', async ({ page }) => {
		await followWriter(page, PAGE_WITHOUT_VIEWPORT);
		await page.goto('/feeds');

		const everything = page.getByRole('tabpanel', { name: 'Everything' });
		await expect(everything.getByText('Best on desktop', { exact: true })).toBeVisible();
		await everything.getByRole('button', { name: 'Save A long, wide post for later' }).click();
		await expect(page.getByText('Saved to your Shelf.')).toBeVisible();

		await page.goto('/you');
		const shelf = page.getByRole('region', { name: /^Shelf/ });
		await expect(shelf.getByText('A long, wide post')).toBeVisible();
		await expect(shelf.getByText(/Wide Writer · wide-writer\.example/)).toBeVisible();
	});

	test('offers nothing extra when the page declares a viewport', async ({ page }) => {
		await followWriter(page, PAGE_WITH_VIEWPORT);
		await page.goto('/feeds');

		await expect(page.getByRole('button', { name: /A long, wide post/ }).first()).toBeVisible();
		await expect(page.getByText('Best on desktop', { exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: /for later/ })).toHaveCount(0);
	});
});

test.describe('partner rings in Discover', () => {
	test('offer no ring switcher at all until a ring is registered', async ({ page }) => {
		await withRing(page);
		await page.goto('/');
		await expect(page.getByRole('button', { name: /^Switch ring/ })).toHaveCount(0);

		// Filtering by category still works and is unaffected: it never depended on a ring
		// being registered, and the button that opens it says "Filter", not "Switch ring".
		await expect(page.getByRole('button', { name: /^Filter the ring/ })).toBeVisible();
	});

	test.describe('with the fixture ring', () => {
		test.beforeEach(async ({ page }) => {
			await withRing(page);
			await recordOpens(page);
			await page.addInitScript(() => localStorage.setItem('yipden:partnerFixture', '1'));
		});

		test('show their own tab, labelled via the ring and linked to its hub', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^Switch ring/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			await expect(panel).toBeVisible();
			// The unsafe member never gets past the boundary.
			await expect(panel.getByRole('heading', { level: 3 })).toHaveText([
				'Ash & Ember',
				'Big Monitor Club'
			]);
			await expect(panel.getByText('via', { exact: false })).toHaveCount(2);

			const hub = panel.getByRole('link', { name: 'Fixture Ring' }).first();
			await expect(hub).toHaveAttribute('href', 'https://fixture-ring.example/');
			await hub.click();
			expect(await opened(page)).toEqual(['https://fixture-ring.example/']);
		});

		test('the switcher sits next to Shuffle, on its own, not inside Filter', async ({ page }) => {
			await page.goto('/');
			const switcher = page.getByRole('button', { name: /^Switch ring/ });
			const shuffle = page.getByRole('button', { name: 'Shuffle the ring' });
			await expect(switcher).toBeVisible();
			await expect(switcher).toHaveAttribute('aria-label', 'Switch ring: IndieNodes');

			// Filter opens its own sheet, with no ring choice inside it: the two are separate now.
			await page.getByRole('button', { name: /^Filter the ring/ }).click();
			await expect(page.getByRole('radiogroup', { name: 'Switch ring' })).toHaveCount(0);
			await page.keyboard.press('Escape');

			await switcher.click();
			await expect(page.getByRole('dialog', { name: 'Switch ring' })).toBeVisible();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await expect(switcher).toHaveAttribute('aria-label', 'Switch ring: Fixture Ring');

			// Adjacent in the header, not just both present somewhere on screen.
			const switcherBox = await switcher.boundingBox();
			const shuffleBox = await shuffle.boundingBox();
			expect(Math.abs((switcherBox?.y ?? 0) - (shuffleBox?.y ?? 100))).toBeLessThan(2);
			expect(switcherBox && shuffleBox && switcherBox.x < shuffleBox.x).toBe(true);
		});

		test('save a desktop first member for later, and link out for the rest', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^Switch ring/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			// The hero underneath is out of reach while the ring is showing: it cannot take focus.
			const heroFocusable = await page.evaluate(() =>
				['Shuffle the ring', 'Filter the ring'].map((label) => {
					const match = [...document.querySelectorAll<HTMLElement>('.discover button')].find(
						(button) =>
							!button.closest('.partner') &&
							(button.getAttribute('aria-label') === label || button.textContent?.trim() === label)
					);
					match?.focus();
					return match ? document.activeElement === match : null;
				})
			);
			expect(heroFocusable).toEqual([false, false]);
			await panel.getByRole('button', { name: 'Visit ash.example.com' }).click();
			expect(await opened(page)).toEqual(['https://ash.example.com/']);

			await expect(panel.getByRole('button', { name: /^Visit bmc/ })).toHaveCount(0);
			await panel.getByRole('button', { name: 'Save for later' }).click();
			await expect(panel.getByRole('button', { name: 'Saved to Shelf' })).toBeVisible();

			await page.goto('/you');
			await expect(
				page
					.getByRole('region', { name: /^Shelf/ })
					.getByText(/via Fixture Ring · bmc\.example\.org/)
			).toBeVisible();
		});

		test('offers a sample only for a member who has one, labelled honestly by what it actually is, and opens externally', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^Switch ring/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			// Not `.locator('..')`: the heading's immediate parent is `.title-row`, not the whole
			// card, since the title sits beside an optional thumbnail. `has` finds the card itself
			// regardless of how deep the heading sits inside it.
			const ashCard = panel.locator('li.card', { has: page.getByText('Ash & Ember') });
			const bmcCard = panel.locator('li.card', { has: page.getByText('Big Monitor Club') });
			// Ash & Ember has no sample at all; Big Monitor Club's is a SoundCloud link, not a
			// file, so the button says so rather than a bare, overpromising "Listen".
			await expect(ashCard.getByRole('button', { name: /Listen|Open on/ })).toHaveCount(0);
			await expect(bmcCard.getByRole('button', { name: 'Open on SoundCloud' })).toBeVisible();

			// The platform's own mark, not the generic play triangle every kind used to share.
			const iconPath = await bmcCard
				.getByRole('button', { name: 'Open on SoundCloud' })
				.locator('svg path')
				.first()
				.getAttribute('d');
			expect(iconPath).toContain('23.999 14.165');

			await bmcCard.getByRole('button', { name: 'Open on SoundCloud' }).click();
			expect(await opened(page)).toEqual(['https://soundcloud.com/bmc/a-track']);
		});

		test('folds and stands its cards the same way Feeds does, and turns off under reduced motion', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^Switch ring/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			// The stack lives on the scrolling half only, not the panel that also holds the pinned
			// "back to IndieNodes" head.
			await expect(panel.locator('.scroll')).toHaveClass(/\bstack\b/);
			await expect(panel.locator('li.card', { has: page.getByText('Ash & Ember') })).toHaveClass(
				/\byip-stack\b/
			);
		});

		test('reduced motion leaves it a flat, untransformed list', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto('/');
			await page.getByRole('button', { name: /^Switch ring/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			await expect(
				page.getByRole('region', { name: 'Fixture Ring members' }).locator('.scroll')
			).not.toHaveClass(/\bstack\b/);
		});

		/**
		 * The fixture ring only has two members, not enough to actually force `.scroll` to
		 * overflow at 390x844, so this checks the mechanism directly (the head sits outside the
		 * scrolling element, which genuinely scrolls) rather than empirically scrolling content
		 * that may not be tall enough to move at all.
		 */
		test('the back bar sits outside the scrolling area, so it cannot scroll away with it', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^Switch ring/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			const headOutsideScroll = await panel.evaluate((node) => {
				const head = node.querySelector('.head');
				const scroll = node.querySelector('.scroll');
				return !!head && !!scroll && !scroll.contains(head);
			});
			expect(headOutsideScroll).toBe(true);

			const overflowY = await panel
				.locator('.scroll')
				.evaluate((node) => getComputedStyle(node).overflowY);
			expect(overflowY).toBe('auto');
		});

		test('never join the IndieNodes rotation', async ({ page }) => {
			await page.goto('/');
			await expectMemberCount(page, 3);
			await page.getByRole('button', { name: /^Switch ring/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await page.getByRole('button', { name: /^IndieNodes/ }).click();

			// Back on the hero, in a ring of three, with the shuffle and swipe untouched.
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await expectMemberCount(page, 3);
			for (let i = 0; i < 3; i += 1) {
				await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(
					/Ash & Ember|Big Monitor Club/
				);
				await ringNext(page);
			}
		});
	});
});
