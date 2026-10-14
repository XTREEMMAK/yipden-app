/**
 * `pnpm directory:resolve [entry-id ...]`: the one directory step that uses the network, run by
 * hand when people are added (phones never chase redirects for every entry).
 *
 * For each entry (or only the ids given), it records extra identities so dedupe and opt-outs match
 * every form of a person, without changing the addresses the creator published:
 *
 * - where the site and each feed really end up, after redirects;
 * - a YouTube @handle's channel ID, read from the channel page's own feed link;
 * - a Bluesky handle's account ID, asked of Bluesky's public API; and when that handle is the
 *   person's own site's domain, the feed is marked verified (the brief's rule for a person with no
 *   rel="me" to check).
 *
 * Then run `pnpm directory:check`.
 */
import {
	identitiesOfUrl,
	personFromDirectoryEntry,
	validateDirectory
} from '../../packages/directory/src/index.ts';
import { paths, readJson, writeJson } from './files.mjs';

const only = new Set(process.argv.slice(2));
const AGENT = 'YipDen directory (+https://yipden.com)';

async function finalUrl(url) {
	try {
		const response = await fetch(url, {
			method: 'GET',
			redirect: 'follow',
			headers: { 'user-agent': AGENT },
			signal: AbortSignal.timeout(15_000)
		});
		await response.body?.cancel();
		return response.ok ? response.url : null;
	} catch {
		return null;
	}
}

async function youtubeChannelId(handleUrl) {
	try {
		const response = await fetch(handleUrl, {
			headers: { 'user-agent': AGENT },
			signal: AbortSignal.timeout(15_000)
		});
		const html = await response.text();
		const match =
			/<link rel="alternate" type="application\/rss\+xml"[^>]*channel_id=(UC[\w-]{22})/.exec(html);
		return match?.[1] ?? null;
	} catch {
		return null;
	}
}

async function blueskyDid(handle) {
	try {
		const response = await fetch(
			`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
			{ signal: AbortSignal.timeout(15_000) }
		);
		if (!response.ok) return null;
		const body = await response.json();
		return typeof body.did === 'string' && body.did.startsWith('did:') ? body.did : null;
	} catch {
		return null;
	}
}

const people = readJson(paths.people);
const valid = new Set(validateDirectory(people).document.entries.map((entry) => entry.id));
const origin = { source: 'yipden', sourceName: 'YipDen', listing: 'curated' };
let changed = 0;

for (const entry of people.entries) {
	if (!valid.has(entry.id) || (only.size && !only.has(entry.id))) continue;
	const known = new Set(entry.identities ?? []);
	const before = known.size;
	const person = personFromDirectoryEntry({ feeds: [], tags: [], ...entry }, origin);

	for (const url of [entry.site_url, ...(entry.feeds ?? []).map((feed) => feed.url)].filter(
		Boolean
	)) {
		const landed = await finalUrl(url);
		if (landed)
			for (const id of identitiesOfUrl(landed)) if (!person.identities.includes(id)) known.add(id);
	}
	for (const id of person.identities) {
		if (id.startsWith('youtube:@')) {
			const channel = await youtubeChannelId(
				`https://www.youtube.com/${id.slice('youtube:'.length)}`
			);
			if (channel) known.add(`youtube:${channel}`);
		}
		if (id.startsWith('bsky:') && !id.startsWith('bsky:did:')) {
			const handle = id.slice('bsky:'.length);
			const did = await blueskyDid(handle);
			if (!did) continue;
			known.add(`bsky:${did}`);
			const siteHost = entry.site_url
				? new URL(entry.site_url).hostname.replace(/^www\./, '')
				: null;
			if (siteHost && siteHost === handle) {
				for (const feed of entry.feeds ?? []) {
					if (feed.type === 'bluesky' && identitiesOfUrl(feed.url).includes(id))
						feed.verified = true;
				}
			}
		}
	}
	if (known.size !== before) {
		entry.identities = [...known].sort();
		changed += 1;
	}
}

if (changed) {
	people.generated_at = new Date().toISOString();
	writeJson(paths.people, people);
}
console.log(`directory:resolve: ${changed} entr${changed === 1 ? 'y' : 'ies'} updated.`);
