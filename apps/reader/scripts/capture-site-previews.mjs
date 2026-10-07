/**
 * Posters and scroll clips for the bundled sites seed (`src/lib/sites/seed.json`).
 *
 * **Not part of the app or its build.** A developer runs it by hand, rarely, so that phones never
 * do: one capture per site here instead of every reader's phone rendering every site. The real
 * index will get these from its own pipeline (PR submission, an Action, Playwright) and host them;
 * this only stands in for that pipeline while the sites experiment is judged.
 *
 * For every entry with a `poster_url` under `/sites/`, it opens the site at the phone viewport
 * every screen is designed for (390x844), lets it settle, and saves the first screen as a JPEG.
 * For an entry with a `preview_url` too, it records a slow scroll down the page and keeps a WebM
 * (VP8): what Playwright records, and what Android's WebView plays. The real feed should be MP4
 * for iOS; that needs a full ffmpeg, which this machine does not have.
 *
 * Polite: robots.txt is read first and a disallowed site is skipped, one site at a time, with an
 * honest user agent.
 *
 *   node scripts/capture-site-previews.mjs [--only id,id] [--posters-only]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'static', 'sites');
const work = join(root, 'tmp-capture');
const seed = JSON.parse(readFileSync(join(root, 'src/lib/sites/seed.json'), 'utf8'));

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const postersOnly = args.includes('--posters-only');

const VIEWPORT = { width: 390, height: 844 };
const USER_AGENT = `${devices['Pixel 7'].userAgent} YipDen-capture/0.1 (+https://yipden.com/about)`;
/** How long the clip holds the top before scrolling, and how long the scroll takes. */
const HOLD_MS = 800;
const SCROLL_MS = 6000;
/** The furthest a clip scrolls: a taste of the page, not a tour of it. */
const MAX_SCROLL = 2400;

function ffmpeg() {
	const base = join(homedir(), '.cache', 'ms-playwright');
	const dir = readdirSync(base).find((name) => name.startsWith('ffmpeg-'));
	if (!dir) throw new Error('Playwright ffmpeg not found: run `pnpm exec playwright install`');
	return join(base, dir, 'ffmpeg-linux');
}

/** RFC 9309 path matching, as `robotsPathMatches` in @yipden/feeds: `*` any run, final `$` the end. */
function matches(rule, path) {
	const anchored = rule.endsWith('$');
	const body = anchored ? rule.slice(0, -1) : rule;
	const pattern = body
		.split('*')
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	return new RegExp(`^${pattern}${anchored ? '$' : ''}`).test(path);
}

/** The groups for `*` and for us, longest matching rule wins, Allow beating Disallow on a tie. */
async function allowed(url) {
	const target = new URL(url);
	let text;
	try {
		const response = await fetch(new URL('/robots.txt', target), {
			headers: { 'user-agent': USER_AGENT },
			signal: AbortSignal.timeout(10_000)
		});
		if (!response.ok) return true;
		text = await response.text();
	} catch {
		return true;
	}
	const groups = [];
	let current = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/#.*/, '').trim();
		const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
		if (!match) continue;
		const [, field, value] = match;
		const key = field.toLowerCase();
		if (key === 'user-agent') {
			if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
			current.agents.push(value.toLowerCase());
		} else if ((key === 'allow' || key === 'disallow') && current) {
			current.rules.push({ allow: key === 'allow', path: value });
		}
	}
	const ours = groups.filter((group) =>
		group.agents.some((agent) => 'yipden'.startsWith(agent) && agent !== '*')
	);
	const rules = (ours.length ? ours : groups.filter((group) => group.agents.includes('*'))).flatMap(
		(group) => group.rules
	);
	const path = target.pathname + target.search;
	let best = null;
	for (const rule of rules) {
		if (!rule.path || !matches(rule.path, path)) continue;
		if (
			!best ||
			rule.path.length > best.path.length ||
			(rule.path.length === best.path.length && rule.allow)
		)
			best = rule;
	}
	return !best || best.allow;
}

