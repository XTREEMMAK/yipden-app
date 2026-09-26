import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { FetchLike, HttpResponse } from '@yipden/feeds';

/**
 * The fetch every network call in the app goes through.
 *
 * On Android this is Capacitor's native HTTP client, which is what makes the product possible:
 * a native request is not subject to CORS, so the app can read a feed from a site that never
 * thought about a reader. In a browser it is the ordinary `fetch`, which means development
 * against live feeds needs the dev only proxy, and tests use fixtures instead.
 *
 * The safety checks in packages/feeds matter more here than they would in a browser, because
 * the browser's own protections are exactly what is being stepped around.
 */

function abortError(): DOMException {
	return new DOMException('The operation was aborted.', 'AbortError');
}

/** Make Capacitor's non-cancellable promise obey the FetchLike AbortSignal contract. */
export function abortable<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
	if (signal?.aborted) return Promise.reject(abortError());

	const promise = work();
	if (!signal) return promise;

	return new Promise<T>((resolve, reject) => {
		const cleanup = () => signal.removeEventListener('abort', onAbort);
		const onAbort = () => {
			cleanup();
			reject(abortError());
		};
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(cause) => {
				cleanup();
				reject(cause);
			}
		);
	});
}
function headersFrom(raw: unknown): HttpResponse['headers'] {
	const entries = Object.entries((raw ?? {}) as Record<string, string>);
	const lower = Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), value]));
	return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

const nativeFetch: FetchLike = async (url, init) => {
	const response = await abortable(
		() =>
			CapacitorHttp.request({
				url,
				method: init?.method ?? 'GET',
				headers: init?.headers ?? {},
				// Redirects are followed by hand in packages/feeds so every hop is checked.
				disableRedirects: init?.redirect === 'manual',
				responseType: 'text',
				readTimeout: 20_000,
				connectTimeout: 20_000
			}),
		init?.signal
	);

	return {
		status: response.status,
		url: response.url ?? url,
		headers: headersFrom(response.headers),
		text: async () =>
			typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
	};
};

/**
 * In a browser, almost no feed sends the CORS headers that would let a page read it. In
 * development the request goes through a Vite middleware that is never part of a build; in a
 * built web page it goes direct and will usually be refused, which is correct: the web build
 * exists for development and testing, not as a second product.
 */
const browserFetch: FetchLike = async (url, init) => {
	const direct = !import.meta.env.DEV;
	const target = direct ? url : `/__dev/fetch?url=${encodeURIComponent(url)}`;

	const response = await fetch(target, {
		method: init?.method ?? 'GET',
		headers: init?.headers ?? {},
		...(init?.signal ? { signal: init.signal } : {}),
		// The proxy resolves redirects itself, checking every hop.
		redirect: direct ? (init?.redirect ?? 'follow') : 'follow'
	});

	return {
		status: response.status,
		url: response.headers.get('x-yipden-final-url') ?? response.url,
		headers: { get: (name: string) => response.headers.get(name) },
		text: () => response.text()
	};
};

/** True on a real device, where native HTTP is available. */
export function isNative(): boolean {
	return Capacitor.isNativePlatform();
}

export const httpFetch: FetchLike = (url, init) =>
	isNative() ? nativeFetch(url, init) : browserFetch(url, init);
