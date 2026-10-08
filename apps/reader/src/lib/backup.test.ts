import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { stableYipId } from '@yipden/feeds';
import { createBackup, parseBackup, restoreBackup } from './backup.js';
import { testStore } from './store/testing/memory.js';
import { reference } from './store/testing/fixtures.js';
import type {
	CreatorRecord,
	Feed,
	Person,
	ShelfItem,
	SiteFollow,
	StoredYip
} from './store/types.js';

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

const SHELVED: ShelfItem = {
	id: 'https://wide.example.com/essay',
	url: 'https://wide.example.com/essay',
	title: 'A wide essay',
	creator: 'Wide',
	from: 'feeds',
	savedAt: '2026-09-26T10:00:00.000Z'
};

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
});

describe('YipDen backup', () => {
	it('round trips people, source provenance, read state and preferences', async () => {
		const source = testStore();
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
		const target = testStore();
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

	it('moves yips from a file made before stable ids onto them, read state and all', async () => {
		const source = testStore();
		await source.init();
		await source.follow(PERSON, [FEED]);
		await source.putYips([YIP]);
		const preview = parseBackup(JSON.stringify(await createBackup(source)));

		globalThis.indexedDB = new IDBFactory();
		const target = testStore();
		await restoreBackup(preview.backup, target);
		const [restored] = await target.listAllYips();
		const id = stableYipId(FEED.id, 'one');
		expect(restored).toMatchObject({ key: id, id, entryId: 'one', readAt: YIP.readAt });
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
		const target = testStore();
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

describe('the Shelf in a backup', () => {
	const file = (extra: Record<string, unknown>) =>
		JSON.stringify({
			format: 'yipden-backup',
			version: 1,
			exportedAt: new Date().toISOString(),
			people: [],
			feeds: [],
			yips: [],
			settings: {},
			appearance: { theme: 'system', skin: 'original' },
			...extra
		});

	it('travels through export and restore, with a person’s declared layout', async () => {
		const source = testStore();
		await source.init();
		await source.follow({ ...PERSON, layout: 'desktop-first' }, [FEED]);
		await source.saveToShelf(SHELVED);

		const preview = parseBackup(JSON.stringify(await createBackup(source)));
		expect(preview.shelf).toBe(1);

		globalThis.indexedDB = new IDBFactory();
		const target = testStore();
		const report = await restoreBackup(preview.backup, target);
		expect(report.shelfAdded).toBe(1);
		expect(await target.listShelf()).toEqual([SHELVED]);
		expect((await target.listPeople())[0]?.layout).toBe('desktop-first');
	});

	it('still reads a backup made before the Shelf existed', () => {
		expect(parseBackup(file({})).shelf).toBe(0);
	});

	it('merges rather than replaces, and saving twice keeps one', async () => {
		const target = testStore();
		await target.init();
		await target.saveToShelf({ ...SHELVED, title: 'Kept as it was' });
		await target.saveToShelf({
			...SHELVED,
			id: 'https://other.example.com/',
			url: 'https://other.example.com/'
		});

		const backup = parseBackup(file({ shelf: [SHELVED] })).backup;
		const report = await restoreBackup(backup, target);

		expect(report.shelfAdded).toBe(0);
		const items = await target.listShelf();
		expect(items).toHaveLength(2);
		expect(items.find((item) => item.id === SHELVED.id)?.title).toBe('Kept as it was');
	});

	it('rejects a shelf entry with an unsafe or mismatched address', () => {
		for (const bad of [
			{ ...SHELVED, url: 'http://wide.example.com/essay', id: 'http://wide.example.com/essay' },
			{ ...SHELVED, url: 'javascript:alert(1)', id: 'javascript:alert(1)' },
			{ ...SHELVED, id: 'https://wide.example.com/other' },
			{ ...SHELVED, from: 'somewhere' }
		]) {
			expect(() => parseBackup(file({ shelf: [bad] }))).toThrow('not a supported YipDen backup');
		}
	});

	it('rejects a layout the app does not know', () => {
		expect(() => parseBackup(file({ people: [{ ...PERSON, layout: 'tablet-only' }] }))).toThrow(
			'not a supported YipDen backup'
		);
	});
});

describe('references in the backup', () => {
	const KEPT = reference({ id: 'ref_00000000000000000000000000000002' });

	it('round trip, merging: one already kept here is not replaced', async () => {
		const source = testStore();
		await source.putReference(KEPT);
		const preview = parseBackup(JSON.stringify(await createBackup(source)));
		expect(preview.references).toBe(1);

		const target = testStore();
		await target.putReference({ ...KEPT, title: 'Mine' });
		const report = await restoreBackup(preview.backup, target);
		expect(report.referencesAdded).toBe(0);
		expect((await target.listReferences())[0]?.title).toBe('Mine');

		const empty = testStore();
		expect((await restoreBackup(preview.backup, empty)).referencesAdded).toBe(1);
		expect(await empty.listReferences()).toEqual([KEPT]);
	});

	it('reads the tracks a file from before references carried as a setting', async () => {
		const source = testStore();
		const old = await createBackup(source);
		delete old.references;
		old.settings.readerTracks = {
			'lena.example.com': [
				{ url: 'https://lena.example.com/a.mp3', title: 'A', addedAt: '2026-10-01T00:00:00.000Z' }
			]
		};
		const preview = parseBackup(JSON.stringify(old));
		expect(preview.references).toBe(1);

		const target = testStore();
		await restoreBackup(preview.backup, target);
		expect((await target.listReferences('lena.example.com')).map((entry) => entry.url)).toEqual([
			'https://lena.example.com/a.mp3'
		]);
		expect(await target.getSetting('readerTracks')).toBeNull();
	});

	it('lets a writing snip leave without its passage, only the page it points at', async () => {
		const source = testStore();
		await source.putReference(
			reference({
				id: 'ref_00000000000000000000000000000003',
				kind: 'text',
				url: 'https://lena.example.com/story',
				canonicalUrl: 'https://lena.example.com/story',
				selector: { exact: 'A secret passage.' },
				textFragmentUrl: 'https://lena.example.com/story#:~:text=A%20secret%20passage.'
			})
		);
		const file = JSON.stringify(await createBackup(source));
		expect(file).not.toContain('secret');
		expect(parseBackup(file).references).toBe(1);
	});

	it('refuses a file with a malformed reference before changing anything', async () => {
		const backup = await createBackup(testStore());
		backup.references = [{ ...KEPT, url: 'http://lena.example.com/a.mp3' }];
		expect(() => parseBackup(JSON.stringify(backup))).toThrow('not a supported YipDen backup');
		backup.references = [{ ...KEPT, selector: { exact: 'only text may have one' } }];
		expect(() => parseBackup(JSON.stringify(backup))).toThrow('not a supported YipDen backup');
	});
});

describe('linked creators in the backup', () => {
	const LINKED: CreatorRecord = {
		id: 'lenaofori.com',
		url: 'https://lenaofori.com/',
		home: 'https://lenaofori.com/',
		homeKind: 'own-site',
		aliases: [
			{
				url: 'https://bsky.app/profile/lena.example',
				key: 'bsky.app/profile/lena.example',
				addedAt: '2026-10-06T00:00:00.000Z'
			}
		],
		updatedAt: '2026-10-06T00:00:00.000Z'
	};

	it('travel through export and restore', async () => {
		const source = testStore();
		await source.init();
		await source.putCreator(LINKED);
		const preview = parseBackup(JSON.stringify(await createBackup(source)));
		expect(preview.creators).toBe(1);

		const target = testStore();
		const report = await restoreBackup(preview.backup, target);
		expect(report.creatorsAdded).toBe(1);
		expect(await target.listCreators()).toEqual([LINKED]);
	});

	it('never join a person this phone already links differently', async () => {
		const target = testStore();
		await target.init();
		await target.putCreator({ ...LINKED, id: 'bsky.app/profile/lena.example', aliases: [] });
		const backup = parseBackup(
			JSON.stringify({ ...(await createBackup(testStore())), creators: [LINKED] })
		).backup;
		const report = await restoreBackup(backup, target);
		expect(report.creatorsAdded).toBe(0);
		expect(await target.listCreators()).toHaveLength(1);
	});

	it('refuse a record with an unsafe address', async () => {
		const backup = {
			...(await createBackup(testStore())),
			creators: [{ ...LINKED, home: 'javascript:x' }]
		};
		expect(() => parseBackup(JSON.stringify(backup))).toThrow('not a supported YipDen backup');
	});
});

describe('places in the backup', () => {
	const PLACE = {
		id: 'lenaofori.com::etsy.com/shop/lenaofori',
		creatorKey: 'lenaofori.com',
		url: 'https://www.etsy.com/shop/lenaofori',
		key: 'etsy.com/shop/lenaofori',
		role: 'shop' as const,
		evidence: 'their-site' as const,
		addedAt: '2026-10-06T00:00:00.000Z'
	};

	it('travel through export and restore, a hidden one staying hidden', async () => {
		const source = testStore();
		await source.init();
		await source.putPlace(PLACE);
		await source.putPlace({
			...PLACE,
			id: 'lenaofori.com::instagram.com/lena',
			key: 'instagram.com/lena',
			url: 'https://www.instagram.com/lena',
			role: 'profile',
			hidden: true
		});
		const preview = parseBackup(JSON.stringify(await createBackup(source)));
		expect(preview.places).toBe(2);
		const target = testStore();
		const report = await restoreBackup(preview.backup, target);
		expect(report.placesAdded).toBe(2);
		expect((await target.listPlaces()).find((p) => p.hidden)?.key).toBe('instagram.com/lena');
	});

	it('refuse a place whose id does not match what it says it is', async () => {
		const backup = {
			...(await createBackup(testStore())),
			places: [{ ...PLACE, id: 'someone-else::x' }]
		};
		expect(() => parseBackup(JSON.stringify(backup))).toThrow('not a supported YipDen backup');
	});
});

describe('followed sites in the backup', () => {
	const SITE: SiteFollow = {
		id: 'https://medjed.example/',
		siteUrl: 'https://medjed.example/',
		feedUrl: 'https://medjed.example/feed.xml',
		title: 'Medjed',
		followedAt: '2026-10-08T00:00:00.000Z',
		refreshHours: 12,
		lastCheckedAt: '2026-10-08T06:00:00.000Z',
		cursor: 'etag-1',
		status: 'gone',
		failures: 3
	};

	it('travel through export and restore without this phone’s check state', async () => {
		const source = testStore();
		await source.init();
		await source.putSiteFollow(SITE);
		const preview = parseBackup(JSON.stringify(await createBackup(source)));
		expect(preview.sites).toBe(1);
		const target = testStore();
		const report = await restoreBackup(preview.backup, target);
		expect(report.sitesAdded).toBe(1);
		const [restored] = await target.listSiteFollows();
		expect(restored).toMatchObject({
			title: 'Medjed',
			refreshHours: 12,
			status: 'ok',
			failures: 0
		});
		expect(restored?.cursor).toBeUndefined();
		expect(restored?.lastCheckedAt).toBeUndefined();
	});

	it('keeps the settings of one already followed here', async () => {
		const target = testStore();
		await target.init();
		await target.putSiteFollow({ ...SITE, refreshHours: 24 });
		const source = testStore();
		await source.init();
		await source.putSiteFollow(SITE);
		const report = await restoreBackup(
			parseBackup(JSON.stringify(await createBackup(source))).backup,
			target
		);
		expect(report.sitesAdded).toBe(0);
		expect((await target.listSiteFollows())[0]?.refreshHours).toBe(24);
	});

	it('still reads a backup made before sites, and refuses an unsafe feed address', () => {
		expect(parseBackup(JSON.stringify({ ...emptyBackup() })).sites).toBe(0);
		const bad = { ...emptyBackup(), sites: [{ ...SITE, feedUrl: 'javascript:alert(1)' }] };
		expect(() => parseBackup(JSON.stringify(bad))).toThrow();
	});
});

function emptyBackup() {
	return {
		format: 'yipden-backup',
		version: 1,
		exportedAt: '2026-10-08T00:00:00.000Z',
		people: [],
		feeds: [],
		yips: [],
		settings: {},
		appearance: { theme: 'system', skin: 'original' }
	};
}
