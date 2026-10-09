import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: '200.html', strict: true }),
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'connect-src': ['self'],
				'frame-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['none'],
				'form-action': ['none']
			}
		}
	}
};
