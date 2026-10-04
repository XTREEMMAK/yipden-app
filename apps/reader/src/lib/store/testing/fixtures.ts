import type { Feed, Person, ShelfItem, StoredYip } from '../types.js';
import type { Reference } from '../../references/types.js';

export function person(overrides: Partial<Person> = {}): Person {
	return {
		id: 'person-lena',
		name: 'Lena',
		siteUrl: 'https://lena.example.com/',
		followedAt: '2026-09-20T10:00:00.000Z',
		...overrides
	};
}

export function feed(overrides: Partial<Feed> = {}): Feed {
	return {
		id: 'https://lena.example.com/feed.xml',
		personId: 'person-lena',
		url: 'https://lena.example.com/feed.xml',
		kind: 'blog',
		title: 'Lena',
		verified: true,
		failures: 0,
		enabled: true,
		...overrides
	};
}

export function yip(overrides: Partial<StoredYip> = {}): StoredYip {
	return {
		key: 'https://lena.example.com/feed.xml::1',
		feedId: 'https://lena.example.com/feed.xml',
		id: '1',
		title: 'A post',
		url: 'https://lena.example.com/1',
		publishedAt: '2026-09-20T10:00:00.000Z',
		summary: 'Something happened.',
		contentHtml: null,
		media: [],
		sourceFeedId: 'https://lena.example.com/feed.xml',
		personId: 'person-lena',
		feedKind: 'blog',
		category: 'posts',
		seenAt: '2026-09-20T11:00:00.000Z',
		...overrides
	};
}

export function shelfItem(overrides: Partial<ShelfItem> = {}): ShelfItem {
	return {
		id: 'https://wide.example.com/essay',
		url: 'https://wide.example.com/essay',
		title: 'A wide essay',
		creator: 'Wide',
		from: 'feeds',
		savedAt: '2026-09-26T10:00:00.000Z',
		...overrides
	};
}

export function reference(overrides: Partial<Reference> = {}): Reference {
	return {
		id: 'ref_00000000000000000000000000000001',
		kind: 'audio',
		creatorId: 'lena.example.com',
		ringSource: 'own',
		ringId: 'indienodes',
		title: 'Night drive',
		url: 'https://lena.example.com/audio/night.mp3',
		canonicalUrl: 'https://lena.example.com/audio/night.mp3',
		foundOnPage: 'https://lena.example.com/music',
		hostVerified: false,
		sharable: false,
		status: 'live',
		createdAt: '2026-10-01T00:00:00.000Z',
		...overrides
	};
}
