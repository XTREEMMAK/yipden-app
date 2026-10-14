/**
 * @yipden/directory
 *
 * People to discover, from every source YipDen reads: the IndieNodes ring (through `ring-client`,
 * unchanged), YipDen's curated directory, and creator lists a reader adds. One `Person` type,
 * dedupe, opt-outs, rotation and filters. No third-party dependencies, no Svelte, no DOM: plain
 * TypeScript, like `ring-client`.
 *
 * The app also has a `Person` (someone the reader follows), so it imports this one as
 * `DirectoryPerson`.
 */

export type {
	DirectoryDocument,
	DirectoryEntry,
	FeedType,
	Listing,
	OptOutDocument,
	Person,
	PersonFeed
} from './types.js';
export { hashIdentity, identitiesOf, identitiesOfInput, identitiesOfUrl } from './identity.js';
export { validateDirectory, validateOptOuts, type DirectoryValidation } from './validate.js';
export {
	loadDocument,
	memoryDocumentCache,
	type CacheRecord,
	type DocumentCache,
	type LoadOptions,
	type LoadResult,
	type LoadSource
} from './load.js';
export {
	indieNodesSource,
	listSource,
	personFromDirectoryEntry,
	personFromRingEntry,
	yipdenSource,
	type DirectorySource,
	type SourceResult
} from './sources.js';
export { hashesOf, isOptedOut, mergePeople } from './merge.js';
export { featuredToday, next, prev, rotationOrder, shuffle } from './rotation.js';
export {
	filterPeople,
	kindOfFeed,
	kindsOf,
	tagCounts,
	type FeedKind,
	type PeopleFilter
} from './filter.js';
