import { store } from './store/index.js';
import { verdictKey } from './verdicts.svelte.js';

/**
 * Which ring members a reader has already looked at, so a long directory can be worked through
 * rather than started over.
 *
 * Keyed by the creator's site, the same key Liked and Not for me use, so a creator met in two
 * rings is explored once. Kept on this phone as one setting and carried in the backup.
 */

/** Explored creators: key to when they were first marked. */
export type ExploredMap = Record<string, string>;

/** Whom a ring's list shows, by what the reader has explored. */
export type ExploredFilter = 'all' | 'unexplored' | 'explored';

/** Where a reader was in one ring's member list. */
export interface RingView {
	query: string;
	genre: string | null;
	scrollTop: number;
	show: ExploredFilter;
	/** How `show` was saved before it had three choices: true meant "not explored yet". */
	hideExplored?: boolean;
}

export const EMPTY_VIEW: RingView = { query: '', genre: null, scrollTop: 0, show: 'all' };

/** A saved view's explored filter, reading one saved before the third choice existed. */
export function showOf(view: Partial<RingView>): ExploredFilter {
	if (view.show === 'all' || view.show === 'unexplored' || view.show === 'explored') {
		return view.show;
	}
	return view.hideExplored ? 'unexplored' : 'all';
}

class ExploredState {
	marks = $state<ExploredMap>({});
	/** Per ring id. Survives leaving Discover, and closing the app. */
	views = $state<Record<string, RingView>>({});
	loaded = $state(false);
	private saveTimer: ReturnType<typeof setTimeout> | undefined;

	private loading: Promise<void> | null = null;

	/** Safe to call from every screen that shows marks; reads storage once. */
	load(): Promise<void> {
		this.loading ??= this.read();
		return this.loading;
	}

	private async read(): Promise<void> {
		await store.init();
		const [marks, views] = await Promise.all([
			store.getSetting<ExploredMap>('explored'),
			store.getSetting<Record<string, RingView>>('ringViews')
		]);
		// Anything marked while storage was still being read is kept, not overwritten.
		this.marks = { ...(marks && typeof marks === 'object' ? marks : {}), ...this.marks };
		this.views = { ...(views && typeof views === 'object' ? views : {}), ...this.views };
		this.loaded = true;
	}

	has(url: string): boolean {
		return verdictKey(url) in this.marks;
	}

	/** Marks a creator explored. Already explored keeps the first time. */
	async mark(url: string): Promise<void> {
		await this.load();
		const key = verdictKey(url);
		if (key in this.marks) return;
		this.marks = { ...this.marks, [key]: new Date().toISOString() };
		await store.setSetting('explored', $state.snapshot(this.marks));
	}

	async toggle(url: string): Promise<boolean> {
		await this.load();
		const key = verdictKey(url);
		if (!(key in this.marks)) {
			await this.mark(url);
			return true;
		}
		const { [key]: _removed, ...rest } = this.marks;
		void _removed;
		this.marks = rest;
		await store.setSetting('explored', $state.snapshot(this.marks));
		return false;
	}

	view(ringId: string): RingView {
		return this.views[ringId] ?? EMPTY_VIEW;
	}

	/**
	 * Remember where a reader is in a ring. A scroll reports dozens of positions a second and only
	 * the last matters, so a scroll alone is written after a short pause; anything else, and any
	 * pending scroll when the app is hidden, is written at once.
	 */
	setView(ringId: string, patch: Partial<RingView>): void {
		this.views = { ...this.views, [ringId]: { ...this.view(ringId), ...patch } };
		clearTimeout(this.saveTimer);
		const scrollOnly = Object.keys(patch).every((key) => key === 'scrollTop');
		if (scrollOnly) this.saveTimer = setTimeout(() => this.saveViews(), 400);
		else this.saveViews();
	}

	/** Writes whatever is pending now. Called when the app is hidden too. */
	flush(): void {
		if (this.saveTimer === undefined) return;
		this.saveViews();
	}

	private saveViews(): void {
		clearTimeout(this.saveTimer);
		this.saveTimer = undefined;
		void store.setSetting('ringViews', $state.snapshot(this.views));
	}
}

export const explored = new ExploredState();

/**
 * Where to pick up: the first unexplored member after the last explored one in this order, or
 * the first unexplored at all when nothing after it is left. `null` when every one is explored.
 */
export function resumeIndex(urls: string[], isExplored: (url: string) => boolean): number | null {
	let last = -1;
	urls.forEach((url, index) => {
		if (isExplored(url)) last = index;
	});
	for (let index = last + 1; index < urls.length; index += 1) {
		if (!isExplored(urls[index]!)) return index;
	}
	const first = urls.findIndex((url) => !isExplored(url));
	return first === -1 ? null : first;
}
