import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scrapeMusiciansWebring } from './musiciansWebring.js';

/**
 * A real capture of the live page (2026-09-28), not an invented shape: this ring has no schema
 * at all, so the only honest fixture is what it actually publishes, kept exactly as fetched.
 *
 * `import.meta.dirname` (a plain string, Node 20.11+), not `new URL('./x', import.meta.url)`:
 * Vite recognizes that exact syntax as its own static asset-URL pattern and rewrites it, which
 * under this project's jsdom test environment resolves against a simulated `http://localhost`
 * origin instead of the real file, wherever it appears in the module, top level or not.
 */
const LIVE_PAGE = readFileSync(
	join(import.meta.dirname, 'test-fixtures', 'musicians-webring.html'),
	'utf8'
);

describe('scrapeMusiciansWebring, against the real live page', () => {
	const candidates = scrapeMusiciansWebring(LIVE_PAGE);

	/**
	 * The page's own heading says "members: 74"; this reads 73. Confirmed the difference is not
	 * a scraper miss: one row (Bailey Lockheart) links a plain `http://` address, which `safeUrl`
	 * correctly refuses, same as anywhere else in the app. The count is informational text on
	 * the page, not something this adapter can or should treat as authoritative.
	 */
	it('finds every member except the one whose site is plain http, not https', () => {
		expect(candidates).toHaveLength(73);
		expect(candidates.some((c) => c.name === 'Bailey Lockheart')).toBe(false);
	});

	it('reads a member whose row uses a real button image, and their own chosen sample', () => {
		expect(candidates.find((c) => c.url === 'https://midnight-channel.neocities.org/')).toEqual({
			name: 'kirig0e',
			url: 'https://midnight-channel.neocities.org/',
			blurb: 'breakcore, jungle, hexd mixes and original music!!',
			sensitive: false,
			previewUrl: 'https://soundcloud.com/kirikirikirigoe/memory',
			thumbUrl:
				'https://lydels.neocities.org/musicianswebring/imagenes/botones/midnight-channel.gif'
		});
	});

	it('reads a member whose row has no button, just a placeholder div, and no sample at all', () => {
		expect(candidates.find((c) => c.url === 'https://www.trollsbridge.net/')).toEqual({
			name: "Troll's Bridge",
			url: 'https://www.trollsbridge.net/',
			blurb:
				'I play drums in a midwest band from the northeast and have published a jazz album with an ensemble',
			sensitive: false
		});
	});

	it('never invents a thumbnail for a member whose row has only a placeholder div', () => {
		expect(candidates.find((c) => c.url === 'https://www.trollsbridge.net/')).not.toHaveProperty(
			'thumbUrl'
		);
	});

	it('reads a button image for most members', () => {
		const withThumb = candidates.filter((c) => c.thumbUrl !== undefined);
		expect(withThumb.length).toBeGreaterThan(50);
		expect(
			withThumb.every((c) => String(c.thumbUrl).startsWith('https://lydels.neocities.org/'))
		).toBe(true);
	});

	/**
	 * The page's own third column is "-" for a member with nothing to sample, or a link they gave
	 * the maintainer specifically to be heard: 54 rows across the whole page, 20 do not
	 * (54 + 20 = 74, the page's own count). 53, not 54, survive here: Bailey Lockheart has one too,
	 * but that whole row is already excluded for its plain-http main site, same as everywhere else.
	 */
	it('carries the member’s own sample link through, and only when the ring actually has one', () => {
		const withSample = candidates.filter((c) => c.previewUrl !== undefined);
		expect(withSample).toHaveLength(53);
		expect(withSample.every((c) => String(c.previewUrl).startsWith('https://'))).toBe(true);
	});

	it('flags the two members the page itself marks nsfw, and nobody else', () => {
		const flagged = candidates.filter((c) => c.sensitive === true).map((c) => c.name);
		expect(flagged).toEqual(["Liliana's Crypt", 'EliOffline']);
	});

	it('never mistakes the table header for a member', () => {
		expect(candidates.some((c) => c.name === 'website' || c.url === undefined)).toBe(false);
	});

	it('drops nothing to an unsafe or plain http address, and keeps going', () => {
		expect(
			candidates.every((c) => typeof c.url === 'string' && c.url!.startsWith('https://'))
		).toBe(true);
	});
});

describe('scrapeMusiciansWebring, edge cases', () => {
	it('returns nothing for a document that is not a string', () => {
		for (const document of [null, undefined, 42, {}, []]) {
			expect(scrapeMusiciansWebring(document)).toEqual([]);
		}
	});

	it('returns nothing for a page with no table rows at all', () => {
		expect(scrapeMusiciansWebring('<html><body>nothing here</body></html>')).toEqual([]);
	});

	it('handles a member with no href at all, and closes the last row with no trailing </tr>', () => {
		const html = `<table>
			<tr><td><a><div>no button</div>No Link</a></td><td>desc</td><td>-</td></tr>
			<tr><td><a href="https://last.example.com/"><div>no button</div>Last One</a></td><td>final row, unterminated</td><td>-`;
		const result = scrapeMusiciansWebring(html);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ name: 'Last One', url: 'https://last.example.com/' });
	});

	it('resolves a button image relative to the ring page, and ignores the img alt text', () => {
		const html = `<table><tr>
			<td><a href="https://example.com/"><img src="./imagenes/botones/x.gif" alt="button" />Someone</a></td>
			<td>desc</td><td>-</td>
		</tr></table>`;
		expect(scrapeMusiciansWebring(html)[0]?.thumbUrl).toBe(
			'https://lydels.neocities.org/musicianswebring/imagenes/botones/x.gif'
		);
	});

	it('never sets a thumbnail for a row whose only image is missing or unsafe', () => {
		const html = `<table><tr>
			<td><a href="https://example.com/"><img src="javascript:alert(1)" />Someone</a></td>
			<td>desc</td><td>-</td>
		</tr></table>`;
		expect('thumbUrl' in scrapeMusiciansWebring(html)[0]!).toBe(false);
	});

	it('only recognizes the literal word "nsfw" in a <b>, not any bold text after the link', () => {
		const html = `<table><tr>
			<td><a href="https://example.com/"><div>no button</div>Someone</a><br><b>new!</b></td>
			<td>desc</td><td>-</td>
		</tr></table>`;
		expect(scrapeMusiciansWebring(html)[0]?.sensitive).toBe(false);
	});

	it('reads the third column’s link as the sample, and leaves it off for a bare "-"', () => {
		const withLink = `<table><tr>
			<td><a href="https://example.com/"><div>no button</div>Someone</a></td>
			<td>desc</td><td><a href="https://soundcloud.com/someone/track">listen</a></td>
		</tr></table>`;
		expect(scrapeMusiciansWebring(withLink)[0]?.previewUrl).toBe(
			'https://soundcloud.com/someone/track'
		);

		const withoutLink = `<table><tr>
			<td><a href="https://example.com/"><div>no button</div>Someone</a></td>
			<td>desc</td><td>-</td>
		</tr></table>`;
		expect('previewUrl' in scrapeMusiciansWebring(withoutLink)[0]!).toBe(false);
	});

	it('never trusts a sample link that is not https', () => {
		const html = `<table><tr>
			<td><a href="https://example.com/"><div>no button</div>Someone</a></td>
			<td>desc</td><td><a href="http://insecure.example.com/track.mp3">listen</a></td>
		</tr></table>`;
		expect('previewUrl' in scrapeMusiciansWebring(html)[0]!).toBe(false);
	});
});
