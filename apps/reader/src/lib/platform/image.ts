import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * A photo's pixels, readable by WebGL, on the platform that can get them.
 *
 * A canvas may only texture an image it is allowed to read, and almost no member's own site
 * sends the CORS headers that permit it, so in a browser most photos can be shown (as a CSS
 * background) but not drawn. Android's native HTTP client is not subject to CORS, the same
 * reason feeds work there, so the bytes come through it and are decoded locally. In a browser
 * this is `undefined` and the caller uses a plain `Image`.
 */
export const loadBitmapNative: ((url: string) => Promise<ImageBitmap>) | undefined =
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
				const bytes = Uint8Array.from(atob(response.data), (c) => c.charCodeAt(0));
				const type = response.headers?.['Content-Type'] ?? response.headers?.['content-type'];
				return createImageBitmap(new Blob([bytes], type ? { type } : {}), {
					imageOrientation: 'flipY'
				});
			}
		: undefined;
