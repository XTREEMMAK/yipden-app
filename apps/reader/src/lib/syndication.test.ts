import { describe, expect, it } from 'vitest';
import { areCrossposts, groupCrossposts } from './syndication.js';
import type { StoredYip } from './store/index.js';

function yip(overrides: Partial<StoredYip> = {}): StoredYip {
	return {
		key: 'site::1',
		feedId: 'site',
		id: '1',
		title: 'A field note',
		url: 'https://ada.example/posts/1',
		publishedAt: '2026-09-20T10:00:00.000Z',
		summary: 'A field note from the workshop.',
		contentHtml: '<p>A field note from the workshop.</p>',
		media: [],
		sourceFeedId: 'site',
		personId: 'ada',
		feedKind: 'blog',
		category: 'posts',
		seenAt: '2026-09-20T11:00:00.000Z',
		...overrides
	};
}

describe('areCrossposts', () => {
	it('trusts an explicit syndication relationship without requiring matching dates', () => {
		const site = yip({ syndicationUrls: ['https://social.example/@ada/22'] });
		const social = yip({
			key: 'social::22',
			feedId: 'social',
			url: 'https://social.example/@ada/22',
			publishedAt: '2026-07-01T10:00:00.000Z',
			summary: 'A shorter mirror.',
			contentHtml: '<p>A shorter mirror.</p>'
		});
		expect(areCrossposts(site, social)).toBe(true);
	});

	it('groups long exact bodies posted on different days', () => {
		const body = `<p>${'A careful workshop update with enough detail to identify the complete post. '.repeat(2)}</p>`;
		expect(
			areCrossposts(
				yip({ contentHtml: body }),
				yip({
					key: 'social::1',
					feedId: 'social',
					url: 'https://social.example/@ada/1',
					publishedAt: '2026-09-23T10:00:00.000Z',
					contentHtml: body
				})
			)
		).toBe(true);
	});

	it('does not infer a relationship outside the 30-day candidate window', () => {
		const body = `<p>${'A careful workshop update with enough detail to identify the complete post. '.repeat(2)}</p>`;
		expect(
			areCrossposts(
				yip({ contentHtml: body, publishedAt: '2026-07-01T10:00:00.000Z' }),
				yip({
					key: 'social::1',
					feedId: 'social',
					url: 'https://social.example/@ada/1',
					publishedAt: '2026-09-23T10:00:00.000Z',
					contentHtml: body
				})
			)
		).toBe(false);
	});

	it('requires a shared outbound URL for short exact posts', () => {
		const short = yip({ contentHtml: '<p>New studio update.</p>' });
		const mirror = yip({
			key: 'social::1',
			feedId: 'social',
			url: 'https://social.example/@ada/1',
			contentHtml: '<p>New studio update.</p>'
		});
		expect(areCrossposts(short, mirror)).toBe(false);

		short.contentHtml =
			'<p>New studio update. <a href="https://project.example/">https://project.example/</a></p>';
		mirror.contentHtml = '<p>New studio update. https://project.example/</p>';
		expect(areCrossposts(short, mirror)).toBe(true);
	});

	it('requires strong supporting evidence for a near-exact body', () => {
		const body = 'A long cross-post body with stable wording and enough detail. '.repeat(3);
		const original = yip({ title: 'Workshop notes', contentHtml: `<p>${body}One.</p>` });
		const mirror = yip({
			key: 'social::1',
			feedId: 'social',
			url: 'https://social.example/@ada/1',
			title: 'Workshop notes',
			contentHtml: `<p>${body}Two.</p>`
		});
		expect(areCrossposts(original, mirror)).toBe(true);
		expect(areCrossposts(original, { ...mirror, title: 'Something else' })).toBe(false);
	});

	it('never groups different people or two items from the same feed', () => {
		const longBody = `<p>${'The same sufficiently long body. '.repeat(5)}</p>`;
		const original = yip({ contentHtml: longBody });
		expect(
			areCrossposts(
				original,
				yip({ key: 'other::1', feedId: 'other', personId: 'other-person', contentHtml: longBody })
			)
		).toBe(false);
		expect(areCrossposts(original, yip({ key: 'site::2', contentHtml: longBody }))).toBe(false);
	});

	it('does not merge an article with a social post that merely links to it', () => {
		const article = yip({
			contentHtml:
				'<p>This is the complete article body with several paragraphs and substantial original detail.</p>'
		});
		const announcement = yip({
			key: 'social::1',
			feedId: 'social',
			url: 'https://social.example/@ada/1',
			contentHtml:
				'<p>I wrote something new: <a href="https://ada.example/posts/1">read it</a>.</p>'
		});
		expect(areCrossposts(article, announcement)).toBe(false);
	});
});

describe('groupCrossposts', () => {
	it('keeps every source while preferring the creator-owned website as the card', () => {
		const social = yip({
			key: 'social::1',
			feedId: 'social',
			url: 'https://social.example/@ada/1',
			canonicalUrl: 'https://ada.example/posts/1',
			contentHtml: '<p>A richer social copy with an image and extra metadata.</p>',
			media: [{ url: 'https://social.example/image.jpg', kind: 'image', alt: 'Workshop' }]
		});
		const result = groupCrossposts([yip(), social], new Map([['ada', 'https://ada.example/']]));

		expect(result.yips).toHaveLength(1);
		expect(result.yips[0]?.key).toBe('site::1');
		expect(result.yips[0]?.crosspostKeys).toEqual(['site::1', 'social::1']);
		expect(result.yips[0]?.crossposts?.map((copy) => copy.key)).toEqual(['site::1', 'social::1']);
	});

	it('makes an unread later mirror inherit an existing read state', () => {
		const body = `<p>${'A complete duplicated post body for read-state propagation. '.repeat(2)}</p>`;
		const result = groupCrossposts([
			yip({ contentHtml: body, readAt: '2026-09-21T00:00:00.000Z' }),
			yip({
				key: 'social::1',
				feedId: 'social',
				url: 'https://social.example/@ada/1',
				publishedAt: '2026-09-22T10:00:00.000Z',
				contentHtml: body
			})
		]);

		expect(result.yips[0]?.readAt).toBe('2026-09-21T00:00:00.000Z');
		expect(result.readKeys).toEqual(['social::1']);
	});
});
