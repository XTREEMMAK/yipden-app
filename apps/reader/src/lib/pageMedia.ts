import { previewKindOf, safeUrl, type PreviewKind } from '@yipden/ring-client';

/**
 * Finding audio on a creator's own page, while the reader browses it in the app.
 *
 * `SCAN_SCRIPT` runs inside the page and reports what it can see: what is playing, audio and
 * video elements, links to audio files, files the page already loaded, and players embedded from
 * a platform. It only reads; it changes nothing on the page and fetches nothing.
 *
 * Everything it sends back is untrusted. The page's own code can read and fake the same message,
 * so `readFoundMedia` keeps only public https addresses and plain bounded text, and nothing found
 * here is added anywhere until the reader picks it in the app's own screen.
 */

export type FoundHow = 'playing' | 'element' | 'link' | 'loaded' | 'embed';

export interface FoundMedia {
	url: string;
	title: string;
	how: FoundHow;
	kind: PreviewKind;
}

export const MESSAGE_TYPE = 'yipden-media';
const MAX_ITEMS = 50;
const MAX_URL = 2_048;
const MAX_TITLE = 200;
const HOWS: FoundHow[] = ['playing', 'element', 'link', 'loaded', 'embed'];
/** Shown first: what the reader just heard is most likely what they want. */
const ORDER: Record<FoundHow, number> = { playing: 0, element: 1, link: 2, embed: 3, loaded: 4 };

/** Plain, short, single-line text: no control characters, no markup meaning anything. */
function cleanTitle(value: unknown): string {
	if (typeof value !== 'string') return '';
	return (
		value
			// Control and direction-override characters: a title must not reorder or hide text.
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, MAX_TITLE)
	);
}

/**
 * The message a scan posted, checked. Anything malformed is dropped item by item; a message that
 * is not a scan at all gives nothing.
 */
export function readFoundMedia(detail: unknown): FoundMedia[] {
	if (!detail || typeof detail !== 'object') return [];
	const message = detail as { type?: unknown; items?: unknown };
	if (message.type !== MESSAGE_TYPE || !Array.isArray(message.items)) return [];

	const found = new Map<string, FoundMedia>();
	for (const raw of message.items.slice(0, MAX_ITEMS * 4)) {
		if (!raw || typeof raw !== 'object') continue;
		const item = raw as { url?: unknown; title?: unknown; how?: unknown };
		if (typeof item.url !== 'string' || item.url.length > MAX_URL) continue;
		const how = HOWS.find((candidate) => candidate === item.how);
		if (!how) continue;
		const safe = safeUrl(item.url);
		if (!safe) continue;
		const url = safe.toString();
		const kind = previewKindOf(url);
		// A loaded file only counts when it is audio; a page loads plenty of other things.
		if (how === 'loaded' && kind !== 'file') continue;
		// An embed is only worth offering when it is a platform player we can name.
		if (how === 'embed' && (kind === 'external' || kind === 'file')) continue;
		const existing = found.get(url);
		if (existing && ORDER[existing.how] <= ORDER[how]) continue;
		found.set(url, { url, title: cleanTitle(item.title) || existing?.title || '', how, kind });
	}
	return [...found.values()]
		.sort((left, right) => ORDER[left.how] - ORDER[right.how])
		.slice(0, MAX_ITEMS);
}

/**
 * Runs in the creator's page. Installed once per page; running it again rescans. Reports through
 * the in-app browser's own bridge, the only way a page there can reach the app.
 */
export const SCAN_SCRIPT = `(() => {
	try {
		const AUDIO = /\\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)(\\?|#|$)/i;
		const EMBED = /(bandcamp\\.com\\/EmbeddedPlayer|w\\.soundcloud\\.com\\/player|youtube(-nocookie)?\\.com\\/embed|open\\.spotify\\.com\\/embed|embed\\.music\\.apple\\.com)/i;
		const usable = (u) => typeof u === 'string' && u.startsWith('https://');
		const absolute = (u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } };
		const text = (el) => (el && (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent) || '').trim().slice(0, 200);
		const scan = (playing) => {
			const items = [];
			const add = (url, title, how) => { url = absolute(url); if (usable(url)) items.push({ url, title, how }); };
			if (playing) add(playing.currentSrc || playing.src, text(playing), 'playing');
			document.querySelectorAll('audio, video').forEach((el) => {
				add(el.currentSrc || el.src, text(el), el.paused ? 'element' : 'playing');
				el.querySelectorAll('source[src]').forEach((s) => add(s.getAttribute('src'), text(el), 'element'));
			});
			document.querySelectorAll('a[href]').forEach((a) => {
				const href = a.getAttribute('href') || '';
				if (AUDIO.test(href)) add(href, text(a), 'link');
			});
			(performance.getEntriesByType('resource') || []).forEach((e) => {
				if (AUDIO.test(e.name)) add(e.name, '', 'loaded');
			});
			document.querySelectorAll('iframe[src]').forEach((f) => {
				const src = f.getAttribute('src') || '';
				if (EMBED.test(src)) add(src, text(f), 'embed');
			});
			const bridge = window.mobileApp;
			if (bridge && bridge.postMessage) {
				bridge.postMessage({ detail: { type: '${MESSAGE_TYPE}', page: location.href, items: items.slice(0, 200) } });
			}
		};
		if (!window.__yipdenScan) {
			window.__yipdenScan = scan;
			document.addEventListener('play', (event) => scan(event.target), true);
		}
		window.__yipdenScan(null);
	} catch (e) {}
})();`;
