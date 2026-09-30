import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { PartnerAdapter } from '@yipden/ring-client';

/**
 * `vi.resetModules()` gives every call its own module graph, including its own fresh `store`
 * singleton distinct from any statically imported at the top of this file. A setting written
 * through the wrong instance would never reach the one `partnerRings.svelte.ts` actually opens,
 * so any setup that needs one is done here, through the store this same reset epoch resolves.
 */
async function freshState(sources: unknown[], settings: Record<string, unknown> = {}) {
	vi.resetModules();
	vi.doMock('./partner/registry.js', () => ({ partnerSources: async () => sources }));
	const { store } = await import('./store/index.js');
	await store.init();
	for (const [key, value] of Object.entries(settings)) {
		await store.setSetting(key as never, value);
	}
	return (await import('./partnerRings.svelte.js')).partners;
}

const fixture = (await import('./partner/fixture.js')).fixtureSource;

/**
 * fake-indexeddb schedules its own callbacks with a real timer (`setImmediate`/`setTimeout`), per
 * spec, not a microtask: awaiting a chain of `Promise.resolve()` never lets a pending `store`
 * call (inside `run()`, ahead of any test source's own `load()`) actually settle. A couple of
 * real, zero-delay timer turns does.
 */
function flush(turns = 5): Promise<void> {
	return turns <= 0
		? Promise.resolve()
		: new Promise((resolve) => setTimeout(resolve, 0)).then(() => flush(turns - 1));
}

/** A made-up sensitive-capable ring, so the filtering has something real to filter. */
function sensitiveSource(sensitiveOne: boolean, sensitiveTwo: boolean) {
	const adapter: PartnerAdapter = {
		ring: { id: 'warns-ring', name: 'Warns Ring', hubUrl: 'https://warns.example.com/' },
		capabilities: ['sensitive'],
		read: () => [
			{ name: 'One', url: 'https://one.example.com/', sensitive: sensitiveOne },
			{ name: 'Two', url: 'https://two.example.com/', sensitive: sensitiveTwo }
		]
	};
	return { adapter, load: async () => ({}) };
}

beforeEach(() => {
	vi.resetModules();
	localStorage.clear();
	globalThis.indexedDB = new IDBFactory();
});

