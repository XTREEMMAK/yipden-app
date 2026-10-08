import { describe, expect, it } from 'vitest';
import fixture from './fixtures/partner-ring.json' with { type: 'json' };
import {
	previewKindOf,
	readPartnerRing,
	type PartnerAdapter,
	type PartnerCandidate,
	type PartnerCapability
} from '../src/partner.js';

/**
 * A stand-in adapter for a stand-in ring. It exists to prove the boundary, not to speak for any
 * real ring: the first real adapter is a separate, agreed decision.
 */
function fixtureAdapter(capabilities: PartnerCapability[] = []): PartnerAdapter {
	return {
		ring: { id: 'fixture-ring', name: 'Fixture Ring', hubUrl: 'https://fixture-ring.example/' },
		capabilities,
		read(document) {
			const sites = (document as { sites?: unknown }).sites;
			if (!Array.isArray(sites)) return [];
			return sites.map((site): PartnerCandidate => ({
				id: site.slug,
				name: site.title,
				url: site.href,
				blurb: site.about,
				thumbUrl: site.banner,
				tags: site.labels,
				layout: site.responsive === false ? 'desktop-first' : 'mobile-friendly',
				sensitive: site.warn === true,
				previewUrl: site.sample
			}));
		}
	};
}

describe('readPartnerRing', () => {
	it('reduces a ring to the small common shape and reports what it refused', () => {
		const result = readPartnerRing(fixtureAdapter(), fixture);

		expect(result.members.map((member) => member.name)).toEqual([
			'Ash & Ember',
			'Big Monitor Club'
		]);
		expect(result.members[0]).toEqual({
			ringId: 'fixture-ring',
			id: 'ash-and-ember',
			name: 'Ash & Ember',
			url: 'https://ash.example.com/',
			blurb: 'Zines about small fires.',
			layout: 'mobile-friendly'
		});
		expect(result.dropped.map((entry) => entry.reason)).toEqual([
			'url is missing, not https, or not public',
			'url is missing, not https, or not public',
			'url is missing, not https, or not public',
			'missing name',
			'duplicate id'
		]);
	});

	it('gates richer fields by declared capability, so an adapter cannot leak what it never declared', () => {
		const plain = readPartnerRing(fixtureAdapter(), fixture).members;
		expect(
			plain.every(
				(member) =>
					!('thumbUrl' in member) &&
					!('tags' in member) &&
					!('sensitive' in member) &&
					!('previewUrl' in member)
			)
		).toBe(true);
		// Without the layout capability a ring's claim is not read at all.
		expect(plain.every((member) => member.layout === 'mobile-friendly')).toBe(true);

		const rich = readPartnerRing(
			fixtureAdapter(['thumbnails', 'tags', 'layout', 'sensitive', 'preview']),
			fixture
		).members;
		expect(rich[0]?.thumbUrl).toBe('https://ash.example.com/banner.png');
		expect(rich[0]?.tags).toEqual(['zine', 'print']);
		expect(rich[1]?.layout).toBe('desktop-first');
		expect(rich[0]?.sensitive).toBe(false);
		expect(rich[1]?.sensitive).toBe(true);
		// Ash & Ember's own sample is plain http, refused the same as a member's main address.
		expect(rich[0]?.previewUrl).toBeUndefined();
		expect(rich[1]?.previewUrl).toBe('https://bmc.example.org/track.mp3');
	});

	it('gives a member with no id a stable one', () => {
		const first = readPartnerRing(fixtureAdapter(), fixture).members[1]?.id;
		const again = readPartnerRing(fixtureAdapter(), fixture).members[1]?.id;
		expect(first).toMatch(/^big-monitor-club-/);
		expect(again).toBe(first);
	});

	it('refuses the whole ring when its hub is not a public https address', () => {
		for (const hubUrl of [
			'http://fixture-ring.example/',
			'https://localhost/',
			'javascript:alert(1)',
			''
		]) {
			const adapter = { ...fixtureAdapter(), ring: { ...fixtureAdapter().ring, hubUrl } };
			const result = readPartnerRing(adapter, fixture);
			expect(result.members).toEqual([]);
			expect(result.dropped[0]?.reason).toMatch(/hub/);
		}
	});

	it('keeps a ring mark bundled with the client, and refuses anything posing as one', () => {
		const withIcon = (iconUrl: string) => {
			const base = fixtureAdapter();
			return readPartnerRing({ ...base, ring: { ...base.ring, iconUrl } }, fixture).ring.iconUrl;
		};
		expect(withIcon('/ring-icons/smallway.svg')).toBe('/ring-icons/smallway.svg');
		expect(withIcon('https://ring.example/icon.png')).toBe('https://ring.example/icon.png');
		expect(withIcon('//evil.example/icon.png')).toBeUndefined();
		expect(withIcon('/ring-icons/../../secret')).toBeUndefined();
		expect(withIcon('javascript:alert(1)')).toBeUndefined();
		expect(withIcon('http://ring.example/icon.png')).toBeUndefined();
	});

	it('never throws, whatever the document or the adapter does', () => {
		for (const document of [null, undefined, 42, 'text', [], { sites: 'no' }]) {
			expect(() => readPartnerRing(fixtureAdapter(), document)).not.toThrow();
			expect(readPartnerRing(fixtureAdapter(), document).members).toEqual([]);
		}
		const throwing: PartnerAdapter = {
			...fixtureAdapter(),
			read() {
				throw new Error('boom');
			}
		};
		expect(readPartnerRing(throwing, fixture).dropped[0]?.reason).toMatch(/adapter failed/);
	});
});

describe('previewKindOf', () => {
	it('recognizes each known platform from its host, with or without a www/subdomain', () => {
		expect(previewKindOf('https://www.youtube.com/watch?v=abc')).toBe('youtube');
		expect(previewKindOf('https://youtu.be/abc')).toBe('youtube');
		expect(previewKindOf('https://m.youtube.com/watch?v=abc')).toBe('youtube');
		expect(previewKindOf('https://soundcloud.com/someone/a-track')).toBe('soundcloud');
		expect(previewKindOf('https://w.soundcloud.com/player/?url=x')).toBe('soundcloud');
		expect(previewKindOf('https://someone.bandcamp.com/track/a-track')).toBe('bandcamp');
		expect(previewKindOf('https://open.spotify.com/track/abc')).toBe('spotify');
		expect(previewKindOf('https://music.apple.com/us/album/x/123')).toBe('apple-music');
	});

	it('recognizes a direct audio file on any other host', () => {
		expect(previewKindOf('https://files.catbox.moe/jpw57c.mp3')).toBe('file');
		expect(previewKindOf('https://file.garden/x/track%20one.mp3')).toBe('file');
		expect(previewKindOf('https://someone.neocities.org/a.wav?v=2')).toBe('file');
	});

	it('prefers the platform over the extension when a platform URL happens to end in one', () => {
		// Bandcamp's own download links can end in an audio extension; it is still Bandcamp.
		expect(previewKindOf('https://someone.bandcamp.com/download/track.mp3')).toBe('bandcamp');
	});

	it('falls back to external for a page on the member’s own site with no recognized extension', () => {
		expect(previewKindOf('https://someone.neocities.org/music')).toBe('external');
	});

	it('answers external for anything unsafe, same as everywhere else in this package', () => {
		for (const url of ['http://insecure.example.com/track.mp3', 'javascript:alert(1)', '']) {
			expect(previewKindOf(url)).toBe('external');
		}
	});
});
