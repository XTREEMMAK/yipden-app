import { readPartnerRing, type PartnerRingResult } from '@yipden/ring-client';
import { partnerSources } from './partner/registry.js';
import { store } from './store/index.js';

/**
 * Discover's other rings.
 *
 * Kept completely apart from `ring.svelte.ts`: a partner member is a different type from a ring
 * entry, is never in the IndieNodes rotation or its filters, and is only ever shown under its own
 * ring's name. Choosing a ring here changes what Discover shows; it never changes what Discover's
 * rotation contains.
 */

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

	/** Pull to refresh: read every registered ring again, ignoring what `load()` already cached. */
	reload(): Promise<void> {
		this.started = this.run();
		return this.started;
	}

	private async run(): Promise<void> {
		this.status = 'loading';
		await store.init();
		// The same reader preference IndieNodes' own `explicit` field already answers to: hidden
		// unless a reader opts in, since this app does not vet a partner ring's members itself.
		const includeSensitive = (await store.getSetting<boolean>('includeExplicit')) === true;

		// In parallel, not one ring at a time: these are independent fetches to unrelated hosts,
		// and reading them serially meant every ring after the first sat waiting for no reason,
		// stretching how long the switch-ring button took to even appear.
		const sources = await partnerSources();
		const outcomes = await Promise.allSettled(
			sources.map((source) => source.load().then((document) => ({ source, document })))
		);

		const results: PartnerRingResult[] = [];
		for (const outcome of outcomes) {
			if (outcome.status === 'rejected') continue; // A ring that cannot be read is simply absent.
			try {
				const { source, document } = outcome.value;
				const result = readPartnerRing(source.adapter, document);
				const members = includeSensitive
					? result.members
					: result.members.filter((member) => member.sensitive !== true);
				if (members.length) results.push({ ...result, members });
			} catch {
				// Read as a stranger's page, not a schema: a malformed one must never break Discover.
			}
		}
		this.rings = results;
		this.status = 'ready';
	}

	select(id: string | null): void {
		this.selectedId = id !== null && this.rings.some((entry) => entry.ring.id === id) ? id : null;
	}
}

export const partners = new PartnerRingsState();
