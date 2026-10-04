import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { creatorNotes, MAX_TRACKS_PER_CREATOR, titleFromUrl } from './creatorNotes.svelte.js';
import { FeedHttp } from '@yipden/feeds';
import { store } from './store/index.js';

// No network in tests: every check fails as if offline, so the rules judge addresses as given.
creatorNotes.captureDeps = () => ({
	http: new FeedHttp({
		fetch: async () => {
			throw new TypeError('offline');
		},
		minHostIntervalMs: 0
	}),
	store,
	now: () => new Date('2026-10-04T12:00:00.000Z')
});

describe('titleFromUrl', () => {
	it('names a track by its file, tidied', () => {
		expect(titleFromUrl('https://ash.example/audio/night_drive-final.mp3')).toBe(
			'night drive final'
		);
	});

	it('falls back to the host', () => {
		expect(titleFromUrl('https://ash.example/')).toBe('ash.example');
	});
});

describe('reader tracks', () => {
	it('adds a safe link once, under the creator’s site whatever the spelling', async () => {
		expect(
			await creatorNotes.addTrack(
				{ url: 'https://www.ash.example/' },
				{
					url: 'https://ash.example/a.mp3'
				}
			)
		).toBe('added');
		expect(
			await creatorNotes.addTrack(
				{ url: 'https://ash.example' },
				{ url: 'https://ash.example/a.mp3' }
			)
		).toBe('already-added');
		expect(creatorNotes.tracksFor('https://ash.example/')).toHaveLength(1);
		expect(creatorNotes.tracksFor('https://ash.example/')[0]?.title).toBe('a');
	});

	it('keeps a track as an audio reference: a pointer, unchecked, with its ring', async () => {
		await creatorNotes.addTrack(
			{ url: 'https://f.example/', ring: { source: 'partner', id: 'musicians-webring' } },
			{ url: 'https://f.example/song.mp3', foundOn: 'https://f.example/music' }
		);
		const [reference] = creatorNotes.referencesFor('https://f.example/');
		expect(reference).toMatchObject({
			kind: 'audio',
			creatorId: 'f.example',
			ringSource: 'partner',
			ringId: 'musicians-webring',
			url: 'https://f.example/song.mp3',
			canonicalUrl: 'https://f.example/song.mp3',
			foundOnPage: 'https://f.example/music',
			// Its host is theirs; with nothing able to prove the page links it, it is not sharable.
			hostVerified: true,
			sharable: false,
			status: 'live'
		});
		expect(reference?.id).toMatch(/^ref_[0-9a-f]{32}$/);
		// And it is in the store, not only in memory.
		expect((await store.listReferences('f.example')).map((entry) => entry.id)).toEqual([
			reference?.id
		]);
	});

	it('refuses a file on someone else’s host, and says why', async () => {
		expect(
			await creatorNotes.addTrack(
				{ url: 'https://g.example/' },
				{ url: 'https://other.example/g.mp3' }
			)
		).toBe('not-own-site');
		expect(creatorNotes.referencesFor('https://g.example/')).toEqual([]);
	});

	it('keeps a platform’s player found on their page, as a link', async () => {
		expect(
			await creatorNotes.addTrack(
				{ url: 'https://h.example/' },
				{ url: 'https://bandcamp.com/EmbeddedPlayer/album=1', foundOn: 'https://h.example/music' }
			)
		).toBe('added');
		expect(creatorNotes.referencesFor('https://h.example/')[0]).toMatchObject({
			hostVerified: false,
			sharable: false
		});
	});

	it('refuses an unsafe address', async () => {
		expect(
			await creatorNotes.addTrack({ url: 'https://b.example/' }, { url: 'http://b.example/a.mp3' })
		).toBe('unsafe');
		expect(
			await creatorNotes.addTrack({ url: 'https://b.example/' }, { url: 'https://127.0.0.1/a.mp3' })
		).toBe('unsafe');
		expect(
			await creatorNotes.addTrack({ url: 'https://b.example/' }, { url: 'javascript:alert(1)' })
		).toBe('unsafe');
	});

	it('keeps an unsafe "found on" page out, and the track itself', async () => {
		await creatorNotes.addTrack(
			{ url: 'https://c.example/' },
			{
				url: 'https://c.example/c.mp3',
				foundOn: 'http://c.example/page'
			}
		);
		expect(creatorNotes.tracksFor('https://c.example/')[0]?.foundOn).toBeUndefined();
	});

	it('caps how many one creator can have', async () => {
		for (let index = 0; index < MAX_TRACKS_PER_CREATOR; index += 1) {
			await creatorNotes.addTrack(
				{ url: 'https://d.example/' },
				{ url: `https://d.example/${index}.mp3` }
			);
		}
		expect(
			await creatorNotes.addTrack({ url: 'https://d.example/' }, { url: 'https://d.example/x.mp3' })
		).toBe('full');
	});

	it('removes one track and forgets an emptied creator', async () => {
		await creatorNotes.removeTrack('https://ash.example/', 'https://ash.example/a.mp3');
		expect(creatorNotes.tracksFor('https://ash.example/')).toEqual([]);
		expect(creatorNotes.referencesFor('https://ash.example/')).toEqual([]);
	});
});

