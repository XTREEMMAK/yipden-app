/**
 * Where a yip or a place comes from, by feed kind (`FeedKind`, kept as free text on a stored
 * feed): its name, and its color (`--src-*` in tokens.css, the way Tapestry tells sources apart).
 * One list, so a source reads the same on a card, in Follow, in You and on a profile.
 */

const LABELS: Record<string, string> = {
	blog: 'Blog',
	bluesky: 'Bluesky',
	mastodon: 'Mastodon',
	youtube: 'YouTube',
	peertube: 'PeerTube',
	podcast: 'Podcast',
	forum: 'Forum',
	rss: 'RSS',
	atom: 'Atom',
	json: 'JSON Feed',
	jsonfeed: 'JSON Feed'
};

/** The kinds with a color of their own; any other is drawn in `--src-other`. */
const COLORED = new Set(['blog', 'bluesky', 'mastodon', 'youtube', 'peertube', 'podcast', 'forum']);

/** A kind's name, or undefined for one this build does not know. */
export function kindLabel(kind: string | undefined): string | undefined {
	return kind ? LABELS[kind] : undefined;
}

/** A kind's color, as a CSS value. */
export function sourceColor(kind: string | undefined): string {
	return `var(--src-${kind && COLORED.has(kind) ? kind : 'other'})`;
}

/**
 * Platforms a creator may be found on, by host, with the name people know them by. A subdomain
 * counts as its platform (`lena.bandcamp.com` is Bandcamp).
 */
export const PLATFORM_NAMES: Record<string, string> = {
	'bsky.app': 'Bluesky',
	'instagram.com': 'Instagram',
	'tiktok.com': 'TikTok',
	'x.com': 'X',
	'twitter.com': 'X',
	'facebook.com': 'Facebook',
	'threads.net': 'Threads',
	'youtube.com': 'YouTube',
	'twitch.tv': 'Twitch',
	'soundcloud.com': 'SoundCloud',
	'bandcamp.com': 'Bandcamp',
	'spotify.com': 'Spotify',
	'patreon.com': 'Patreon',
	'ko-fi.com': 'Ko-fi',
	'etsy.com': 'Etsy',
	'gumroad.com': 'Gumroad',
	'itch.io': 'itch.io',
	'github.com': 'GitHub',
	'tumblr.com': 'Tumblr',
	'neocities.org': 'Neocities',
	'linktr.ee': 'Linktree',
	'cara.app': 'Cara',
	'artstation.com': 'ArtStation',
	'deviantart.com': 'DeviantArt'
};

/** Whether `host` is `name` or a subdomain of it. */
export function isUnder(host: string, name: string): boolean {
	return host === name || host.endsWith(`.${name}`);
}

/** The platform a host belongs to, by name, or undefined for anyone's own site. */
export function platformName(host: string): string | undefined {
	return Object.entries(PLATFORM_NAMES).find(([name]) => isUnder(host, name))?.[1];
}
