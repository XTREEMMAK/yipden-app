import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, sanitizeHtml, summarize } from '../src/sanitize.js';

describe('sanitizeHtml refuses script execution', () => {
	it.each([
		['a script element', '<script>alert(1)</script>'],
		['a script with an attribute', '<script src="https://evil.test/x.js"></script>'],
		['an uppercase script', '<SCRIPT>alert(1)</SCRIPT>'],
		['a nested script', '<div><p>ok</p><script>alert(1)</script></div>'],
		['an iframe', '<iframe src="https://evil.test/"></iframe>'],
		['an object', '<object data="https://evil.test/x.swf"></object>'],
		['an embed', '<embed src="https://evil.test/x">'],
		['a form', '<form action="https://evil.test/"><input name="a"></form>'],
		['an svg payload', '<svg><script>alert(1)</script></svg>'],
		['a math payload', '<math><mtext><script>alert(1)</script></mtext></math>'],
		['a template', '<template><script>alert(1)</script></template>'],
		['a noscript wrapper', '<noscript><p>hidden</p></noscript>'],
		['a base tag', '<base href="https://evil.test/">'],
		['a style block', '<style>body{background:url(https://evil.test/x)}</style>']
	])('drops %s', (_label, input) => {
		const output = sanitizeHtml(input);
		expect(output.toLowerCase()).not.toContain('<script');
		expect(output.toLowerCase()).not.toContain('<iframe');
		expect(output.toLowerCase()).not.toContain('evil.test');
		expect(output.toLowerCase()).not.toContain('alert(1)');
	});

	it.each([
		['an inline handler', '<p onclick="alert(1)">text</p>'],
		['an image error handler', '<img src="https://example.com/a.png" onerror="alert(1)">'],
		['an uppercase handler', '<P ONCLICK="alert(1)">text</P>'],
		['a handler with odd spacing', '<p on click = "alert(1)">text</p>'],
		['an inline style', '<p style="background:url(https://evil.test/x)">text</p>'],
		['a class and id', '<p class="x" id="y">text</p>']
	])('drops %s', (_label, input) => {
		const output = sanitizeHtml(input).toLowerCase();
		expect(output).not.toContain('onclick');
		expect(output).not.toContain('onerror');
		expect(output).not.toContain('style=');
		expect(output).not.toContain('class=');
		expect(output).not.toContain(' id=');
	});

	it.each([
		['a javascript href', '<a href="javascript:alert(1)">click</a>'],
		['a javascript href with spacing', '<a href=" javascript:alert(1)">click</a>'],
		['a data URL href', '<a href="data:text/html,<script>alert(1)</script>">click</a>'],
		['a vbscript href', '<a href="vbscript:msgbox(1)">click</a>'],
		['a plain http href', '<a href="http://example.com/">click</a>'],
		['a local network href', '<a href="https://192.168.1.1/">click</a>'],
		['a javascript image source', '<img src="javascript:alert(1)">'],
		['a data URL image', '<img src="data:image/svg+xml,<svg onload=alert(1)>">']
	])('drops %s but keeps the text', (_label, input) => {
		const output = sanitizeHtml(input);
		expect(output).not.toContain('javascript:');
		expect(output).not.toContain('vbscript:');
		expect(output).not.toContain('data:');
		expect(output).not.toContain('href=');
		expect(output).not.toContain('src=');
	});

	it('does not let an encoded tag out of the text it arrived in', () => {
		expect(sanitizeHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(
			'&lt;script&gt;alert(1)&lt;/script&gt;'
		);
	});

	it('does not reassemble a tag split across a comment', () => {
		const output = sanitizeHtml('<scr<!-- -->ipt>alert(1)</script>');
		expect(output.toLowerCase()).not.toContain('<script');
	});

	it('escapes a stray angle bracket rather than treating it as markup', () => {
		expect(sanitizeHtml('5 < 6 and 7 > 6')).toBe('5 &lt; 6 and 7 &gt; 6');
	});

	it('drops a malformed tag rather than guessing at it', () => {
		expect(
			sanitizeHtml('<p foo="bar<script>alert(1)</script>">text</p>').toLowerCase()
		).not.toContain('alert(1)');
	});
});

describe('sanitizeHtml keeps what a reader needs', () => {
	it('keeps allowed structure', () => {
		const input = '<p>Hello <strong>there</strong>, <em>friend</em>.</p><ul><li>one</li></ul>';
		expect(sanitizeHtml(input)).toBe(input);
	});

	it('keeps an https link and hardens it', () => {
		expect(sanitizeHtml('<a href="https://example.com/post">read</a>')).toBe(
			'<a href="https://example.com/post" rel="noopener noreferrer">read</a>'
		);
	});

	it('keeps an image with its alt text', () => {
		expect(sanitizeHtml('<img src="https://example.com/a.png" alt="A cat">')).toBe(
			'<img src="https://example.com/a.png" alt="A cat">'
		);
	});

	it('resolves a relative URL against the feed it came from', () => {
		expect(
			sanitizeHtml('<a href="/post/1">read</a>', { baseUrl: 'https://example.com/blog/' })
		).toContain('href="https://example.com/post/1"');
	});

	it('unwraps an element it does not know, keeping the text inside', () => {
		expect(sanitizeHtml('<marquee>still readable</marquee>')).toBe('still readable');
		expect(sanitizeHtml('<div><p>kept</p></div>')).toBe('<p>kept</p>');
	});

	it('closes what the feed left open', () => {
		expect(sanitizeHtml('<p>one<p>two')).toBe('<p>one<p>two</p></p>');
	});

	it('ignores a closing tag with nothing open', () => {
		expect(sanitizeHtml('text</p></div>')).toBe('text');
	});

	it('refuses a numeric attribute that is not a number', () => {
		expect(sanitizeHtml('<img src="https://example.com/a.png" width="100px">')).not.toContain(
			'width'
		);
	});

	it('caps its own output', () => {
		const long = `<p>${'a'.repeat(5000)}</p>`;
		expect(sanitizeHtml(long, { maxLength: 100 }).length).toBeLessThanOrEqual(100);
	});
});

describe('decodeEntities', () => {
	it('decodes the named entities feeds actually use', () => {
		expect(decodeEntities('Tom &amp; Jerry &mdash; a &quot;classic&quot;')).toBe(
			'Tom & Jerry \u2014 a "classic"'
		);
	});

	it('decodes numeric and hex references', () => {
		expect(decodeEntities('&#72;&#101;&#x6c;&#x6C;&#111;')).toBe('Hello');
	});

	it('leaves an unknown reference alone rather than guessing', () => {
		expect(decodeEntities('&bogus; &notreal;')).toBe('&bogus; &notreal;');
	});

	it('refuses a codepoint that is not text', () => {
		expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
		expect(decodeEntities('&#0;')).toBe('&#0;');
	});
});

describe('htmlToText', () => {
	it('flattens markup to readable text', () => {
		expect(htmlToText('<p>One.</p><p>Two.</p>')).toBe('One.\n\nTwo.');
	});

	it('drops script contents rather than reading them out', () => {
		expect(htmlToText('<p>Hi</p><script>alert(1)</script>')).toBe('Hi');
	});

	it('decodes entities', () => {
		expect(htmlToText('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
	});

	it('collapses runs of whitespace', () => {
		expect(htmlToText('<p>one   two\n\n\nthree</p>')).toBe('one two three');
	});
});

describe('summarize', () => {
	it('leaves a short summary alone', () => {
		expect(summarize('<p>Short enough.</p>')).toBe('Short enough.');
	});

	it('cuts at a word boundary and marks the cut', () => {
		const summary = summarize(`<p>${'word '.repeat(100)}</p>`, 40);
		expect(summary.length).toBeLessThanOrEqual(41);
		expect(summary.endsWith('\u2026')).toBe(true);
		expect(summary).not.toContain('  ');
	});

	it('has no line breaks left in it', () => {
		expect(summarize('<p>One.</p><p>Two.</p>')).toBe('One. Two.');
	});
});
