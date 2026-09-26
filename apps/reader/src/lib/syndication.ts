import { htmlToText } from '@yipden/feeds';
import type { StoredYip } from './store/index.js';

const CANDIDATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const LONG_EXACT_BODY = 80;
const FUZZY_BODY_MIN = 100;
const FUZZY_THRESHOLD = 0.95;

/** A stored yip decorated only for the current feed view. Every source record remains intact. */
export interface FeedYip extends StoredYip {
	crosspostGroupId?: string;
	crosspostKeys?: string[];
	crossposts?: StoredYip[];
}

export interface GroupingResult {
	yips: FeedYip[];
	/** Unread mirrors of an already-read group, which storage should reconcile in one write. */
	readKeys: string[];
}

function normalizedUrl(value: string | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:') return null;
		url.hash = '';
		if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
		return url.toString();
	} catch {
		return null;
	}
}

function feedIdentity(yip: StoredYip): string {
	return yip.feedId ?? yip.sourceFeedId;
}

function itemUrls(yip: StoredYip): Set<string> {
	return new Set(
		[yip.url, yip.canonicalUrl].map(normalizedUrl).filter((url): url is string => url !== null)
	);
}

function syndicationUrls(yip: StoredYip): Set<string> {
	return new Set(
		(yip.syndicationUrls ?? []).map(normalizedUrl).filter((url): url is string => url !== null)
	);
}

function intersects(left: Set<string>, right: Set<string>): boolean {
	for (const value of left) if (right.has(value)) return true;
	return false;
}

function explicitlyRelated(left: StoredYip, right: StoredYip): boolean {
	const leftItems = itemUrls(left);
	const rightItems = itemUrls(right);
	const leftSyndication = syndicationUrls(left);
	const rightSyndication = syndicationUrls(right);
	return (
		intersects(leftItems, rightItems) ||
		intersects(leftSyndication, rightItems) ||
		intersects(rightSyndication, leftItems) ||
		intersects(leftSyndication, rightSyndication)
	);
}

function comparableTime(yip: StoredYip): number {
	return new Date(yip.publishedAt ?? yip.seenAt).getTime();
}

function withinCandidateWindow(left: StoredYip, right: StoredYip): boolean {
	const leftTime = comparableTime(left);
	const rightTime = comparableTime(right);
	return (
		Number.isFinite(leftTime) &&
		Number.isFinite(rightTime) &&
		Math.abs(leftTime - rightTime) <= CANDIDATE_WINDOW_MS
	);
}

