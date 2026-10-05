/**
 * @yipden/feeds
 *
 * Finds feeds, fetches them politely, and turns RSS 2.0, RSS 1.0, Atom and JSON Feed into one
 * `Item` type. Plain TypeScript with one dependency, a strict XML parser that cannot be talked
 * into resolving an external entity.
 */

export type {
	DiscoveredFeed,
	DiscoveryResult,
	FeedFormat,
	FeedKind,
	Item,
	MediaAttachment,
	MediaKind,
	ParsedFeed
} from './types.js';

export { parseFeed, parseAtom, parseJsonFeed, parseRss, type ParseOptions } from './parse/index.js';
export { FeedParseError, MAX_XML_BYTES } from './xml.js';

export { byPublishedDescending, parseDate, parseDuration } from './dates.js';
export { feedKindFromUrl, mediaKindFor, refineKind, youtubeVideoId } from './kind.js';

export { decodeEntities, htmlToText, sanitizeHtml, summarize } from './sanitize.js';
export {
	isFeedLink,
	layoutSignal,
	linksBackTo,
	scanPage,
	type PageLink,
	type ScannedPage
} from './html.js';
export { absoluteUrl, sameUrl } from './urls.js';
/**
 * The untrusted-HTML tokenizer `sanitizeHtml` and `scanPage` are both built on. Exported for a
 * third reason: reading arbitrary third-party markup (a partner ring's own hand-built member
 * list, say) the same safe way, a flat token walk, rather than a bespoke regex against a
 * stranger's HTML.
 */
export { tokenize, type Token } from './tokenize.js';

export {
	channelIdFromPage,
	FALLBACK_PATHS,
	resolveProfile,
	type ProfileMatch,
	type ProfileResolution
} from './profiles.js';

export {
	FeedHttp,
	HttpError,
	linkHeaderUrl,
	parseRobots,
	type FeedHttpOptions,
	type FetchLike,
	type HttpResponse,
	type TextResponse
} from './http.js';

export { discoverFeeds, type DiscoverOptions } from './discover.js';

export { sha256Hex, stableYipId } from './hash.js';
export {
	categoryIdFromUrl,
	firstUnreadUrl,
	FORUM_HOST_INTERVAL_MS,
	forumHttp,
	listCategories,
	listTopics,
	probeForum,
	readForumPage,
	topicUrl,
	type Forum,
	type ForumCategory,
	type ForumProbe,
	type ForumTopic,
	type TopicsResult
} from './forum.js';
export {
	bareHost,
	headerNoIndex,
	isOnOwnSite,
	linkedOnPage,
	metaNoIndex,
	textOnPage
} from './capture.js';
export {
	DirectFetchSource,
	directCursor,
	type DirectFetchSourceOptions,
	type FeedRequest,
	type FeedResult,
	type FeedSource
} from './source.js';
