import { FeedHttp } from './http.js';
import { parseFeed } from './parse/index.js';
import type { ParsedFeed } from './types.js';

/**
 * Where yips come from.
 *
 * Every fetch of a followed feed goes through a `FeedSource`, the same way storage goes through
 * the app's `Store`. v0.9 has one, `DirectFetchSource`, which asks each creator's own host. v2.0
 * adds a source that asks the shared feed cache for many feeds in one request and falls back to
 * this one per feed; swapping them must not touch anything that reads the results.
 */

export interface FeedRequest {
	/** The caller's own key for this feed, handed back unchanged on its result. */
	id: string;
	url: string;
	/**
	 * What the previous result for this feed returned, unread by the caller. Each source decides
	 * what goes in it, and treats one it cannot read (another source's, a corrupted one) as no
	 * cursor: a full fetch, never a failure.
	 */
	cursor?: string;
}

export type FeedResult =
	| {
			id: string;
			status: 'updated';
			/** Where the feed lives now, after redirects. */
			url: string;
			feed: ParsedFeed;
			cursor?: string;
			/** The feed's WebSub hub, from the response header or the document. Unused in v0.9. */
			hubUrl?: string;
	  }
	| { id: string; status: 'not-modified'; cursor?: string }
	| {
			id: string;
			status: 'failed';
			/** As thrown: an `HttpError`, a `FeedParseError`, or whatever the platform threw. */
			error: unknown;
	  };

export interface FeedSource {
	/**
	 * Fetch a batch of feeds. Results arrive one per request, as each is ready, so a caller can
	 * store them as they come and a slow feed never holds up the ones already answered. One
	 * feed failing is a `failed` result, never a rejected batch.
	 */
	fetchBatch(requests: FeedRequest[]): AsyncIterable<FeedResult>;
}

interface DirectCursor {
	etag?: string;
	lastModified?: string;
}

/** The conditional-request validators a direct fetch keeps between checks, as a cursor. */
export function directCursor(validators: DirectCursor): string | undefined {
	const { etag, lastModified } = validators;
	if (!etag && !lastModified) return undefined;
	return JSON.stringify({ ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) });
}

function readDirectCursor(cursor: string | undefined): DirectCursor {
	if (!cursor) return {};
	try {
		const parsed: unknown = JSON.parse(cursor);
		if (!parsed || typeof parsed !== 'object') return {};
		const { etag, lastModified } = parsed as Record<string, unknown>;
		return {
			...(typeof etag === 'string' && etag ? { etag } : {}),
			...(typeof lastModified === 'string' && lastModified ? { lastModified } : {})
		};
	} catch {
		return {};
	}
}

export interface DirectFetchSourceOptions {
	/** The polite client: robots.txt, per-host spacing, size and time caps, redirect checks. */
	http?: FeedHttp;
}

/**
 * Each feed from its own host, one at a time.
 *
 * Sequential rather than parallel: `FeedHttp` already holds one request per host at a time, so
 * running feeds in parallel would only mean more of them waiting at once, not finishing sooner,
 * while making a refresh harder to reason about and to cancel.
 */
export class DirectFetchSource implements FeedSource {
	private readonly http: FeedHttp;

	constructor(options: DirectFetchSourceOptions = {}) {
		this.http = options.http ?? new FeedHttp();
	}

	async *fetchBatch(requests: FeedRequest[]): AsyncIterable<FeedResult> {
		for (const request of requests) yield await this.fetchOne(request);
	}

	private async fetchOne(request: FeedRequest): Promise<FeedResult> {
		const { id } = request;
		try {
			const validators = readDirectCursor(request.cursor);
			const response = await this.http.get(request.url, validators);
			if (response.notModified) {
				const cursor = directCursor(validators);
				return { id, status: 'not-modified', ...(cursor ? { cursor } : {}) };
			}

			const feed = parseFeed(response.body, {
				feedUrl: response.url,
				contentType: response.contentType
			});
			const cursor = directCursor(response);
			// The header wins: WebSub discovery checks it before the document.
			const hubUrl = response.hubUrl ?? feed.hubUrl;
			return {
				id,
				status: 'updated',
				url: response.url,
				feed,
				...(cursor ? { cursor } : {}),
				...(hubUrl ? { hubUrl } : {})
			};
		} catch (error) {
			return { id, status: 'failed', error };
		}
	}
}
