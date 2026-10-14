import type { FetchLike } from '@yipden/ring-client';

/**
 * Load a published JSON document, conditionally, and never leave the reader with nothing: the
 * same three outcomes `ring-client`'s `fetchRing` gives the ring (changed, unchanged, or gone and
 * the last good copy used), written once here for YipDen's directory, its opt-outs and every list
 * a reader adds.
 */

export interface CacheRecord<T> {
	document: T;
	etag?: string;
	lastModified?: string;
	fetchedAt: string;
}

/** Storage is the caller's business: the app's encrypted store on a phone, memory in tests. */
export interface DocumentCache<T> {
	read(): Promise<CacheRecord<T> | null> | CacheRecord<T> | null;
	write(record: CacheRecord<T>): Promise<void> | void;
}

export type LoadSource = 'network' | 'not-modified' | 'cache' | 'empty';

export interface LoadResult<T> {
	document: T | null;
	source: LoadSource;
	fetchedAt: string | null;
	error?: Error;
}

export interface LoadOptions<T> {
	url: string;
	fetch: FetchLike;
	/** Check the JSON. One bad entry should be dropped, never the document. */
	parse(json: unknown): T;
	cache?: DocumentCache<T>;
	/** A document with nothing in it is kept from replacing a good one: almost always an accident. */
	isEmpty?(document: T): boolean;
	timeoutMs?: number;
	maxBytes?: number;
	/** Ask caches in between to check with the origin. Native HTTP only (a browser preflights it). */
	revalidate?: boolean;
	now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2_000_000;

async function readCache<T>(cache: DocumentCache<T> | undefined): Promise<CacheRecord<T> | null> {
	if (!cache) return null;
	try {
		return (await cache.read()) ?? null;
	} catch {
		return null;
	}
}

export async function loadDocument<T>(options: LoadOptions<T>): Promise<LoadResult<T>> {
	const {
		url,
		fetch: fetchImpl,
		parse,
		cache,
		isEmpty,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxBytes = DEFAULT_MAX_BYTES,
		revalidate = false,
		now = () => new Date()
	} = options;

	const cached = await readCache(cache);
	const fallback = (error: Error): LoadResult<T> =>
		cached
			? { document: cached.document, source: 'cache', fetchedAt: cached.fetchedAt, error }
			: { document: null, source: 'empty', fetchedAt: null, error };

	const headers: Record<string, string> = { accept: 'application/json' };
	if (cached?.etag) headers['if-none-match'] = cached.etag;
	if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;
	if (revalidate) headers['cache-control'] = 'no-cache';

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(url, {
			headers,
			signal: controller.signal,
			redirect: 'follow'
		});
		if (response.status === 304 && cached) {
			return { document: cached.document, source: 'not-modified', fetchedAt: cached.fetchedAt };
		}
		if (response.status < 200 || response.status >= 300) {
			return fallback(new Error(`request failed with status ${response.status}`));
		}
		const declared = Number(response.headers.get('content-length'));
		if (Number.isFinite(declared) && declared > maxBytes) {
			return fallback(new Error('response declares more bytes than the cap'));
		}
		const body = await response.text();
		if (body.length > maxBytes) return fallback(new Error('response exceeded the size cap'));

		let json: unknown;
		try {
			json = JSON.parse(body);
		} catch {
			return fallback(new Error('response was not valid JSON'));
		}
		const document = parse(json);
		if (isEmpty?.(document) && cached && !isEmpty(cached.document)) {
			return fallback(new Error('response had nothing usable in it'));
		}

		const fetchedAt = now().toISOString();
		const record: CacheRecord<T> = { document, fetchedAt };
		const etag = response.headers.get('etag');
		const lastModified = response.headers.get('last-modified');
		if (etag) record.etag = etag;
		if (lastModified) record.lastModified = lastModified;
		try {
			await cache?.write(record);
		} catch {
			// A cache that cannot write is a slower app, not a broken one.
		}
		return { document, source: 'network', fetchedAt };
	} catch (cause) {
		return fallback(cause instanceof Error ? cause : new Error(String(cause)));
	} finally {
		clearTimeout(timer);
	}
}

/** A cache that lives only as long as the process. */
export function memoryDocumentCache<T>(initial: CacheRecord<T> | null = null): DocumentCache<T> {
	let record = initial;
	return {
		read: () => record,
		write: (next) => {
			record = next;
		}
	};
}