describe('partner rings', () => {
	it('offers nothing when no ring is registered, as in a release build', async () => {
		const partners = await freshState([]);
		await partners.load();
		expect(partners.rings).toEqual([]);
		partners.select('fixture-ring');
		expect(partners.selected).toBeNull();
	});

	it('reads a registered ring through its adapter and keeps unsafe members out', async () => {
		const partners = await freshState([fixture]);
		await partners.load();

		expect(partners.rings.map((entry) => entry.ring.name)).toEqual(['Fixture Ring']);
		expect(partners.rings[0]?.members.map((member) => member.name)).toEqual([
			'Ash & Ember',
			'Big Monitor Club'
		]);
		expect(partners.rings[0]?.members[1]?.layout).toBe('desktop-first');
	});

	it('selects a known ring and ignores an unknown one', async () => {
		const partners = await freshState([fixture]);
		await partners.load();

		partners.select('fixture-ring');
		expect(partners.selected?.ring.id).toBe('fixture-ring');
		partners.select('nope');
		expect(partners.selected).toBeNull();
		partners.select('fixture-ring');
		partners.select(null);
		expect(partners.selected).toBeNull();
	});

	it('leaves out a ring whose document cannot be loaded, without breaking the rest', async () => {
		const broken = {
			adapter: fixture.adapter,
			load: async () => Promise.reject(new Error('offline'))
		};
		const partners = await freshState([broken, fixture]);
		await partners.load();
		expect(partners.rings).toHaveLength(1);
	});

	it('hides a member marked sensitive unless the reader opted in to explicit content', async () => {
		const partners = await freshState([sensitiveSource(false, true)]);
		await partners.load();
		expect(partners.rings[0]?.members.map((member) => member.name)).toEqual(['One']);
	});

	it('shows every member once the reader opts in, the same setting IndieNodes uses', async () => {
		const partners = await freshState([sensitiveSource(true, true)], { includeExplicit: true });
		await partners.load();
		expect(partners.rings[0]?.members.map((member) => member.name)).toEqual(['One', 'Two']);
	});

	it('drops a ring entirely when opting out leaves it with no members left', async () => {
		const partners = await freshState([sensitiveSource(true, true)]);
		await partners.load();
		expect(partners.rings).toEqual([]);
	});

	it('reload reads the sources again, rather than reusing what load already cached', async () => {
		let calls = 0;
		const counting = {
			adapter: fixture.adapter,
			load: async () => {
				calls += 1;
				return fixture.load();
			}
		};
		const partners = await freshState([counting]);

		await partners.load();
		await partners.load(); // Memoized: still the one call load() already made.
		expect(calls).toBe(1);

		await partners.reload();
		expect(calls).toBe(2);
		expect(partners.rings.map((entry) => entry.ring.name)).toEqual(['Fixture Ring']);
	});

	it('reports loading while every ring is still being read, then ready once settled', async () => {
		let resolveLoad!: (value: unknown) => void;
		const slow = {
			adapter: fixture.adapter,
			load: () => new Promise((resolve) => (resolveLoad = resolve))
		};
		const partners = await freshState([slow]);

		expect(partners.status).toBe('idle');
		const loaded = partners.load();
		expect(partners.status).toBe('loading');
		await flush();
		resolveLoad(await fixture.load());
		await loaded;
		expect(partners.status).toBe('ready');
	});

	it('reads every ring in parallel, not one after another', async () => {
		const order: string[] = [];
		let releaseFirst!: () => void;
		const first = {
			adapter: { ...fixture.adapter, ring: { ...fixture.adapter.ring, id: 'first' } },
			load: () =>
				new Promise<unknown>((resolve) => {
					releaseFirst = () => resolve(fixture.load());
				}).then((document) => {
					order.push('first');
					return document;
				})
		};
		const second = {
			adapter: { ...fixture.adapter, ring: { ...fixture.adapter.ring, id: 'second' } },
			load: async () => {
				order.push('second');
				return fixture.load();
			}
		};
		const partners = await freshState([first, second]);
		const loaded = partners.load();
		// `second` finishes before `first` is ever released, which a serial, awaited-in-order
		// read of the sources array could not do.
		await flush();
		expect(order).toEqual(['second']);
		releaseFirst();
		await loaded;
		expect(order).toEqual(['second', 'first']);
	});

	it('never reads sensitive from an adapter that did not declare the capability', async () => {
		const undeclared = {
			adapter: { ...fixture.adapter, capabilities: [] as const },
			load: fixture.load
		};
		const partners = await freshState([undeclared]);
		await partners.load();
		expect(partners.rings[0]?.members.every((member) => member.sensitive === undefined)).toBe(true);
	});
});

describe('the registry', () => {
	it('registers no partner ring unless a build and a test both opt in', async () => {
		vi.doUnmock('./partner/registry.js');
		const { partnerSources } = await import('./partner/registry.js');
		expect(await partnerSources()).toEqual([]);
		localStorage.setItem('yipden:partnerFixture', '1');
		// Without the build flag the local opt in alone does nothing.
		expect(await partnerSources()).toEqual([]);
	});

	it('adopts a flag from the URL once, with no console needed, then keeps it on its own', async () => {
		vi.doUnmock('./partner/registry.js');
		try {
			history.pushState({}, '', '/?yipden:partnerMusiciansWebring=1');
			const { partnerSources } = await import('./partner/registry.js');

			expect(await partnerSources()).toHaveLength(1);
			expect(localStorage.getItem('yipden:partnerMusiciansWebring')).toBe('1');

			// The query string is a one-time trigger, not a standing switch: the setting the
			// first load wrote to storage is what a later, plain load without it still reads.
			history.pushState({}, '', '/');
			expect(await partnerSources()).toHaveLength(1);
		} finally {
			history.pushState({}, '', '/');
		}
	});

	it('registers Knifebeetle behind its own flag, independently of the others', async () => {
		vi.doUnmock('./partner/registry.js');
		const { partnerSources } = await import('./partner/registry.js');
		expect(await partnerSources()).toEqual([]);
		localStorage.setItem('yipden:partnerKnifebeetle', '1');
		const sources = await partnerSources();
		expect(sources).toHaveLength(1);
		expect(sources[0]?.adapter.ring.id).toBe('knifebeetle');
	});

	it('never turns anything on from an unrelated query string', async () => {
		vi.doUnmock('./partner/registry.js');
		try {
			history.pushState({}, '', '/?utm_source=somewhere');
			const { partnerSources } = await import('./partner/registry.js');
			expect(await partnerSources()).toEqual([]);
		} finally {
			history.pushState({}, '', '/');
		}
	});
});
