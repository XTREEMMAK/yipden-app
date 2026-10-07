import seed from './sites/seed.json';
import { SITE_CATEGORIES, type SiteEntry, type SitesDocument } from './sites/types.js';
import { validateSites } from './sites/validate.js';
import { store } from './store/index.js';

/**
 * Discover's Surf side: the sites index, a place to wander rather than a ring of people.
 *
 * Kept apart from `ring.svelte.ts` and `partnerRings.svelte.ts` the same way partner rings are
 * kept apart from IndieNodes: a site is a different type from a ring entry, never enters the
 * rotation, and is never a person. See docs/sites-contract.md.
 *
 * Experiment (branch `sites-surf`): the document is the seed bundled with the app. When the real
 * index is published, `loadDocument` becomes a fetch modelled on `ring-client`'s `fetchRing`, and
 * nothing else here changes.
 */

async function loadDocument(): Promise<{ document: unknown; localMedia: boolean }> {
	return { document: seed, localMedia: true };
}

/** "personal" reads as "Personal sites": the chips name what a reader is choosing between. */
const CATEGORY_LABELS: Record<string, string> = {
	shrines: 'Shrines',
	fandom: 'Fandom',
	personal: 'Personal sites',
	blogs: 'Blogs',
	webrings: 'Webrings',
	resources: 'Resources'
};

export function categoryLabel(category: string): string {
	return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** "fandom:sonic" reads as "Sonic": the namespace is for sorting, not for reading. */
export function tagLabel(tag: string): string {
	const bare = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/** Known categories in their own order, then any newer one the index adds, by name. */
export function categoriesOf(entries: readonly SiteEntry[]): Array<{ key: string; count: number }> {
	const counts = new Map<string, number>();
	for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
	const known: readonly string[] = SITE_CATEGORIES;
	return [...counts]
		.map(([key, count]) => ({ key, count }))
		.sort((a, b) => {
			const ai = known.indexOf(a.key);
			const bi = known.indexOf(b.key);
			if (ai !== -1 || bi !== -1) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
			return a.key.localeCompare(b.key);
		});
}

class SitesState {
	/** Every site this reader may see: explicit ones only when they opted in. */
	all = $state<SiteEntry[]>([]);
	status = $state<'idle' | 'loading' | 'ready'>('idle');
	generatedAt = $state<string | null>(null);

	categories = $derived(categoriesOf(this.all));

	private started: Promise<void> | null = null;

	load(): Promise<void> {
		this.started ??= this.run();
		return this.started;
	}

	/** Reads the reader's explicit switch again, after Settings changes it. */
	reload(): Promise<void> {
		this.started = this.run();
		return this.started;
	}

	private async run(): Promise<void> {
		if (!this.all.length) this.status = 'loading';
		await store.init();
		// The same switch the ring's `explicit` and a partner ring's `sensitive` answer to.
		const includeExplicit = (await store.getSetting<boolean>('includeExplicit')) === true;
		let document: SitesDocument = { version: '0', entries: [] };
		try {
			const loaded = await loadDocument();
			document = validateSites(loaded.document, { localMedia: loaded.localMedia }).document;
		} catch {
			// An index that cannot be read leaves Surf empty, never Discover broken.
		}
		this.all = includeExplicit
			? document.entries
			: document.entries.filter((entry) => !entry.explicit);
		this.generatedAt = document.generated_at ?? null;
		this.status = 'ready';
	}

	byUrl(url: string): SiteEntry | null {
		return this.all.find((entry) => entry.url === url) ?? null;
	}
}

export const sites = new SitesState();
