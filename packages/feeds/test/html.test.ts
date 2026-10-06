import { describe, expect, it } from 'vitest';
import { scanPage } from '../src/html.js';

const BASE = 'https://lena.example/';

describe('scanPage: who a page says they are', () => {
	it("reads an h-card's note as their bio, as plain text, and its photo", () => {
		const page = scanPage(
			`<div class="h-card">
				<img class="u-photo" src="/me.jpg" alt="">
				<span class="p-name">Lena Ofori</span>
				<div class="p-note"><p>I make <b>ambient</b> music &amp; zines.</p><p>Toronto.</p></div>
			</div>
			<meta name="description" content="Lena's site">`,
			BASE
		);
		expect(page.cardName).toBe('Lena Ofori');
		expect(page.cardNote).toBe('I make ambient music & zines. Toronto.');
		expect(page.photoUrl).toBe('https://lena.example/me.jpg');
		expect(page.description).toBe("Lena's site");
	});

	it('falls back to og:description and og:image, and has none when the page says nothing', () => {
		const page = scanPage(
			`<meta property="og:description" content="Comics, weekly">
			 <meta property="og:image" content="https://lena.example/card.png">`,
			BASE
		);
		expect(page.description).toBe('Comics, weekly');
		expect(page.photoUrl).toBe('https://lena.example/card.png');
		expect(page.cardNote).toBeNull();
		expect(scanPage('<title>Bare</title>', BASE).description).toBeNull();
	});

	it('cuts a very long bio at a word', () => {
		const long = 'word '.repeat(400);
		const page = scanPage(`<meta name="description" content="${long}">`, BASE);
		expect(page.description!.length).toBeLessThanOrEqual(601);
		expect(page.description!.endsWith('word…')).toBe(true);
	});
});
