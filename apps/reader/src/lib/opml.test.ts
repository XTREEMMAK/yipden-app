import { describe, expect, it } from 'vitest';
import { exportOpml, parseOpml } from './opml.js';
import type { Feed, Person } from './store/index.js';

function person(overrides: Partial<Person> = {}): Person {
	return {
		id: 'p1',
		name: 'Lena Ofori',
		siteUrl: 'https://lena.example.com/',
		followedAt: '2026-09-20T00:00:00.000Z',
		...overrides
	};
}

function feed(overrides: Partial<Feed> = {}): Feed {
	return {
		id: 'https://lena.example.com/feed.xml',
		personId: 'p1',
		url: 'https://lena.example.com/feed.xml',
		kind: 'blog',
		title: 'Lena Ofori',
		verified: true,
		failures: 0,
		enabled: true,
		...overrides
	};
}

describe('exportOpml', () => {
	it('groups a person’s feeds under one outline', () => {
		const xml = exportOpml(
			[person()],
			new Map([['p1', [feed(), feed({ id: 'b', url: 'https://bsky.app/x/rss', kind: 'bluesky' })]]])
		);

		expect(xml).toContain('<opml version="2.0">');
		expect(xml).toContain('text="Lena Ofori"');
		expect(xml).toContain('xmlUrl="https://lena.example.com/feed.xml"');
		expect(xml).toContain('xmlUrl="https://bsky.app/x/rss"');
	});

	it('escapes a name that would otherwise break the markup', () => {
		const xml = exportOpml([person({ name: 'Ada & "the" <Team>' })], new Map());
		expect(xml).toContain('Ada &amp; &quot;the&quot; &lt;Team&gt;');
		expect(xml).not.toContain('<Team>');
	});

	it('preserves a disabled source as an ignorable OPML extension', () => {
		const xml = exportOpml([person()], new Map([['p1', [feed({ enabled: false })]]]));
		expect(xml).toContain('yipdenEnabled="false"');
		expect(parseOpml(xml)[0]?.feeds[0]?.enabled).toBe(false);
	});

	it('produces nothing for a person with no feeds beyond an empty outline', () => {
		const xml = exportOpml([person()], new Map());
		expect(xml).toContain('<outline text="Lena Ofori"');
	});
});

describe('parseOpml', () => {
	it('reads a grouped export back into the same shape', () => {
		const xml = exportOpml([person()], new Map([['p1', [feed()]]]));
		const [imported] = parseOpml(xml);

		expect(imported?.name).toBe('Lena Ofori');
		expect(imported?.siteUrl).toBe('https://lena.example.com/');
		expect(imported?.feeds).toEqual([
			{ url: 'https://lena.example.com/feed.xml', title: 'Lena Ofori', kind: 'rss' }
		]);
	});

	it('reads a bare feed with no grouping outline as one person', () => {
		const xml = `<opml version="2.0"><body>
			<outline type="rss" text="A Blog" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com/"/>
		</body></opml>`;
		const [imported] = parseOpml(xml);
		expect(imported).toEqual({
			name: 'A Blog',
			siteUrl: 'https://example.com/',
			feeds: [{ url: 'https://example.com/feed.xml', title: 'A Blog', kind: 'rss' }]
		});
	});

	it('drops a feed with an unsafe URL rather than failing the whole import', () => {
		const xml = `<opml version="2.0"><body>
			<outline text="Someone">
				<outline type="rss" text="Kept" xmlUrl="https://example.com/feed.xml"/>
				<outline type="rss" text="Local network" xmlUrl="https://192.168.1.1/feed.xml"/>
				<outline type="rss" text="Not https" xmlUrl="http://example.com/feed.xml"/>
			</outline>
		</body></opml>`;
		const [imported] = parseOpml(xml);
		expect(imported?.feeds).toEqual([
			{ url: 'https://example.com/feed.xml', title: 'Kept', kind: 'rss' }
		]);
	});

	it('drops a person left with no safe feeds at all', () => {
		const xml = `<opml version="2.0"><body>
			<outline text="Someone">
				<outline type="rss" text="Bad" xmlUrl="javascript:alert(1)"/>
			</outline>
		</body></opml>`;
		expect(parseOpml(xml)).toEqual([]);
	});

	it('falls back to the feed host when nothing named the person', () => {
		const xml = `<opml version="2.0"><body>
			<outline>
				<outline type="rss" xmlUrl="https://example.com/feed.xml"/>
			</outline>
		</body></opml>`;
		expect(parseOpml(xml)[0]?.name).toBe('example.com');
	});

	it('returns nothing for a document with no body', () => {
		expect(parseOpml('<opml version="2.0"><head><title>Empty</title></head></opml>')).toEqual([]);
	});

	it('does not resolve an external entity', () => {
		const xml = `<?xml version="1.0"?>
			<!DOCTYPE opml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
			<opml version="2.0"><body>
				<outline text="&xxe;">
					<outline type="rss" xmlUrl="https://example.com/feed.xml"/>
				</outline>
			</body></opml>`;
		const result = parseOpml(xml);
		expect(JSON.stringify(result)).not.toContain('root:');
	});
});

describe('round trip', () => {
	it('exports and re-imports the same follow list', () => {
		const people = [
			person(),
			person({ id: 'p2', name: 'Cy Marsh', siteUrl: 'https://cy.example.com/' })
		];
		const feeds = new Map([
			['p1', [feed()]],
			[
				'p2',
				[
					feed({
						id: 'c',
						personId: 'p2',
						url: 'https://cy.example.com/feed.xml',
						title: 'Cy Marsh'
					})
				]
			]
		]);

		const imported = parseOpml(exportOpml(people, feeds));
		expect(imported.map((p) => p.name).sort()).toEqual(['Cy Marsh', 'Lena Ofori']);
		expect(imported.flatMap((p) => p.feeds)).toHaveLength(2);
	});
});
