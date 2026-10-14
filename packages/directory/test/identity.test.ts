import { describe, expect, it } from 'vitest';
import { hashIdentity, identitiesOfInput, identitiesOfUrl } from '../src/index.js';

describe('identities of an address', () => {
	it('treats www, a trailing slash and case in the host as the same site', () => {
		const forms = [
			'https://www.Example.com/',
			'https://example.com',
			'https://example.com/',
			'https://EXAMPLE.com/#top'
		];
		for (const form of forms) expect(identitiesOfUrl(form)).toEqual(['url:example.com']);
		expect(identitiesOfUrl('https://example.com/shop/')).toEqual(['url:example.com/shop']);
	});

	it('knows a YouTube channel by handle, by channel id, and through its feed', () => {
		expect(identitiesOfUrl('https://www.youtube.com/@JerichordsPlays')).toContain(
			'youtube:@jerichordsplays'
		);
		expect(identitiesOfUrl('https://www.youtube.com/channel/UCY_lC-yhnqr9M3Umye24TbA')).toContain(
			'youtube:UCY_lC-yhnqr9M3Umye24TbA'
		);
		expect(
			identitiesOfUrl(
				'https://www.youtube.com/feeds/videos.xml?channel_id=UCY_lC-yhnqr9M3Umye24TbA'
			)
		).toContain('youtube:UCY_lC-yhnqr9M3Umye24TbA');
	});

	it('knows Bluesky and fediverse accounts', () => {
		expect(identitiesOfUrl('https://bsky.app/profile/Someone.example.com')).toContain(
			'bsky:someone.example.com'
		);
		expect(identitiesOfUrl('https://social.example/@Gone')).toContain('fedi:gone@social.example');
		expect(identitiesOfUrl('https://social.example/users/gone')).toContain(
			'fedi:gone@social.example'
		);
	});

	it('reads a Mastodon profile’s feed as the same account, so an opt-out by handle reaches it', () => {
		expect(identitiesOfUrl('https://social.example/@Gone.rss')).toContain(
			'fedi:gone@social.example'
		);
	});

	it('refuses anything that is not a public https address', () => {
		expect(identitiesOfUrl('http://example.com/')).toEqual([]);
		expect(identitiesOfUrl('https://localhost/')).toEqual([]);
		expect(identitiesOfUrl('javascript:alert(1)')).toEqual([]);
	});
});

describe('identities of what someone typed when asking to be removed', () => {
	it('reads addresses, handles and prefixed identities, and guesses nothing else', () => {
		expect(identitiesOfInput('https://www.opted-out.example.com/')).toEqual([
			'url:opted-out.example.com'
		]);
		expect(identitiesOfInput('http://opted-out.example.com')).toEqual([
			'url:opted-out.example.com'
		]);
		expect(identitiesOfInput('@Gone@social.example')).toEqual(['fedi:gone@social.example']);
		expect(identitiesOfInput('someone.example.com')).toEqual([
			'bsky:someone.example.com',
			'url:someone.example.com'
		]);
		expect(identitiesOfInput('youtube:@JerichordsPlays')).toEqual(['youtube:@jerichordsplays']);
		expect(identitiesOfInput('just some words')).toEqual([]);
	});
});

describe('the opt-out hash', () => {
	it('is SHA-256 hex, the same every time, and different per identity', async () => {
		const a = await hashIdentity('url:opted-out.example.com');
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashIdentity('url:opted-out.example.com')).toBe(a);
		expect(await hashIdentity('url:other.example.com')).not.toBe(a);
	});
});