describe('checking kept tracks again', () => {
	const offline = creatorNotes.captureDeps;
	const goneEverywhere = () => ({
		...offline(),
		http: new FeedHttp({
			fetch: async (url: string) => ({
				status: 410,
				url,
				headers: { get: () => null },
				text: async () => ''
			}),
			minHostIntervalMs: 0
		})
	});

	it('checks a few at a time, never-checked first, and marks what has gone', async () => {
		// Only this creator's tracks, so the pass's five are theirs.
		for (const kept of creatorNotes.references) await store.removeReference(kept.id);
		await creatorNotes.reload();
		for (let index = 0; index < 7; index += 1) {
			await creatorNotes.addTrack(
				{ url: 'https://i.example/' },
				{ url: `https://i.example/${index}.mp3` }
			);
		}
		creatorNotes.captureDeps = goneEverywhere;
		try {
			await creatorNotes.recheckDue(new Date('2026-10-04T12:00:00.000Z'));
			const gone = () => creatorNotes.tracksFor('https://i.example/').filter((track) => track.gone);
			expect(gone()).toHaveLength(5);
			await creatorNotes.recheckDue(new Date('2026-10-04T12:00:00.000Z'));
			expect(gone()).toHaveLength(7);
			// What the store holds, not only what is on screen.
			expect(
				(await store.listReferences('i.example')).every((entry) => entry.status === 'gone')
			).toBe(true);
		} finally {
			creatorNotes.captureDeps = offline;
		}
	});

	it('opening one checks it, unless it was checked within the hour', async () => {
		await creatorNotes.addTrack({ url: 'https://j.example/' }, { url: 'https://j.example/a.mp3' });
		const [kept] = creatorNotes.referencesFor('https://j.example/');
		creatorNotes.captureDeps = goneEverywhere;
		try {
			await store.updateReferenceCheck(kept!.id, {
				status: 'live',
				checkedAt: '2026-10-04T11:30:00.000Z'
			});
			await creatorNotes.reload();
			await creatorNotes.recheckOnOpen(kept!.id, new Date('2026-10-04T12:00:00.000Z'));
			expect(creatorNotes.tracksFor('https://j.example/')[0]?.gone).toBeUndefined();
			await creatorNotes.recheckOnOpen(kept!.id, new Date('2026-10-04T13:00:00.000Z'));
			expect(creatorNotes.tracksFor('https://j.example/')[0]?.gone).toBe(true);
		} finally {
			creatorNotes.captureDeps = offline;
		}
	});
});

describe('layout overrides', () => {
	it('wins over what the ring said, and clears back to it', async () => {
		expect(creatorNotes.layoutFor('https://e.example/', 'desktop-first')).toBe('desktop-first');
		await creatorNotes.setLayout('https://e.example/', 'mobile-friendly');
		expect(creatorNotes.layoutFor('https://e.example/', 'desktop-first')).toBe('mobile-friendly');
		await creatorNotes.setLayout('https://e.example/', null);
		expect(creatorNotes.layoutFor('https://e.example/', 'desktop-first')).toBe('desktop-first');
	});
});
