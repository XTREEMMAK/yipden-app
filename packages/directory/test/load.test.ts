import { describe, expect, it } from 'vitest';
import { loadDocument, memoryDocumentCache, validateDirectory } from '../src/index.js';
import { fakeFetch, sampleList } from './helpers.js';

const URL_ = 'https://yipden.com/directory/people.json';
const parse = (json: unknown) => validateDirectory(json).document;

describe('loading a published document', () => {
	it('fetches it, keeps it, and asks next time whether it changed', async () => {
		const cache = memoryDocumentCache<ReturnType<typeof parse>>();
		const first = fakeFetch({ [URL_]: { body: sampleList(), etag: 'W/"1"' } });
		const loaded = await loadDocument({ url: URL_, fetch: first.fetch, parse, cache });
		expect(loaded.source).toBe('network');
		expect(loaded.document?.entries.length).toBe(6);

		const second = fakeFetch({ [URL_]: { status: 304 } });
		const again = await loadDocument({ url: URL_, fetch: second.fetch, parse, cache });
		expect(second.calls[0]?.headers['if-none-match']).toBe('W/"1"');
		expect(again.source).toBe('not-modified');
		expect(again.document?.entries.length).toBe(6);
	});

	it('falls back to the last good copy when offline, and says so', async () => {
		const cache = memoryDocumentCache({
			document: parse(sampleList()),
			fetchedAt: '2026-10-13T00:00:00.000Z'
		});
		const result = await loadDocument({ url: URL_, fetch: fakeFetch({}).fetch, parse, cache });
		expect(result.source).toBe('cache');
		expect(result.error?.message).toBe('offline');
		expect(result.document?.entries.length).toBe(6);
	});

	it('keeps a good copy over an empty one, and is empty with nothing at all', async () => {
		const cache = memoryDocumentCache({ document: parse(sampleList()), fetchedAt: 'then' });
		const empty = fakeFetch({ [URL_]: { body: { version: '1.0', entries: [] } } });
		const kept = await loadDocument({
			url: URL_,
			fetch: empty.fetch,
			parse,
			cache,
			isEmpty: (document) => document.entries.length === 0
		});
		expect(kept.source).toBe('cache');

		const none = await loadDocument({ url: URL_, fetch: fakeFetch({}).fetch, parse });
		expect(none).toMatchObject({ document: null, source: 'empty' });
	});

	it('refuses something that is not JSON, keeping what it had', async () => {
		const result = await loadDocument({
			url: URL_,
			fetch: fakeFetch({ [URL_]: { body: '<html>' } }).fetch,
			parse
		});
		expect(result.source).toBe('empty');
		expect(result.error?.message).toBe('response was not valid JSON');
	});
});
