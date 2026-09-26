import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createBackup, parseBackup, restoreBackup } from './backup.js';
import { IdbStore } from './store/idb.js';
import type { Feed, Person, StoredYip } from './store/types.js';

const PERSON: Person = {
	id: 'person-lena',
	name: 'Lena',
	siteUrl: 'https://lena.example.com/',
	followedAt: '2026-09-20T10:00:00.000Z'
};
const FEED: Feed = {
	id: 'https://lena.example.com/feed.xml',
	personId: PERSON.id,
	url: 'https://lena.example.com/feed.xml',
	kind: 'blog',
	title: 'Lena',
	verified: false,
	provenance: 'manual',
	failures: 1,
	enabled: true
};
const YIP: StoredYip = {
	key: `${FEED.id}::one`,
	feedId: FEED.id,
	id: 'one',
	title: 'One post',
	url: 'https://lena.example.com/one',
	publishedAt: '2026-09-20T10:00:00.000Z',
	summary: 'A summary.',
	contentHtml: '<img src=x onerror=alert(1)>',
	media: [],
	sourceFeedId: FEED.id,
	personId: PERSON.id,
	feedKind: 'blog',
	category: 'posts',
	seenAt: '2026-09-20T11:00:00.000Z',
	readAt: '2026-09-20T12:00:00.000Z'
};

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
});

describe('YipDen backup', () => {
	it('round trips people, source provenance, read state and preferences', async () => {
		const source = new IdbStore();
		await source.init();
		await source.follow(PERSON, [FEED]);
		await source.putYips([YIP]);
		await source.setSetting('shuffleMusic', false);
		localStorage.setItem('yipden:theme', 'dark');
		localStorage.setItem('yipden:skin', 'forest');

		const preview = parseBackup(JSON.stringify(await createBackup(source)));
		expect(preview).toMatchObject({ people: 1, feeds: 1, yips: 1 });

		globalThis.indexedDB = new IDBFactory();
		localStorage.clear();
		const target = new IdbStore();
		const report = await restoreBackup(preview.backup, target);
		expect(report).toMatchObject({ peopleAdded: 1, feedsAdded: 1, yipsAdded: 1 });
		expect((await target.listFeeds())[0]).toMatchObject({
			provenance: 'manual',
			failures: 1
		});
		expect((await target.listYips())[0]).toMatchObject({
			readAt: YIP.readAt,
			contentHtml: null
		});
		expect(await target.getSetting('shuffleMusic')).toBe(false);
		expect(localStorage.getItem('yipden:theme')).toBe('dark');
		expect(localStorage.getItem('yipden:skin')).toBe('forest');
	});

	it('rejects malformed files and orphaned sources before changing storage', () => {
		expect(() => parseBackup('{')).toThrow('not valid JSON');
		expect(() =>
			parseBackup(
				JSON.stringify({
					format: 'yipden-backup',
					version: 1,
					exportedAt: new Date().toISOString(),
					people: [],
					feeds: [FEED],
					yips: [],
					settings: {},
					appearance: { theme: 'system', skin: 'original' }
				})
			)
		).toThrow('source without its creator');
	});

	it('reports a feed collision instead of moving the source to the backup creator', async () => {
		const target = new IdbStore();
		await target.init();
		const other: Person = {
			id: 'person-other',
			name: 'Other',
			siteUrl: 'https://other.example.com/',
			followedAt: PERSON.followedAt
		};
		await target.follow(other, [{ ...FEED, personId: other.id }]);
		const backup = parseBackup(
			JSON.stringify({
				format: 'yipden-backup',
				version: 1,
				exportedAt: new Date().toISOString(),
				people: [PERSON],
				feeds: [FEED],
				yips: [YIP],
				settings: {},
				appearance: { theme: 'system', skin: 'original' }
			})
		).backup;

		const report = await restoreBackup(backup, target);
		expect(report).toMatchObject({ feedsSkipped: 1, yipsAdded: 0 });
		expect((await target.listFeeds())[0]?.personId).toBe(other.id);
	});
});
