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

function headersFrom(raw: unknown): HttpResponse['headers'] {
	const entries = Object.entries((raw ?? {}) as Record<string, string>);
	const lower = Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), value]));
	return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

const nativeFetch: FetchLike = async (url, init) => {
	const response = await CapacitorHttp.request({
		url,
		method: init?.method ?? 'GET',
		headers: init?.headers ?? {},
		// Redirects are followed by hand in packages/feeds so every hop is checked.
		disableRedirects: init?.redirect === 'manual',
		responseType: 'text',
		readTimeout: 20_000,
		connectTimeout: 20_000
	});

	return {
		status: response.status,
		url: response.url ?? url,
		headers: headersFrom(response.headers),
		text: async () =>
			typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
	};
};

const browserFetch: FetchLike = async (url, init) => {
	const response = await fetch(url, {
		method: init?.method ?? 'GET',
		headers: init?.headers ?? {},
		...(init?.signal ? { signal: init.signal } : {}),
		redirect: init?.redirect ?? 'follow'
	});
	return {
		status: response.status,
		url: response.url,
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
