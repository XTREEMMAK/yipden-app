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
export { feedKindFromUrl, mediaKindFor, refineKind } from './kind.js';

export { decodeEntities, htmlToText, sanitizeHtml, summarize } from './sanitize.js';
export { isFeedLink, linksBackTo, scanPage, type PageLink, type ScannedPage } from './html.js';
export { absoluteUrl, sameUrl } from './urls.js';

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
	parseRobots,
	type FeedHttpOptions,
	type FetchLike,
	type HttpResponse,
	type TextResponse
} from './http.js';

export { discoverFeeds, type DiscoverOptions } from './discover.js';
