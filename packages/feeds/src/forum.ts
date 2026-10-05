import { safeUrl } from '@yipden/ring-client';
import { FeedHttp, HttpError, type FetchLike, type TextResponse } from './http.js';
import { parseFeed } from './parse/index.js';
import { tokenize } from './tokenize.js';
import { FeedParseError } from './xml.js';

/**
 * Public Discourse forums, read as forums: what the forum is, its categories, and its topics.
 *
 * Discourse publishes JSON beside every page it renders (`/latest.json`, `/c/<id>.json`,
 * `/categories.json`, `/site/basic-info.json`), the same data its own web app reads, open to
 * anyone the forum is open to. This reads that, with each list's RSS as the fallback, through the
 * same polite client as feeds, with a slower pace per host (`FORUM_HOST_INTERVAL_MS`), since a
 * forum is often one small self-hosted server.
 *
 * A forum that needs an account is reported as such and never asked for credentials. Nothing
 * here knows about creators or the ring.
 */

/** Twice the feeds' one second: a forum is often a small server, read for many topics at once. */
export const FORUM_HOST_INTERVAL_MS = 3_000;

/** A client for forums: the feeds' polite client, slower per host. */
export function forumHttp(fetch?: FetchLike): FeedHttp {
	return new FeedHttp({ ...(fetch ? { fetch } : {}), minHostIntervalMs: FORUM_HOST_INTERVAL_MS });
}

export interface Forum {
	/** Where the forum lives, with no trailing slash: an origin, or an origin and a subfolder. */
	baseUrl: string;
	title: string;
	description: string;
	logoUrl: string | null;
}

export interface ForumCategory {
	id: number;
	name: string;
	slug: string;
	description: string;
	parentId: number | null;
	topicCount: number;
}

export interface ForumTopic {
	id: number;
	title: string;
	/** The topic itself, on the forum. */
	url: string;
	categoryId: number | null;
	/** Posts after the first. */
	replyCount: number;
	/** The newest post's number, what "new since last time" and "first unread" are counted by. */
	highestPostNumber: number;
	/** ISO. The last post, or else when the topic was created. */
	lastActivityAt: string | null;
	createdAt: string | null;
	pinned: boolean;
	closed: boolean;
}

export type ForumProbe =
	| {
			status: 'forum';
			forum: Forum;
			/** The pasted link pointed into a category: offered first, never followed by itself. */
			categoryId: number | null;
	  }
	| { status: 'members-only'; forum: Forum }
	| { status: 'not-a-forum' };

export type TopicsResult =
	| { status: 'ok'; topics: ForumTopic[]; via: 'json' | 'rss'; cursor?: string }
	| { status: 'not-modified'; cursor?: string }
	| { status: 'members-only' }
	| { status: 'gone' };

/** Statuses a forum sends a reader it will not show this to. */
const REFUSED = new Set([401, 403]);
const MAX_TOPICS = 100;
const MAX_CATEGORIES = 500;
const MAX_TEXT = 500;

const JSON_ACCEPT = 'application/json';
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5';

