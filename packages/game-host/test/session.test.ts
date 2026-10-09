import { describe, expect, it, vi } from 'vitest';
import { SessionController } from '../src/session.js';
import type { GameEntry, GameHost, GameModule, GameSession } from '@yipden/game-contracts';
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
const host: GameHost = {
	surface: 'lab',
	beforeStart: () => {},
	page: null,
	requestExit: vi.fn(),
	saves: { read: async () => null, write: async () => {} }
};
const options = { target: {} as HTMLElement, host };
const session = (): GameSession => ({ pause: vi.fn(), resume: vi.fn(), destroy: vi.fn() });
function entry(load: GameEntry['load']): GameEntry {
	return { id: 'realm', title: 'Realm', description: '', load };
}

describe('host lifecycle', () => {
	it('does not mount an import that finishes after cancellation', async () => {
		const pending = deferred<GameModule>(),
			mount = vi.fn(),
			cleanup = vi.fn();
		const controller = new SessionController();
		const start = controller.start(
			entry(() => pending.promise),
			options,
			cleanup
		);
		await Promise.resolve();
		await controller.stop();
		pending.resolve({ mount });
		await start;
		expect(mount).not.toHaveBeenCalled();
		expect(cleanup).toHaveBeenCalledOnce();
	});
	it('destroys a late mounted session without reclaiming the surface', async () => {
		const pending = deferred<GameSession>(),
			old = session(),
			cleanup = vi.fn();
		const controller = new SessionController(),
			states: string[] = [];
		controller.subscribe((value) => states.push(value.state));
		const mount = vi.fn(() => pending.promise);
		const start = controller.start(
			entry(async () => ({ mount })),
			options,
			cleanup
		);
		await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
		await controller.stop();
		pending.resolve(old);
		await start;
		expect(old.destroy).toHaveBeenCalledOnce();
		expect(cleanup).toHaveBeenCalledOnce();
		expect(states.at(-1)).toBe('idle');
	});
	it('cancels while the host prepares without starting a game import', async () => {
		const pending = deferred<void>(),
			load = vi.fn(),
			cleanup = vi.fn();
		const preparing = vi.fn(() => pending.promise);
		const controller = new SessionController();
		const start = controller.start(
			entry(load),
			{ ...options, host: { ...host, beforeStart: preparing } },
			cleanup
		);
		await vi.waitFor(() => expect(preparing).toHaveBeenCalledOnce());
		await controller.stop();
		pending.resolve();
		await start;
		expect(load).not.toHaveBeenCalled();
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('keeps a game paused when backgrounding interrupts loading', async () => {
		const pending = deferred<GameModule>(),
			mounted = session(),
			load = vi.fn(() => pending.promise);
		const controller = new SessionController(),
			states: string[] = [];
		controller.subscribe((value) => states.push(value.state));
		const start = controller.start(entry(load), options, vi.fn());
		await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
		await controller.pause();
		pending.resolve({ mount: async () => mounted });
		await start;
		expect(mounted.pause).toHaveBeenCalledOnce();
		expect(states.at(-1)).toBe('paused');
		await controller.resume();
		expect(states.at(-1)).toBe('playing');
		await controller.destroy();
	});

	it('replaces sessions, pauses/resumes and releases resources on unmount', async () => {
		const controller = new SessionController(),
			first = session(),
			second = session(),
			cleanup = vi.fn();
		await controller.start(
			entry(async () => ({ mount: async () => first })),
			options,
			cleanup
		);
		await controller.pause();
		await controller.resume();
		expect(first.pause).toHaveBeenCalledOnce();
		expect(first.resume).toHaveBeenCalledOnce();
		await controller.start(
			entry(async () => ({ mount: async () => second })),
			options,
			vi.fn()
		);
		expect(first.destroy).toHaveBeenCalledOnce();
		expect(cleanup).toHaveBeenCalledOnce();
		await controller.destroy();
		await controller.destroy();
		expect(second.destroy).toHaveBeenCalledOnce();
	});
	it('ignores failures from an obsolete launch and supports retry after a load failure', async () => {
		const controller = new SessionController(),
			states: string[] = [];
		controller.subscribe((value) => states.push(value.state));
		await controller.start(
			entry(async () => {
				throw new Error('fixture failure');
			}),
			options,
			vi.fn()
		);
		expect(states.at(-1)).toBe('error');
		await controller.start(
			entry(async () => ({ mount: async () => session() })),
			options,
			vi.fn()
		);
		expect(states.at(-1)).toBe('playing');
		await controller.stop();
	});
});
