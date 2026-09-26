import { expect, test, type Page } from '@playwright/test';

/**
 * "From the ring" in Feeds' Listen pane: per-member cards, continuous play across members, a
 * queue a reader can reorder and trim, and a prompt once a member's own tracks run out. Real
 * (if silent, and deliberately brief) audio, the same approach player.spec.ts uses, so `ended`
 * genuinely fires rather than being simulated.
 */

/** PCM 16-bit mono WAV, built by hand: no fixture binary to commit. */
function silentWav(seconds: number, sampleRate = 8000): Buffer {
	const frames = Math.round(seconds * sampleRate);
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

const RING = {
	version: '1.0',
	entries: [
		{
			id: 'ada-ring',
			creator: 'Ada Reed',
			type: 'audio',
			form: 'music',
			why: 'Synth music.',
			tags: ['synth'],
			thumb_url: 'https://example.com/ada.jpg',
			source_url: 'https://ada.example.com/',
			verification_token: 'a',
			joined_at: '2026-01-01T00:00:00.000Z',
			tracks: [{ label: 'Ada Track One', media_url: 'https://example.com/ada-1.wav' }]
		},
		{
			id: 'bo-ring',
			creator: 'Bo Quill',
			type: 'audio',
			form: 'music',
			why: 'Lofi beats.',
			tags: ['synth'],
			thumb_url: 'https://example.com/bo.jpg',
			source_url: 'https://bo.example.com/',
			verification_token: 'b',
			joined_at: '2026-02-01T00:00:00.000Z',
			tracks: [
				{ label: 'Bo Track One', media_url: 'https://example.com/bo-1.wav' },
				{ label: 'Bo Track Two', media_url: 'https://example.com/bo-2.wav' }
			]
		}
	]
};

/**
 * `trackSeconds` defaults long enough that a track is still playing when a test finishes
 * poking at it, and is shortened only by the one test that needs `ended` to fire for real.
 */
async function seed(page: Page, trackSeconds = 4, shuffleRandom = 0.999) {
	const track = silentWav(trackSeconds);
	// Music shuffle is on by default. A constant random source makes it deterministic: 0.999
	// swaps nothing (so the order is the published one), 0 reverses a pair.
	await page.addInitScript((value) => {
		Math.random = () => value;
	}, shuffleRandom);
	await page.route('https://**', (route) => route.fulfill({ status: 404, body: 'not mocked' }));
	await page.route('https://ring.indienodes.us/ring.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RING) })
	);
	await page.route('https://example.com/*.wav', (route) =>
		route.fulfill({ status: 200, contentType: 'audio/wav', body: track })
	);
	await page.route('https://example.com/*.jpg', (route) => route.abort());

	await page.goto('/feeds');
	await page.getByRole('tab', { name: 'Listen' }).click();
	await page.getByText('From the IndieNodes webring').waitFor({ timeout: 10_000 });
}

/**
 * Tapping Play opens the full screen player over the cards, so a real tap on +Queue underneath
 * would hit the player instead. Collapsing, tapping, and reopening is already covered by
 * player.spec.ts; this dispatches the click straight to the button so the test stays about
 * what queueing does, not about the player's own sheet handling.
 */
async function queueBoWhilePlaying(page: Page) {
	await page.getByRole('button', { name: 'Add Bo Quill to the queue' }).dispatchEvent('click');
}

async function queueTitles(page: Page): Promise<string[]> {
	return page.locator('.queue-title').allTextContents();
}

test.describe('From the ring', () => {
	test('shows one card per member, not a flat list of tracks', async ({ page }) => {
		await seed(page);
		await expect(page.getByRole('button', { name: 'Play Ada Reed' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Play Bo Quill' })).toBeVisible();
		await expect(page.getByText('1 track')).toBeVisible();
		await expect(page.getByText('2 tracks')).toBeVisible();
		// The old per-track rows are gone: a track's own label is not shown anywhere.
		await expect(page.getByText('Ada Track One')).not.toBeVisible();
	});

	test('playing a member starts a fresh session with just their tracks', async ({ page }) => {
		await seed(page);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();

		await expect(page.getByRole('heading', { name: 'Ada Track One' })).toBeVisible();
		// Alone in the queue, and not looping: nothing to advance to yet.
		await expect(page.getByRole('button', { name: /Up next/ })).toBeDisabled();
	});

	test('+Queue appends a second member without interrupting playback', async ({ page }) => {
		await seed(page);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await expect(page.getByRole('heading', { name: 'Ada Track One' })).toBeVisible();

		await queueBoWhilePlaying(page);
		// Still on Ada: queueing never interrupts what is already playing.
		await expect(page.getByRole('heading', { name: 'Ada Track One' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Up next/ })).toContainText('Bo Track One');
	});

	test('running out of a solo member prompts to continue with someone new', async ({ page }) => {
		await seed(page, 0.4);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await expect(page.getByRole('heading', { name: 'Ada Track One' })).toBeVisible();

		await expect(page.getByText('Queue finished.')).toBeVisible({ timeout: 10_000 });
		await expect(
			page.getByRole('region', { name: 'Now playing' }).getByText('Bo Quill')
		).toBeVisible();
		await page.getByRole('button', { name: 'Keep going' }).click();

		await expect(page.getByRole('heading', { name: 'Bo Track One' })).toBeVisible();
		await expect(page.getByText('Queue finished.')).not.toBeVisible();
	});

	test('the queue panel lists every track and removal adjusts the playhead', async ({ page }) => {
		await seed(page);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await queueBoWhilePlaying(page);

		await page.getByRole('button', { name: 'Open the queue' }).click();
		const sheet = page.getByRole('dialog', { name: 'Queue' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByText('Ada Track One')).toBeVisible();
		await expect(sheet.getByText('Bo Track One')).toBeVisible();
		await expect(sheet.getByText('Bo Track Two')).toBeVisible();

		await sheet.getByRole('button', { name: 'Remove Ada Track One from the queue' }).click();
		await expect(sheet.getByText('Ada Track One')).not.toBeVisible();
		await expect(page.getByRole('heading', { name: 'Bo Track One' })).toBeVisible();
	});

	test('a ring session survives closing the app, restored paused in the mini player', async ({
		page
	}) => {
		await seed(page);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await queueBoWhilePlaying(page);
		await expect(page.getByRole('button', { name: /Up next/ })).toContainText('Bo Track One');

		// The save is fire-and-forget from an effect; give IndexedDB a moment before "closing".
		await page.waitForTimeout(500);
		await page.reload();

		const mini = page.getByRole('button', { name: 'Open the player' });
		await expect(mini).toBeVisible();
		await expect(mini).toContainText('Ada Track One');
		// Restoring never starts audio on its own: the reader presses play.
		await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);

		await mini.click();
		await expect(page.getByRole('button', { name: /Up next/ })).toContainText('Bo Track One');
	});

	test('an emptied ring queue is not restored on the next launch', async ({ page }) => {
		await seed(page);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await queueBoWhilePlaying(page);
		await page.getByRole('button', { name: 'Open the queue' }).click();
		const sheet = page.getByRole('dialog', { name: 'Queue' });

		await sheet.getByRole('button', { name: 'Remove Ada Track One from the queue' }).click();
		await sheet.getByRole('button', { name: 'Remove Bo Track One from the queue' }).click();
		await sheet.getByRole('button', { name: 'Remove Bo Track Two from the queue' }).click();
		await expect(page.getByRole('button', { name: 'Open the player' })).toHaveCount(0);

		await page.waitForTimeout(500);
		await page.reload();
		await expect(page.getByRole('button', { name: 'Open the player' })).toHaveCount(0);
	});

	test('every new control clears the 44px minimum', async ({ page }) => {
		await seed(page);
		for (const name of ['Play Ada Reed', 'Add Bo Quill to the queue']) {
			const box = await page.getByRole('button', { name }).boundingBox();
			expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
			expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		}

		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await queueBoWhilePlaying(page);
		await page.getByRole('button', { name: 'Open the queue' }).click();
		const sheet = page.getByRole('dialog', { name: 'Queue' });
		for (const name of [/^Reorder Ada Track One/, 'Remove Ada Track One from the queue']) {
			const box = await sheet.getByRole('button', { name }).boundingBox();
			expect(box?.width ?? 0, name).toBeGreaterThanOrEqual(44);
			expect(box?.height ?? 0, name).toBeGreaterThanOrEqual(44);
		}
	});

	test('dragging a queue row by its grip reorders the queue', async ({ page }) => {
		await seed(page);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await queueBoWhilePlaying(page);
		await page.getByRole('button', { name: 'Open the queue' }).click();
		await expect
			.poll(() => queueTitles(page))
			.toEqual(['Ada Track One', 'Bo Track One', 'Bo Track Two']);

		const grip = page.getByRole('button', { name: /^Reorder Bo Track Two/ });
		const box = (await grip.boundingBox())!;
		const rowHeight = (await page.locator('.queue-row').first().boundingBox())!.height;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - rowHeight * 1.1, {
			steps: 6
		});
		await page.mouse.up();

		await expect
			.poll(() => queueTitles(page))
			.toEqual(['Ada Track One', 'Bo Track Two', 'Bo Track One']);
		// The playhead stays on the track that was playing.
		await expect(page.locator('.queue-row.is-current .queue-title')).toHaveText('Ada Track One');
	});

	test('the grip also reorders with the arrow keys', async ({ page }) => {
		await seed(page);
		await page.getByRole('button', { name: 'Play Ada Reed' }).click();
		await queueBoWhilePlaying(page);
		await page.getByRole('button', { name: 'Open the queue' }).click();

		const grip = page.getByRole('button', { name: /^Reorder Bo Track One/ });
		await grip.focus();
		await grip.press('ArrowDown');
		await expect
			.poll(() => queueTitles(page))
			.toEqual(['Ada Track One', 'Bo Track Two', 'Bo Track One']);
		// Focus stays with the moved row, so a second press keeps moving it.
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowUp');
		await expect
			.poll(() => queueTitles(page))
			.toEqual(['Ada Track One', 'Bo Track Two', 'Bo Track One']);
	});

	test('music is shuffled by default, and the You switch turns it off', async ({ page }) => {
		// random = 0 reverses a two track member, so a shuffle is visible as Track Two first.
		await seed(page, 4, 0);
		await page.getByRole('button', { name: 'Play Bo Quill' }).click();
		await expect(page.getByRole('heading', { name: 'Bo Track Two' })).toBeVisible();

		await page.goto('/you');
		const shuffle = page.getByRole('switch', { name: 'Shuffle music' });
		await expect(shuffle).toBeChecked();
		await shuffle.uncheck();
		await page.waitForTimeout(300);

		await page.reload();
		await expect(page.getByRole('switch', { name: 'Shuffle music' })).not.toBeChecked();
		await page.goto('/feeds');
		await page.getByRole('tab', { name: 'Listen' }).click();
		await page.getByRole('button', { name: 'Play Bo Quill' }).click();
		await expect(page.getByRole('heading', { name: 'Bo Track One' })).toBeVisible();
	});
});
