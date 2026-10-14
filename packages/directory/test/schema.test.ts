import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readJson } from './helpers.js';

/**
 * The published schemas agree with what the client accepts, so someone publishing their own
 * creator list in YipDen's format can check it against the schema and know the app will read it.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const people = ajv.compile(readJson('../../../directory/schema/people.schema.json') as object);
const optOuts = ajv.compile(readJson('../../../directory/schema/optouts.schema.json') as object);

describe('the published schemas', () => {
	it('accept the published files and the test seed', () => {
		expect(people(readJson('../../../directory/people.json'))).toBe(true);
		expect(people(readJson('../../../directory/seed/people.test.json'))).toBe(true);
		expect(optOuts(readJson('../../../directory/optouts.json'))).toBe(true);
		expect(optOuts(readJson('../../../directory/seed/optouts.test.json'))).toBe(true);
	});

	it('refuse an entry the client would drop', () => {
		const entry = { id: 'Bad Id', name: 'x', site_url: 'https://example.com/' };
		expect(people({ version: '1.0', entries: [entry] })).toBe(false);
		expect(people({ version: '1.0', entries: [{ id: 'no-address', name: 'x' }] })).toBe(false);
		expect(
			people({
				version: '1.0',
				entries: [{ id: 'http', name: 'x', site_url: 'http://a.example/' }]
			})
		).toBe(false);
		expect(optOuts({ version: '1.0', hashes: ['nope'] })).toBe(false);
	});
});
