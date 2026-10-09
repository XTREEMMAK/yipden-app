import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const profile = process.env.YIPDEN_GAMES ?? 'realm';
const included = profile === 'thin' ? [] : profile === 'all' ? ['realm', 'stray'] : [profile];
function audit(): { chunks: { file: string; games: string[] }[] } {
	return JSON.parse(readFileSync(join(process.cwd(), 'build/game-build.json'), 'utf8'));
}
const title = (id: string) => (id === 'realm' ? 'Realm' : 'The Stray');

test('cold launch stays offline and loads no player code or reference', async ({ page }) => {
	const gameChunks = audit()
		.chunks.filter((chunk) => chunk.games.length)
		.map((chunk) => chunk.file);
	const requested: string[] = [],
		external: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		requested.push(url.pathname);
		if (url.hostname !== '127.0.0.1') external.push(request.url());
	});
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Games Lab', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(included.length);
	expect(
		requested.filter(
			(path) => gameChunks.some((chunk) => path.endsWith(chunk)) || path.startsWith('/references/')
		)
	).toEqual([]);
	expect(external).toEqual([]);
	expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

for (const id of included) {
	test(`${id} loads explicitly, pauses, resumes and exits repeatedly`, async ({ page }) => {
		const requested: string[] = [];
		page.on('request', (request) => requested.push(new URL(request.url()).pathname));
		await page.goto('/');
		for (let run = 0; run < 3; run++) {
			await page.getByRole('button', { name: `Play ${title(id)}`, exact: true }).click();
			await expect(
				page.getByRole('heading', { name: `${title(id)} player scaffold` })
			).toBeVisible();
			await page.getByRole('button', { name: 'Pause', exact: true }).click();
			await expect(page.getByText('Session paused', { exact: true })).toBeVisible();
			await page.getByRole('button', { name: 'Resume', exact: true }).click();
			await expect(page.getByText('Session active', { exact: true })).toBeVisible();
			await page.getByRole('button', { name: 'Exit game', exact: true }).click();
			await expect(page.getByRole('heading', { name: `${title(id)} player scaffold` })).toHaveCount(
				0
			);
			await expect(
				page.getByRole('button', { name: `Play ${title(id)}`, exact: true })
			).toBeFocused();
		}
		const own = audit().chunks.filter((chunk) => chunk.games.includes(id));
		expect(requested.some((path) => own.some((chunk) => path.endsWith(chunk.file)))).toBe(true);
		const others = audit().chunks.filter((chunk) => chunk.games.some((game) => game !== id));
		expect(requested.some((path) => others.some((chunk) => path.endsWith(chunk.file)))).toBe(false);
	});
}

test('a Realm reference starts only on request and closes its iframe', async ({ page }) => {
	test.skip(process.env.YIPDEN_GAME_REFERENCES !== '1' || !included.includes('realm'));
	await page.goto('/');
	await page.getByRole('button', { name: 'Open Realm prototype' }).click();
	const frame = page.frameLocator('iframe[title="Realm reference prototype"]');
	await expect(frame.locator('#realmLabel')).toContainText('REALM 1', { timeout: 20000 });
	await page.getByRole('button', { name: 'Close prototype' }).click();
	await expect(page.locator('iframe')).toHaveCount(0);
});
