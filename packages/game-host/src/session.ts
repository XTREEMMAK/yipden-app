import type { GameEntry, GameMountOptions, GameSession } from '@yipden/game-contracts';

export type SessionState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export interface SessionSnapshot {
	state: SessionState;
	title: string | null;
	error: string | null;
}

/** One session at a time; a late import/mount can never reclaim an exited host. */
export class SessionController {
	private generation = 0;
	private abort: AbortController | null = null;
	private session: GameSession | null = null;
	private cleanup: (() => void) | null = null;
	private closed = false;
	private pauseRequested = false;
	private snapshot: SessionSnapshot = { state: 'idle', title: null, error: null };
	private listeners = new Set<(snapshot: SessionSnapshot) => void>();

	subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.snapshot);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private publish(snapshot: SessionSnapshot): void {
		if (this.closed) return;
		this.snapshot = snapshot;
		for (const listener of this.listeners) listener(snapshot);
	}

	private detach(): { session: GameSession | null; cleanup: (() => void) | null } {
		this.abort?.abort();
		this.abort = null;
		const owned = { session: this.session, cleanup: this.cleanup };
		this.session = null;
		this.cleanup = null;
		return owned;
	}

	private async release(owned: {
		session: GameSession | null;
		cleanup: (() => void) | null;
	}): Promise<void> {
		try {
			await owned.session?.destroy();
		} finally {
			owned.cleanup?.();
		}
	}

	async start(
		entry: GameEntry,
		options: Omit<GameMountOptions, 'signal'>,
		cleanup: () => void
	): Promise<void> {
		if (this.closed) {
			cleanup();
			return;
		}
		let cleaned = false;
		const releaseTarget = () => {
			if (!cleaned) {
				cleaned = true;
				cleanup();
			}
		};
		const generation = ++this.generation;
		const previous = this.detach();
		this.pauseRequested = false;
		const abort = new AbortController();
		this.abort = abort;
		this.cleanup = releaseTarget;
		this.publish({ state: 'loading', title: entry.title, error: null });
		const current = () => !this.closed && generation === this.generation && !abort.signal.aborted;
		let mounted: GameSession | null = null;
		try {
			await this.release(previous);
			if (!current()) return;
			await options.host.beforeStart();
			if (!current()) return;
			const module = await entry.load();
			if (!current()) return;
			mounted = await module.mount({ ...options, signal: abort.signal });
			if (!current()) {
				await this.release({ session: mounted, cleanup: releaseTarget });
				return;
			}
			this.session = mounted;
			if (this.pauseRequested) {
				await mounted.pause();
				if (!current()) return;
			}
			this.publish({
				state: this.pauseRequested ? 'paused' : 'playing',
				title: entry.title,
				error: null
			});
		} catch (error) {
			if (!current()) return;
			this.detach();
			try {
				await this.release({ session: mounted, cleanup: releaseTarget });
			} catch {
				/* Preserve the original failure. */
			}
			this.publish({
				state: 'error',
				title: entry.title,
				error: error instanceof Error ? error.message : 'Unable to start this game.'
			});
		}
	}

	async pause(): Promise<void> {
		if (this.snapshot.state === 'loading') {
			this.pauseRequested = true;
			return;
		}
		const session = this.session;
		const generation = this.generation;
		if (!session || this.snapshot.state !== 'playing') return;
		try {
			await session.pause();
			if (this.session === session && generation === this.generation)
				this.publish({ ...this.snapshot, state: 'paused' });
		} catch (error) {
			await this.fail(error, generation);
		}
	}

	async resume(): Promise<void> {
		const session = this.session;
		const generation = this.generation;
		if (!session || this.snapshot.state !== 'paused') return;
		try {
			await session.resume();
			if (this.session === session && generation === this.generation)
				this.publish({ ...this.snapshot, state: 'playing' });
		} catch (error) {
			await this.fail(error, generation);
		}
	}

	private async fail(error: unknown, generation: number): Promise<void> {
		if (generation !== this.generation) return;
		await this.stop();
		if (generation + 1 === this.generation)
			this.publish({
				state: 'error',
				title: null,
				error: error instanceof Error ? error.message : 'Game lifecycle failed.'
			});
	}

	async stop(): Promise<void> {
		const generation = ++this.generation;
		const owned = this.detach();
		try {
			await this.release(owned);
			if (generation === this.generation) this.publish({ state: 'idle', title: null, error: null });
		} catch (error) {
			if (generation === this.generation)
				this.publish({
					state: 'error',
					title: null,
					error: error instanceof Error ? error.message : 'Unable to release the game.'
				});
		}
	}

	async destroy(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.listeners.clear();
		await this.stop();
	}
}
