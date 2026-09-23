import { safeUrl } from '@yipden/ring-client';

/**
 * The one place this package talks to the network.
 *
 * Two jobs, and they pull in the same direction. The first is being a good guest on servers
 * nobody here pays for: conditional requests so an unchanged feed costs its host almost
 * nothing, one request at a time per host, robots.txt honored, and a User-Agent that says who
 * is calling. The second is safety: every redirect hop is checked, not just the address the
 * reader typed, because a redirect into a private network is the standard way past a check
 * that only runs once.
 */

export interface HttpResponse {
	status: number;
	/** The address this response came from. Differs from the request on a redirect. */
	url?: string;
	headers: { get(name: string): string | null };
	text(): Promise<string>;
}

export type FetchLike = (
	url: string,
	init?: {
		method?: string;
		headers?: Record<string, string>;
		signal?: AbortSignal;
		redirect?: 'follow' | 'manual';
	}
) => Promise<HttpResponse>;

export interface TextResponse {
	status: number;
	/** Where the document actually lives, after redirects. This is its identity from now on. */
	url: string;
	contentType: string;
	body: string;
	etag?: string;
	lastModified?: string;
	notModified: boolean;
}

export class HttpError extends Error {
	override name = 'HttpError';
	readonly status: number;

	constructor(message: string, status = 0) {
		super(message);
		this.status = status;
	}
}

export interface FeedHttpOptions {
	fetch?: FetchLike;
	/**
	 * Honest, and pointing somewhere a server operator can read about the client. An anonymous
	 * or forged agent string is how readers get blocked, deservedly.
	 */
	userAgent?: string;
	timeoutMs?: number;
	maxBytes?: number;
	/** The floor between two requests to the same host. */
	minHostIntervalMs?: number;
	maxRedirects?: number;
	respectRobots?: boolean;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = {
	userAgent: 'YipDen/0.0.1 (+https://yipden.com/about)',
	timeoutMs: 15_000,
	maxBytes: 5_000_000,
	minHostIntervalMs: 1_000,
	maxRedirects: 5,
	respectRobots: true
};

/** The statuses that actually mean "look somewhere else". 304 is deliberately not one. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Cached robots rules live this long. A day is polite without being stale. */
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;

interface RobotsRules {
	/** Prefix rules, longest first, so the most specific match wins as the standard says. */
	rules: Array<{ allow: boolean; path: string }>;
	fetchedAt: number;
}

export class FeedHttp {
	private readonly options: Required<FeedHttpOptions>;
	private readonly lastRequestAt = new Map<string, number>();
	private readonly hostQueues = new Map<string, Promise<unknown>>();
	private readonly robots = new Map<string, RobotsRules | null>();

