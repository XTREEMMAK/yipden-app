import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { creatorNotes, MAX_TRACKS_PER_CREATOR, titleFromUrl } from './creatorNotes.svelte.js';

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
			await creatorNotes.addTrack('https://www.ash.example/', {
				url: 'https://ash.example/a.mp3'
			})
		).toBe('added');
		expect(
			await creatorNotes.addTrack('https://ash.example', { url: 'https://ash.example/a.mp3' })
		).toBe('already-added');
		expect(creatorNotes.tracksFor('https://ash.example/')).toHaveLength(1);
		expect(creatorNotes.tracksFor('https://ash.example/')[0]?.title).toBe('a');
	});

	it('refuses an unsafe address', async () => {
		expect(
			await creatorNotes.addTrack('https://b.example/', { url: 'http://b.example/a.mp3' })
		).toBe('unsafe');
		expect(
			await creatorNotes.addTrack('https://b.example/', { url: 'https://127.0.0.1/a.mp3' })
		).toBe('unsafe');
		expect(await creatorNotes.addTrack('https://b.example/', { url: 'javascript:alert(1)' })).toBe(
			'unsafe'
		);
	});

	it('keeps an unsafe "found on" page out, and the track itself', async () => {
		await creatorNotes.addTrack('https://c.example/', {
			url: 'https://c.example/c.mp3',
			foundOn: 'http://c.example/page'
		});
		expect(creatorNotes.tracksFor('https://c.example/')[0]?.foundOn).toBeUndefined();
	});

	it('caps how many one creator can have', async () => {
		for (let index = 0; index < MAX_TRACKS_PER_CREATOR; index += 1) {
			await creatorNotes.addTrack('https://d.example/', { url: `https://d.example/${index}.mp3` });
		}
		expect(
			await creatorNotes.addTrack('https://d.example/', { url: 'https://d.example/x.mp3' })
		).toBe('full');
	});

	it('removes one track and forgets an emptied creator', async () => {
		await creatorNotes.removeTrack('https://ash.example/', 'https://ash.example/a.mp3');
		expect(creatorNotes.tracksFor('https://ash.example/')).toEqual([]);
		expect('ash.example' in creatorNotes.tracks).toBe(false);
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
