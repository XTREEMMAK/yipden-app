import type { Person } from './store/index.js';

/**
 * Folders: a reader's own grouping of the people they follow.
 *
 * A folder is only a name on a person, one at most, so it exists exactly as long as someone is in
 * it. There is no folder record to create, rename in two places or leave behind empty.
 */

export const MAX_FOLDER_LENGTH = 40;

export interface FolderSummary {
	name: string;
	/** How many followed people are in it. */
	count: number;
}

/** A typed folder name as it is stored, or `undefined` when nothing usable was typed. */
export function cleanFolder(name: string | null | undefined): string | undefined {
	const cleaned = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_LENGTH).trim();
	return cleaned || undefined;
}

/** Every folder in use, by name. */
export function folderList(people: Iterable<Person>): FolderSummary[] {
	const counts = new Map<string, number>();
	for (const person of people) {
		if (person.folder) counts.set(person.folder, (counts.get(person.folder) ?? 0) + 1);
	}
	return [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}

/**
 * The folder already in use that a typed name means, so "music" joins "Music" rather than
 * starting a second folder beside it.
 */
export function matchFolder(name: string, existing: Iterable<FolderSummary>): string {
	for (const folder of existing) {
		if (folder.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0) {
			return folder.name;
		}
	}
	return name;
}