function normalizedBody(yip: StoredYip): string {
	const body = yip.contentHtml ? htmlToText(yip.contentHtml, { maxLength: 50_000 }) : yip.summary;
	return body.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function outboundUrls(yip: StoredYip): Set<string> {
	const values: string[] = [];
	const source = yip.contentHtml ?? yip.summary;
	for (const match of source.matchAll(/href=["']([^"']+)["']/gi)) values.push(match[1] ?? '');
	for (const match of htmlToText(source, { maxLength: 50_000 }).matchAll(
		/https:\/\/[^\s<>"']+/gi
	)) {
		values.push((match[0] ?? '').replace(/[),.!?]+$/, ''));
	}

	const own = itemUrls(yip);
	return new Set(
		values.map(normalizedUrl).filter((url): url is string => url !== null && !own.has(url))
	);
}

function sameTitle(left: StoredYip, right: StoredYip): boolean {
	const normalize = (title: string) => title.normalize('NFKC').toLocaleLowerCase().trim();
	const leftTitle = normalize(left.title);
	const rightTitle = normalize(right.title);
	return leftTitle !== '' && leftTitle !== 'untitled' && leftTitle === rightTitle;
}

function sharedMedia(left: StoredYip, right: StoredYip): boolean {
	const urls = new Set(left.media.map((media) => normalizedUrl(media.url)).filter(Boolean));
	return right.media.some((media) => {
		const url = normalizedUrl(media.url);
		return url !== null && urls.has(url);
	});
}

/** Dice similarity over character bigrams, including duplicate bigrams. */
function textSimilarity(left: string, right: string): number {
	if (left === right) return 1;
	if (left.length < 2 || right.length < 2) return 0;
	const counts = new Map<string, number>();
	for (let index = 0; index < left.length - 1; index += 1) {
		const pair = left.slice(index, index + 2);
		counts.set(pair, (counts.get(pair) ?? 0) + 1);
	}
	let overlap = 0;
	for (let index = 0; index < right.length - 1; index += 1) {
		const pair = right.slice(index, index + 2);
		const count = counts.get(pair) ?? 0;
		if (count <= 0) continue;
		overlap += 1;
		counts.set(pair, count - 1);
	}
	return (2 * overlap) / (left.length + right.length - 2);
}

export function areCrossposts(left: StoredYip, right: StoredYip): boolean {
	if (left.personId !== right.personId) return false;
	if (feedIdentity(left) === feedIdentity(right)) return false;
	if (left.category !== right.category) return false;
	if (explicitlyRelated(left, right)) return true;
	if (!withinCandidateWindow(left, right)) return false;

	const leftBody = normalizedBody(left);
	const rightBody = normalizedBody(right);
	if (!leftBody || !rightBody) return false;

	const sharedOutbound = intersects(outboundUrls(left), outboundUrls(right));
	if (leftBody === rightBody) {
		return leftBody.length >= LONG_EXACT_BODY || sharedOutbound;
	}

	if (Math.min(leftBody.length, rightBody.length) < FUZZY_BODY_MIN) return false;
	const hasSupportingEvidence =
		sharedOutbound || sameTitle(left, right) || sharedMedia(left, right);
	return hasSupportingEvidence && textSimilarity(leftBody, rightBody) >= FUZZY_THRESHOLD;
}

function ownedByPerson(yip: StoredYip, siteUrl: string | undefined): boolean {
	const item = normalizedUrl(yip.url);
	const site = normalizedUrl(siteUrl);
	if (!item || !site) return false;
	const itemHost = new URL(item).hostname.replace(/^www\./, '');
	const siteHost = new URL(site).hostname.replace(/^www\./, '');
	return itemHost === siteHost;
}

function richness(yip: StoredYip): number {
	return (
		(yip.contentHtml?.length ?? yip.summary.length) +
		yip.media.length * 100 +
		yip.media.filter((media) => Boolean(media.alt || media.durationSeconds)).length * 40
	);
}

function choosePrimary(copies: StoredYip[], siteUrl: string | undefined): StoredYip {
	return [...copies].sort((left, right) => {
		const ownership = Number(ownedByPerson(right, siteUrl)) - Number(ownedByPerson(left, siteUrl));
		if (ownership) return ownership;
		const detail = richness(right) - richness(left);
		if (detail) return detail;
		return comparableTime(left) - comparableTime(right) || left.key.localeCompare(right.key);
	})[0]!;
}

function groupId(copies: StoredYip[]): string {
	let hash = 0x811c9dc5;
	for (const character of copies
		.map((copy) => copy.key)
		.sort()
		.join('\u0000')) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}
	return `crosspost-${(hash >>> 0).toString(36)}`;
}

function newestFirst(left: StoredYip, right: StoredYip): number {
	return comparableTime(right) - comparableTime(left) || left.key.localeCompare(right.key);
}

export function groupCrossposts(
	items: StoredYip[],
	siteUrlsByPerson: ReadonlyMap<string, string> = new Map()
): GroupingResult {
	const parent = items.map((_, index) => index);
	const find = (index: number): number => {
		while (parent[index] !== index) {
			parent[index] = parent[parent[index]!]!;
			index = parent[index]!;
		}
		return index;
	};
	const union = (left: number, right: number) => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
	};

	for (let left = 0; left < items.length; left += 1) {
		for (let right = left + 1; right < items.length; right += 1) {
			if (areCrossposts(items[left]!, items[right]!)) union(left, right);
		}
	}

	const groups = new Map<number, StoredYip[]>();
	for (let index = 0; index < items.length; index += 1) {
		const root = find(index);
		groups.set(root, [...(groups.get(root) ?? []), items[index]!]);
	}

	const readKeys = new Set<string>();
	const yips: FeedYip[] = [];
	for (const copies of groups.values()) {
		if (copies.length === 1) {
			yips.push(copies[0]!);
			continue;
		}

		const primary = choosePrimary(copies, siteUrlsByPerson.get(copies[0]!.personId));
		const readAt = copies
			.map((copy) => copy.readAt)
			.filter((value): value is string => Boolean(value))
			.sort()[0];
		if (readAt) {
			for (const copy of copies) if (!copy.readAt) readKeys.add(copy.key);
		}
		const ordered = [
			primary,
			...copies.filter((copy) => copy.key !== primary.key).sort(newestFirst)
		];
		yips.push({
			...primary,
			...(readAt ? { readAt } : {}),
			crosspostGroupId: groupId(copies),
			crosspostKeys: ordered.map((copy) => copy.key),
			crossposts: ordered
		});
	}

	return { yips: yips.sort(newestFirst), readKeys: [...readKeys] };
}
