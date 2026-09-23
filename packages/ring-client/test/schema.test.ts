import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../schema/ring-document.schema.json' with { type: 'json' };
import live from './fixtures/ring-live.json' with { type: 'json' };
import extended from './fixtures/ring-extended.json' with { type: 'json' };
import { validate } from '../src/validate.js';

const ajv = addFormats(new Ajv2020({ allErrors: true, strict: false }));
const check = ajv.compile(schema);

describe('the published schema', () => {
	it('accepts the live ring exactly as the ring serves it', () => {
		expect(check(live), JSON.stringify(check.errors)).toBe(true);
	});

	it('accepts a ring carrying the additive fields the ring does not emit yet', () => {
		expect(check(extended), JSON.stringify(check.errors)).toBe(true);
	});

	it('accepts what the client hands back, so validation is a fixed point', () => {
		const result = validate(extended).document;
		expect(check(result), JSON.stringify(check.errors)).toBe(true);
	});

	it('refuses an entry with no source_url', () => {
		expect(check({ version: '1.0', entries: [{ id: 'a', creator: 'A', type: 'text' }] })).toBe(
			false
		);
	});

	it('refuses a plain http URL', () => {
		const document = {
			version: '1.0',
			entries: [{ id: 'a', creator: 'A', type: 'text', source_url: 'http://example.com/' }]
		};
		expect(check(document)).toBe(false);
	});
});
