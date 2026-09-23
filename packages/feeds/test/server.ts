import type { FetchLike, HttpResponse } from '../src/http.js';

export interface Route {
	status?: number;
	body?: string;
	headers?: Record<string, string>;
}

export interface FakeServer {
	fetch: FetchLike;
	/** Every URL requested, in order, so a test can assert on what was and was not fetched. */
	calls: string[];
	headersSeen: Record<string, string>[];
}

/**
 * A fake server for tests: a map of URL to response, and a record of what was asked for.
 *
 * Tests never touch the network. A test that depends on someone else's server is a test that
 * fails on a train.
 */
export function fakeServer(routes: Record<string, Route>): FakeServer {
	const calls: string[] = [];
	const headersSeen: Record<string, string>[] = [];

	const fetch: FetchLike = async (url, init) => {
		calls.push(url);
		headersSeen.push(init?.headers ?? {});

		const route = routes[url] ?? routes[url.replace(/\/$/, '')];
		if (!route) {
			return response(404, '', {});
		}
		return response(route.status ?? 200, route.body ?? '', route.headers ?? {}, url);
	};

	return { fetch, calls, headersSeen };
}

function response(
	status: number,
	body: string,
	headers: Record<string, string>,
	url?: string
): HttpResponse {
	const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	return {
		status,
		...(url ? { url } : {}),
		headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
		text: async () => body
	};
}

export const HTML = { 'content-type': 'text/html; charset=utf-8' };
export const XML = { 'content-type': 'application/rss+xml' };
export const ATOM = { 'content-type': 'application/atom+xml' };

export function page(body: string): Route {
	return { body: `<!doctype html><html><head>${body}</head><body></body></html>`, headers: HTML };
}

export const MINIMAL_RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>A Feed</title><link>https://example.com/</link><description>Posts.</description>
<item><title>One</title><link>https://example.com/1</link><pubDate>Mon, 15 Sep 2026 14:02:00 GMT</pubDate></item>
</channel></rss>`;
