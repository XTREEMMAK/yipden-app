import { previewKindOf, safeUrl, type PreviewKind } from '@yipden/ring-client';

/**
 * Finding what a reader might keep on a creator's own page, while they browse it in the app.
 *
 * `SCAN_SCRIPT` runs inside the page and reports what it can see: what is playing, audio and
 * video elements, links to audio files, files the page already loaded, and players embedded from
 * a platform. It also notes the last picture the reader long-pressed and the last passage they
 * selected, each with the page it was on. It reads, stops none of the page's own handling, and
 * fetches nothing. Its one touch on the page is a pass-through wrapper on media `play()`, so a
 * player built in script (`new Audio(url)`, never in the document) is seen when it plays; the
 * call itself goes through unchanged. `PAUSE_SCRIPT` pauses the page's media when the reader
 * previews something in the app, and only then.
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

/** A picture the reader long-pressed. */
export interface FoundImage {
	url: string;
	alt: string;
	/** The page it was on. */
	page: string;
}

/** Text the reader selected, as a W3C TextQuoteSelector with the page it was on. */
export interface FoundPassage {
	exact: string;
	prefix?: string;
	suffix?: string;
	page: string;
}

/** What one scan message carried, checked. */
export interface FoundOnPage {
	media: FoundMedia[];
	image: FoundImage | null;
	passage: FoundPassage | null;
	/** The reader selected more than a passage's worth; nothing is offered, and the sheet says so. */
	passageTooLong: boolean;
}

export const MESSAGE_TYPE = 'yipden-media';
/** The longest selection offered as a passage. Matches `MAX_SNIP` (references/types.ts). */
export const MAX_PASSAGE = 500;
const MAX_CONTEXT = 64;
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
 * Selected text, kept as written but made safe to show: no control or direction characters,
 * whitespace collapsed (a Text Fragment and `textOnPage` both match across whitespace anyway).
 */
function cleanPassage(value: unknown, max: number): string {
	if (typeof value !== 'string') return '';
	return (
		value
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, max)
	);
}

function readImage(raw: unknown): FoundImage | null {
	if (!raw || typeof raw !== 'object') return null;
	const image = raw as { url?: unknown; alt?: unknown; page?: unknown };
	if (typeof image.url !== 'string' || image.url.length > MAX_URL) return null;
	if (typeof image.page !== 'string' || image.page.length > MAX_URL) return null;
	const url = safeUrl(image.url);
	const page = safeUrl(image.page);
	if (!url || !page) return null;
	return { url: url.toString(), alt: cleanTitle(image.alt), page: page.toString() };
}

function readPassage(raw: unknown): { passage: FoundPassage | null; tooLong: boolean } {
	if (!raw || typeof raw !== 'object') return { passage: null, tooLong: false };
	const passage = raw as { exact?: unknown; prefix?: unknown; suffix?: unknown; page?: unknown };
	if (typeof passage.page !== 'string' || passage.page.length > MAX_URL) {
		return { passage: null, tooLong: false };
	}
	const page = safeUrl(passage.page);
	if (!page || typeof passage.exact !== 'string') return { passage: null, tooLong: false };
	// Measured before cleaning cuts it down, so an over-long selection is never quietly shortened.
	if (cleanPassage(passage.exact, MAX_PASSAGE * 4).length > MAX_PASSAGE) {
		return { passage: null, tooLong: true };
	}
	const exact = cleanPassage(passage.exact, MAX_PASSAGE);
	if (!exact) return { passage: null, tooLong: false };
	const prefix = cleanPassage(passage.prefix, MAX_CONTEXT);
	const suffix = cleanPassage(passage.suffix, MAX_CONTEXT);
	return {
		passage: {
			exact,
			...(prefix ? { prefix } : {}),
			...(suffix ? { suffix } : {}),
			page: page.toString()
		},
		tooLong: false
	};
}

/**
 * The message a scan posted, checked. Anything malformed is dropped item by item; a message that
 * is not a scan at all gives nothing.
 */
export function readFound(detail: unknown): FoundOnPage {
	const nothing: FoundOnPage = { media: [], image: null, passage: null, passageTooLong: false };
	if (!detail || typeof detail !== 'object') return nothing;
	const message = detail as { type?: unknown; image?: unknown; passage?: unknown };
	if (message.type !== MESSAGE_TYPE) return nothing;
	const { passage, tooLong } = readPassage(message.passage);
	return {
		media: readFoundMedia(detail),
		image: readImage(message.image),
		passage,
		passageTooLong: tooLong
	};
}

/** The audio a scan found, checked. See `readFound` for the rest of a message. */
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
 * Runs in the creator's page: pause whatever it is playing, so a preview in the app can be heard.
 * Media in the document, in same-origin frames, and anything the play hook saw. Nothing resumes
 * by itself afterwards; the reader presses play on the page again if they want it.
 */
