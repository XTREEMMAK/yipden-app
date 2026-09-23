import { refreshAll } from './refresh.js';
import { store, type Feed, type Person, type StoredYip, type YipCategory } from './store/index.js';

/**
 * Today's state: the merged feed, the filter pill the reader is on, and refreshing it.
 *
 * Everything a card needs to render is already on the stored yip (see `refresh.ts`), so this
 * file is about which yips are visible and in what order, not about deriving anything from
 * them.
 */

export const TODAY_FILTERS = [
	{ key: 'everything', label: 'Everything' },
	{ key: 'posts', label: 'Posts' },
	{ key: 'watch', label: 'Watch' },
	{ key: 'listen', label: 'Listen' }
] as const;

export type TodayFilterKey = (typeof TODAY_FILTERS)[number]['key'];

const PAGE_SIZE = 50;

class TodayState {
	filter = $state<TodayFilterKey>('everything');
	/** One list per filter, so switching panes keeps each one's scroll position and content. */
	panes = $state<Record<TodayFilterKey, StoredYip[]>>({
		everything: [],
		posts: [],
		watch: [],
		listen: []
	});
	people = $state<Map<string, Person>>(new Map());
	status = $state<'idle' | 'loading' | 'refreshing'>('loading');
	refreshError = $state<string | null>(null);

	unreadCount = $derived(this.panes.everything.filter((yip) => !yip.readAt).length);
	peopleCount = $derived(
		new Set(this.panes.everything.filter((yip) => !yip.readAt).map((y) => y.personId)).size
	);

	/** From storage only. Called on mount, and again after a refresh completes. */
	async load(): Promise<void> {
		await store.init();
		const [people, ...lists] = await Promise.all([
			store.listPeople(),
			...TODAY_FILTERS.map((filter) => store.listYips({ filter: filter.key, limit: PAGE_SIZE }))
		]);

		this.people = new Map(people.map((person) => [person.id, person]));
		const next: Record<TodayFilterKey, StoredYip[]> = {
			everything: [],
			posts: [],
			watch: [],
			listen: []
		};
		TODAY_FILTERS.forEach((filter, index) => {
			next[filter.key] = lists[index] ?? [];
		});
		this.panes = next;
		this.status = 'idle';
	}

	/** Pull to refresh: fetch every followed feed, then reload from what was actually stored. */
	async refresh(): Promise<void> {
		if (this.status === 'refreshing') return;
		this.status = 'refreshing';
		this.refreshError = null;
		try {
			await refreshAll();
		} catch (cause) {
			this.refreshError = cause instanceof Error ? cause.message : 'Could not refresh.';
		}
		await this.load();
	}

	/**
	 * Load, then fetch in the background if there is a feed nobody has ever actually read.
	 *
	 * Following someone only saves who they are; it never fetches what they have published,
	 * because that fetch belongs to the refresh pipeline, not to the follow flow. Without this,
	 * a reader who just followed someone and opened Today would see an empty screen until a
	 * pull to refresh or the next background window, which is a worse first look at the app
	 * than one extra fetch on the way in.
	 */
	async loadAndCatchUp(): Promise<void> {
		await this.load();
		const feeds = await store.listFeeds();
		const neverFetched = feeds.some((feed: Feed) => feed.enabled && !feed.lastFetchedAt);
		if (neverFetched) await this.refresh();
	}

	setFilter(key: TodayFilterKey): void {
		this.filter = key;
	}

	async markRead(key: string): Promise<void> {
		await store.markRead(key);
		for (const list of Object.values(this.panes)) {
			const yip = list.find((item) => item.key === key);
			if (yip && !yip.readAt) yip.readAt = new Date().toISOString();
		}
	}

	personFor(yip: StoredYip): Person | null {
		return this.people.get(yip.personId) ?? null;
	}
}

export const today = new TodayState();

/** "3h", "2d", "just now": the compact age the mono meta line shows. */
export function relativeAge(iso: string | null, now: Date = new Date()): string {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	const diffSeconds = Math.max(0, Math.round((now.getTime() - then) / 1000));

	if (diffSeconds < 60) return 'now';
	const minutes = Math.round(diffSeconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days}d`;
	const weeks = Math.round(days / 7);
	if (weeks < 5) return `${weeks}w`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo`;
	return `${Math.round(days / 365)}y`;
}

const SOURCE_LABELS: Record<YipCategory | 'default', string> = {
	posts: 'Blog',
	watch: 'YouTube',
	listen: 'Podcast',
	default: 'Feed'
};

/** The source chip's label. Feed kind wins over category, since it is the more specific fact. */
export function sourceLabel(yip: StoredYip): string {
	const byKind: Record<string, string> = {
		blog: 'Blog',
		bluesky: 'Bluesky',
		mastodon: 'Mastodon',
		youtube: 'YouTube',
		peertube: 'Video',
		podcast: 'Podcast',
		forum: 'Forum'
	};
	return byKind[yip.feedKind] ?? SOURCE_LABELS[yip.category] ?? SOURCE_LABELS.default;
}

/** mm:ss or h:mm:ss, for a track or clip length under a card. */
export function formatDuration(seconds: number | undefined): string {
	if (!seconds || !Number.isFinite(seconds)) return '';
	const total = Math.round(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
