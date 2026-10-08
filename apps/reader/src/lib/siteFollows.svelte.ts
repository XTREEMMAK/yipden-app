import { DirectFetchSource, FeedHttp, type FeedSource, type Item } from '@yipden/feeds';
import { ageCutoff, DEFAULT_MAX_AGE_DAYS, isAgeLimitActive } from './age.js';
import { DEFAULT_REFRESH_HOURS, REFRESH_CHOICES } from './forums.svelte.js';
import { httpFetch } from './platform/http.js';
import { classifyFailure } from './refresh.js';
import { store as defaultStore } from './store/index.js';
import type { SiteFollow, SiteUpdateRecord, Store } from './store/types.js';
import { verdictKey } from './verdicts.svelte.js';

export { DEFAULT_REFRESH_HOURS, REFRESH_CHOICES };

/**
 * Followed sites, read as a calm digest: one card per post, newest first, never ranked.
 *
 * A site is a place, not a person (docs/sites-contract.md), so this is the forums' model and not
 * the people's: a follow of its own, with its own transient posts and its own pane in Feeds, and
 * nothing here touches people's follows, their yips, or the ring. A site with no feed cannot be
 * followed; it can still be saved, liked and visited.
 */

/** The newest posts kept from one check: a feed with three hundred posts is not three hundred cards. */
export const MAX_PER_CHECK = 30;
/** A post's summary as a card shows it. */
export const SUMMARY_LENGTH = 280;
/** After this many failures in a row a site is asked about a quarter as often. */
export const BACKOFF_AFTER = 5;

export interface SiteFollowsDeps {
	source: FeedSource;
	store: Store;
	now: () => Date;
}

/** One card in the digest. */
export interface DigestUpdate {
	record: SiteUpdateRecord;
	siteTitle: string;
	iconUrl: string | null;
	/** Not yet opened. */
	isNew: boolean;
}

/** Whether a site is due for a check by itself. A failing site is asked about less often. */
export function isDue(follow: SiteFollow, now: Date): boolean {
	if (!follow.lastCheckedAt) return true;
	const hours = follow.refreshHours * (follow.failures >= BACKOFF_AFTER ? 4 : 1);
	return now.getTime() - Date.parse(follow.lastCheckedAt) >= hours * 60 * 60 * 1000;
}

/** A feed item as a card keeps it. A post hidden behind a content warning keeps no summary. */
export function toUpdate(follow: SiteFollow, item: Item, seenAt: string): SiteUpdateRecord {
	const hidden = Boolean(item.contentWarning) || item.sensitive === true;
	const title = item.title && item.title !== 'Untitled' ? item.title : new URL(item.url).hostname;
	return {
		key: `${follow.id}#${item.id}`,
		followId: follow.id,
		siteUrl: follow.siteUrl,
		title,
		url: item.url,
		summary: hidden ? '' : item.summary.slice(0, SUMMARY_LENGTH),
		publishedAt: item.publishedAt,
		firstSeenAt: seenAt
	};
}

/** What a failed check says about the site: the same reasons a feed's failure has. */
function statusOf(cause: unknown, feedUrl: string): SiteFollow['status'] {
	switch (classifyFailure(cause, feedUrl).kind) {
		case 'gone':
			return 'gone';
		case 'blocked':
			return 'blocked';
		case 'not-a-feed':
			return 'not-a-feed';
		default:
			return 'unreachable';
	}
}

/** What a site is followed as, from wherever it was found (Follow, or a Surf card's own feed). */
export interface FollowableSite {
	siteUrl: string;
	feedUrl: string;
	title: string;
	iconUrl?: string | null;
}

