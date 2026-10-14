import { safeUrl } from '@yipden/ring-client';

/**
 * The normalized identities a person is known by, so the same person found two ways is one
 * person, and an opt-out made under one form still matches the others.
 *
 * Each identity is a short `kind:value` string:
 *
 * - `url:example.com/path?query`: any address, host lowercased, `www.` and a trailing slash
 *   dropped; its query kept (sorted, tracking parameters left out), since a query can be the
 *   whole difference between two people (YouTube's feeds differ only by `channel_id`)
 * - `bsky:handle` or `bsky:did:plc:…`: a Bluesky account
 * - `youtube:@handle` or `youtube:UC…`: a YouTube channel, by handle or by channel ID
 * - `fedi:user@host`: a Mastodon (or other fediverse) account
 *
 * Without a network nothing can tell that `youtube:@handle` and `youtube:UC…` are one channel, or
 * a Bluesky handle and its account ID: `directory:resolve` records both forms on an entry, so the
 * published list carries them.
 */

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com']);
const BLUESKY_HOSTS = new Set(['bsky.app']);

function bareHost(url: URL): string {
	return url.hostname.toLowerCase().replace(/^www\./, '');
}

function barePath(url: URL): string {
	const path = url.pathname.replace(/\/+$/, '');
	return path === '' ? '' : path;
}

/** The query that tells one address from another: sorted, with tracking parameters left out. */
function bareQuery(url: URL): string {
	const params = [...url.searchParams]
		.filter(([key]) => !/^(utm_|fbclid$|gclid$|ref$|ref_src$)/i.test(key))
		.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
	if (!params.length) return '';
	return `?${new URLSearchParams(params).toString()}`;
}

/** Every identity an address stands for: always its `url:` form, plus a platform form if any. */
export function identitiesOfUrl(raw: string): string[] {
	const url = safeUrl(raw);
	if (!url) return [];
	const host = bareHost(url);
	const out = new Set<string>([`url:${host}${barePath(url)}${bareQuery(url)}`]);
	const parts = url.pathname.split('/').filter(Boolean);

	if (YOUTUBE_HOSTS.has(host)) {
		const first = parts[0] ?? '';
		if (first.startsWith('@')) out.add(`youtube:${first.toLowerCase()}`);
		if (first === 'channel' && parts[1]) out.add(`youtube:${parts[1]}`);
		const channelId = url.searchParams.get('channel_id');
		if (first === 'feeds' && channelId) out.add(`youtube:${channelId}`);
	} else if (BLUESKY_HOSTS.has(host)) {
		if (parts[0] === 'profile' && parts[1]) out.add(`bsky:${parts[1].toLowerCase()}`);
	} else if (parts.length >= 1 && parts[0]!.startsWith('@') && parts[0]!.length > 1) {
		// A Mastodon profile's feed is the profile address with `.rss` on the end: one account.
		const user = parts[0]!.slice(1).replace(/\.(rss|atom|json)$/i, '');
		out.add(`fedi:${user.toLowerCase()}@${host}`);
	} else if (parts[0] === 'users' && parts[1]) {
		out.add(`fedi:${parts[1].toLowerCase()}@${host}`);
	}
	return [...out];
}

/**
 * What someone typed when asking to be removed: an address, a handle, or an identity already in
 * `kind:value` form. `@user@host` is a fediverse account; a bare domain-like handle is both a
 * Bluesky handle and a site, since a Bluesky handle is often the person's own domain. Returns
 * nothing it cannot read, rather than guessing.
 */
export function identitiesOfInput(input: string): string[] {
	const value = input.trim();
	if (!value) return [];
	if (/^https?:\/\//i.test(value)) {
		return identitiesOfUrl(value.replace(/^http:/i, 'https:'));
	}
	const prefixed = /^(url|bsky|youtube|fedi):(.+)$/i.exec(value);
	if (prefixed) {
		const kind = prefixed[1]!.toLowerCase();
		const rest = prefixed[2]!;
		return [`${kind}:${kind === 'youtube' && !rest.startsWith('@') ? rest : rest.toLowerCase()}`];
	}
	const fedi = /^@?([\w.-]+)@([a-z0-9-]+(\.[a-z0-9-]+)+)$/i.exec(value);
	if (fedi) return [`fedi:${fedi[1]!.toLowerCase()}@${fedi[2]!.toLowerCase()}`];
	const domain = /^@?([a-z0-9-]+(\.[a-z0-9-]+)+)$/i.exec(value);
	if (domain) {
		const name = domain[1]!.toLowerCase();
		return [`bsky:${name}`, ...identitiesOfUrl(`https://${name}/`)];
	}
	return [];
}

/** Every identity of a person: their site, each feed, and any recorded by `directory:resolve`. */
export function identitiesOf(person: {
	siteUrl?: string;
	feeds: { url: string }[];
	identities?: string[];
}): string[] {
	const out = new Set<string>(person.identities ?? []);
	if (person.siteUrl) for (const id of identitiesOfUrl(person.siteUrl)) out.add(id);
	for (const feed of person.feeds) for (const id of identitiesOfUrl(feed.url)) out.add(id);
	return [...out];
}

/**
 * The published hash of one identity: SHA-256 of `yipden-optout-v1:` and the identity, in hex.
 *
 * The hash keeps `optouts.json` from being read as a list of names. It does not stop someone who
 * already suspects a person from hashing that person's address and checking: the app has to check
 * the list, so the hash cannot be secret. The real protection is that an opt-out removes the entry
 * before anything is published (DECISIONS.md, 2026-10-14).
 */
export async function hashIdentity(identity: string): Promise<string> {
	const bytes = new TextEncoder().encode(`yipden-optout-v1:${identity}`);
	const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Where to send someone who taps "Visit" on a person with no website: their own page on the
 * platform their first feed is on (a YouTube channel, a Bluesky or Mastodon profile), or that
 * feed's address when there is no better page.
 */
export function homeOf(person: { siteUrl?: string; feeds: { url: string }[] }): string | null {
	if (person.siteUrl) return person.siteUrl;
	for (const feed of person.feeds) {
		let url: URL;
		try {
			url = new URL(feed.url);
		} catch {
			continue;
		}
		const host = url.hostname.toLowerCase().replace(/^www\./, '');
		const channel = url.searchParams.get('channel_id');
		if (host === 'youtube.com' && channel) return `https://www.youtube.com/channel/${channel}`;
		const bluesky = /^\/profile\/([^/]+)\/rss\/?$/.exec(url.pathname);
		if (host === 'bsky.app' && bluesky) return `https://bsky.app/profile/${bluesky[1]}`;
		const fedi = /^\/(@[^/]+?)\.(rss|atom|json)$/i.exec(url.pathname);
		if (fedi) return `${url.origin}/${fedi[1]}`;
	}
	return person.feeds[0]?.url ?? null;
}
