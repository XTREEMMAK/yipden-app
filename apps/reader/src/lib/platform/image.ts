import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * A photo's bytes, readable by WebGL, on the platform that can get them.
 *
 * A canvas may only texture an image it is allowed to read, and almost no member's own site
 * sends the CORS headers that permit it, so in a browser most photos can be shown (as a CSS
 * background) but not drawn. Android's native HTTP client is not subject to CORS, the same
 * reason feeds work there, so the bytes come through it and are handed back as a `data:` URL,
 * which is same-origin by definition and so never blocks a canvas upload. In a browser this is
 * `undefined` and the caller uses a plain `Image`.
 */
export const loadDataUrlNative: ((url: string) => Promise<string>) | undefined =
	Capacitor.isNativePlatform()
		? async (url) => {
				const response = await CapacitorHttp.request({
					url,
					method: 'GET',
					responseType: 'blob',
					readTimeout: 20_000,
					connectTimeout: 20_000
				});
				if (response.status < 200 || response.status >= 300 || typeof response.data !== 'string') {
					throw new Error(`image request failed: ${response.status}`);
				}
				const type = response.headers?.['Content-Type'] ?? response.headers?.['content-type'];
				const mime = type?.split(';')[0]?.trim() || 'image/jpeg';
				return `data:${mime};base64,${response.data.replace(/\s/g, '')}`;
			}
		: undefined;
