import { expect, type Page } from '@playwright/test';

/**
 * Advances or reverses through Discover's ring the way a reader now actually has to: an arrow
 * key. The prev/next buttons every one of these specs used to click were removed (2026-09-29,
 * see DECISIONS.md) in favor of teaching the gesture later rather than keeping a permanent
 * on-screen crutch for it; swipe itself already has its own dedicated, real pointer-drag
 * coverage in discover-swipe.spec.ts and is not what these call sites care about; they use
 * whichever quick, deterministic trigger moves the ring one member, and a key press is that.
 */
export async function ringNext(page: Page): Promise<void> {
	await page.keyboard.press('ArrowRight');
	await settled(page);
}

export async function ringPrev(page: Page): Promise<void> {
	await page.keyboard.press('ArrowLeft');
	await settled(page);
}

/**
 * `.click()` on the old buttons wound up implicitly synchronizing these calls, since Playwright's
 * own actionability check for a click waits for its target to stop moving first. A raw key press
 * has no such wait: fired again before the outgoing member's fly out transition has cleaned
 * itself up (`.body-inner[aria-hidden="true"]`, the same locator discover-swipe.spec.ts already
 * reads for the same element), it can land in the moment neither the old nor the new member's
 * heading is in the accessibility tree, which `getByRole('heading', ...)` then reports as not
 * found. Waiting for that leaving copy to be gone restores the synchronization `.click()` used to
 * give for free.
 */
async function settled(page: Page): Promise<void> {
	await expect(page.locator('.body-inner[aria-hidden="true"]')).toHaveCount(0, { timeout: 2000 });
}

/**
 * Opens Discover's More actions menu and returns its dialog, where Like, Not for me and Visit
 * site live (plus Follow for a member built for desktop). The hero keeps only the main action.
 */
export async function openActions(page: Page) {
	await page.getByRole('button', { name: 'More actions' }).click();
	const dialog = page.getByRole('dialog', { name: /^Actions for / });
	await expect(dialog).toBeVisible();
	return dialog;
}

/**
 * Leave records in the old plaintext IndexedDB store, as a phone upgraded from an earlier build
 * would have them, before the app first opens. The app moves them into the encrypted store and
 * deletes the old database on load. Done from a static file on the same origin, where the app
 * itself does not run.
 */
export async function seedOldStore(
	page: Page,
	records: { verdicts?: object[]; shelf?: object[] }
): Promise<void> {
	await page.goto('/favicon.svg');
	await page.evaluate(async (seed) => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('yipden', 3);
			request.onupgradeneeded = () => {
				request.result.createObjectStore('verdicts', { keyPath: 'id' });
				request.result.createObjectStore('shelf', { keyPath: 'id' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const tx = db.transaction(['verdicts', 'shelf'], 'readwrite');
		for (const record of seed.verdicts ?? []) tx.objectStore('verdicts').put(record);
		for (const record of seed.shelf ?? []) tx.objectStore('shelf').put(record);
		await new Promise((resolve) => (tx.oncomplete = resolve));
		db.close();
	}, records);
}
