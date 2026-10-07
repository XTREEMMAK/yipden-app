import { FeedHttp, decodeEntities } from '@yipden/feeds';
import type { PartnerAdapter } from '@yipden/ring-client';
import { httpFetch } from '../platform/http.js';
import { fetchPartnerPage } from './fetchPage.js';
import type { PartnerSource } from './registry.js';

/**
 * A partner ring read live from one address: its own `FeedHttp` (robots.txt honored, its own
 * per-host throttle and size cap), kept on the phone and asked "has this changed?" like the
 * first two rings. Whatever comes back is untrusted until `readPartnerRing`.
 */
export function livePartnerSource(adapter: PartnerAdapter, url: string): PartnerSource {
	const http = new FeedHttp({ fetch: httpFetch });
	return {
		adapter,
		load: async () => (await http.get(url, { accept: 'text/html' })).body,
		revalidate: (validators) => fetchPartnerPage(http, url, validators)
	};
}

/** A text token's value as a reader sees it: entities decoded, runs of space as one. */
export function plain(value: string): string {
	return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

/** The class attribute's words, so `class="a artist-name b"` is found by `artist-name`. */
export function hasClass(attributes: Record<string, string>, name: string): boolean {
	return (attributes.class ?? '').split(/\s+/).includes(name);
}
