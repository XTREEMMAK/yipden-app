import type { DroppedEntry, RingDocument } from './types.js';
import { validate, type ValidateOptions } from './validate.js';

export const DEFAULT_RING_URL = 'https://ring.indienodes.us/ring.json';

/** The slice of a Response this client uses, so a native HTTP client can stand in for fetch. */
export interface HttpResponse {
	status: number;
	headers: { get(name: string): string | null };
	text(): Promise<string>;
}

export type FetchLike = (
	url: string,
	init?: { headers?: Record<string, string>; signal?: AbortSignal; redirect?: 'follow' }
) => Promise<HttpResponse>;

export interface RingCacheRecord {
	document: RingDocument;
	etag?: string;
	lastModified?: string;
	/** ISO timestamp of the response this record came from. */
	fetchedAt: string;
}

/** Storage is the caller's business: SQLite on device, IndexedDB on web, memory in tests. */
export interface RingCache {
	read(): Promise<RingCacheRecord | null> | RingCacheRecord | null;
	write(record: RingCacheRecord): Promise<void> | void;
}

export interface FetchRingOptions extends ValidateOptions {
	url?: string;
	fetch?: FetchLike;
	cache?: RingCache;
	timeoutMs?: number;
	maxBytes?: number;
	userAgent?: string;
	now?: () => Date;
}

export type RingSource = 'network' | 'not-modified' | 'cache' | 'empty';

export interface FetchRingResult {
	document: RingDocument;
	/** Where the document came from, so the UI can say "showing what you had" honestly. */
	source: RingSource;
	dropped: DroppedEntry[];
	repaired: DroppedEntry[];
	fetchedAt: string | null;
	error?: Error;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** The live ring is a few kilobytes. A megabyte is generous and still bounds a hostile reply. */
const DEFAULT_MAX_BYTES = 1_000_000;

const EMPTY_DOCUMENT: RingDocument = { version: '0', entries: [] };

async function readCache(cache: RingCache | undefined): Promise<RingCacheRecord | null> {
	if (!cache) return null;
	try {
		return (await cache.read()) ?? null;
	} catch {
		return null;
	}
}

/**
 * The last good copy alone, with no network: what a screen can draw the instant it opens, while
 * `fetchRing` checks whether anything changed. Null when nothing has ever been saved.
 */
export async function cachedRing(
	cache: RingCache,
	options: ValidateOptions = {}
): Promise<FetchRingResult | null> {
	const cached = await readCache(cache);
	if (!cached) return null;
	const checked = validate(cached.document, options);
	return {
		document: checked.document,
		source: 'cache',
		dropped: checked.dropped,
		repaired: checked.repaired,
		fetchedAt: cached.fetchedAt
	};
}

/**
 * Fetch ring.json, conditionally, and never leave the reader with nothing.
 *
 * The three outcomes that matter on a phone: the ring changed and we parse it, the ring did
 * not change and we spend no bandwidth on it, or the network is gone and the last good copy
 * still fills the screen. An error is reported alongside the cached document rather than
 * instead of it, because an offline reader still wants Discover to work.
 */
export async function fetchRing(options: FetchRingOptions = {}): Promise<FetchRingResult> {
	const {
		url = DEFAULT_RING_URL,
		fetch: fetchImpl = globalThis.fetch as unknown as FetchLike,
		cache,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		maxBytes = DEFAULT_MAX_BYTES,
		userAgent,
		now = () => new Date()
	} = options;

	const cached = await readCache(cache);
	const fallback = (error?: Error): FetchRingResult => {
		if (cached) {
			const checked = validate(cached.document, options);
			return {
				document: checked.document,
				source: 'cache',
				dropped: checked.dropped,
				repaired: checked.repaired,
				fetchedAt: cached.fetchedAt,
				...(error ? { error } : {})
			};
		}
		return {
			document: EMPTY_DOCUMENT,
			source: 'empty',
			dropped: [],
			repaired: [],
			fetchedAt: null,
			...(error ? { error } : {})
		};
	};

	if (typeof fetchImpl !== 'function') {
		return fallback(new Error('no fetch implementation available'));
	}

	const headers: Record<string, string> = { accept: 'application/json' };
	if (cached?.etag) headers['if-none-match'] = cached.etag;
	if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;
	// Browsers refuse to let a page set this, so it only takes effect on the native client.
	if (userAgent) headers['user-agent'] = userAgent;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetchImpl(url, {
			headers,
			signal: controller.signal,
			redirect: 'follow'
		});

		if (response.status === 304 && cached) {
			const checked = validate(cached.document, options);
			return {
				document: checked.document,
				source: 'not-modified',
				dropped: checked.dropped,
				repaired: checked.repaired,
				fetchedAt: cached.fetchedAt
			};
		}

		if (response.status < 200 || response.status >= 300) {
			return fallback(new Error(`ring request failed with status ${response.status}`));
		}

		const declaredLength = Number(response.headers.get('content-length'));
		if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
			return fallback(new Error(`ring response declares ${declaredLength} bytes, over the cap`));
		}

		const body = await response.text();
		if (body.length > maxBytes) {
			return fallback(new Error('ring response exceeded the size cap'));
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(body);
		} catch {
			return fallback(new Error('ring response was not valid JSON'));
		}

		const checked = validate(parsed, options);
		if (!checked.document.entries.length && cached?.document.entries.length) {
			// An empty ring is almost always a publishing accident. Keep what we had and say so.
			return fallback(new Error('ring returned no usable entries'));
		}

		const fetchedAt = now().toISOString();
		const record: RingCacheRecord = { document: checked.document, fetchedAt };
		const etag = response.headers.get('etag');
		const lastModified = response.headers.get('last-modified');
		if (etag) record.etag = etag;
		if (lastModified) record.lastModified = lastModified;

		try {
			await cache?.write(record);
		} catch {
			// A cache that cannot write is a slower app, not a broken one.
		}

		return {
			document: checked.document,
			source: 'network',
			dropped: checked.dropped,
			repaired: checked.repaired,
			fetchedAt
		};
	} catch (cause) {
		return fallback(cause instanceof Error ? cause : new Error(String(cause)));
	} finally {
		clearTimeout(timer);
	}
}

/** A cache that lives only as long as the process. Useful in tests and on first run. */
export function memoryCache(initial: RingCacheRecord | null = null): RingCache {
	let record = initial;
	return {
		read: () => record,
		write: (next) => {
			record = next;
		}
	};
}
