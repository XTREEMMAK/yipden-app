import {
	listSource,
	loadDocument,
	personFromDirectoryEntry,
	validateDirectory,
	validateOptOuts,
	yipdenSource,
	type CacheRecord,
	type DirectoryDocument,
	type DocumentCache,
	type OptOutDocument,
	type Person as DirectoryPerson
} from '@yipden/directory';
import { safeUrl } from '@yipden/ring-client';
import { DIRECTORY_URL, OPTOUTS_URL } from './config.js';
import { httpFetch, isNative } from './platform/http.js';
import { store } from './store/index.js';

/**
 * Where Discover's people come from, besides the IndieNodes ring: YipDen's curated directory and
 * creator lists a reader adds, with YipDen's opt-out list applied to all of them (DECISIONS.md,
 * 2026-10-14). The reader can switch each source off in Settings.
 *
 * Until the opt-out list has been read at least once, nobody from the directory or a reader's
 * lists is shown: an opt-out that could not be checked is not taken as no opt-out.
 */

/** A creator list a reader added, by its address. */
export interface AddedList {
	id: string;
	name: string;
	url: string;
	format: 'directory' | 'ring';
	addedAt: string;
}

/** On unless switched off: `indienodes`, `yipden`, a partner ring's id, or `list:<id>`. */
export type SourceToggles = Record<string, boolean>;

type Cached = Record<string, CacheRecord<unknown>>;

/** One record per address, kept in a single setting, like the partner rings' cache. */
function settingCache<T>(url: string): DocumentCache<T> {
	return {
		async read() {
			const all = (await store.getSetting<Cached>('directoryCache')) ?? {};
			return (all[url] as CacheRecord<T> | undefined) ?? null;
		},
		async write(record) {
			const all = (await store.getSetting<Cached>('directoryCache')) ?? {};
			await store.setSetting('directoryCache', { ...all, [url]: record });
		}
	};
}

/** The test seed, in a phone debug build only (`VITE_YIPDEN_DIRECTORY_SEED=1`, set by android:apk). */
const SEED = __YIPDEN_DEBUG__ && import.meta.env.VITE_YIPDEN_DIRECTORY_SEED === '1';

function listId(url: string): string {
	const parsed = new URL(url);
	return `${parsed.hostname}${parsed.pathname}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

/** Which format a published list is in, from its first good entry. */
export function listFormat(json: unknown): 'directory' | 'ring' | null {
	if (typeof json !== 'object' || json === null) return null;
	const entries = (json as { entries?: unknown }).entries;
	if (!Array.isArray(entries)) return null;
	for (const entry of entries) {
		if (typeof entry !== 'object' || entry === null) continue;
		if ('creator' in entry && 'source_url' in entry) return 'ring';
		if ('name' in entry) return 'directory';
	}
	return null;
}

class DiscoverSources {
	toggles = $state<SourceToggles>({});
	lists = $state<AddedList[]>([]);
	/** People from YipDen's directory and the reader's lists, each knowing its source. */
	people = $state<DirectoryPerson[][]>([]);
	optOuts = $state<ReadonlySet<string>>(new Set());
	/** True once the opt-out list has been read, from the network or a saved copy. */
	optOutsKnown = $state(false);
	/** Bumped whenever what Discover should show has changed. */
	version = $state(0);

	private settingsRead: Promise<void> | null = null;
	private loading: Promise<void> | null = null;

	isOn(id: string): boolean {
		return this.toggles[id] !== false;
	}

	readSettings(): Promise<void> {
		this.settingsRead ??= (async () => {
			await store.init();
			this.toggles = (await store.getSetting<SourceToggles>('discoverSources')) ?? {};
			this.lists = (await store.getSetting<AddedList[]>('addedLists')) ?? [];
		})();
		return this.settingsRead;
	}

	load(force = false): Promise<void> {
		if (this.loading && !force) return this.loading;
		this.loading = this.run();
		return this.loading;
	}

	private async run(): Promise<void> {
		await this.readSettings();
		const network = { fetch: httpFetch, revalidate: isNative() };

		let optOuts: OptOutDocument | null;
		let directory: DirectoryPerson[] = [];
		if (SEED) {
			const [seed, seedOptOuts] = await Promise.all([
				import('../../../../directory/seed/people.test.json'),
				import('../../../../directory/seed/optouts.test.json')
			]);
			optOuts = validateOptOuts(seedOptOuts.default);
			directory = validateDirectory(seed.default).document.entries.map((entry) =>
				personFromDirectoryEntry(entry, {
					source: 'yipden',
					sourceName: 'YipDen',
					listing: entry.listing ?? 'curated'
				})
			);
		} else {
			const loaded = await loadDocument<OptOutDocument>({
				url: OPTOUTS_URL,
				fetch: httpFetch,
				parse: validateOptOuts,
				cache: settingCache<OptOutDocument>(OPTOUTS_URL),
				revalidate: isNative()
			});
			optOuts = loaded.document;
			if (this.isOn('yipden')) {
				directory = (
					await yipdenSource({
						...network,
						url: DIRECTORY_URL,
						cache: settingCache<DirectoryDocument>(DIRECTORY_URL)
					}).load()
				).people;
			}
		}

		const fromLists = await Promise.all(
			this.lists
				.filter((list) => this.isOn(`list:${list.id}`))
				.map(async (list) => {
					const source = listSource({
						...network,
						id: list.id,
						name: list.name,
						url: list.url,
						format: list.format,
						cache: settingCache<DirectoryDocument>(list.url)
					});
					return (await source.load()).people;
				})
		);

		this.optOuts = new Set(optOuts?.hashes ?? []);
		this.optOutsKnown = optOuts !== null;
		this.people = [this.isOn('yipden') ? directory : [], ...fromLists];
		this.version += 1;
	}

	async setOn(id: string, on: boolean): Promise<void> {
		await this.readSettings();
		this.toggles = { ...this.toggles, [id]: on };
		await store.setSetting('discoverSources', this.toggles);
		await this.load(true);
	}

	/**
	 * Add a creator list by its address: YipDen's directory format or an IndieNodes-style
	 * `ring.json`. It is read once now, so a wrong address is said at once rather than later.
	 */
	async addList(rawUrl: string, rawName: string): Promise<AddedList> {
		await this.readSettings();
		const url = safeUrl(rawUrl.trim());
		if (!url) throw new Error('That is not a public https address.');
		const response = await loadDocument<unknown>({
			url: url.toString(),
			fetch: httpFetch,
			parse: (json) => json
		});
		const format = response.document === null ? null : listFormat(response.document);
		if (!format) {
			throw new Error('No creator list there: it should be a people.json or a ring.json.');
		}
		const id = listId(url.toString());
		if (this.lists.some((list) => list.id === id)) throw new Error('That list is already added.');
		const list: AddedList = {
			id,
			name: rawName.trim().slice(0, 80) || url.hostname.replace(/^www\./, ''),
			url: url.toString(),
			format,
			addedAt: new Date().toISOString()
		};
		this.lists = [...this.lists, list];
		await store.setSetting('addedLists', this.lists);
		await this.load(true);
		return list;
	}

	async removeList(id: string): Promise<void> {
		await this.readSettings();
		this.lists = this.lists.filter((list) => list.id !== id);
		await store.setSetting('addedLists', this.lists);
		const { [`list:${id}`]: _removed, ...rest } = this.toggles;
		void _removed;
		this.toggles = rest;
		await store.setSetting('discoverSources', this.toggles);
		await this.load(true);
	}
}

export const discoverSources = new DiscoverSources();
