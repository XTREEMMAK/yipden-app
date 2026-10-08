import {
	firstUnreadUrl,
	forumHttp,
	listCategories,
	listTopics,
	type FeedHttp,
	type Forum,
	type ForumCategory,
	type ForumTopic
} from '@yipden/feeds';
import { httpFetch } from './platform/http.js';
import { store as defaultStore } from './store/index.js';
import type { ForumFollow, ForumTopicRecord, Store } from './store/types.js';

/**
 * Followed forums, read as a calm digest: one card per topic, newest activity first.
 *
 * A forum is followed whole or by category, never by thread: a thread goes quiet and leaves a
 * dead source behind, while a category keeps bringing the next one. Topics come and go by
 * themselves. One that has been quiet for the reader's window (14 days unless changed) is
 * dropped, with what was seen of it.
 *
 * Forums are not people. Nothing here touches follows of creators, or the ring.
 */

export const DEFAULT_REFRESH_HOURS = 6;
export const REFRESH_CHOICES = [3, 6, 12, 24] as const;
export const DEFAULT_QUIET_DAYS = 14;

export interface ForumsDeps {
	http: FeedHttp;
	store: Store;
	now: () => Date;
}

/** One card in the digest. */
export interface DigestTopic {
	record: ForumTopicRecord;
	forumTitle: string;
	/** The forum's own picture, where it has one. */
	logoUrl: string | null;
	categoryName: string | null;
	/** Posts the reader has not seen: all of its replies, for a topic never opened. */
	newReplies: number;
	/** Never opened. */
	isNew: boolean;
}

export function followIdFor(forumUrl: string, categoryId: number | null): string {
	return categoryId === null ? forumUrl : `${forumUrl}#c${categoryId}`;
}

/** What a topic shows as new, from what the reader had seen when they last opened it. */
export function newRepliesOf(topic: ForumTopicRecord): number {
	if (topic.seenPostNumber === undefined) return topic.replyCount;
	return Math.max(0, topic.highestPostNumber - topic.seenPostNumber);
}

export function isDue(follow: ForumFollow, now: Date): boolean {
	if (!follow.lastCheckedAt) return true;
	return now.getTime() - Date.parse(follow.lastCheckedAt) >= follow.refreshHours * 60 * 60 * 1000;
}

function toRecord(follow: ForumFollow, topic: ForumTopic, seenAt: string): ForumTopicRecord {
	return {
		key: `${follow.forumUrl}#${topic.id}`,
		forumUrl: follow.forumUrl,
		followId: follow.id,
		topicId: topic.id,
		title: topic.title,
		url: topic.url,
		categoryId: topic.categoryId,
		replyCount: topic.replyCount,
		highestPostNumber: topic.highestPostNumber,
		lastActivityAt: topic.lastActivityAt,
		pinned: topic.pinned,
		closed: topic.closed,
		firstSeenAt: seenAt
	};
}

/** Categories as names by id, for labelling topics of a whole-forum follow. */
export function namesOf(categories: readonly ForumCategory[]): Record<string, string> {
	return Object.fromEntries(
		categories.slice(0, 500).map((category) => [String(category.id), category.name])
	);
}

