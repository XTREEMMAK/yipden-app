import type { Plugin } from 'vite';
import type { ServerResponse } from 'node:http';
/*
 * Imported by relative path rather than as '@yipden/ring-client'.
 *
 * Vite loads this config in Node, and a bare workspace specifier would be left external, at
 * which point Node cannot resolve the package's TypeScript source. A relative import is
 * bundled with the config instead. The point of doing it this way rather than copying the
 * rules is that there is one list of forbidden addresses in this repository, not two.
 */
import { isPrivateHost, safeUrl } from '../../../packages/ring-client/src/url.js';

/**
 * A fetch proxy for development only.
 *
 * On Android, Capacitor's native HTTP client makes feed requests without CORS applying. In a
 * browser it does apply, and almost no feed sends the headers that would let a page read it.
 * That would make the browser useless for trying a real feed, which is where nearly all the
 * work on this app happens.
 *
 * So this exists, and three things are true about it on purpose:
 *
 * 1. `apply: 'serve'` means it is never part of a build. The shipped app has no server and
 *    cannot acquire one by accident.
 * 2. It applies the same address rules as the rest of the app, and applies them **again after
 *    every redirect**, because a redirect into a private range is the standard way past a check
 *    that only runs once. This runs on a developer's own machine, which is exactly the network
 *    position worth protecting.
 * 3. It caps size, time and redirect count, so a hostile or broken feed cannot hang the dev
 *    server.
 */

export const DEV_PROXY_PATH = '/__dev/fetch';

const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

function refuse(response: ServerResponse, status: number, reason: string) {
	response.statusCode = status;
	response.setHeader('content-type', 'text/plain; charset=utf-8');
	response.end(reason);
}

export function devFetchProxy(): Plugin {
	return {
		name: 'yipden-dev-fetch-proxy',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(DEV_PROXY_PATH, async (request, response) => {
				const target = new URL(request.url ?? '', 'http://localhost').searchParams.get('url');
				const first = safeUrl(target);
				if (!first) return refuse(response, 400, 'refusing to request that address');

				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

				try {
					let current = first;
					let upstream: Response | null = null;

					for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
						upstream = await fetch(current, {
							headers: {
								accept: request.headers.accept ?? '*/*',
								'user-agent': 'YipDen/0.0.1 (+https://yipden.com/about; development)',
								...(request.headers['if-none-match']
									? { 'if-none-match': String(request.headers['if-none-match']) }
									: {}),
								...(request.headers['if-modified-since']
									? { 'if-modified-since': String(request.headers['if-modified-since']) }
									: {})
							},
							redirect: 'manual',
							signal: controller.signal
						});

						if (upstream.status < 300 || upstream.status >= 400 || upstream.status === 304) break;

						const location = upstream.headers.get('location');
						const next = location ? safeUrl(new URL(location, current).toString()) : null;
						if (!next || isPrivateHost(next.hostname)) {
							return refuse(response, 502, 'refusing to follow that redirect');
						}
						current = next;
						if (hop === MAX_REDIRECTS) return refuse(response, 502, 'too many redirects');
					}

					if (!upstream) return refuse(response, 502, 'no response');

					const body = upstream.status === 304 ? '' : await upstream.text();
					if (body.length > MAX_BYTES) return refuse(response, 502, 'response too large');

					response.statusCode = upstream.status;
					// The address it actually resolved to: the client needs it to identify the feed.
					response.setHeader('x-yipden-final-url', current.toString());
					for (const header of ['content-type', 'etag', 'last-modified']) {
						const value = upstream.headers.get(header);
						if (value) response.setHeader(header, value);
					}
					// Expose them, because the browser is reading this cross origin from the app.
					response.setHeader(
						'access-control-expose-headers',
						'x-yipden-final-url, etag, last-modified'
					);
					response.end(body);
				} catch (cause) {
					refuse(response, 502, cause instanceof Error ? cause.message : 'request failed');
				} finally {
					clearTimeout(timer);
				}
			});
		}
	};
}
