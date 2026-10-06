import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Static output, always. Capacitor loads these files from the device, so this app has no
 * server and can never have one: a +server route here could not run in production even if
 * someone wrote it. `fallback` gives the WebView a single document to boot from.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			fallback: '200.html',
			precompress: false,
			strict: true
		}),
		alias: {
			$components: 'src/lib/components',
			$styles: 'src/lib/styles'
		},
		/*
		 * Content Security Policy, following Mozilla's guidance and adapted to an app whose
		 * origin is local files. Scripts are 'self' with no unsafe-inline and no eval, which is
		 * the directive that actually stops a compromised feed from running anything. Images and
		 * media are open to https because creator media comes from everywhere, and connect-src
		 * likewise because that is the entire product.
		 */
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				// The platform player APIs the player drives (embeds/engines.ts), loaded only once a reader
				// presses play on such a track. The two Spotify origins are the embed spike's alone and go
				// with it.
				'script-src': [
					'self',
					'https://www.youtube.com',
					'https://w.soundcloud.com',
					'https://open.spotify.com',
					'https://embed-cdn.spotifycdn.com'
				],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'https:', 'data:', 'blob:'],
				'media-src': ['self', 'https:', 'blob:'],
				'font-src': ['self'],
				'connect-src': ['self', 'https:'],
				// The platforms' own players, each only after a reader taps play: YouTube's privacy-enhanced
				// one (YipCard, and the player), SoundCloud's and Bandcamp's (the player). www.youtube.com
				// and Spotify are the embed spike's alone and go with it.
				'frame-src': [
					'https://www.youtube-nocookie.com',
					'https://www.youtube.com',
					'https://w.soundcloud.com',
					'https://open.spotify.com',
					'https://bandcamp.com'
				],
				'object-src': ['none'],
				'base-uri': ['none'],
				'form-action': ['none'],
				// Ignored when the policy is delivered in a meta tag, which is how a static build
				// carries it. Declared anyway so a header delivered deployment gets it for free.
				'frame-ancestors': ['none']
			}
		}
	}
};
