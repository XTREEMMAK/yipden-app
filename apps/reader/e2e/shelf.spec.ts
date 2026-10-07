import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openActions, ringNext } from './support.js';

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
		const actions = await openActions(page);
		await expect(actions.getByRole('button', { name: 'Follow all' })).toBeVisible();
		await actions.getByRole('button', { name: 'Visit site' }).click();
		expect(await opened(page)).toEqual(['https://wide.example.com/']);
	});

	test('a reader can overrule the layout and add a track of their own, labelled as theirs', async ({
		page
	}) => {
		await page.goto('/');
		await chooseFilter(page, 'Comics');
		await expect(page.getByRole('button', { name: 'Save for later' })).toBeVisible();

		const actions = await openActions(page);
		await actions.getByRole('button', { name: 'Their profile' }).click();
		await expect(page).toHaveURL(/\/creator\/?\?site=https%3A%2F%2Fwide\.example\.com/);
		await expect(page.getByRole('heading', { level: 1, name: 'Wide Screen' })).toBeVisible();
		const notes = page;
		await notes.getByLabel('Reads best on').selectOption('mobile-friendly');

		// What it is comes first: nothing to fill in until a kind is picked.
		await expect(notes.getByLabel('Add a track by link')).toHaveCount(0);
		await notes.getByRole('radio', { name: 'Track' }).click();
		await notes.getByLabel('Add a track by link').fill('http://wide.example.com/a.mp3');
		await notes.getByRole('button', { name: 'Add track' }).click();
		await expect(page.getByText('That link cannot be used.', { exact: false })).toBeVisible();

		await notes
			.getByLabel('Add a track by link')
			.fill('https://wide.example.com/audio/night_drive.mp3');
		await notes.getByRole('button', { name: 'Add track' }).click();
		await expect(notes.getByText('night drive')).toBeVisible();
		await expect(notes.getByText(/Added by you/)).toBeVisible();

		await page.getByRole('button', { name: 'Back' }).click();
		await expect(page).not.toHaveURL(/\/creator/);
		// Now read as fine on a phone: the usual actions, not Save for later.
		await expect(page.getByText('Best on desktop', { exact: true })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Save for later' })).toHaveCount(0);

		// Kept across a relaunch.
		await page.reload();
		await chooseFilter(page, 'Comics');
		await expect(page.getByText('Best on desktop', { exact: true })).toHaveCount(0);
		const again = await openActions(page);
		await again.getByRole('button', { name: 'Their profile' }).click();
		await expect(page.getByText('night drive')).toBeVisible();
		await page.getByRole('button', { name: 'Remove night drive' }).click();
		await expect(page.getByText('night drive')).toHaveCount(0);
	});

	test('a kept track is in the Library, reached from the toast, searchable and arranged', async ({
		page
	}) => {
		await page.goto('/you?tab=library');
		const library = page.getByRole('region', { name: /^Library/ });
		await expect(library.getByText(/Everything you keep, in one place/)).toBeVisible();

		await page.goto('/');
		await chooseFilter(page, 'Comics');
		const actions = await openActions(page);
		await actions.getByRole('button', { name: 'Their profile' }).click();
		const notes = page;
		await notes.getByRole('radio', { name: 'Track' }).click();
		await notes
			.getByLabel('Add a track by link')
			.fill('https://wide.example.com/audio/night_drive.mp3');
		await notes.getByRole('button', { name: 'Add track' }).click();
		const toast = page.getByRole('status');
		await expect(toast).toContainText('Kept to Library');

		await toast.getByRole('button', { name: 'View' }).click();
		await expect(page).toHaveURL(
			/\/you\/?\?tab=library&library=creator&of=wide\.example\.com#library$/
		);
		await expect(library).toContainText('1 track');
		await expect(library.getByText('Showing Wide Screen')).toBeVisible();
		// Narrowed to one creator, so arranged by creator.
		const tracks = library.getByRole('list', { name: 'Wide Screen' });
		await expect(tracks.locator('li.marked')).toContainText('night drive');
		await expect(tracks.getByText(/Wide Screen · Track ·/)).toBeVisible();
		await expect(tracks.getByRole('button', { name: /^Visit Wide Screen’s site/ })).toBeVisible();

		await library.getByRole('button', { name: 'Show everything' }).click();
		await library.getByRole('radio', { name: 'By type' }).click();
		await expect(library.getByRole('list', { name: 'Tracks' })).toBeVisible();

		const search = library.getByRole('searchbox', { name: 'Search your Library' });
		await search.fill('night wide');
		await expect(library.getByText('night drive')).toBeVisible();
		await search.fill('nothing like it');
		await expect(library.getByText('Nothing matches “nothing like it”.')).toBeVisible();
		await search.fill('');

		await library.getByRole('button', { name: /^Remove night drive from your Library/ }).click();
		await expect(library.getByText(/Everything you keep, in one place/)).toBeVisible();
	});

	test('keeps the usual actions for a member who declared nothing, or something unknown', async ({
		page
	}) => {
		await page.goto('/');
		for (const label of ['Words', 'Art']) {
			await chooseFilter(page, label);
			await expect(page.getByRole('button', { name: /Follow all/ })).toBeVisible();
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
		await expect(page.getByText('Saved for later, in your Library.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Saved' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// The toast's View goes straight there, to the Library's links, with the new one picked out.
		await page.getByRole('status').getByRole('button', { name: 'View' }).click();
		await expect(page).toHaveURL(/\/you\/?\?tab=library&library=type&of=links#library$/);
		const shelf = page.getByRole('region', { name: /^Library/ });
		await expect(shelf).toContainText('1 link');
		await expect(shelf.getByText('Showing Links')).toBeVisible();
		await expect(shelf.locator('li.marked')).toContainText('Wide Screen');
		await expect(shelf.getByText('Wide Screen').first()).toBeVisible();
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

		await page.goto('/you?tab=library');
		await shelf.getByRole('button', { name: /^Open Wide Screen/ }).click();
		expect(await opened(page)).toEqual(['https://wide.example.com/']);

		await shelf.getByRole('button', { name: /^Remove Wide Screen/ }).click();
		await expect(shelf.getByText(/Everything you keep, in one place/)).toBeVisible();
		await page.reload();
		await expect(
			page.getByRole('region', { name: /^Library/ }).getByText(/Everything you keep, in one place/)
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
			page.getByRole('button', { name: 'More actions' })
		]);

		await page.goto('/you?tab=library');
		const shelf = page.getByRole('region', { name: /^Library/ });
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

		await page.goto('/you?tab=library');
		await expect(
			page.getByRole('region', { name: /^Library/ }).getByRole('button', { name: /^Open / })
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
		await expect(page.getByText('Saved for later, in your Library.')).toBeVisible();

		await page.goto('/you?tab=library');
		const shelf = page.getByRole('region', { name: /^Library/ });
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

/** The partner ring's Filter sheet: open it, do something, and close it with Done. */
async function inPartnerFilter(
	page: Page,
	work: (sheet: ReturnType<Page['getByRole']>) => Promise<void>
) {
	await page.getByRole('button', { name: /^Filter Fixture Ring/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Filter Fixture Ring' });
	await work(sheet);
	await sheet.getByRole('button', { name: 'Done' }).click();
	await expect(sheet).toHaveCount(0);
}

/** How many members are explored, as the Filter sheet counts them. */
async function expectExplored(page: Page, count: number) {
	await inPartnerFilter(page, async (sheet) => {
		await expect(sheet.getByRole('radio', { name: /^Explored/ })).toContainText(String(count));
	});
}

async function chooseShow(page: Page, label: string) {
	await inPartnerFilter(page, (sheet) =>
		sheet.getByRole('radio', { name: new RegExp(`^${label}`) }).click()
	);
}

test.describe('partner rings in Discover', () => {
	test('with no ring registered, the switcher offers IndieNodes, with Surf and Forums beside it', async ({
		page
	}) => {
		await withRing(page);
		await page.goto('/');
		await page.getByRole('button', { name: /^What to discover/ }).click();
		const kind = page.getByRole('radiogroup', { name: 'What to discover' });
		await expect(kind.getByRole('radio')).toHaveText(['Webrings', 'Surf', 'Forums']);
		await expect(page.getByRole('radiogroup', { name: 'Webrings' }).getByRole('radio')).toHaveText([
			/IndieNodes Webring/
		]);
		await page.keyboard.press('Escape');

		// Filtering by category still works and is unaffected: it never depended on a ring
		// being registered, and the button that opens it says "Filter", not "What to discover".
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
			await page.getByRole('button', { name: /^What to discover/ }).click();
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

		test('a card swiped left is explored, the check top right undoes it, and the hint goes', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			const hint = panel.getByRole('note');
			await expect(hint).toContainText('Swipe a card left');
			// The panel slides in: measure the card where it settles, not where it is on the way.
			await expect.poll(() => panel.evaluate((el) => el.getAnimations().length)).toBe(0);

			const card = panel.locator('.card').first();
			const box = (await card.boundingBox())!;
			const y = box.y + box.height / 2;
			await page.mouse.move(box.x + box.width - 20, y);
			await page.mouse.down();
			for (let step = 1; step <= 10; step += 1) {
				await page.mouse.move(box.x + box.width - 20 - step * 25, y);
			}
			await page.mouse.up();

			await expectExplored(page, 1);
			await expect(hint).toHaveCount(0);
			const check = panel.getByRole('button', { name: 'Unmark Ash & Ember as explored' });
			await check.click();
			await expectExplored(page, 0);

			// Every action on a card fits one row: the icon buttons share one top edge.
			const icons = card.locator('.acts').last().locator('button');
			const tops = await icons.evaluateAll((buttons) =>
				buttons.map((button) => Math.round(button.getBoundingClientRect().top))
			);
			expect(new Set(tops).size).toBe(1);

			await page.reload();
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await expect(page.getByRole('note')).toHaveCount(0);
		});

		test('marks members explored, filters by it either way, and keeps the search after leaving', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			await expectExplored(page, 0);

			// Visiting someone counts as looking at them.
			await panel
				.getByRole('button', { name: /^Visit/ })
				.first()
				.click();
			await expectExplored(page, 1);
			await expect(
				panel.getByRole('button', { name: 'Unmark Ash & Ember as explored' })
			).toHaveAttribute('aria-pressed', 'true');

			await chooseShow(page, 'Not explored yet');
			await expect(panel.getByRole('heading', { level: 3 })).toHaveText(['Big Monitor Club']);
			await expect(
				page.getByRole('button', { name: /^Filter Fixture Ring: not explored yet/ })
			).toBeVisible();
			// And the other way round: only the ones already explored.
			await chooseShow(page, 'Explored');
			await expect(panel.getByRole('heading', { level: 3 })).toHaveText(['Ash & Ember']);
			await chooseShow(page, 'Everyone');

			await panel.getByRole('searchbox').fill('monitor');
			await expect(panel.getByRole('heading', { level: 3 })).toHaveText(['Big Monitor Club']);

			// Away to Feeds and back: the ring, its search and the marks are all still there.
			await page.getByRole('link', { name: 'Feeds' }).click();
			await page.getByRole('link', { name: 'Discover' }).click();
			const again = page.getByRole('region', { name: 'Fixture Ring members' });
			await expect(again.getByRole('searchbox')).toHaveValue('monitor');
			await expect(again.getByRole('heading', { level: 3 })).toHaveText(['Big Monitor Club']);
			await expectExplored(page, 1);

			// And after a relaunch.
			await page.reload();
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await expect(page.getByRole('searchbox')).toHaveValue('monitor');
			await expectExplored(page, 1);
		});

		test('the switcher sits next to Shuffle, on its own, not inside Filter', async ({ page }) => {
			await page.goto('/');
			const switcher = page.getByRole('button', { name: /^What to discover/ });
			const shuffle = page.getByRole('button', { name: 'Shuffle the ring' });
			await expect(switcher).toBeVisible();
			await expect(switcher).toHaveAttribute('aria-label', 'What to discover: IndieNodes');

			// Filter opens its own sheet, with no ring choice inside it: the two are separate now.
			await page.getByRole('button', { name: /^Filter the ring/ }).click();
			await expect(page.getByRole('radiogroup', { name: 'What to discover' })).toHaveCount(0);
			await page.keyboard.press('Escape');

			await switcher.click();
			await expect(page.getByRole('dialog', { name: 'What to discover' })).toBeVisible();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await expect(switcher).toHaveAttribute('aria-label', 'What to discover: Fixture Ring');

			// Adjacent in the header, not just both present somewhere on screen.
			const switcherBox = await switcher.boundingBox();
			const shuffleBox = await shuffle.boundingBox();
			expect(Math.abs((switcherBox?.y ?? 0) - (shuffleBox?.y ?? 100))).toBeLessThan(2);
			expect(switcherBox && shuffleBox && switcherBox.x < shuffleBox.x).toBe(true);
		});

		test('save a desktop first member for later, and link out for the rest', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
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
			await expect(panel.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

			await page.goto('/you?tab=library');
			await expect(
				page
					.getByRole('region', { name: /^Library/ })
					.getByText(/via Fixture Ring · bmc\.example\.org/)
			).toBeVisible();
		});

		test('offers a sample only for a member who has one, labelled honestly by what it actually is, and opens the way Visit does', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			// Not `.locator('..')`: the heading's immediate parent is `.title-row`, not the whole
			// card, since the title sits beside an optional thumbnail. `has` finds the card itself
			// regardless of how deep the heading sits inside it.
			const ashCard = panel.locator('li.yip-stack', { has: page.getByText('Ash & Ember') });
			const bmcCard = panel.locator('li.yip-stack', { has: page.getByText('Big Monitor Club') });
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

			// The web build has no in-app browser, so this falls back to the system one, as Visit
			// does; on a phone both open in the app with this member as the creator.
			await bmcCard.getByRole('button', { name: 'Open on SoundCloud' }).click();
			expect(await opened(page)).toEqual(['https://soundcloud.com/bmc/a-track']);
			await expectExplored(page, 1);
		});

		test('folds and stands its cards the same way Feeds does, and turns off under reduced motion', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();

			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			// The stack lives on the scrolling half only, not the panel that also holds the pinned
			// "back to IndieNodes" head.
			await expect(panel.locator('.scroll')).toHaveClass(/\bstack\b/);
			await expect(
				panel.locator('li.yip-stack', { has: page.getByText('Ash & Ember') })
			).toHaveClass(/\byip-stack\b/);
			// The drawn card is held at the top by the scroller, as in Feeds. A card style of its own
			// once overrode this, and a ring's cards scrolled away instead of folding in place.
			await expect(panel.locator('.yip-fold').first()).toHaveCSS('position', 'sticky');
		});

		test('reduced motion leaves it a flat, untransformed list', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
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
			await page.getByRole('button', { name: /^What to discover/ }).click();
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

		test('Back returns to Discover instead of leaving the app', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			await expect(panel).toBeVisible();

			await page.goBack();
			await expect(panel).toHaveCount(0);
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			expect(new URL(page.url()).pathname).toBe('/');

			// The back bar pops the same entry, so a second Back has nothing of the panel's left.
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await expect(panel).toBeVisible();
			await page.getByRole('button', { name: 'Back to IndieNodes Webring' }).click();
			await expect(panel).toHaveCount(0);
			expect(await page.evaluate(() => window.history.state?.yipdenRing ?? null)).toBeNull();
		});

		test('back from a member’s profile, one Back still returns to Discover', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			await expect(panel).toBeVisible();

			await panel.getByRole('button', { name: "Ash & Ember's profile" }).click();
			await expect(page.getByRole('heading', { level: 1, name: 'Ash & Ember' })).toBeVisible();
			await page.getByRole('button', { name: 'Back' }).click();
			await expect(panel).toBeVisible();

			await page.goBack();
			await expect(panel).toHaveCount(0);
			expect(new URL(page.url()).pathname).toBe('/');
		});

		test('search and the genre filter narrow the ring, generically', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			const names = panel.getByRole('heading', { level: 3 });
			await expect(names).toHaveText(['Ash & Ember', 'Big Monitor Club']);

			await panel.getByRole('searchbox', { name: 'Search Fixture Ring members' }).fill('monitor');
			await expect(names).toHaveText(['Big Monitor Club']);
			await panel.getByRole('searchbox').fill('');

			await inPartnerFilter(page, (sheet) => sheet.getByRole('radio', { name: /^Zines/ }).click());
			await expect(names).toHaveText(['Ash & Ember']);
			await panel.getByRole('searchbox').fill('monitor');
			await expect(names).toHaveCount(0);
			await expect(panel.getByText(/Nobody here matches “monitor” in Zines/)).toBeVisible();

			await inPartnerFilter(page, (sheet) =>
				sheet.getByRole('radio', { name: 'All genres' }).click()
			);
			await expect(names).toHaveText(['Big Monitor Club']);
		});

		test('any member can be saved for later, not only a desktop-first one', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			const panel = page.getByRole('region', { name: 'Fixture Ring members' });
			const save = panel.getByRole('button', { name: 'Save Ash & Ember for later' });
			await save.click();
			await expect(save).toHaveAttribute('aria-pressed', 'true');

			await page.goto('/you?tab=library');
			await expect(
				page
					.getByRole('region', { name: /^Library/ })
					.getByText(/via Fixture Ring · ash\.example\.com/)
			).toBeVisible();
		});

		test('the hidden hero stops drifting and the tab bar stops blurring while a ring is open', async ({
			page
		}) => {
			await page.goto('/');
			const drift = page.locator('.drift');
			const bar = page.getByRole('navigation', { name: 'Main' });
			await expect(drift).not.toHaveClass(/paused/);
			await expect(bar).not.toHaveClass(/solid/);

			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await expect(drift).toHaveClass(/paused/);
			await expect(bar).toHaveClass(/solid/);
			expect(await bar.evaluate((node) => getComputedStyle(node).backdropFilter)).toBe('none');

			await page.getByRole('button', { name: 'Back to IndieNodes Webring' }).click();
			await expect(drift).not.toHaveClass(/paused/);
			await expect(bar).not.toHaveClass(/solid/);
		});

		test('the intro note scrolls away with the cards, and the title stays pinned', async ({
			page
		}) => {
			await page.goto('/');
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			const pane = page.locator('.partner .scroll');
			// Inside the scroller, so it costs nothing per frame and never resizes it mid-fling.
			await expect(pane.locator('.note.intro')).toContainText('Another ring');
			await expect(page.locator('.partner .head .note')).toHaveCount(0);
			await expect(page.locator('.partner .head h2')).toHaveText('Fixture Ring');
		});

		test('never join the IndieNodes rotation', async ({ page }) => {
			await page.goto('/');
			await expectMemberCount(page, 3);
			await page.getByRole('button', { name: /^What to discover/ }).click();
			await page.getByRole('radio', { name: /Fixture Ring/ }).click();
			await page.getByRole('button', { name: 'Back to IndieNodes Webring' }).click();

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
