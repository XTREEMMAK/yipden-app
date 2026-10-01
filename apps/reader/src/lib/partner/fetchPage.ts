import type { FeedHttp } from '@yipden/feeds';

/**
 * A live partner ring's page, fetched so it can be kept on the phone: with validators from the
 * last copy the request is conditional, and an unchanged page costs a 304 rather than a download.
 * Its own module, not part of `registry.ts`, because the adapters that use it are themselves
 * imported by the registry.
 */

export interface PartnerValidators {
	etag?: string;
	lastModified?: string;
}

export type PartnerFetch =
	| { notModified: true }
	| { notModified: false; document: string; etag?: string; lastModified?: string };

/** A live ring's page through `FeedHttp`, conditionally when validators are on hand. */
export async function fetchPartnerPage(
	http: FeedHttp,
	url: string,
	validators: PartnerValidators = {}
): Promise<PartnerFetch> {
	const response = await http.get(url, { ...validators, accept: 'text/html' });
	if (response.notModified) return { notModified: true };
	return {
		notModified: false,
		document: response.body,
		...(response.etag ? { etag: response.etag } : {}),
		...(response.lastModified ? { lastModified: response.lastModified } : {})
	};
}
