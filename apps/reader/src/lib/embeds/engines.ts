/* eslint-disable @typescript-eslint/no-explicit-any -- the platforms' player APIs ship no types */
import { embedSrc, type EmbedSource } from './source.js';

/**
 * Drives a platform's own player (YouTube, SoundCloud, Bandcamp) from the app's player: one
 * iframe in the host the full player gives it, loaded through the platform's own API, reporting
 * back what the app's audio element would. Proved on the phone by the embed spike (2026-10-06):
 * YouTube and SoundCloud take play, pause and seek from our buttons. Bandcamp has no API at all:
 * on Android a script the host adds to its frames stands in for one (`bandcampBridged`), and
 * anywhere else it plays with its own controls and never says when it ends.
 *
 * Nothing here is loaded until a reader presses play on such a track: no platform is contacted
 * by a track merely sitting in the queue.
 */

export interface EmbedEvents {
	playing(playing: boolean): void;
	time(seconds: number): void;
	duration(seconds: number): void;
	ended(): void;
	error(): void;
	/** What the platform said about the track once loaded: SoundCloud's artwork and waveform. */
	meta(meta: { artUrl?: string; waveformUrl?: string }): void;
}

export interface EmbedEngine {
	play(): void;
	pause(): void;
	seek(seconds: number): void;
	destroy(): void;
}

const loaded = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
	let pending = loaded.get(src);
	if (!pending) {
		pending = new Promise<void>((resolve, reject) => {
			const el = document.createElement('script');
			el.src = src;
			el.async = true;
			el.onload = () => resolve();
			el.onerror = () => {
				loaded.delete(src);
				reject(new Error(`could not load ${src}`));
			};
			document.head.appendChild(el);
		});
		loaded.set(src, pending);
	}
	return pending;
}

let youtubeApi: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
	const w = window as any;
	if (w.YT?.Player) return Promise.resolve(w.YT);
	youtubeApi ??= new Promise((resolve, reject) => {
		const previous = w.onYouTubeIframeAPIReady;
		w.onYouTubeIframeAPIReady = () => {
			previous?.();
			resolve(w.YT);
		};
		loadScript('https://www.youtube.com/iframe_api').catch((cause) => {
			youtubeApi = null;
			reject(cause);
		});
	});
	return youtubeApi;
}

async function loadSoundCloudApi(): Promise<any> {
	await loadScript('https://w.soundcloud.com/player/api.js');
	return (window as any).SC;
}

let frames = 0;

function frame(host: HTMLElement, src: string, title: string): HTMLIFrameElement {
	const el = document.createElement('iframe');
	el.id = `embed-${++frames}`;
	el.title = title;
	el.allow = 'autoplay; encrypted-media';
	// YouTube refuses to play without a referrer (error 153); this sends only the origin.
	el.referrerPolicy = 'strict-origin-when-cross-origin';
	el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation');
	el.src = src;
	host.replaceChildren(el);
	return el;
}

/** YouTube: the IFrame API, with the time read four times a second while it plays. */
async function youtube(
	source: Extract<EmbedSource, { provider: 'youtube' }>,
	host: HTMLElement,
	events: EmbedEvents,
	autoplay: boolean,
	title: string
): Promise<EmbedEngine> {
	const YT = await loadYouTubeApi();
	const src = embedSrc(source, location.origin).replace(
		'autoplay=1',
		`autoplay=${autoplay ? 1 : 0}`
	);
	const el = frame(host, src, `${title}, YouTube player`);
	let poll = 0;
	const stopPolling = () => window.clearInterval(poll);
	const instance = new YT.Player(el.id, {
		events: {
			onReady: () => {
				const duration = instance.getDuration?.();
				if (duration) events.duration(duration);
				if (autoplay) instance.playVideo();
			},
			onStateChange: (event: { data: number }) => {
				// -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
				if (event.data === 1) {
					events.playing(true);
					const duration = instance.getDuration?.();
					if (duration) events.duration(duration);
					stopPolling();
					poll = window.setInterval(() => events.time(instance.getCurrentTime?.() ?? 0), 250);
				} else if (event.data === 2 || event.data === 0) {
					stopPolling();
					events.playing(false);
					if (event.data === 0) events.ended();
				}
			},
			onError: () => {
				stopPolling();
				events.error();
			}
		}
	});
	return {
		play: () => instance.playVideo?.(),
		pause: () => instance.pauseVideo?.(),
		seek: (seconds) => instance.seekTo?.(seconds, true),
		destroy: () => {
			stopPolling();
			try {
				instance.destroy?.();
			} catch {
				// Already gone with its frame.
			}
			host.replaceChildren();
		}
	};
}