class SiteFollowsState {
	follows = $state<SiteFollow[]>([]);
	updates = $state<SiteUpdateRecord[]>([]);
	loaded = $state(false);
	refreshing = $state(false);
	/** Swapped in tests, which must not reach the network. */
	deps: () => SiteFollowsDeps = () => ({
		source: (this.source ??= new DirectFetchSource({ http: new FeedHttp({ fetch: httpFetch }) })),
		store: defaultStore,
		now: () => new Date()
	});
	private source: FeedSource | null = null;
	private loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.loading ??= this.read();
		return this.loading;
	}

	async reload(): Promise<void> {
		this.loading = this.read();
		return this.loading;
	}

	private async read(): Promise<void> {
		const { store } = this.deps();
		await store.init();
		const [follows, updates] = await Promise.all([
			store.listSiteFollows(),
			store.listSiteUpdates()
		]);
		this.follows = follows;
		this.updates = updates;
		this.loaded = true;
	}

	/** The digest: every post kept, newest first. Chronological, never ranked. */
	get digest(): DigestUpdate[] {
		const follows = new Map(this.follows.map((follow) => [follow.id, follow]));
		return this.updates.map((record) => {
			const follow = follows.get(record.followId);
			return {
				record,
				siteTitle: follow?.title ?? new URL(record.siteUrl).hostname,
				iconUrl: follow?.iconUrl ?? null,
				isNew: record.seenAt === undefined
			};
		});
	}

	/** Posts the reader has not opened. */
	get activeCount(): number {
		return this.updates.filter((record) => record.seenAt === undefined).length;
	}

	/** The follow for an address, however it is spelled (www, a trailing slash). */
	followFor(siteUrl: string): SiteFollow | null {
		const key = verdictKey(siteUrl);
		return this.follows.find((follow) => verdictKey(follow.siteUrl) === key) ?? null;
	}

	isFollowing(siteUrl: string): boolean {
		return this.followFor(siteUrl) !== null;
	}

	/**
	 * Follow a site by its feed. Following one already followed changes nothing but the feed it is
	 * read from, so the same call serves "follow" and "read it from this feed instead".
	 */
	async follow(site: FollowableSite, refreshHours = DEFAULT_REFRESH_HOURS): Promise<SiteFollow> {
		await this.load();
		const { store, now } = this.deps();
		const existing = this.followFor(site.siteUrl);
		const follow: SiteFollow = {
			id: existing?.id ?? new URL(site.siteUrl).toString(),
			siteUrl: existing?.siteUrl ?? new URL(site.siteUrl).toString(),
			feedUrl: site.feedUrl,
			title: site.title,
			...(site.iconUrl ? { iconUrl: site.iconUrl } : {}),
			followedAt: existing?.followedAt ?? now().toISOString(),
			refreshHours: existing?.refreshHours ?? refreshHours,
			// A different feed is a fresh start: the old one's cursor means nothing to it.
			...(existing && existing.feedUrl === site.feedUrl && existing.lastCheckedAt
				? { lastCheckedAt: existing.lastCheckedAt }
				: {}),
			...(existing && existing.feedUrl === site.feedUrl && existing.cursor
				? { cursor: existing.cursor }
				: {}),
			status: 'ok',
			failures: 0
		};
		await store.putSiteFollow(follow);
		await this.reload();
		// A new follow is checked at once, so its posts are there the first time Sites is opened.
		if (!follow.lastCheckedAt) await this.refresh({ only: [follow.id] });
		return follow;
	}

	async setRefreshHours(id: string, hours: number): Promise<void> {
		const follow = this.follows.find((entry) => entry.id === id);
		if (!follow) return;
		await this.deps().store.putSiteFollow({ ...follow, refreshHours: hours });
		await this.reload();
	}

	async unfollow(id: string): Promise<void> {
		await this.deps().store.removeSiteFollow(id);
		await this.reload();
	}

	/**
	 * Check what is due (or everything, `force`), store what came back, and drop what is older than
	 * the reader's limit for posts. One site failing never stops the rest.
	 */
	async refresh(options: { force?: boolean; only?: string[] } = {}): Promise<void> {
		await this.load();
		if (this.refreshing) return;
		this.refreshing = true;
		const { store, source, now } = this.deps();
		try {
			const due = this.follows.filter((follow) =>
				options.only ? options.only.includes(follow.id) : options.force || isDue(follow, now())
			);
			const saved = await store.getSetting<number>('maxAgeDays');
			const days = typeof saved === 'number' ? saved : DEFAULT_MAX_AGE_DAYS;
			const cutoff = ageCutoff(days, now());
			const byId = new Map(due.map((follow) => [follow.id, follow]));

			for await (const result of source.fetchBatch(
				due.map((follow) => ({
					id: follow.id,
					url: follow.feedUrl,
					...(follow.cursor ? { cursor: follow.cursor } : {})
				}))
			)) {
				const follow = byId.get(result.id);
				if (!follow) continue;
				const at = now().toISOString();
				let next: SiteFollow;
				if (result.status === 'updated') {
					const fresh = result.feed.items
						.filter(
							(item) => !isAgeLimitActive() || !item.publishedAt || item.publishedAt >= cutoff
						)
						.slice(0, MAX_PER_CHECK)
						.map((item) => toUpdate(follow, item, at));
					await store.putSiteUpdates(fresh);
					next = { ...follow, status: 'ok', failures: 0, lastCheckedAt: at };
					if (result.cursor) next.cursor = result.cursor;
					else delete next.cursor;
				} else if (result.status === 'not-modified') {
					next = { ...follow, status: 'ok', failures: 0, lastCheckedAt: at };
				} else {
					next = {
						...follow,
						status: statusOf(result.error, follow.feedUrl),
						failures: follow.failures + 1,
						lastCheckedAt: at
					};
				}
				await store.putSiteFollow(next);
			}
			if (isAgeLimitActive()) await store.pruneSiteUpdates(cutoff);
		} finally {
			this.refreshing = false;
		}
		await this.reload();
	}

	/** Opened: the post counts as seen, and where to go is its own address. */
	async open(update: SiteUpdateRecord): Promise<string> {
		const { store, now } = this.deps();
		const at = now().toISOString();
		await store.markSiteUpdateSeen(update.key, at);
		this.updates = this.updates.map((entry) =>
			entry.key === update.key ? { ...entry, seenAt: at } : entry
		);
		return update.url;
	}

	async markAllSeen(): Promise<void> {
		const { store, now } = this.deps();
		const at = now().toISOString();
		for (const update of this.updates) {
			if (update.seenAt === undefined) await store.markSiteUpdateSeen(update.key, at);
		}
		await this.reload();
	}
}

export const siteFollows = new SiteFollowsState();