	constructor(options: FeedHttpOptions = {}) {
		this.options = {
			...DEFAULTS,
			fetch: (options.fetch ?? (globalThis.fetch as unknown as FetchLike)) as FetchLike,
			now: options.now ?? (() => Date.now()),
			sleep: options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
			...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined))
		} as Required<FeedHttpOptions>;
	}

	/**
	 * GET a document as text, conditionally when the caller has a validator.
	 *
	 * A 304 comes back as `notModified` with an empty body rather than as an error, because
	 * "nothing changed" is the successful case this client is built to produce most of the time.
	 */
	async get(
		url: string,
		conditional: { etag?: string; lastModified?: string; accept?: string } = {}
	): Promise<TextResponse> {
		const target = safeUrl(url);
		if (!target) throw new HttpError(`refusing to request ${url}`);

		if (this.options.respectRobots && !(await this.allowed(target))) {
			throw new HttpError(`robots.txt disallows ${target.pathname}`, 999);
		}

		return this.queued(target.hostname, () => this.request(target.toString(), conditional));
	}

	/** Run one request per host at a time, spaced by the configured interval. */
	private async queued<T>(host: string, work: () => Promise<T>): Promise<T> {
		const previous = this.hostQueues.get(host) ?? Promise.resolve();
		const run = previous.then(async () => {
			const last = this.lastRequestAt.get(host);
			const wait =
				last === undefined ? 0 : last + this.options.minHostIntervalMs - this.options.now();
			if (wait > 0) await this.options.sleep(wait);
			this.lastRequestAt.set(host, this.options.now());
			return work();
		});

		// Keep the chain alive even when this request fails, or the host stalls forever.
		this.hostQueues.set(
			host,
			run.catch(() => undefined)
		);
		return run;
	}

	private async request(
		url: string,
		conditional: { etag?: string; lastModified?: string; accept?: string },
		hop = 0
	): Promise<TextResponse> {
		if (hop > this.options.maxRedirects) throw new HttpError('too many redirects');

		const headers: Record<string, string> = {
			accept:
				conditional.accept ??
				'application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml;q=0.8, text/xml;q=0.8, text/html;q=0.7',
			'user-agent': this.options.userAgent
		};
		if (conditional.etag) headers['if-none-match'] = conditional.etag;
		if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

		try {
			const response = await this.options.fetch(url, {
				headers,
				signal: controller.signal,
				// Followed by hand so every hop is checked, not only the address we started from.
				redirect: 'manual'
			});

			// 304 sits inside the 300 range and is not a redirect: it is the answer this client
			// hopes for most of the time, so it is recognized before anything else.
			if (response.status === 304) {
				return {
					status: 304,
					url: response.url ?? url,
					contentType: response.headers.get('content-type') ?? '',
					body: '',
					notModified: true
				};
			}

			if (REDIRECT_STATUSES.has(response.status)) {
				const location = response.headers.get('location');
				if (!location)
					throw new HttpError(`redirect with no location from ${url}`, response.status);
				const next = safeUrl(new URL(location, url).toString());
				if (!next) throw new HttpError(`refusing to follow a redirect to ${location}`);
				return this.request(next.toString(), conditional, hop + 1);
			}

			if (response.status < 200 || response.status >= 300) {
				throw new HttpError(`request for ${url} failed`, response.status);
			}

			// Some clients follow redirects for us whatever we asked. Check where we landed.
			const finalUrl = response.url && response.url !== url ? response.url : url;
			if (!safeUrl(finalUrl)) throw new HttpError(`request ended at an unsafe address`);

			const declared = Number(response.headers.get('content-length'));
			if (Number.isFinite(declared) && declared > this.options.maxBytes) {
				throw new HttpError(`response declares ${declared} bytes, over the cap`);
			}

			const body = await response.text();
			if (body.length > this.options.maxBytes) {
				throw new HttpError('response exceeded the size cap');
			}

			const etag = response.headers.get('etag');
			const lastModified = response.headers.get('last-modified');
			return {
				status: response.status,
				url: finalUrl,
				contentType: response.headers.get('content-type') ?? '',
				body,
				...(etag ? { etag } : {}),
				...(lastModified ? { lastModified } : {}),
				notModified: false
			};
		} finally {
			clearTimeout(timer);
		}
	}

	/** Whether robots.txt permits this path. An unreachable robots.txt means yes. */
	async allowed(target: URL): Promise<boolean> {
		const rules = await this.robotsFor(target.origin);
		if (!rules?.rules.length) return true;

		const path = `${target.pathname}${target.search}`;
		for (const rule of rules.rules) {
			if (path.startsWith(rule.path)) return rule.allow;
		}
		return true;
	}

	private async robotsFor(origin: string): Promise<RobotsRules | null> {
		const cached = this.robots.get(origin);
		if (
			cached !== undefined &&
			(!cached || this.options.now() - cached.fetchedAt < ROBOTS_TTL_MS)
		) {
			return cached;
		}

		try {
			const response = await this.queued(new URL(origin).hostname, () =>
				this.request(`${origin}/robots.txt`, { accept: 'text/plain' })
			);
			const rules = parseRobots(response.body, this.options.userAgent);
			const record = { rules, fetchedAt: this.options.now() };
			this.robots.set(origin, record);
			return record;
		} catch {
			// No robots.txt, or it could not be read. The standard reading of that is "allowed".
			this.robots.set(origin, null);
			return null;
		}
	}
}

/**
 * Parse robots.txt for one agent.
 *
 * Groups for our own token win over the wildcard group; within a group, the longest matching
 * prefix decides, with Allow beating Disallow at equal length, which is how the major crawlers
 * have read the standard for years.
 */
export function parseRobots(text: string, userAgent: string): RobotsRules['rules'] {
	const token = userAgent.split('/')[0]?.toLowerCase() ?? 'yipden';
	const groups = new Map<string, Array<{ allow: boolean; path: string }>>();
	let current: string[] = [];
	let expectingAgents = true;

	for (const rawLine of text.split(/\r?\n/).slice(0, 5000)) {
		const line = rawLine.replace(/#.*$/, '').trim();
		if (!line) continue;

		const separator = line.indexOf(':');
		if (separator === -1) continue;
		const field = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();

		if (field === 'user-agent') {
			if (!expectingAgents) current = [];
			expectingAgents = true;
			current.push(value.toLowerCase());
			continue;
		}
		if (field !== 'allow' && field !== 'disallow') continue;

		expectingAgents = false;
		for (const agent of current) {
			const rules = groups.get(agent) ?? [];
			// An empty Disallow means "allow everything", which is a rule about the root.
			if (field === 'disallow' && !value) rules.push({ allow: true, path: '/' });
			else if (value) rules.push({ allow: field === 'allow', path: value });
			groups.set(agent, rules);
		}
	}

	const rules = groups.get(token) ?? groups.get('*') ?? [];
	return [...rules].sort(
		(a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow)
	);
}
