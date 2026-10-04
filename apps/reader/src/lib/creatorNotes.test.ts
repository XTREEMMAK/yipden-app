import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { creatorNotes, MAX_TRACKS_PER_CREATOR, titleFromUrl } from './creatorNotes.svelte.js';
import { store } from './store/index.js';

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
			hostVerified: false,
			sharable: false,
			status: 'live'
		});
		expect(reference?.id).toMatch(/^ref_[0-9a-f]{32}$/);
		// And it is in the store, not only in memory.
		expect((await store.listReferences('f.example')).map((entry) => entry.id)).toEqual([
			reference?.id
		]);
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

describe('layout overrides', () => {
	it('wins over what the ring said, and clears back to it', async () => {
		expect(creatorNotes.layoutFor('https://e.example/', 'desktop-first')).toBe('desktop-first');
		await creatorNotes.setLayout('https://e.example/', 'mobile-friendly');
		expect(creatorNotes.layoutFor('https://e.example/', 'desktop-first')).toBe('mobile-friendly');
		await creatorNotes.setLayout('https://e.example/', null);
		expect(creatorNotes.layoutFor('https://e.example/', 'desktop-first')).toBe('desktop-first');
	});
});