/** SoundCloud: the Widget API, which reports progress itself. */
async function soundcloud(
	source: Extract<EmbedSource, { provider: 'soundcloud' }>,
	host: HTMLElement,
	events: EmbedEvents,
	autoplay: boolean,
	title: string
): Promise<EmbedEngine> {
	const SC = await loadSoundCloudApi();
	const src = embedSrc(source, location.origin).replace(
		'auto_play=true',
		`auto_play=${autoplay ? 'true' : 'false'}`
	);
	const el = frame(host, src, `${title}, SoundCloud player`);
	const widget = SC.Widget(el);
	const E = SC.Widget.Events;
	widget.bind(E.READY, () => {
		widget.getDuration((ms: number) => events.duration(ms / 1000));
		widget.getCurrentSound(
			(sound: { artwork_url?: string; waveform_url?: string; user?: { avatar_url?: string } }) => {
				const artUrl = sound?.artwork_url ?? sound?.user?.avatar_url;
				events.meta({
					...(artUrl ? { artUrl } : {}),
					...(sound?.waveform_url ? { waveformUrl: sound.waveform_url } : {})
				});
			}
		);
		if (autoplay) widget.play();
	});
	widget.bind(E.PLAY, () => events.playing(true));
	widget.bind(E.PAUSE, () => events.playing(false));
	widget.bind(E.PLAY_PROGRESS, (event: { currentPosition: number }) =>
		events.time(event.currentPosition / 1000)
	);
	widget.bind(E.FINISH, () => {
		events.playing(false);
		events.ended();
	});
	widget.bind(E.ERROR, () => events.error());
	return {
		play: () => widget.play(),
		pause: () => widget.pause(),
		seek: (seconds) => widget.seekTo(seconds * 1000),
		destroy: () => {
			try {
				for (const name of Object.values(E)) widget.unbind(name);
			} catch {
				// Already gone with its frame.
			}
			host.replaceChildren();
		}
	};
}

/**
 * Bandcamp: its own player, which has no API. On Android the app adds a small script to
 * Bandcamp's frames (`bandcampBridged`, MainActivity, `assets/yipden/bandcamp-bridge.js`) that
 * reports and takes play, pause and seek like the others. Anywhere else (the web build, an old
 * WebView, iOS for now) our buttons do nothing and nothing is reported, as before.
 */
function bandcamp(
	source: Extract<EmbedSource, { provider: 'bandcamp' }>,
	host: HTMLElement,
	events: EmbedEvents,
	autoplay: boolean,
	title: string
): EmbedEngine {
	const el = frame(host, embedSrc(source, location.origin), `${title}, Bandcamp player`);
	if (!bandcampBridged()) {
		const nothing = () => {};
		return { play: nothing, pause: nothing, seek: nothing, destroy: () => host.replaceChildren() };
	}

	const command = (name: 'play' | 'pause' | 'seek', value?: number) =>
		el.contentWindow?.postMessage({ yipdenBandcamp: 1, command: name, value }, BANDCAMP_ORIGIN);
	let wantPlay = autoplay;
	const onMessage = (event: MessageEvent) => {
		// Only that frame, from Bandcamp: the bridge's own messages and nothing posing as them.
		if (event.source !== el.contentWindow || event.origin !== BANDCAMP_ORIGIN) return;
		const data = event.data as { yipdenBandcamp?: number; type?: string; value?: unknown } | null;
		if (!data || data.yipdenBandcamp !== 1) return;
		const value = typeof data.value === 'number' && Number.isFinite(data.value) ? data.value : null;
		switch (data.type) {
			case 'ready':
				if (wantPlay) command('play');
				break;
			case 'playing':
				wantPlay = false;
				events.playing(data.value === true);
				break;
			case 'time':
				if (value !== null) events.time(value);
				break;
			case 'duration':
				if (value !== null) events.duration(value);
				break;
			case 'ended':
				events.ended();
				break;
		}
	};
	window.addEventListener('message', onMessage);
	return {
		play: () => {
			wantPlay = true;
			command('play');
		},
		pause: () => {
			wantPlay = false;
			command('pause');
		},
		seek: (seconds) => command('seek', seconds),
		destroy: () => {
			window.removeEventListener('message', onMessage);
			host.replaceChildren();
		}
	};
}

const BANDCAMP_ORIGIN = 'https://bandcamp.com';

/**
 * Whether this app can read and drive Bandcamp's player: set on the app's own page by the
 * Android host, and only when it added the bridge to Bandcamp's frames. False everywhere else.
 */
export function bandcampBridged(): boolean {
	return (
		typeof window !== 'undefined' &&
		(window as unknown as { __yipdenBandcampBridge?: number }).__yipdenBandcampBridge === 1
	);
}

export async function mountEmbed(
	source: EmbedSource,
	host: HTMLElement,
	events: EmbedEvents,
	opts: { autoplay: boolean; title: string }
): Promise<EmbedEngine> {
	switch (source.provider) {
		case 'youtube':
			return youtube(source, host, events, opts.autoplay, opts.title);
		case 'soundcloud':
			return soundcloud(source, host, events, opts.autoplay, opts.title);
		case 'bandcamp':
			return bandcamp(source, host, events, opts.autoplay, opts.title);
	}
}