/** Scroll the page, or its biggest scrolling box when the page itself does not scroll. */
async function scrollDown(page) {
	await page.evaluate(
		async ({ duration, max }) => {
			const doc = document.scrollingElement ?? document.documentElement;
			let scroller = doc;
			if (doc.scrollHeight - innerHeight < 50) {
				let biggest = 0;
				for (const el of document.querySelectorAll('*')) {
					const room = el.scrollHeight - el.clientHeight;
					const style = getComputedStyle(el);
					if (room > biggest && /(auto|scroll)/.test(style.overflowY)) {
						biggest = room;
						scroller = el;
					}
				}
			}
			const distance = Math.min(max, scroller.scrollHeight - scroller.clientHeight);
			if (distance <= 0) return;
			const start = performance.now();
			await new Promise((resolve) => {
				const step = (now) => {
					const t = Math.min(1, (now - start) / duration);
					const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
					scroller.scrollTop = distance * eased;
					if (t < 1) requestAnimationFrame(step);
					else resolve();
				};
				requestAnimationFrame(step);
			});
		},
		{ duration: SCROLL_MS, max: MAX_SCROLL }
	);
}

async function settle(page, url) {
	await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
	await page.waitForTimeout(1500);
}

async function capture(browser, entry) {
	const poster = entry.poster_url?.startsWith('/sites/')
		? join(out, entry.poster_url.slice(7))
		: null;
	const clip =
		!postersOnly && entry.preview_url?.startsWith('/sites/')
			? join(out, entry.preview_url.slice(7))
			: null;
	if (!poster && !clip) return;

	if (!(await allowed(entry.url))) {
		console.log(`skip ${entry.id}: robots.txt disallows it`);
		return;
	}

	const base = { viewport: VIEWPORT, userAgent: USER_AGENT, isMobile: true, hasTouch: true };
	if (poster) {
		const context = await browser.newContext({ ...base, deviceScaleFactor: 2 });
		const page = await context.newPage();
		await settle(page, entry.url);
		await page.screenshot({ path: poster, type: 'jpeg', quality: 72 });
		await context.close();
		console.log(`poster ${entry.id}: ${Math.round(statSync(poster).size / 1024)} KB`);
	}

	if (clip) {
		const dir = join(work, entry.id);
		mkdirSync(dir, { recursive: true });
		const context = await browser.newContext({
			...base,
			deviceScaleFactor: 1,
			recordVideo: { dir, size: VIEWPORT }
		});
		const page = await context.newPage();
		const opened = Date.now();
		await settle(page, entry.url);
		const from = (Date.now() - opened) / 1000;
		await page.waitForTimeout(HOLD_MS);
		await scrollDown(page);
		await page.waitForTimeout(500);
		const raw = await page.video().path();
		await context.close();

		// The recording starts on a blank page: keep only the settled page and its scroll, and
		// spend fewer bits than the recorder does, since a clip is a glance, not a viewing.
		const length = (HOLD_MS + SCROLL_MS + 500) / 1000;
		const trimmed = join(dir, 'out.webm');
		execFileSync(ffmpeg(), [
			'-y',
			'-loglevel',
			'error',
			'-ss',
			String(from),
			'-i',
			raw,
			'-t',
			String(length),
			'-an',
			'-c:v',
			'libvpx',
			'-b:v',
			'450k',
			'-crf',
			'30',
			'-r',
			'24',
			trimmed
		]);
		renameSync(trimmed, clip);
		console.log(`clip ${entry.id}: ${Math.round(statSync(clip).size / 1024)} KB`);
	}
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
	for (const entry of seed.entries) {
		if (only && !only.has(entry.id)) continue;
		try {
			await capture(browser, entry);
		} catch (error) {
			console.log(`failed ${entry.id}: ${error.message}`);
		}
	}
} finally {
	await browser.close();
	rmSync(work, { recursive: true, force: true });
}