function text(value: unknown, max = MAX_TEXT): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function id(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function isoOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function readJson(response: TextResponse): unknown {
	try {
		return JSON.parse(response.body);
	} catch {
		throw new FeedParseError('not JSON');
	}
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** What a page says about itself: whether Discourse made it, and where the forum's root is. */
export function readForumPage(
	html: string,
	pageUrl: string
): { isDiscourse: boolean; baseUrl: string | null } {
	let isDiscourse = false;
	let baseUrl: string | null = null;
	for (const token of tokenize(html.slice(0, 200_000))) {
		if (token.type !== 'start') continue;
		const name = token.name.toLowerCase();
		const { attributes } = token;
		if (name === 'meta' && (attributes.name ?? '').toLowerCase() === 'generator') {
			if (/^discourse\b/i.test(attributes.content ?? '')) isDiscourse = true;
		}
		// Discourse names its search description at the forum's root, subfolder installs included.
		if (
			name === 'link' &&
			(attributes.rel ?? '').toLowerCase() === 'search' &&
			/\/opensearch\.xml$/.test(attributes.href ?? '')
		) {
			try {
				const resolved = safeUrl(new URL(attributes.href!, pageUrl).toString());
				if (resolved) baseUrl = resolved.toString().replace(/\/opensearch\.xml$/, '');
			} catch {
				// An unusable link is no root; the page's origin stands in below.
			}
		}
		if (name === 'body') break;
	}
	return { isDiscourse, baseUrl };
}

/** A category's id from a Discourse category address: `/c/<slug>/<id>`, `/c/<slug>/<sub>/<id>`. */
export function categoryIdFromUrl(url: string, baseUrl: string): number | null {
	if (!url.startsWith(baseUrl)) return null;
	const path = url.slice(baseUrl.length).split(/[?#]/)[0] ?? '';
	const match = /^\/c\/(?:[^/]+\/)*?(\d+)(?:\/|\.json|$)/.exec(path);
	return match ? Number(match[1]) : null;
}

/**
 * Whether a pasted link is on a Discourse forum, and which. Any page of it will do: the front
 * page, a category, a topic, someone's profile. The page's own `generator` says Discourse made
 * it; the forum's public description (`/site/basic-info.json`) confirms it and names it.
 */
export async function probeForum(url: string, http: FeedHttp): Promise<ForumProbe> {
	let page: TextResponse;
	try {
		page = await http.get(url, { accept: HTML_ACCEPT });
	} catch (cause) {
		if (cause instanceof HttpError && REFUSED.has(cause.status)) {
			// A members-only forum may refuse its pages too; it can still say what it is below.
			return probeByOrigin(url, http);
		}
		return { status: 'not-a-forum' };
	}
	const { isDiscourse, baseUrl } = readForumPage(page.body, page.url);
	if (!isDiscourse) return { status: 'not-a-forum' };
	const base = baseUrl ?? new URL(page.url).origin;
	const described = await describe(base, http);
	if (!described) return { status: 'not-a-forum' };
	if (described.membersOnly) return { status: 'members-only', forum: described.forum };
	return {
		status: 'forum',
		forum: described.forum,
		categoryId: categoryIdFromUrl(page.url, base) ?? categoryIdFromUrl(url, base)
	};
}

async function probeByOrigin(url: string, http: FeedHttp): Promise<ForumProbe> {
	const origin = new URL(url).origin;
	const described = await describe(origin, http);
	if (!described) return { status: 'not-a-forum' };
	return { status: 'members-only', forum: described.forum };
}

/** The forum's name, description and logo, and whether it is closed to anyone without an account. */
async function describe(
	baseUrl: string,
	http: FeedHttp
): Promise<{ forum: Forum; membersOnly: boolean } | null> {
	const fallback: Forum = {
		baseUrl,
		title: new URL(baseUrl).hostname,
		description: '',
		logoUrl: null
	};
	try {
		const info = record(
			readJson(await http.get(`${baseUrl}/site/basic-info.json`, { accept: JSON_ACCEPT }))
		);
		if (!info) return null;
		const logo = [info.logo_small_url, info.apple_touch_icon_url, info.logo_url]
			.map((candidate) =>
				typeof candidate === 'string' ? safeUrl(candidate)?.toString() : undefined
			)
			.find(Boolean);
		return {
			forum: {
				baseUrl,
				title: text(info.title, 200) || fallback.title,
				description: text(info.description),
				logoUrl: logo ?? null
			},
			membersOnly: info.login_required === true
		};
	} catch (cause) {
		if (cause instanceof HttpError && REFUSED.has(cause.status)) {
			return { forum: fallback, membersOnly: true };
		}
		// An older Discourse without basic-info: its about page says the same.
		try {
			const about = record(
				record(readJson(await http.get(`${baseUrl}/about.json`, { accept: JSON_ACCEPT })))?.about
			);
			if (!about) return null;
			return {
				forum: {
					...fallback,
					title: text(about.title, 200) || fallback.title,
					description: text(about.description)
				},
				membersOnly: false
			};
		} catch (inner) {
			if (inner instanceof HttpError && REFUSED.has(inner.status)) {
				return { forum: fallback, membersOnly: true };
			}
			return null;
		}
	}
}

/** Every public category, subcategories after their parent. Restricted ones never appear. */
export async function listCategories(
	forum: Forum,
	http: FeedHttp
): Promise<ForumCategory[] | 'members-only'> {
	let body: unknown;
	try {
		body = readJson(
			await http.get(`${forum.baseUrl}/categories.json?include_subcategories=true`, {
				accept: JSON_ACCEPT
			})
		);
	} catch (cause) {
		if (cause instanceof HttpError && REFUSED.has(cause.status)) return 'members-only';
		throw cause;
	}
	const list = record(record(body)?.category_list)?.categories;
	if (!Array.isArray(list)) return [];
	const out: ForumCategory[] = [];
	const add = (raw: unknown, parentId: number | null) => {
		const category = record(raw);
		const categoryId = id(category?.id);
		if (!category || !categoryId || category.read_restricted === true) return;
		if (out.length >= MAX_CATEGORIES || out.some((entry) => entry.id === categoryId)) return;
		out.push({
			id: categoryId,
			name: text(category.name, 200) || `Category ${categoryId}`,
			slug: text(category.slug, 200),
			description: text(category.description_text),
			parentId: id(category.parent_category_id) ?? parentId,
			topicCount: count(category.topic_count)
		});
		if (Array.isArray(category.subcategory_list)) {
			for (const sub of category.subcategory_list) add(sub, categoryId);
		}
	};
	for (const category of list) add(category, null);
	return out;
}

/** A topic's address: the forum's own `/t/<slug>/<id>`, which also works without the slug. */
export function topicUrl(forum: Forum, topicId: number, slug = ''): string {
	return `${forum.baseUrl}/t/${encodeURIComponent(slug || 'topic')}/${topicId}`;
}

/**
 * Where a topic should open: at the first post the reader has not seen, when they have seen
 * some. Discourse opens `/t/<slug>/<id>/<post number>` at that post.
 */
export function firstUnreadUrl(topic: ForumTopic, seenPostNumber: number | null): string {
	if (!seenPostNumber || seenPostNumber >= topic.highestPostNumber) return topic.url;
	return `${topic.url}/${seenPostNumber + 1}`;
}

function topicFrom(forum: Forum, raw: unknown): ForumTopic | null {
	const topic = record(raw);
	const topicId = id(topic?.id);
	if (!topic || !topicId || topic.visible === false || topic.archived === true) return null;
	const postsCount = Math.max(1, count(topic.posts_count));
	const title = text(topic.title ?? topic.fancy_title, 300);
	if (!title) return null;
	return {
		id: topicId,
		title,
		url: topicUrl(forum, topicId, text(topic.slug, 200)),
		categoryId: id(topic.category_id),
		replyCount: postsCount - 1,
		highestPostNumber: Math.max(count(topic.highest_post_number), postsCount),
		lastActivityAt:
			isoOrNull(topic.last_posted_at) ?? isoOrNull(topic.bumped_at) ?? isoOrNull(topic.created_at),
		createdAt: isoOrNull(topic.created_at),
		pinned: topic.pinned === true,
		closed: topic.closed === true
	};
}

function cursorFrom(response: TextResponse): string | undefined {
	if (!response.etag && !response.lastModified) return undefined;
	return JSON.stringify({
		...(response.etag ? { etag: response.etag } : {}),
		...(response.lastModified ? { lastModified: response.lastModified } : {})
	});
}

function validatorsFrom(cursor: string | undefined): { etag?: string; lastModified?: string } {
	if (!cursor) return {};
	try {
		const parsed = record(JSON.parse(cursor));
		return {
			...(typeof parsed?.etag === 'string' ? { etag: parsed.etag } : {}),
			...(typeof parsed?.lastModified === 'string' ? { lastModified: parsed.lastModified } : {})
		};
	} catch {
		return {};
	}
}

/**
 * The newest topics of a whole forum, or of one category. JSON first; the list's RSS when the
 * JSON is not there or is not JSON. RSS has no reply counts, so those topics count as having none.
 */
export async function listTopics(
	forum: Forum,
	categoryId: number | null,
	http: FeedHttp,
	cursor?: string
): Promise<TopicsResult> {
	const path = categoryId ? `/c/${categoryId}` : '/latest';
	try {
		const response = await http.get(`${forum.baseUrl}${path}.json`, {
			...validatorsFrom(cursor),
			accept: JSON_ACCEPT
		});
		if (response.notModified) return { status: 'not-modified', ...(cursor ? { cursor } : {}) };
		const topics = record(record(readJson(response))?.topic_list)?.topics;
		if (!Array.isArray(topics)) throw new FeedParseError('no topic list');
		const next = cursorFrom(response);
		return {
			status: 'ok',
			via: 'json',
			topics: topics
				.slice(0, MAX_TOPICS)
				.map((raw) => topicFrom(forum, raw))
				.filter((topic): topic is ForumTopic => topic !== null),
			...(next ? { cursor: next } : {})
		};
	} catch (cause) {
		if (cause instanceof HttpError && REFUSED.has(cause.status)) return { status: 'members-only' };
		const missing = cause instanceof HttpError && (cause.status === 404 || cause.status === 410);
		// A category that is not there is gone; its RSS would only say the same.
		if (missing && categoryId) return { status: 'gone' };
		// Anything else that is not "no JSON here" (offline, too big, robots) is the caller's to see.
		if (!missing && !(cause instanceof FeedParseError)) throw cause;
	}
	// No JSON at that address, or something other than JSON: the same list as RSS.
	return listTopicsFromRss(forum, categoryId, http);
}

async function listTopicsFromRss(
	forum: Forum,
	categoryId: number | null,
	http: FeedHttp
): Promise<TopicsResult> {
	const path = categoryId ? `/c/${categoryId}` : '/latest';
	try {
		const response = await http.get(`${forum.baseUrl}${path}.rss`);
		const feed = parseFeed(response.body, {
			feedUrl: response.url,
			contentType: response.contentType
		});
		const topics: ForumTopic[] = [];
		for (const item of feed.items.slice(0, MAX_TOPICS)) {
			const match = /\/t\/([^/]+)\/(\d+)/.exec(item.url);
			if (!match) continue;
			const topicId = Number(match[2]);
			topics.push({
				id: topicId,
				title: item.title,
				url: topicUrl(forum, topicId, decodeURIComponent(match[1]!)),
				categoryId,
				replyCount: 0,
				highestPostNumber: 1,
				lastActivityAt: item.publishedAt,
				createdAt: item.publishedAt,
				pinned: false,
				closed: false
			});
		}
		return { status: 'ok', via: 'rss', topics };
	} catch (cause) {
		if (cause instanceof HttpError && REFUSED.has(cause.status)) return { status: 'members-only' };
		if (cause instanceof HttpError && (cause.status === 404 || cause.status === 410)) {
			return { status: 'gone' };
		}
		throw cause;
	}
}