export const PAUSE_SCRIPT = `(() => {
	try {
		const pause = (el) => { try { if (!el.paused) el.pause(); } catch (e) {} };
		document.querySelectorAll('audio, video').forEach(pause);
		document.querySelectorAll('iframe').forEach((frame) => {
			try { frame.contentDocument && frame.contentDocument.querySelectorAll('audio, video').forEach(pause); } catch (e) {}
		});
		(window.__yipdenMedia || []).forEach(pause);
	} catch (e) {}
})();`;

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
			// Media the page made in script and never put in the document: seen by the play hook.
			(window.__yipdenMedia || []).forEach((el) => {
				add(el.currentSrc || el.src, text(el), el.paused ? 'element' : 'playing');
			});
			const documents = [document];
			// A same-origin frame's player too (a cross-origin one cannot be read, by design).
			document.querySelectorAll('iframe').forEach((frame) => {
				try { if (frame.contentDocument) documents.push(frame.contentDocument); } catch (e) {}
			});
			documents.forEach((doc) => doc.querySelectorAll('audio, video').forEach((el) => {
				add(el.currentSrc || el.src, text(el), el.paused ? 'element' : 'playing');
				el.querySelectorAll('source[src]').forEach((s) => add(s.getAttribute('src'), text(el), 'element'));
			}));
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
			// A platform's own page names its player in og:video (Bandcamp, YouTube): the address
			// of what it plays that lasts, unlike the stream it is playing.
			document.querySelectorAll('meta[property="og:video"], meta[property="og:video:secure_url"]').forEach((m) => {
				const src = m.getAttribute('content') || '';
				const og = document.querySelector('meta[property="og:title"]');
				if (EMBED.test(src)) add(src, (og && og.getAttribute('content')) || document.title || '', 'embed');
			});
			const bridge = window.mobileApp;
			const pick = window.__yipdenPick || {};
			if (bridge && bridge.postMessage) {
				bridge.postMessage({ detail: { type: '${MESSAGE_TYPE}', page: location.href, items: items.slice(0, 200), image: pick.image || null, passage: pick.passage || null } });
			}
		};
		if (!window.__yipdenScan) {
			window.__yipdenScan = scan;
			window.__yipdenPick = {};
			window.__yipdenMedia = new Set();
			document.addEventListener('play', (event) => scan(event.target), true);
			// A player built with \`new Audio(url)\` never joins the document, so its play event never
			// reaches the listener above. Noticing it at play() is the only way to see it. The call
			// goes through untouched: this records the element and the page plays as it would have.
			const play = HTMLMediaElement.prototype.play;
			HTMLMediaElement.prototype.play = function () {
				try { window.__yipdenMedia.add(this); setTimeout(() => scan(this), 0); } catch (e) {}
				return play.apply(this, arguments);
			};
			// A long press on a picture. The page's own handling is left alone: nothing here
			// prevents a default or stops an event. Chrome on Android fires contextmenu for a long
			// press; the timer covers a page or WebView that does not.
			// Say on the page that something was picked, so a long press is not a silent guess: a
			// short line at the bottom, text only, that never takes a tap from the page under it.
			let noticeTimer = null;
			const notice = (message) => {
				try {
					let el = document.getElementById('__yipden-notice');
					if (!el) {
						el = document.createElement('div');
						el.id = '__yipden-notice';
						el.setAttribute('role', 'status');
						el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:86vw;padding:10px 16px;border-radius:999px;background:#2a1d17;color:#fff;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);pointer-events:none;transition:opacity .25s;opacity:0';
						document.documentElement.appendChild(el);
					}
					el.textContent = message;
					el.style.opacity = '1';
					clearTimeout(noticeTimer);
					noticeTimer = setTimeout(() => { el.style.opacity = '0'; }, 2600);
					if (navigator.vibrate) navigator.vibrate(15);
				} catch (e) {}
			};
			const pickImage = (target) => {
				const img = target && target.closest ? target.closest('img') : null;
				if (!img) return;
				const url = absolute(img.currentSrc || img.src);
				if (!usable(url)) return;
				const again = window.__yipdenPick.image && window.__yipdenPick.image.url === url;
				window.__yipdenPick.image = { url, alt: (img.getAttribute('alt') || '').trim().slice(0, 200), page: location.href };
				scan(null);
				if (again) return;
				notice('Picture picked. Tap the YipDen button to keep it.');
				const outline = img.style.outline;
				img.style.outline = '3px solid #e8711c';
				setTimeout(() => { img.style.outline = outline; }, 1200);
			};
			document.addEventListener('contextmenu', (event) => pickImage(event.target), true);
			let press = null;
			const cancel = () => { if (press) { clearTimeout(press.timer); press = null; } };
			document.addEventListener('pointerdown', (event) => {
				cancel();
				const target = event.target;
				press = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { press = null; pickImage(target); }, 550) };
			}, true);
			document.addEventListener('pointermove', (event) => {
				if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancel();
			}, true);
			document.addEventListener('pointerup', cancel, true);
			document.addEventListener('pointercancel', cancel, true);
			// The last passage selected, with a little text either side so it can be found again.
			let settle = null;
			document.addEventListener('selectionchange', () => {
				clearTimeout(settle);
				settle = setTimeout(() => {
					const selection = document.getSelection();
					const exact = selection ? String(selection).trim() : '';
					if (!exact || !selection.rangeCount) return;
					const range = selection.getRangeAt(0);
					const before = range.startContainer.nodeType === 3 ? range.startContainer.textContent.slice(0, range.startOffset) : '';
					const after = range.endContainer.nodeType === 3 ? range.endContainer.textContent.slice(range.endOffset) : '';
					const previous = window.__yipdenPick.passage;
					window.__yipdenPick.passage = { exact: exact.slice(0, 2400), prefix: before.slice(-64), suffix: after.slice(0, 64), page: location.href };
					if (!previous || previous.exact !== exact) notice('Passage picked. Tap the YipDen button to keep it.');
				}, 300);
			});
		}
		window.__yipdenScan(null);
	} catch (e) {}
})();`;
