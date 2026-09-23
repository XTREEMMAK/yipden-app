/**
 * The reader is a single page app that Capacitor loads from the device.
 *
 * `ssr = false` because there is no server and never will be one here: rendering on a server
 * would be rendering somewhere this app does not run. `prerender` still writes a static
 * document per route, which is what the WebView and the web build both load.
 */
export const ssr = false;
export const prerender = true;
export const trailingSlash = 'always';
