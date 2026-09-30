/**
 * One-time check: is a partner ring member's own-domain preview link actually a file?
 *
 * `previewKindOf` (packages/ring-client) answers this for free when the URL is a known platform
 * (SoundCloud, Bandcamp, Spotify, Apple Music, YouTube) or ends in a recognized audio extension.
 * What it cannot answer from the URL alone is a link on the member's *own* site with no
 * extension at all, e.g. `https://someone.neocities.org/music`: that could be a raw file, or a
 * page with an embedded player. This script settles that with one polite `HEAD` request per
 * link, reading only `Content-Type`, never the file itself.
 *
 * **This is not part of the app, its build, or anything that runs on its own.** The running app
 * never makes these requests; only a developer, running this by hand, occasionally, does. That
 * split is deliberate: five hundred phones independently re-checking the same handful of small
 * personal sites would be a worse neighbor than one developer doing it once. See DECISIONS.md.
 *
 * Robots.txt is honored with the real, already-audited parser (`FeedHttp.allowed`,
 * `@yipden/feeds`), not a naive "does the file say Disallow anywhere" check: a real robots.txt
 * can list `Disallow: /` for a dozen named AI crawlers and say nothing at all for an honestly
 * identified reader like this one, which the naive check would refuse for no reason. The actual
 * `HEAD` beyond that is this script's own, deliberately not `FeedHttp.get`, which reads the whole
 * body: downloading an entire track just to learn its Content-Type would defeat the point for
 * exactly the members whose link really is one.
 *
 * Deliberately not the whole ring by default: only a handful of real, ambiguous, own-domain
 * links from Musicians Webring (found by hand, 2026-09-29), and `--limit` to go even smaller.
 * Nothing here is wired into the app; it only prints a report.
 *
 *   npx tsx scripts/analyze-partner-previews.ts [--limit N]
 */

import { FeedHttp, type FetchLike, type HttpResponse } from '@yipden/feeds';
import { previewKindOf } from '@yipden/ring-client';

const USER_AGENT =
	'YipDen-preview-check/1 (+https://yipden.com/about; manual, developer-run, one-off)';
const HOST_DELAY_MS = 1_000;

/**
 * Real, ambiguous cases from Musicians Webring's own listing: the link sits on the member's own
 * domain (not a platform `previewKindOf` already recognizes) and has no file extension, so only
 * a real request settles it. Found by reading the scraped page by hand, not generated.
 */
const CANDIDATES: Array<{ member: string; url: string }> = [
	{ member: 'technoangel', url: 'https://technoangel.neocities.org/hubs/music' },
	{ member: 'dogystuff', url: 'https://dogystuff.neocities.org/music' },
	{ member: 'weollex', url: 'https://weollex.neocities.org/music' },
	{ member: 'Nogbad the Bad', url: 'https://nogbadthebad.neocities.org/music' }
];

const nodeFetch: FetchLike = async (url, init) => {
	const response = await fetch(url, {
		method: init?.method ?? 'GET',
		headers: init?.headers,
		redirect: 'manual',
		...(init?.signal ? { signal: init.signal } : {})
	});
	const result: HttpResponse = {
		status: response.status,
		url: response.url || url,
		headers: { get: (name) => response.headers.get(name) },
		text: () => response.text()
	};
	return result;
};

function looksLikeAudio(contentType: string | null): boolean | null {
	if (!contentType) return null;
	const type = contentType.split(';')[0]?.trim().toLowerCase();
	if (!type) return null;
	if (type.startsWith('audio/')) return true;
	if (type === 'application/octet-stream') return null; // genuinely ambiguous, not a no
	return false;
}

async function headOrRangedGet(
	url: string
): Promise<{ status: number; contentType: string | null }> {
	const head = await fetch(url, {
		method: 'HEAD',
		headers: { 'user-agent': USER_AGENT },
		redirect: 'follow'
	}).catch(() => null);
	if (head && head.status >= 200 && head.status < 400 && head.headers.get('content-type')) {
		return { status: head.status, contentType: head.headers.get('content-type') };
	}
	// Some static hosts answer HEAD with a generic type or refuse it outright; a tiny ranged GET
	// (one byte) still tells us the real Content-Type without downloading the file.
	const ranged = await fetch(url, {
		headers: { 'user-agent': USER_AGENT, range: 'bytes=0-0' },
		redirect: 'follow'
	});
	return { status: ranged.status, contentType: ranged.headers.get('content-type') };
}

async function main() {
	const limitArg = process.argv.indexOf('--limit');
	const limit =
		limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Math.min(CANDIDATES.length, 5);

	// `.allowed()` is called directly below, not `.get()`, which would also download the whole
	// body; `respectRobots` only gates `.get()`'s own automatic check, so it is irrelevant here.
	const http = new FeedHttp({ fetch: nodeFetch, userAgent: USER_AGENT });
	const targets = CANDIDATES.slice(0, limit);

	console.log(`Checking ${targets.length} of ${CANDIDATES.length} known candidates.\n`);

	for (const candidate of targets) {
		const target = new URL(candidate.url);
		const alreadyKnown = previewKindOf(candidate.url);
		if (alreadyKnown !== 'external') {
			console.log(
				`${candidate.member}: ${candidate.url} — already known as ${alreadyKnown}, skipped.`
			);
			continue;
		}

		const allowed = await http.allowed(target);
		if (!allowed) {
			console.log(
				`${candidate.member}: ${candidate.url} — robots.txt disallows this path, skipped.`
			);
			continue;
		}

		try {
			const { status, contentType } = await headOrRangedGet(candidate.url);
			const audio = looksLikeAudio(contentType);
			const verdict =
				audio === true ? 'real audio file' : audio === false ? 'a page, not a file' : 'unclear';
			console.log(
				`${candidate.member}: ${candidate.url}\n  status ${status}, content-type ${contentType ?? '(none)'} → ${verdict}`
			);
		} catch (cause) {
			console.log(
				`${candidate.member}: ${candidate.url} — could not check (${cause instanceof Error ? cause.message : cause})`
			);
		}

		await new Promise((resolve) => setTimeout(resolve, HOST_DELAY_MS));
	}
}

await main();
