import type { Reference } from './references/types.js';
import type { Person, ShelfItem } from './store/types.js';
import { verdictKey } from './verdicts.svelte.js';

/**
 * The Library: everything a reader chose to keep, in one place. Kept references (tracks,
 * pictures, screenshots, passages) and the Shelf's saved links, read from where they already
 * live. Nothing is copied here; this only arranges them.
 *
 * Plain functions over plain records, so the arranging is tested without a screen.
 */

export type LibraryType = 'tracks' | 'passages' | 'pictures' | 'screenshots' | 'links';

/** The order types are listed and counted in. */
export const LIBRARY_TYPES: readonly LibraryType[] = [
	'tracks',
	'passages',
	'pictures',
	'screenshots',
	'links'
];

const NAMES: Record<LibraryType, [one: string, many: string]> = {
	tracks: ['track', 'tracks'],
	passages: ['passage', 'passages'],
	pictures: ['picture', 'pictures'],
	screenshots: ['screenshot', 'screenshots'],
	links: ['link', 'links']
};

export const TYPE_LABELS: Record<LibraryType, string> = {
	tracks: 'Tracks',
	passages: 'Passages',
	pictures: 'Pictures',
	screenshots: 'Screenshots',
	links: 'Links'
};

export interface LibraryItem {
	/** Unique across both sources. */
	key: string;
	type: LibraryType;
	title: string;
	/** Whose it is, as shown. */
	creatorName: string;
	/** Their site, where "their site" goes. */
	creatorUrl: string;
	/** Groups items by creator: `verdictKey` of their site, the same key references use. */
	creatorId: string;
	/** When it was kept or saved (ISO). */
	at: string;
	/** Their site no longer has it. */
	gone: boolean;
	reference?: Reference;
	link?: ShelfItem;
	/** Lowercased text search looks through: title, creator, address, a passage's words. */
	searchText: string;
}

const TYPE_OF_KIND: Record<Reference['kind'], LibraryType> = {
	audio: 'tracks',
	text: 'passages',
	image: 'pictures',
	screenshot: 'screenshots'
};

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

/** Everything kept, newest first. */
export function libraryItems(
	references: readonly Reference[],
	links: readonly ShelfItem[],
	people: readonly Person[]
): LibraryItem[] {
	const followed = new Map(people.map((person) => [verdictKey(person.siteUrl), person]));
	const items: LibraryItem[] = [];

	for (const reference of references) {
		const person = followed.get(reference.creatorId);
		const creatorUrl = person?.siteUrl ?? `https://${reference.creatorId}`;
		const creatorName = reference.creatorName ?? person?.name ?? hostOf(creatorUrl);
		items.push({
			key: reference.id,
			type: TYPE_OF_KIND[reference.kind],
			title: reference.title,
			creatorName,
			creatorUrl,
			creatorId: reference.creatorId,
			at: reference.createdAt,
			gone: reference.status === 'gone',
			reference,
			searchText: [reference.title, creatorName, reference.url, reference.selector?.exact ?? '']
				.join('\n')
				.toLowerCase()
		});
	}

	for (const link of links) {
		const creatorName = link.creator ?? hostOf(link.url);
		items.push({
			key: `link:${link.id}`,
			type: 'links',
			title: link.title,
			creatorName,
			creatorUrl: link.url,
			creatorId: verdictKey(link.url),
			at: link.savedAt,
			gone: false,
			link,
			searchText: [link.title, creatorName, link.url, link.via ?? ''].join('\n').toLowerCase()
		});
	}

	return items.sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}

export function countByType(items: readonly LibraryItem[]): Record<LibraryType, number> {
	const counts = Object.fromEntries(LIBRARY_TYPES.map((type) => [type, 0])) as Record<
		LibraryType,
		number
	>;
	for (const item of items) counts[item.type] += 1;
	return counts;
}

/** "23 tracks · 8 passages · 1 link": only the types there are. */
export function countsLine(counts: Record<LibraryType, number>): string {
	return LIBRARY_TYPES.filter((type) => counts[type] > 0)
		.map((type) => `${counts[type]} ${NAMES[type][counts[type] === 1 ? 0 : 1]}`)
		.join(' · ');
}

/** Every word of the query somewhere in the item: "lena river" finds Lena's passage about one. */
export function searchLibrary(items: readonly LibraryItem[], query: string): LibraryItem[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [...items];
	return items.filter((item) => words.every((word) => item.searchText.includes(word)));
}

export interface LibraryGroup {
	key: string;
	label: string;
	items: LibraryItem[];
}

export function groupByType(items: readonly LibraryItem[]): LibraryGroup[] {
	return LIBRARY_TYPES.map((type) => ({
		key: type,
		label: TYPE_LABELS[type],
		items: items.filter((item) => item.type === type)
	})).filter((group) => group.items.length);
}

/** By person, the way Follow and You list people: by name. */
export function groupByCreator(items: readonly LibraryItem[]): LibraryGroup[] {
	const groups = new Map<string, LibraryGroup>();
	for (const item of items) {
		const group = groups.get(item.creatorId) ?? {
			key: item.creatorId,
			label: item.creatorName,
			items: []
		};
		group.items.push(item);
		groups.set(item.creatorId, group);
	}
	return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Today, Yesterday, This week, then by month: how far back something was kept. */
export function groupByDate(items: readonly LibraryItem[], now: Date = new Date()): LibraryGroup[] {
	const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const DAY = 24 * 60 * 60 * 1000;
	const labelFor = (iso: string): [string, string] => {
		const at = new Date(iso);
		const time = at.getTime();
		if (Number.isNaN(time)) return ['undated', 'Undated'];
		if (time >= startOfDay) return ['today', 'Today'];
		if (time >= startOfDay - DAY) return ['yesterday', 'Yesterday'];
		if (time >= startOfDay - 6 * DAY) return ['week', 'This week'];
		const month = at.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
		return [`${at.getFullYear()}-${at.getMonth()}`, month];
	};
	const groups = new Map<string, LibraryGroup>();
	for (const item of items) {
		const [key, label] = labelFor(item.at);
		const group = groups.get(key) ?? { key, label, items: [] };
		group.items.push(item);
		groups.set(key, group);
	}
	// Items arrive newest first, so groups come out in that order too.
	return [...groups.values()];
}

/** Where a "View" goes: You, at the Library, showing one creator or one type. */
export function libraryHref(show: { creatorId: string } | { type: LibraryType }): string {
	const params =
		'creatorId' in show
			? new URLSearchParams({ library: 'creator', of: show.creatorId })
			: new URLSearchParams({ library: 'type', of: show.type });
	return `/you?${params.toString()}#library`;
}
