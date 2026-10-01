import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scrapeKnifebeetleWebring } from './knifebeetleWebring.js';

/**
 * A real capture of the live page (2026-09-29), not an invented shape: a second real, different
 * ring proves the boundary generalizes, or shows where it does not.
 *
 * `import.meta.dirname`, not `new URL('./x', import.meta.url)`: see musiciansWebring.test.ts for
 * why, the exact same jsdom/Vite quirk.
 */
const LIVE_PAGE = readFileSync(
	join(import.meta.dirname, 'test-fixtures', 'knifebeetle.html'),
	'utf8'
);

describe('scrapeKnifebeetleWebring, against the real live page', () => {
	const candidates = scrapeKnifebeetleWebring(LIVE_PAGE);

	/**
	 * Of the roughly 68 comics the page lists, a third are already gone from the count before any
	 * of this app's own rules apply: the page marks a removed comic by commenting its whole block
	 * out (`<!-- -->`), which `tokenize` already discards entirely, and 14 more link their own
	 * site as plain `http://`, which `safeUrl` refuses the same as anywhere else in this app, even
	 * though the site itself may well answer on `https://` too (checked directly: several do).
	 * 31 is what is left once both of those are accounted for, confirmed by hand against the real
	 * page, not guessed at.
	 */
	it('finds the real, active, https-linked comics, and nothing else', () => {
		expect(candidates).toHaveLength(31);
	});

	it('never mistakes a commented-out (removed) member for a real one', () => {
		// Ladies of the Knight and Crossed Wires are both commented out in the real page.
		expect(candidates.some((c) => c.name === 'Ladies of the Knight')).toBe(false);
		expect(candidates.some((c) => c.name === 'Crossed Wires')).toBe(false);
	});

	it('drops a real, active comic whose own link is plain http, the same rule as anywhere else', () => {
		// AstralSounds is real and active, but links itself as http://astralsoundscomic.com/.
		expect(candidates.some((c) => c.name === 'AstralSounds')).toBe(false);
	});

	it('reads a comic’s title, address, cover and genre correctly', () => {
		expect(candidates.find((c) => c.name === 'The City Between')).toEqual({
			name: 'The City Between',
			url: 'https://kelmcdonald.com/',
			blurb:
				'In the futuristic city of New Mahtlaw, technology has made the supernatural hard to hide. The world knows werewolves are real but their rarity makes them an oddity not a threat. But more lies out there trying to stay in the shadows.',
			thumbUrl: 'https://knifebeetle.neocities.org/images/comics/thecitybetween.png',
			tags: ['Supernatural']
		});
	});

	it('reads the title correctly even when a "complete" badge image sits before the link', () => {
		// King Fish of the Charles's own <h4> has <img src="/images/complete-2.gif"> before <a>.
		expect(candidates.find((c) => c.name === 'King Fish of the Charles')).toMatchObject({
			url: 'https://kingfishofthecharles.thecomicseries.com/'
		});
	});

	it('folds a content warning into the blurb, never as a sensitive flag', () => {
		const entry = candidates.find((c) => c.name === 'Blackout City');
		expect(entry?.blurb).toContain('Content warning:');
		expect(entry?.blurb).toContain('gore');
		expect('sensitive' in (entry ?? {})).toBe(false);
	});

	it('leaves the blurb alone for a comic with no content warning at all', () => {
		const entry = candidates.find((c) => c.name === 'Kingfisher');
		expect(entry?.blurb).not.toContain('Content warning:');
		expect(entry?.blurb).toMatch(/^Kingfisher is an 1920s occult mystery/);
	});

	it('tags every comic with the genre section it was found under, all ten represented', () => {
		const genres = new Set(candidates.flatMap((c) => c.tags as string[]));
		expect(genres).toEqual(
			new Set([
				'Adventure',
				'Drama',
				'Fantasy',
				'Historical',
				'Horror',
				'Mystery',
				'Romance',
				'Sci-Fi',
				'Slice of Life',
				'Supernatural'
			])
		);
	});

	it('drops nothing to a plain http or otherwise unsafe address', () => {
		expect(candidates.every((c) => typeof c.url === 'string' && c.url.startsWith('https://'))).toBe(
			true
		);
	});
});

describe('scrapeKnifebeetleWebring, edge cases', () => {
	it('returns nothing for a document that is not a string', () => {
		for (const document of [null, undefined, 42, {}, []]) {
			expect(scrapeKnifebeetleWebring(document)).toEqual([]);
		}
	});

	it('returns nothing for a page with no .desc blocks at all', () => {
		expect(scrapeKnifebeetleWebring('<html><body>nothing here</body></html>')).toEqual([]);
	});

	it('handles a comic with an unclosed final block, no trailing </div>', () => {
		const html = `<a name="drama"></a>
			<div class="desc"><table><tr><td colspan="2"><h4><b><a href="https://example.com/">A Comic</a></b> by Someone</h4></td></tr>
			<tr><td><div id="bans"><a href="https://example.com/"><img class="comicicon" src="/c.png"></a></div></td>
			<td><p>A description.</p><b>Links:</b> <a href="https://example.com/">website</a></td></tr></table>`;
		const result = scrapeKnifebeetleWebring(html);
		expect(result).toEqual([
			{
				name: 'A Comic',
				url: 'https://example.com/',
				blurb: 'A description.',
				// Root-relative, resolved against the ring's own address, not the comic's: images
				// are always the ring's own CDN, whoever the comic's page belongs to.
				thumbUrl: 'https://knifebeetle.neocities.org/c.png',
				tags: ['drama']
			}
		]);
	});
});
