import { readPartnerRing, type PartnerRingResult } from '@yipden/ring-client';
import { partnerSources, type PartnerSource } from './partner/registry.js';
import { store } from './store/index.js';

/**
 * Discover's other rings.
 *
 * Kept completely apart from `ring.svelte.ts`: a partner member is a different type from a ring
 * entry, is never in the IndieNodes rotation or its filters, and is only ever shown under its own
 * ring's name. Choosing a ring here changes what Discover shows; it never changes what Discover's
 * rotation contains.
 */

/**
 * How long a partner ring's page is trusted before it is asked about again. Rings are edited by
 * hand, a few times a month at most; a day keeps a new member from waiting long without spending a
 * request on every launch. Pull to refresh asks at once regardless.
 */
export const PARTNER_FRESH_MS = 24 * 60 * 60 * 1000;

/** A live ring's last page, kept per ring id with what is needed to ask whether it changed. */
interface CachedPartnerPage {
	document: string;
	etag?: string;
	lastModified?: string;
	checkedAt: string;
}
type PartnerCache = Record<string, CachedPartnerPage>;

/** Read each source's document through its adapter, keeping rings with a usable member. */
function readAll(
	documents: Array<{ source: PartnerSource; document: unknown }>,
	includeSensitive: boolean
): PartnerRingResult[] {
	const results: PartnerRingResult[] = [];
	for (const { source, document } of documents) {
		try {
			const result = readPartnerRing(source.adapter, document);
			const members = includeSensitive
				? result.members
				: result.members.filter((member) => member.sensitive !== true);
			if (members.length) results.push({ ...result, members });
		} catch {
			// Read as a stranger's page, not a schema: a malformed one must never break Discover.
		}
	}
	return results;
}

class PartnerRingsState {
	/** Only rings that were read and have at least one usable member. */
	rings = $state<PartnerRingResult[]>([]);
	/** The ring on screen, or null for IndieNodes' own. */
	selectedId = $state<string | null>(null);
	/**
	 * Whether reading every registered partner ring is still in flight. Each one is a real fetch
	 * of a stranger's page, not something already on the device, so this can genuinely take a
	 * moment; without a way to tell "still loading" apart from "no partner ring is registered at
	 * all," the ring-switch button on Discover simply does not exist yet on a cold launch and
	 * looks the same as it would if nothing had ever been registered.
	 */
	status = $state<'idle' | 'loading' | 'ready'>('idle');

	selected = $derived(this.rings.find((entry) => entry.ring.id === this.selectedId) ?? null);

	private started: Promise<void> | null = null;

	load(): Promise<void> {
		this.started ??= this.run();
		return this.started;
	}

	/** Pull to refresh: ask every registered ring again, however recently it was checked. */
	reload(): Promise<void> {
		this.started = this.run(true);
		return this.started;
	}

	private async run(force = false): Promise<void> {
		if (!this.rings.length) this.status = 'loading';
		await store.init();
		// The same reader preference IndieNodes' own `explicit` field already answers to: hidden
		// unless a reader opts in, since this app does not vet a partner ring's members itself.
		const includeSensitive = (await store.getSetting<boolean>('includeExplicit')) === true;

		const sources = await partnerSources();
		const cache = (await store.getSetting<PartnerCache>('partnerCache')) ?? {};

		// The copies already on this phone go on screen first, so the ring switcher is there at
		// once on a launch rather than after a round trip to a stranger's host.
		if (!this.rings.length) {
			const saved = sources.flatMap((source) => {
				const page = cache[source.adapter.ring.id];
				return source.revalidate && page ? [{ source, document: page.document }] : [];
			});
			const early = readAll(saved, includeSensitive);
			if (early.length) {
				this.rings = early;
				this.status = 'ready';
			}
		}

		// In parallel, not one ring at a time: these are independent fetches to unrelated hosts.
		// A ring checked within `PARTNER_FRESH_MS` is not asked about at all; an older one is asked
		// whether it changed, and an unchanged page costs a 304, not a download.
		const now = Date.now();
		const next: PartnerCache = {};
		const outcomes = await Promise.allSettled(
			sources.map(async (source) => {
				const id = source.adapter.ring.id;
				if (!source.revalidate) return { source, document: await source.load() };

				const saved = cache[id];
				if (saved && !force && now - Date.parse(saved.checkedAt) < PARTNER_FRESH_MS) {
					next[id] = saved;
					return { source, document: saved.document };
				}
				const checkedAt = new Date(now).toISOString();
				try {
					const fetched = await source.revalidate(
						saved
							? {
									...(saved.etag ? { etag: saved.etag } : {}),
									...(saved.lastModified ? { lastModified: saved.lastModified } : {})
								}
							: {}
					);
					if (!fetched.notModified) {
						next[id] = {
							document: fetched.document,
							...(fetched.etag ? { etag: fetched.etag } : {}),
							...(fetched.lastModified ? { lastModified: fetched.lastModified } : {}),
							checkedAt
						};
						return { source, document: fetched.document };
					}
					if (!saved) throw new Error('not modified, with no copy to keep');
					next[id] = { ...saved, checkedAt };
					return { source, document: saved.document };
				} catch (cause) {
					// Unreachable for now: the last good copy stands, and the next launch asks again.
					if (!saved) throw cause;
					next[id] = saved;
					return { source, document: saved.document };
				}
			})
		);

		this.rings = readAll(
			outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : [])),
			includeSensitive
		);
		this.status = 'ready';
		// Rebuilt from this build's sources alone, so a ring switched off stops taking up space.
		await store.setSetting('partnerCache', next);
	}

	select(id: string | null): void {
		this.selectedId = id !== null && this.rings.some((entry) => entry.ring.id === id) ? id : null;
	}
}

export const partners = new PartnerRingsState();
