import { readFileSync } from 'node:fs';

export function readJson(path: string): unknown {
	return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

export const liveRing = () => readJson('../../ring-client/test/fixtures/ring-live.json');
export const sampleList = () => readJson('./fixtures/people.sample.json');
export const sampleOptOuts = () => readJson('./fixtures/optouts.sample.json');
export const testSeed = () => readJson('../../../directory/seed/people.test.json');
export const testSeedOptOuts = () => readJson('../../../directory/seed/optouts.test.json');

/** A fetch that serves fixed bodies by URL, and records the headers it was asked with. */
export function fakeFetch(
	routes: Record<string, { status?: number; body?: unknown; etag?: string }>
) {
	const calls: { url: string; headers: Record<string, string> }[] = [];
	const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
		calls.push({ url, headers: init?.headers ?? {} });
		const route = routes[url];
		if (!route) throw new Error('offline');
		return {
			status: route.status ?? 200,
			headers: {
				get: (name: string) => (name === 'etag' && route.etag ? route.etag : null)
			},
			text: async () => (typeof route.body === 'string' ? route.body : JSON.stringify(route.body))
		};
	};
	return { fetch, calls };
}
