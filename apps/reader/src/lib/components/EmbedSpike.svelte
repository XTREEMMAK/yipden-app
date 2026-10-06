<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	/**
	 * THROWAWAY: the Listen embeds spike. Debug builds only, opened from Settings' Debug build
	 * section. Loads one embed per provider through its own API, drives play/pause/seek, listens
	 * for ended and errors, and runs the background skip test. Everything it learns goes into the
	 * log at the bottom, which "Copy log" puts on the clipboard to paste back.
	 *
	 * Not part of the feature: deleted once the results are reported.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { App } from '@capacitor/app';
	import { MediaSession } from '@capgo/capacitor-media-session';
	import { httpFetch } from '$lib/platform/http.js';

	let { onclose }: { onclose: () => void } = $props();

	type Provider = 'youtube' | 'soundcloud' | 'spotify' | 'bandcamp';
	const ORDER: Provider[] = ['youtube', 'soundcloud', 'spotify', 'bandcamp'];

	let lines = $state<string[]>([]);
	const t0 = performance.now();
	function log(tag: string, message: string): void {
		const at = ((performance.now() - t0) / 1000).toFixed(1).padStart(6);
		lines = [...lines, `${at}s [${tag}] ${message}`];
		console.warn(`[spike:${tag}]`, message);
	}

	// ---------- inputs ----------
	let ytId = $state('M7lc1UVf-VE');
	let ytHost = $state<'nocookie' | 'www'>('nocookie');
	let ytReferrer = $state<'strict-origin-when-cross-origin' | 'strict-origin' | 'origin' | 'none'>(
		'strict-origin-when-cross-origin'
	);
	let ytOriginParam = $state(true);
	let scUrl = $state('https://soundcloud.com/forss/flickermood');
	let spUri = $state('spotify:track:11dFghVXANMlKmJXsNCbNl');
	let bcUrl = $state('');
	let bcEmbed = $state('');
	let chain = $state(false);

	let active = $state<Provider | null>(null);
	let slot: HTMLDivElement | undefined = $state();

	// One controller at a time, like the real queue will have.
	let yt: any = null;
	let sc: any = null;
	let sp: any = null;
	let ytPoll = 0;

	// ---------- script loading ----------
	const loaded = new Map<string, Promise<void>>();
	function loadScript(src: string): Promise<void> {
		let pending = loaded.get(src);
		if (!pending) {
			pending = new Promise<void>((resolve, reject) => {
				const el = document.createElement('script');
				el.src = src;
				el.async = true;
				el.onload = () => resolve();
				el.onerror = () => reject(new Error(`script failed: ${src}`));
				document.head.appendChild(el);
			});
			loaded.set(src, pending);
		}
		return pending;
	}

	function ytApi(): Promise<any> {
		const w = window as any;
		if (w.YT?.Player) return Promise.resolve(w.YT);
		return new Promise((resolve, reject) => {
			const previous = w.onYouTubeIframeAPIReady;
			w.onYouTubeIframeAPIReady = () => {
				previous?.();
				resolve(w.YT);
			};
			loadScript('https://www.youtube.com/iframe_api').catch(reject);
		});
	}

	async function scApi(): Promise<any> {
		await loadScript('https://w.soundcloud.com/player/api.js');
		return (window as any).SC;
	}

	let spotifyApi: Promise<any> | null = null;
	function spApi(): Promise<any> {
		spotifyApi ??= new Promise((resolve, reject) => {
			(window as any).onSpotifyIframeApiReady = (api: any) => resolve(api);
			loadScript('https://open.spotify.com/embed/iframe-api/v1').catch(reject);
		});
		return spotifyApi;
	}

	// ---------- teardown ----------
	function destroyAll(): void {
		cancelAnimationFrame(ytPoll);
		try {
			yt?.destroy();
		} catch (cause) {
			log('yt', `destroy threw ${String(cause)}`);
		}
		try {
			sc?.unbind?.('ready');
		} catch {
			/* nothing */
		}
		try {
			sp?.destroy();
		} catch (cause) {
			log('sp', `destroy threw ${String(cause)}`);
		}
		yt = sc = sp = null;
		if (slot) slot.replaceChildren();
		if (active) log(active, 'destroyed');
		active = null;
	}

	function frame(src: string, title: string, allow: string, referrer?: string): HTMLIFrameElement {
		const el = document.createElement('iframe');
		el.title = title;
		el.allow = allow;
		if (referrer && referrer !== 'none') el.referrerPolicy = referrer as ReferrerPolicy;
		el.src = src;
		el.style.width = '100%';
		el.style.border = '0';
		slot?.appendChild(el);
		return el;
	}

	// ---------- YouTube ----------
	const YT_STATES: Record<number, string> = {
		[-1]: 'unstarted',
		0: 'ended',
		1: 'playing',
		2: 'paused',
		3: 'buffering',
		5: 'cued'
	};

	async function loadYouTube(autoplay: boolean): Promise<void> {
		destroyAll();
		active = 'youtube';
		const host =
			ytHost === 'nocookie' ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';
		const params = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0' });
		if (ytOriginParam) params.set('origin', location.origin);
		const src = `${host}/embed/${encodeURIComponent(ytId)}?${params}`;
		log('yt', `variant host=${ytHost} referrerpolicy=${ytReferrer} originParam=${ytOriginParam}`);
		log('yt', `src ${src}`);
		try {
			const YT = await ytApi();
			log('yt', 'API ready');
			const el = frame(
				src,
				'YouTube video player, spike',
				'autoplay; encrypted-media; fullscreen',
				ytReferrer
			);
			el.style.aspectRatio = '16 / 9';
			el.id = `yt-spike-${Date.now()}`;
			yt = new YT.Player(el.id, {
				events: {
					onReady: () => {
						log('yt', `onReady duration=${yt?.getDuration?.()}`);
						if (autoplay) {
							log('yt', 'playVideo() without a tap (chain)');
							yt.playVideo();
						}
					},
					onStateChange: (event: any) => {
						log('yt', `state ${event.data} ${YT_STATES[event.data] ?? '?'}`);
						if (event.data === 1) pollYouTube();
						else cancelAnimationFrame(ytPoll);
						if (event.data === 0) ended('youtube');
					},
					onError: (event: any) => log('yt', `onError code=${event.data}`)
				}
			});
		} catch (cause) {
			log('yt', `load failed ${String(cause)}`);
		}
	}

	// About 4Hz, only while playing: the poll the real adapter will use, logged once a second.
	let ytLast = 0;
	let ytLogged = 0;
	function pollYouTube(): void {
		cancelAnimationFrame(ytPoll);
		const tick = (now: number) => {
			if (now - ytLast >= 250) {
				ytLast = now;
				const position = yt?.getCurrentTime?.() ?? 0;
				if (now - ytLogged >= 5000) {
					ytLogged = now;
					log('yt', `time ${position.toFixed(1)} / ${(yt?.getDuration?.() ?? 0).toFixed(1)}`);
				}
			}
			ytPoll = requestAnimationFrame(tick);
		};
		ytPoll = requestAnimationFrame(tick);
	}

	// ---------- SoundCloud ----------
	async function loadSoundCloud(autoplay: boolean): Promise<void> {
		destroyAll();
		active = 'soundcloud';
		const params = new URLSearchParams({
			url: scUrl,
			auto_play: 'false',
			visual: 'false',
			show_related: 'false',
			show_comments: 'false',
			buying: 'false',
			sharing: 'false',
			download: 'false',
			show_teaser: 'false'
		});
		const src = `https://w.soundcloud.com/player/?${params}`;
		log('sc', `src ${src}`);
		try {
			const SC = await scApi();
			log('sc', 'API ready');
			const el = frame(
				src,
				'SoundCloud player, spike',
				'autoplay; encrypted-media',
				'strict-origin-when-cross-origin'
			);
			el.height = '166';
			sc = SC.Widget(el);
			const E = SC.Widget.Events;
			let lastProgress = 0;
			sc.bind(E.READY, () => {
				sc.getDuration((ms: number) => log('sc', `READY duration=${ms}ms`));
				sc.getSounds((sounds: any[]) => log('sc', `sounds in widget: ${sounds?.length}`));
				if (autoplay) {
					log('sc', 'play() without a tap (chain)');
					sc.play();
				}
			});
			sc.bind(E.PLAY, () => log('sc', 'PLAY'));
			sc.bind(E.PAUSE, () => log('sc', 'PAUSE'));
			sc.bind(E.SEEK, (e: any) => log('sc', `SEEK ${e?.currentPosition}ms`));
			sc.bind(E.FINISH, () => {
				log('sc', 'FINISH');
				ended('soundcloud');
			});
			sc.bind(E.ERROR, (e: any) => log('sc', `ERROR ${JSON.stringify(e)}`));
			sc.bind(E.PLAY_PROGRESS, (e: any) => {
				if (performance.now() - lastProgress < 5000) return;
				lastProgress = performance.now();
				log('sc', `PLAY_PROGRESS ${e.currentPosition}ms rel=${e.relativePosition?.toFixed(3)}`);
			});
		} catch (cause) {
			log('sc', `load failed ${String(cause)}`);
		}
	}

	// ---------- Spotify ----------
	async function loadSpotify(autoplay: boolean): Promise<void> {
		destroyAll();
		active = 'spotify';
		log('sp', `uri ${spUri}`);
		try {
			const api = await spApi();
			log('sp', 'API ready');
			const host = document.createElement('div');
			slot?.appendChild(host);
			api.createController(host, { uri: spUri, width: '100%', height: 152 }, (controller: any) => {
				sp = controller;
				log('sp', 'controller created');
				let last = { paused: true, buffering: false, logged: 0 };
				controller.addListener('ready', () => {
					log('sp', 'ready');
					if (autoplay) {
						log('sp', 'play() without a tap (chain)');
						controller.play();
					}
				});
				controller.addListener('playback_started', (e: any) =>
					log('sp', `playback_started ${e?.data?.playingURI}`)
				);
				controller.addListener('playback_update', (e: any) => {
					const d = e?.data ?? {};
					const changed = d.isPaused !== last.paused || d.isBuffering !== last.buffering;
					if (changed || performance.now() - last.logged > 5000) {
						log(
							'sp',
							`update paused=${d.isPaused} buffering=${d.isBuffering} pos=${d.position} dur=${d.duration}`
						);
						last = { paused: d.isPaused, buffering: d.isBuffering, logged: performance.now() };
					}
					if (d.isPaused && d.duration > 0 && d.position >= d.duration - 500) {
						log('sp', 'looks ended (paused at duration)');
						ended('spotify');
					}
				});
			});
		} catch (cause) {
			log('sp', `load failed ${String(cause)}`);
			spotifyApi = null;
			await probeSpotify();
		}
	}

	/**
	 * Why the API script would not load. No [csp] line means CSP did not block it. The WebView's own
	 * fetch failing while the native one works points at the WebView; both failing points at the
	 * phone's network (Private DNS, an ad blocker, a VPN).
	 */
	async function probeSpotify(): Promise<void> {
		const targets = [
			'https://open.spotify.com/embed/iframe-api/v1',
			'https://embed-cdn.spotifycdn.com/_next/static/iframe_api.38366c9cb5e4eaa70ced.js',
			'https://open.spotify.com/embed/track/11dFghVXANMlKmJXsNCbNl'
		];
		for (const url of targets) {
			const short = url.replace(/^https:\/\//, '').slice(0, 48);
			try {
				const response = await fetch(url, { mode: 'no-cors', cache: 'no-store' });
				log('sp', `webview fetch ${short}: ok (type ${response.type})`);
			} catch (cause) {
				log('sp', `webview fetch ${short}: FAILED ${String(cause)}`);
			}
			try {
				const response = await httpFetch(url, {});
				const body = await response.text();
				log('sp', `native fetch ${short}: ${response.status}, ${body.length} bytes`);
			} catch (cause) {
				log('sp', `native fetch ${short}: FAILED ${String(cause)}`);
			}
		}
	}

	// ---------- Bandcamp ----------
	async function findBandcamp(): Promise<void> {
		log('bc', `fetching ${bcUrl}`);
		try {
			const response = await httpFetch(bcUrl, { headers: { accept: 'text/html' } });
			const body = await response.text();
			log('bc', `status ${response.status}, ${body.length} bytes, final ${response.url ?? '?'}`);
			const og = body.match(
				/<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i
			)?.[1];
			const props = body.match(
				/<meta[^>]+name=["']bc-page-properties["'][^>]+content=["']([^"']+)["']/i
			)?.[1];
			log('bc', `og:video ${og ?? 'none'}`);
			log('bc', `bc-page-properties ${props ? props.replace(/&quot;/g, '"') : 'none'}`);
			if (og) bcEmbed = og.replace(/&amp;/g, '&');
			if (!og && /challenge|captcha|_fs-ch-/i.test(body))
				log('bc', 'looks like a bot challenge page');
		} catch (cause) {
			log('bc', `fetch failed ${String(cause)}`);
		}
	}

	function loadBandcamp(): void {
		destroyAll();
		active = 'bandcamp';
		// Bandcamp's Share > Embed code pasted whole: its iframe's src is the address.
		const pasted = bcEmbed.match(/src=["']([^"']+)["']/i)?.[1];
		if (pasted) bcEmbed = pasted.replace(/&amp;/g, '&');
		if (!/^https:\/\/bandcamp\.com\/EmbeddedPlayer\//.test(bcEmbed)) {
			log('bc', 'need an https://bandcamp.com/EmbeddedPlayer/... address first');
			return;
		}
		log('bc', `src ${bcEmbed}`);
		const el = frame(
			bcEmbed,
			'Bandcamp player, spike',
			'autoplay; encrypted-media',
			'strict-origin-when-cross-origin'
		);
		el.height = '120';
		el.addEventListener('load', () => log('bc', 'iframe load event'));
	}

	// ---------- shared controls ----------
	function play(): void {
		log(active ?? '-', 'our Play button');
		if (active === 'youtube') yt?.playVideo();
		else if (active === 'soundcloud') sc?.play();
		else if (active === 'spotify') sp?.resume();
		else if (active === 'bandcamp') log('bc', 'no API: use its own controls');
	}

	function pause(): void {
		log(active ?? '-', 'our Pause button');
		if (active === 'youtube') yt?.pauseVideo();
		else if (active === 'soundcloud') sc?.pause();
		else if (active === 'spotify') sp?.pause();
	}

	function seekBy(seconds: number): void {
		if (active === 'youtube') yt?.seekTo((yt.getCurrentTime() ?? 0) + seconds, true);
		else if (active === 'soundcloud')
			sc?.getPosition((ms: number) => sc.seekTo(ms + seconds * 1000));
		else if (active === 'spotify') log('sp', 'relative seek needs the last position; use Near end');
		log(active ?? '-', `seek by ${seconds}s`);
	}

	function nearEnd(): void {
		log(active ?? '-', 'seek to 5s before the end');
		if (active === 'youtube') yt?.seekTo(Math.max(0, (yt.getDuration() ?? 0) - 5), true);
		else if (active === 'soundcloud')
			sc?.getDuration((ms: number) => sc.seekTo(Math.max(0, ms - 5000)));
		else if (active === 'spotify') sp?.seek(25);
	}

	function ended(provider: Provider): void {
		log(provider, 'ENDED');
		if (!chain) return;
		const next = ORDER[(ORDER.indexOf(provider) + 1) % 3]!;
		log('chain', `advancing to ${next} with no tap`);
		void loaders[next](true);
	}

	const loaders: Record<Provider, (autoplay: boolean) => unknown> = {
		youtube: loadYouTube,
		soundcloud: loadSoundCloud,
		spotify: loadSpotify,
		bandcamp: () => loadBandcamp()
	};

	// ---------- oEmbed thumbnails ----------
	async function oembed(): Promise<void> {
		const targets: [string, string][] = [
			[
				'yt',
				`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}`
			],
			['sc', `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(scUrl)}`],
			['sp', `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyLink(spUri))}`]
		];
		if (bcUrl)
			targets.push([
				'bc',
				`https://bandcamp.com/oembed?format=json&url=${encodeURIComponent(bcUrl)}`
			]);
		for (const [tag, url] of targets) {
			try {
				const response = await httpFetch(url, { headers: { accept: 'application/json' } });
				const text = await response.text();
				let thumb = 'no JSON';
				try {
					thumb = JSON.parse(text).thumbnail_url ?? 'no thumbnail_url';
				} catch {
					/* leave it */
				}
				log(tag, `oEmbed ${response.status} thumb=${thumb}`);
			} catch (cause) {
				log(tag, `oEmbed failed ${String(cause)}`);
			}
		}
	}

	function spotifyLink(uri: string): string {
		const [, type, id] = uri.split(':');
		return `https://open.spotify.com/${type}/${id}`;
	}

	// ---------- background test ----------
	const NATIVE_TEST = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
	let bgMode = $state<'off' | 'skip' | 'watch'>('off');
	let native: HTMLAudioElement | null = null;
	let wentBackground = 0;
	let embedTimeAtBackground = 0;
	let nativeTimeAtBackground = 0;
	let appListener: Promise<{ remove: () => Promise<void> }> | null = null;

	function nativeAudio(): HTMLAudioElement {
		if (!native) {
			native = new Audio();
			native.preload = 'none';
			for (const name of ['play', 'playing', 'pause', 'ended', 'stalled', 'waiting']) {
				native.addEventListener(name, () =>
					log('native', `${name} t=${native?.currentTime.toFixed(1)}`)
				);
			}
			native.addEventListener('error', () => log('native', `error code=${native?.error?.code}`));
		}
		return native;
	}

	function embedTime(): number {
		if (active === 'youtube') return yt?.getCurrentTime?.() ?? -1;
		return -1;
	}

	async function onAppState(isActive: boolean): Promise<void> {
		log('app', `appStateChange isActive=${isActive} mode=${bgMode}`);
		if (bgMode === 'off') return;
		if (!isActive) {
			wentBackground = performance.now();
			embedTimeAtBackground = embedTime();
			if (bgMode === 'skip') {
				destroyAll();
				const audio = nativeAudio();
				audio.src = NATIVE_TEST;
				const result = audio.play() as Promise<void> | undefined;
				log('native', `play() from background returned ${result ? 'a promise' : 'undefined'}`);
				result?.then(
					() => log('native', 'play() resolved'),
					(cause: unknown) => log('native', `play() rejected ${String(cause)}`)
				);
				void MediaSession.setMetadata({
					title: 'Spike native track',
					artist: 'SoundHelix',
					artwork: []
				})
					.then(() => log('ms', 'metadata set'))
					.catch((cause: unknown) => log('ms', `metadata failed ${String(cause)}`));
				void MediaSession.setPlaybackState({ playbackState: 'playing' })
					.then(() => log('ms', 'playbackState playing set (foreground service should start)'))
					.catch((cause: unknown) => log('ms', `playbackState failed ${String(cause)}`));
				nativeTimeAtBackground = 0;
			}
			return;
		}
		const away = ((performance.now() - wentBackground) / 1000).toFixed(1);
		log('app', `back after ${away}s`);
		if (bgMode === 'watch') {
			log(
				'bg',
				`embed time before=${embedTimeAtBackground.toFixed(1)} now=${embedTime().toFixed(1)} (grew by about ${away} means it kept playing)`
			);
		} else {
			log(
				'bg',
				`native time before=${nativeTimeAtBackground} now=${native?.currentTime.toFixed(1)} paused=${native?.paused} (grew by about ${away} means it played in the background)`
			);
		}
	}

	function stopNative(): void {
		native?.pause();
		void MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
		log('native', 'stopped');
	}

	// ---------- page ----------
	function onViolation(event: SecurityPolicyViolationEvent): void {
		log('csp', `${event.violatedDirective} blocked ${event.blockedURI}`);
	}

	function onMessage(event: MessageEvent): void {
		if (/bandcamp\.com$/.test(new URL(event.origin || 'https://x.invalid').hostname)) {
			log('bc', `postMessage from frame: ${String(JSON.stringify(event.data)).slice(0, 200)}`);
		}
	}

	onMount(() => {
		log('env', `origin=${location.origin} href=${location.href}`);
		log('env', `ua=${navigator.userAgent}`);
		document.addEventListener('securitypolicyviolation', onViolation);
		window.addEventListener('message', onMessage);
		appListener = App.addListener('appStateChange', ({ isActive }) => void onAppState(isActive));
	});

	onDestroy(() => {
		destroyAll();
		native?.pause();
		document.removeEventListener('securitypolicyviolation', onViolation);
		window.removeEventListener('message', onMessage);
		void appListener?.then((handle) => handle.remove());
	});

	let copied = $state(false);
	async function copyLog(): Promise<void> {
		const text = lines.join('\n');
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
		} catch {
			const area = document.createElement('textarea');
			area.value = text;
			document.body.appendChild(area);
			area.select();
			copied = document.execCommand('copy');
			area.remove();
		}
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="spike" role="dialog" aria-label="Embed spike">
	<header>
		<b>Embed spike</b>
		<button onclick={onclose}>Close</button>
	</header>

	<section>
		<h4>YouTube</h4>
		<input bind:value={ytId} aria-label="YouTube video id" />
		<label
			>Host
			<select bind:value={ytHost}>
				<option value="nocookie">youtube-nocookie.com</option>
				<option value="www">www.youtube.com</option>
			</select>
		</label>
		<label
			>Referrer policy
			<select bind:value={ytReferrer}>
				<option>strict-origin-when-cross-origin</option>
				<option>strict-origin</option>
				<option>origin</option>
				<option value="none">(not set)</option>
			</select>
		</label>
		<label><input type="checkbox" bind:checked={ytOriginParam} /> origin= param</label>
		<button onclick={() => loadYouTube(false)}>Load YouTube</button>
	</section>

	<section>
		<h4>SoundCloud</h4>
		<input bind:value={scUrl} aria-label="SoundCloud URL" />
		<button onclick={() => loadSoundCloud(false)}>Load SoundCloud</button>
	</section>

	<section>
		<h4>Spotify</h4>
		<input bind:value={spUri} aria-label="Spotify URI" />
		<button onclick={() => loadSpotify(false)}>Load Spotify</button>
	</section>

	<section>
		<h4>Bandcamp</h4>
		<input
			bind:value={bcUrl}
			placeholder="Paste a bandcamp.com album or track page"
			aria-label="Bandcamp page"
		/>
		<button onclick={findBandcamp}>Find embed</button>
		<input
			bind:value={bcEmbed}
			placeholder="EmbeddedPlayer address, or the whole Share > Embed code"
			aria-label="Bandcamp embed address"
		/>
		<button onclick={loadBandcamp}>Load Bandcamp</button>
	</section>

	<div class="slot" bind:this={slot}></div>

	<section class="ctrls">
		<button onclick={play}>Play</button>
		<button onclick={pause}>Pause</button>
		<button onclick={() => seekBy(30)}>+30s</button>
		<button onclick={nearEnd}>Near end</button>
		<button onclick={destroyAll}>Destroy</button>
		<label><input type="checkbox" bind:checked={chain} /> Chain YT → SC → Spotify on end</label>
	</section>

	<section>
		<h4>Background</h4>
		<label
			>When the app goes to the background
			<select bind:value={bgMode}>
				<option value="off">do nothing</option>
				<option value="skip">destroy embed, start native audio</option>
				<option value="watch">leave the embed alone</option>
			</select>
		</label>
		<button onclick={stopNative}>Stop native audio</button>
		<button onclick={oembed}>Test oEmbed thumbs</button>
	</section>

	<section class="logs">
		<div class="log-head">
			<h4>Log</h4>
			<button onclick={copyLog}>{copied ? 'Copied' : 'Copy log'}</button>
			<button onclick={() => (lines = [])}>Clear</button>
		</div>
		<pre>{lines.join('\n')}</pre>
	</section>
</div>

<style>
	.spike {
		position: fixed;
		inset: 0;
		z-index: 1000;
		overflow-y: auto;
		padding: 12px 16px 80px;
		background: var(--bg, #120b08);
		color: var(--text, #fff);
		font-size: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	header,
	.log-head {
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: space-between;
	}

	section {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	h4 {
		width: 100%;
		margin: 0;
	}

	input:not([type='checkbox']) {
		flex: 1 1 100%;
		min-height: 40px;
		padding: 0 8px;
	}

	button,
	select {
		min-height: 44px;
		padding: 0 12px;
	}

	.slot {
		min-height: 0;
		background: #000;
	}

	pre {
		width: 100%;
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 11px;
		margin: 0;
	}
</style>
