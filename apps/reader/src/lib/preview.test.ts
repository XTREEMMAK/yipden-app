import { describe, expect, it } from 'vitest';
import type { RingEntry } from '@yipden/ring-client';
import { previewFor } from './preview.js';

const base = { id: 'x', creator: 'X', source_url: 'https://x.example.com/' };
const entry = (extra: Partial<RingEntry> & { type: string }): RingEntry => ({ ...base, ...extra });

describe('previewFor', () => {
	it('plays an audio member with tracks', () => {
		const tracks = [{ label: 'One', media_url: 'https://x.example.com/1.mp3' }];
		expect(previewFor(entry({ type: 'audio', tracks }))).toEqual({ kind: 'play', label: 'Play' });
	});

	it('offers nothing for audio with no tracks', () => {
		expect(previewFor(entry({ type: 'audio', tracks: [] }))).toBeNull();
	});

	it('pages a comic, keeping captions as alt text and caption', () => {
		const preview = previewFor(
			entry({
				type: 'comic',
				pages: [{ image_url: 'https://x.example.com/1.png', caption: 'Panel' }]
			})
		);
		expect(preview).toMatchObject({ kind: 'view', label: 'Read a preview' });
		expect(preview?.kind === 'view' && preview.slides[0]).toEqual({
			image: 'https://x.example.com/1.png',
			alt: 'Panel',
			caption: 'Panel'
		});
	});

	it('shows artwork with medium and year as the caption', () => {
		const preview = previewFor(
			entry({
				type: 'art',
				artworks: [
					{
						image_url: 'https://x.example.com/a.png',
						alt: 'A pond',
						year: '2023',
						medium: 'pixel art'
					}
				]
			})
		);
		expect(preview?.kind === 'view' && preview.slides[0]).toMatchObject({
			alt: 'A pond',
			caption: 'pixel art · 2023'
		});
	});

	it('reads text excerpts', () => {
		const preview = previewFor(entry({ type: 'text', excerpts: [{ text: 'Hello', title: 'Hi' }] }));
		expect(preview?.kind === 'view' && preview.slides[0]).toEqual({ text: 'Hello', title: 'Hi' });
	});

	it('links a game trailer in preference to its preview', () => {
		expect(
			previewFor(
				entry({
					type: 'game',
					trailer_url: 'https://t.example.com/',
					preview_url: 'https://p.example.com/'
				})
			)
		).toEqual({ kind: 'link', label: 'Watch trailer', url: 'https://t.example.com/' });
		expect(previewFor(entry({ type: 'game', preview_url: 'https://p.example.com/' }))?.label).toBe(
			'Preview'
		);
	});

	it('has no preview for a member that publishes nothing previewable', () => {
		expect(previewFor(entry({ type: 'game' }))).toBeNull();
	});
});