class ForumsState {
	follows = $state<ForumFollow[]>([]);
	topics = $state<ForumTopicRecord[]>([]);
	loaded = $state(false);
	refreshing = $state(false);
	quietDays = $state(DEFAULT_QUIET_DAYS);
	/** Swapped in tests, which must not reach the network. */
	deps: () => ForumsDeps = () => ({
		http: (this.http ??= forumHttp(httpFetch)),
		store: defaultStore,
		now: () => new Date()
	});
	private http: FeedHttp | null = null;
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
		const [follows, topics, quiet] = await Promise.all([
			store.listForumFollows(),
			store.listForumTopics(),
			store.getSetting<number>('forumQuietDays')
		]);
		this.follows = follows;
		this.topics = topics;
		if (typeof quiet === 'number' && quiet >= 1) this.quietDays = quiet;
		this.loaded = true;
	}

	/** Forums by root, each with its follows: the shape the forums screen lists them in. */
	get forums(): Array<{
		forumUrl: string;
		title: string;
		logoUrl?: string;
		follows: ForumFollow[];
	}> {
		const byUrl = new Map<
			string,
			{ forumUrl: string; title: string; logoUrl?: string; follows: ForumFollow[] }
		>();
		for (const follow of this.follows) {
			const forum = byUrl.get(follow.forumUrl) ?? {
				forumUrl: follow.forumUrl,
				title: follow.title,
				...(follow.logoUrl ? { logoUrl: follow.logoUrl } : {}),
				follows: []
			};
			forum.follows.push(follow);
			byUrl.set(follow.forumUrl, forum);
		}
		return [...byUrl.values()].sort((a, b) => a.title.localeCompare(b.title));
	}

	/** The digest: every topic still active, newest activity first. Chronological, never ranked. */
	get digest(): DigestTopic[] {
		const follows = new Map(this.follows.map((follow) => [follow.id, follow]));
		return this.topics.map((record) => {
			const follow = follows.get(record.followId);
			const categoryName =
				record.categoryId === null
					? null
					: (follow?.categoryNames?.[String(record.categoryId)] ??
						(follow?.categoryId === record.categoryId ? (follow.categoryName ?? null) : null));
			const newReplies = newRepliesOf(record);
			return {
				record,
				forumTitle: follow?.title ?? new URL(record.forumUrl).hostname,
				logoUrl: follow?.logoUrl ?? null,
				categoryName,
				newReplies,
				isNew: record.seenPostNumber === undefined
			};
		});
	}

	/** Topics with something the reader has not seen. */
	get activeCount(): number {
		return this.digest.filter((topic) => topic.isNew || topic.newReplies > 0).length;
	}

	/**
	 * Follow a forum: the whole of it, or the chosen categories. Replaces whatever was followed of
	 * that forum before, so the forums screen can edit with the same call.
	 */
	async follow(
		forum: Forum,
		choice: { whole: true } | { whole: false; categories: ForumCategory[] },
		names: Record<string, string>,
		refreshHours = this.refreshHoursOf(forum.baseUrl)
	): Promise<void> {
		await this.load();
		const { store, now } = this.deps();
		const at = now().toISOString();
		const wanted: ForumFollow[] = (
			choice.whole ? [null] : choice.categories.map((category) => category)
		).map((category) => {
			const id = followIdFor(forum.baseUrl, category?.id ?? null);
			const existing = this.follows.find((follow) => follow.id === id);
			return {
				id,
				forumUrl: forum.baseUrl,
				title: forum.title,
				...(forum.description ? { description: forum.description } : {}),
				...(forum.logoUrl ? { logoUrl: forum.logoUrl } : {}),
				categoryId: category?.id ?? null,
				...(category ? { categoryName: category.name } : {}),
				categoryNames: names,
				followedAt: existing?.followedAt ?? at,
				refreshHours,
				...(existing?.lastCheckedAt ? { lastCheckedAt: existing.lastCheckedAt } : {}),
				...(existing?.cursor ? { cursor: existing.cursor } : {}),
				status: existing?.status ?? 'ok',
				failures: existing?.failures ?? 0
			};
		});
		const keep = new Set(wanted.map((follow) => follow.id));
		for (const old of this.follows.filter((follow) => follow.forumUrl === forum.baseUrl)) {
			if (!keep.has(old.id)) await store.removeForumFollow(old.id);
		}
		for (const follow of wanted) await store.putForumFollow(follow);
		await this.reload();
		// A new follow is checked at once, so its topics are there the first time Forums is opened.
		await this.refresh({ only: wanted.filter((follow) => !follow.lastCheckedAt).map((f) => f.id) });
	}

	refreshHoursOf(forumUrl: string): number {
		return (
			this.follows.find((follow) => follow.forumUrl === forumUrl)?.refreshHours ??
			DEFAULT_REFRESH_HOURS
		);
	}

	async setRefreshHours(forumUrl: string, hours: number): Promise<void> {
		const { store } = this.deps();
		for (const follow of this.follows.filter((entry) => entry.forumUrl === forumUrl)) {
			await store.putForumFollow({ ...follow, refreshHours: hours });
		}
		await this.reload();
	}

	async unfollow(forumUrl: string): Promise<void> {
		const { store } = this.deps();
		for (const follow of this.follows.filter((entry) => entry.forumUrl === forumUrl)) {
			await store.removeForumFollow(follow.id);
		}
		await this.reload();
	}

	/** The categories a forum offers, for editing what is followed of it. */
	async categoriesOf(forumUrl: string): Promise<ForumCategory[] | 'members-only'> {
		const follow = this.follows.find((entry) => entry.forumUrl === forumUrl);
		const forum: Forum = {
			baseUrl: forumUrl,
			title: follow?.title ?? forumUrl,
			description: '',
			logoUrl: null
		};
		return listCategories(forum, this.deps().http);
	}

	/**
	 * Check what is due (or everything, `force`), store what came back, and drop what has gone
	 * quiet. One forum failing never stops the rest.
	 */
	async refresh(options: { force?: boolean; only?: string[] } = {}): Promise<void> {
		await this.load();
		if (this.refreshing) return;
		this.refreshing = true;
		const { store, http, now } = this.deps();
		try {
			const due = this.follows.filter((follow) =>
				options.only ? options.only.includes(follow.id) : options.force || isDue(follow, now())
			);
			for (const follow of due) {
				const at = now().toISOString();
				const forum: Forum = {
					baseUrl: follow.forumUrl,
					title: follow.title,
					description: '',
					logoUrl: null
				};
				let next: ForumFollow;
				try {
					const result = await listTopics(forum, follow.categoryId, http, follow.cursor);
					if (result.status === 'ok') {
						await store.putForumTopics(result.topics.map((topic) => toRecord(follow, topic, at)));
						next = { ...follow, status: 'ok', failures: 0, lastCheckedAt: at };
						if (result.cursor) next.cursor = result.cursor;
						else delete next.cursor;
					} else if (result.status === 'not-modified') {
						next = { ...follow, status: 'ok', failures: 0, lastCheckedAt: at };
					} else {
						next = {
							...follow,
							status: result.status,
							failures: follow.failures + 1,
							lastCheckedAt: at
						};
					}
				} catch {
					next = {
						...follow,
						status: 'unreachable',
						failures: follow.failures + 1,
						lastCheckedAt: at
					};
				}
				await store.putForumFollow(next);
			}
			const cutoff = new Date(now().getTime() - this.quietDays * 24 * 60 * 60 * 1000).toISOString();
			await store.pruneForumTopics(cutoff);
		} finally {
			this.refreshing = false;
		}
		await this.reload();
	}

	/** Opened: where to go, and the topic counts as read up to its newest post. */
	async open(topic: ForumTopicRecord): Promise<string> {
		const { store, now } = this.deps();
		const url = firstUnreadUrl(
			{ ...topic, id: topic.topicId, createdAt: null },
			topic.seenPostNumber ?? null
		);
		await store.markForumTopicSeen(topic.key, topic.highestPostNumber, now().toISOString());
		this.topics = this.topics.map((entry) =>
			entry.key === topic.key
				? { ...entry, seenPostNumber: topic.highestPostNumber, seenAt: now().toISOString() }
				: entry
		);
		return url;
	}

	/** Everything in the digest counts as seen, up to each topic's newest post. */
	async markAllSeen(): Promise<void> {
		const { store, now } = this.deps();
		const at = now().toISOString();
		for (const topic of this.topics) {
			if (topic.seenPostNumber !== topic.highestPostNumber) {
				await store.markForumTopicSeen(topic.key, topic.highestPostNumber, at);
			}
		}
		await this.reload();
	}

	async setQuietDays(days: number): Promise<void> {
		this.quietDays = days;
		await this.deps().store.setSetting('forumQuietDays', days);
	}
}

export const forums = new ForumsState();
