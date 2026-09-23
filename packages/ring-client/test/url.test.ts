import { describe, expect, it } from 'vitest';
import { displayHost, isPrivateHost, normalizeUrl, safeUrl } from '../src/url.js';

describe('safeUrl', () => {
	it('accepts a public https URL', () => {
		expect(safeUrl('https://example.com/feed.xml')?.href).toBe('https://example.com/feed.xml');
	});

	it.each([
		['plain http', 'http://example.com/'],
		['javascript', 'javascript:alert(1)'],
		['data', 'data:text/html,<script>alert(1)</script>'],
		['file', 'file:///etc/passwd'],
		['embedded credentials', 'https://user:pass@example.com/'],
		['not a URL', 'example.com'],
		['empty', '   ']
	])('refuses %s', (_label, value) => {
		expect(safeUrl(value)).toBeNull();
	});

	it.each([
		'https://localhost/ring.json',
		'https://127.0.0.1/ring.json',
		'https://10.0.0.5/ring.json',
		'https://172.16.4.4/ring.json',
		'https://192.168.1.1/ring.json',
		'https://169.254.169.254/latest/meta-data/',
		'https://100.64.0.1/',
		'https://[::1]/',
		'https://[fd00::1]/',
		'https://[::ffff:127.0.0.1]/',
		'https://printer.local/',
		'https://api.internal/'
	])('refuses the private address %s', (value) => {
		expect(safeUrl(value)).toBeNull();
	});

	it('refuses a URL past the length cap', () => {
		expect(safeUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeNull();
	});

	it('refuses a non-string', () => {
		expect(safeUrl(42)).toBeNull();
		expect(safeUrl(null)).toBeNull();
	});
});

describe('isPrivateHost', () => {
	it('allows public addresses that merely look close to private ranges', () => {
		expect(isPrivateHost('172.32.0.1')).toBe(false);
		expect(isPrivateHost('192.169.1.1')).toBe(false);
		expect(isPrivateHost('example.com')).toBe(false);
	});
});

describe('normalizeUrl', () => {
	it('gives a bare origin its root slash', () => {
		expect(normalizeUrl('https://keyjay.neocities.org')).toBe('https://keyjay.neocities.org/');
	});

	it('leaves a deeper path spelled as the creator published it', () => {
		expect(normalizeUrl('https://example.com/blog')).toBe('https://example.com/blog');
		expect(normalizeUrl('https://example.com/blog/')).toBe('https://example.com/blog/');
	});

	it('drops the fragment and keeps the query', () => {
		expect(normalizeUrl('https://youtube.com/feeds/videos.xml?channel_id=UC1#top')).toBe(
			'https://youtube.com/feeds/videos.xml?channel_id=UC1'
		);
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeUrl('  https://example.com/  ')).toBe('https://example.com/');
	});
});

describe('displayHost', () => {
	it('drops the www prefix', () => {
		expect(displayHost('https://www.example.com/page')).toBe('example.com');
	});

	it('returns null for an unusable URL', () => {
		expect(displayHost('javascript:alert(1)')).toBeNull();
	});
});
