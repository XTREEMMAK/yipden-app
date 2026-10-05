import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { FeedHttp, type FetchLike, type HttpResponse } from '@yipden/feeds';
import { forums, isDue, newRepliesOf, type ForumsDeps } from './forums.svelte.js';
import { testStore } from './store/testing/memory.js';
import type { ForumFollow, Store } from './store/types.js';

const BASE = 'https://meta.discourse.org';
const fixture = (name: string) =>
	readFileSync(join(process.cwd(), '../../packages/feeds/test/fixtures/discourse', name), 'utf8');

type Routes = Record<string, { status?: number; body?: string }>;

function deps(routes: Routes, store: Store, now = new Date('2026-10-05T12:00:00.000Z')) {
	const calls: string[] = [];
	const fetch: FetchLike = async (url) => {
		calls.push(url);
		const route = routes[url];
		const response: HttpResponse = {
			status: route ? (route.status ?? 200) : 404,
			url,
			headers: { get: (name) => (name === 'content-type' ? 'application/json' : null) },
			text: async () => route?.body ?? ''
		};
		return response;
	};
	const value: ForumsDeps = {
		http: new FeedHttp({ fetch, minHostIntervalMs: 0, respectRobots: false }),
		store,
		now: () => now
	};
	return { value, calls };
}

const META = { baseUrl: BASE, title: 'Discourse Meta', description: '', logoUrl: null };

let store: Store;

beforeEach(async () => {
	store = testStore();
	forums.deps = () =>
		deps({ [`${BASE}/latest.json`]: { body: fixture('latest.json') } }, store).value;
	await forums.reload();
});

describe('following a forum', () => {
	it('follows the whole forum and fetches its topics at once', async () => {
		await forums.follow(META, { whole: true }, { '6': 'Support' });
		expect(forums.follows.map((follow) => follow.id)).toEqual([BASE]);
		// The fixture's long-pinned welcome topic has been quiet for years, so it is dropped at once.
		const recent = JSON.parse(fixture('latest.json')).topic_list.topics.filter(
			(topic: { last_posted_at: string }) =>
				Date.parse(topic.last_posted_at) > Date.parse('2026-09-21T12:00:00.000Z')
		);
		expect(forums.topics).toHaveLength(recent.length);
		expect(forums.topics.length).toBeLessThan(4);
		expect(forums.follows[0]).toMatchObject({ status: 'ok', refreshHours: 6 });
		const announcement = forums.digest.find((topic) => topic.record.categoryId === 6);
		expect(announcement?.categoryName).toBe('Support');
		expect(announcement?.forumTitle).toBe('Discourse Meta');
	});

	it('choosing categories replaces the whole-forum follow, and takes its topics with it', async () => {
		await forums.follow(META, { whole: true }, {});
		forums.deps = () =>
			deps({ [`${BASE}/c/67.json`]: { body: fixture('latest.json') } }, store).value;
		await forums.follow(
			META,
			{
				whole: false,
				categories: [
					{
						id: 67,
						name: 'Announcements',
						slug: 'a',
						description: '',
						parentId: 207,
						topicCount: 1
					}
				]
			},
			{}
		);
		expect(forums.follows.map((follow) => [follow.id, follow.categoryName])).toEqual([
			[`${BASE}#c67`, 'Announcements']
		]);
		expect(forums.topics.every((topic) => topic.followId === `${BASE}#c67`)).toBe(true);
	});

	it('unfollowing a forum takes away everything of it', async () => {
		await forums.follow(META, { whole: true }, {});
		await forums.unfollow(BASE);
		expect(forums.follows).toEqual([]);
		expect(forums.topics).toEqual([]);
	});
});

describe('reading the digest', () => {
	it('counts every reply of a topic never opened as new, then only what came after', async () => {
		await forums.follow(META, { whole: true }, {});
		const [first] = forums.digest;
		expect(first!.isNew).toBe(true);
		expect(first!.newReplies).toBe(first!.record.replyCount);

		const url = await forums.open(first!.record);
		expect(url).toBe(first!.record.url);
		const opened = forums.topics.find((topic) => topic.key === first!.record.key)!;
		expect(newRepliesOf(opened)).toBe(0);
		expect(newRepliesOf({ ...opened, highestPostNumber: opened.highestPostNumber + 3 })).toBe(3);
	});

	it('opens a topic with new posts at the first one not seen', async () => {
		await forums.follow(META, { whole: true }, {});
		const [first] = forums.topics;
		await store.markForumTopicSeen(first!.key, 1, '2026-10-05T12:00:00.000Z');
		await forums.reload();
		const seen = forums.topics.find((topic) => topic.key === first!.key)!;
		const url = await forums.open({ ...seen, highestPostNumber: 6 });
		expect(url).toBe(`${seen.url}/2`);
	});

	it('marks everything seen at once', async () => {
		await forums.follow(META, { whole: true }, {});
		await forums.markAllSeen();
		expect(forums.activeCount).toBe(0);
	});
});

describe('refreshing', () => {
	it('checks a forum only when it is due, unless asked to check everything', () => {
		const follow = {
			refreshHours: 6,
			lastCheckedAt: '2026-10-05T09:00:00.000Z'
		} as ForumFollow;
		expect(isDue(follow, new Date('2026-10-05T12:00:00.000Z'))).toBe(false);
		expect(isDue(follow, new Date('2026-10-05T15:00:00.000Z'))).toBe(true);
		const neverChecked = { refreshHours: 6 } as ForumFollow;
		expect(isDue(neverChecked, new Date())).toBe(true);
	});

	it('says members-only or unreachable on the follow, and carries on', async () => {
		await forums.follow(META, { whole: true }, {});
		forums.deps = () => deps({ [`${BASE}/latest.json`]: { status: 403 } }, store).value;
		await forums.refresh({ force: true });
		expect(forums.follows[0]?.status).toBe('members-only');
		forums.deps = () =>
			({
				...deps({}, store).value,
				http: new FeedHttp({
					fetch: async () => {
						throw new TypeError('offline');
					},
					minHostIntervalMs: 0
				})
			}) as ForumsDeps;
		await forums.refresh({ force: true });
		expect(forums.follows[0]).toMatchObject({ status: 'unreachable', failures: 2 });
		// What was already there stays readable.
		expect(forums.topics.length).toBeGreaterThan(0);
	});

	it('drops topics quiet for longer than the reader’s window, with what was seen of them', async () => {
		await forums.follow(META, { whole: true }, {});
		const later = new Date(
			Date.parse(forums.topics[0]!.lastActivityAt!) + 400 * 24 * 60 * 60 * 1000
		);
		forums.deps = () => deps({ [`${BASE}/latest.json`]: { status: 304 } }, store, later).value;
		await forums.refresh({ force: true });
		expect(forums.topics).toEqual([]);
	});
});
