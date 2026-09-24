/**
 * @yipden/ring-client
 *
 * Reads the IndieNodes ring document. No framework, no runtime dependencies, no DOM: this
 * package is destined for the indienodes-ring repository so other clients can share it, so
 * nothing here may reach for Svelte, SvelteKit or the app.
 */

export type {
	DroppedEntry,
	KnownFeedType,
	KnownForm,
	KnownType,
	RingArtwork,
	RingDocument,
	RingEntry,
	RingExcerpt,
	RingFeed,
	RingFocalPoint,
	RingPage,
	RingTrack,
	ValidationResult
} from './types.js';
export { KNOWN_FEED_TYPES, KNOWN_FORMS, KNOWN_TYPES } from './types.js';

export { displayHost, isPrivateHost, normalizeUrl, safeUrl } from './url.js';
export { heroImage, normalize, type NormalizeOptions } from './normalize.js';
export { validate, type ValidateOptions } from './validate.js';

export {
	dayKey,
	entriesOf,
	next,
	nodeOfTheDay,
	positionOf,
	prev,
	rotationOrder,
	shuffle,
	type Ring
} from './rotation.js';

export { filterRing, tagFacets, typeFacets, type RingFilter } from './filter.js';

export { suggestNextEntry, type SuggestOptions } from './suggest.js';

export {
	DEFAULT_RING_URL,
	fetchRing,
	memoryCache,
	type FetchLike,
	type FetchRingOptions,
	type FetchRingResult,
	type HttpResponse,
	type RingCache,
	type RingCacheRecord,
	type RingSource
} from './fetch.js';
