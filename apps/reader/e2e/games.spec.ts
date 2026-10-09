import { expect, test } from '@playwright/test';
const enabled = (process.env.YIPDEN_GAMES ?? 'thin') !== 'thin';
test('game launcher follows the build registry and does not preload implementations', async ({
	page
}) => {
	await page.route('https://**/*', (route) => route.abort());
	await page.goto('/you/');
	const launcher = page.getByRole('link', { name: 'Play games', exact: true });
	await expect(launcher).toHaveCount(enabled ? 1 : 0);
	if (enabled) {
		await expect(launcher).toHaveAttribute('data-sveltekit-preload-data', 'false');
		await expect(launcher).toHaveAttribute('data-sveltekit-preload-code', 'false');
		await launcher.click();
		await expect(page.getByRole('heading', { name: 'Play', exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: /player scaffold/ })).toHaveCount(0);
		const name = (process.env.YIPDEN_GAMES ?? 'realm') === 'stray' ? 'The Stray' : 'Realm';
		await page.getByRole('button', { name: `Play ${name}`, exact: true }).click();
		await expect(page.getByRole('heading', { name: `${name} player scaffold` })).toBeVisible();
		await page.getByRole('link', { name: 'Back to You' }).click();
		await expect(page).toHaveURL(/\/you\//);
	}
});
