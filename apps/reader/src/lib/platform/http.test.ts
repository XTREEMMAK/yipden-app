import { describe, expect, it, vi } from 'vitest';
import { abortable } from './http.js';

describe('abortable', () => {
	it('rejects promptly when a running native request is aborted', async () => {
		const controller = new AbortController();
		let release: () => void = () => {};
		const work = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
		const request = abortable(work, controller.signal);

		controller.abort();
		await expect(request).rejects.toMatchObject({ name: 'AbortError' });
		expect(work).toHaveBeenCalledOnce();
		release();
	});

	it('does not start a native request when already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const work = vi.fn(async () => undefined);

		await expect(abortable(work, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
		expect(work).not.toHaveBeenCalled();
	});
});
