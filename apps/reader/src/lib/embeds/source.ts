/**
 * Which platform player can play an address in the app, and what it needs to. Worked out from
 * the address alone, so a queue item needs no new field: its `mediaUrl` is the platform's address
 * (a YouTube watch link, a SoundCloud track page, a Bandcamp player), and a queue saved before
 * embeds existed reads the same way.
 *
 * Spotify is not here yet: its player script would not load on the phone (2026-10-06).
 */

export type EmbedSource =
	| { provider: 'youtube'; videoId: string }
	| { provider: 'soundcloud'; url: string }
	| { provider: 'bandcamp'; album?: string; track?: string };

export type EmbedProvider = EmbedSource['provider'];

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const BANDCAMP_ID = /^\d{1,20}$/;

function parse(url: string): URL | null {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' ? parsed : null;
	} catch {
		return null;
	}
}

function youtubeId(url: URL, host: string): string | null {
	const id =
		host === 'youtu.be'
			? url.pathname.slice(1).split('/')[0]
			: url.pathname === '/watch'
				? url.searchParams.get('v')
				: url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
	return id && YOUTUBE_ID.test(id) ? id : null;
}

/** A SoundCloud track or playlist page: `/artist/track` or `/artist/sets/name`, nothing else. */
function soundcloudPage(url: URL): string | null {
	const parts = url.pathname.split('/').filter(Boolean);
	const reserved = new Set(['discover', 'search', 'you', 'stream', 'upload', 'pages', 'charts']);
	if (parts.length < 2 || reserved.has(parts[0]!)) return null;
	if (
		parts.length === 2 &&
		['tracks', 'albums', 'popular-tracks', 'reposts', 'likes', 'sets'].includes(parts[1]!)
	) {
		return null;
	}
	return `https://soundcloud.com/${parts.slice(0, parts[1] === 'sets' ? 3 : 2).join('/')}`;
}

export function embedOf(address: string): EmbedSource | null {
	const url = parse(address);
	if (!url) return null;
	const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');

	if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
		const videoId = youtubeId(url, host);
		return videoId ? { provider: 'youtube', videoId } : null;
	}

	if (host === 'w.soundcloud.com' && url.pathname.startsWith('/player')) {
		const inner = url.searchParams.get('url');
		const target = inner ? parse(inner) : null;
		return target && /(^|\.)soundcloud\.com$/.test(target.hostname)
			? { provider: 'soundcloud', url: target.toString() }
			: null;
	}
	if (host === 'soundcloud.com') {
		const page = soundcloudPage(url);
		return page ? { provider: 'soundcloud', url: page } : null;
	}

	// Only Bandcamp's own player carries the ids; a track page needs a browser to read them.
	if (host === 'bandcamp.com' && url.pathname.startsWith('/EmbeddedPlayer/')) {
		const fields = new Map(
			url.pathname
				.slice('/EmbeddedPlayer/'.length)
				.split('/')
				.map((part) => part.split('=') as [string, string | undefined])
				.filter((pair): pair is [string, string] => pair[1] !== undefined)
		);
		const album = fields.get('album');
		const track = fields.get('track');
		const source: EmbedSource = { provider: 'bandcamp' };
		if (album && BANDCAMP_ID.test(album)) source.album = album;
		if (track && BANDCAMP_ID.test(track)) source.track = track;
		return source.album || source.track ? source : null;
	}

	return null;
}

/** The address the platform's player is loaded from, with its own controls kept small. */
export function embedSrc(source: EmbedSource, origin: string): string {
	switch (source.provider) {
		case 'youtube': {
			const params = new URLSearchParams({
				enablejsapi: '1',
				playsinline: '1',
				rel: '0',
				autoplay: '1',
				origin
			});
			return `https://www.youtube-nocookie.com/embed/${source.videoId}?${params}`;
		}
		case 'soundcloud': {
			const params = new URLSearchParams({
				url: source.url,
				auto_play: 'true',
				visual: 'false',
				show_related: 'false',
				show_comments: 'false',
				show_teaser: 'false',
				sharing: 'false',
				download: 'false',
				buying: 'false'
			});
			return `https://w.soundcloud.com/player/?${params}`;
		}
		case 'bandcamp': {
			const ids = [
				source.album ? `album=${source.album}` : '',
				source.track ? `track=${source.track}` : ''
			].filter(Boolean);
			return `https://bandcamp.com/EmbeddedPlayer/${ids.join('/')}/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/artwork=small/transparent=true/`;
		}
	}
}

/**
 * Artwork known from the address alone: a YouTube video's thumbnail. SoundCloud's comes from its
 * player once loaded (`soundcloudArt`); Bandcamp's player says nothing.
 */
export function embedArtOf(source: EmbedSource): string | null {
	return source.provider === 'youtube'
		? `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`
		: null;
}

/** SoundCloud artwork as its player reports it, at 500px rather than the 100px it names. */
export function soundcloudArt(url: string): string | null {
	const parsed = safeHttps(url, /(^|\.)sndcdn\.com$/);
	return parsed ? parsed.toString().replace(/-large(\.\w+)$/, '-t500x500$1') : null;
}

/** SoundCloud's waveform data address: the JSON beside the picture it sometimes names instead. */
export function soundcloudWaveform(url: string): string | null {
	const parsed = safeHttps(url, /^wave\.sndcdn\.com$/);
	return parsed ? parsed.toString().replace(/\.png$/, '.json') : null;
}

function safeHttps(url: string, host: RegExp): URL | null {
	const parsed = parse(url);
	return parsed && host.test(parsed.hostname.toLowerCase()) && !parsed.username ? parsed : null;
}

/** What the player's own buttons can do with it. Bandcamp's player offers no way in: its own controls only. */
export function embedControllable(provider: EmbedProvider): boolean {
	return provider !== 'bandcamp';
}

export const PROVIDER_NAMES: Record<EmbedProvider, string> = {
	youtube: 'YouTube',
	soundcloud: 'SoundCloud',
	bandcamp: 'Bandcamp'
};
