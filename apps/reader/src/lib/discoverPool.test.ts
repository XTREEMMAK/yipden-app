import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	personFromDirectoryEntry,
	validateDirectory,
	validateOptOuts,
	type Person as DirectoryPerson
} from '@yipden/directory';
import seedPeople from '../../../../directory/seed/people.test.json';
import seedOptOuts from '../../../../directory/seed/optouts.test.json';

/**
 * What Discover walks once YipDen's directory and a reader's lists join the ring (DECISIONS.md,
 * 2026-10-14), with the test seed as the directory: Jericho George, and an example person who
 * opted out and must never appear.
 */

const sources = vi.hoisted(() => ({
	toggles: {} as Record<string, boolean>,
	optOutsKnown: true,
	optOuts: new Set<string>(),
	people: [] as DirectoryPerson[][]
}));

vi.mock('./store/index.js', () => ({
	store: {
		init: async () => {},
		readRing: async () => null,
		writeRing: async () => {},
		listPeople: async () => [],
		getSetting: async () => null,
		setSetting: async () => {}
	}
}));
vi.mock('./platform/http.js', () => ({ httpFetch: vi.fn(), isNative: () => false }));
vi.mock('./discoverSources.svelte.js', () => ({
	discoverSources: {
		readSettings: async () => {},
		load: async () => {},
		isOn: (id: string) => sources.toggles[id] !== false,
		get optOutsKnown() {
			return sources.optOutsKnown;
		},
		get optOuts() {
			return sources.optOuts;
		},
		get people() {
			return sources.people;
		}
	}
}));

const { kindsOfEntry, offersRemoval, ring, sourceLabel } = await import('./ring.svelte.js');

const member = (id: string, url: string) => ({
	id,
	creator: id,
	type: 'comic',
	source_url: url,
	why: 'x'
});
const seed = validateDirectory(seedPeople).document.entries.map((entry) =>
	personFromDirectoryEntry(entry, {
		source: 'yipden',
		sourceName: 'YipDen',
		listing: entry.listing ?? 'curated'
	})
);

beforeEach(() => {
	ring.all = [
		member('nori', 'https://frammyjammy.com/'),
		member('sam', 'https://maddox79.neocities.org/')
	];
	ring.pool = [];
	ring.poolReady = false;
	ring.index = 0;
	ring.filter = 'all';
	ring.kind = 'all';
	ring.tag = null;
	sources.toggles = {};
	sources.optOutsKnown = true;
	sources.optOuts = new Set(validateOptOuts(seedOptOuts).hashes);
	sources.people = [seed];
});

const names = () => ring.pool.map((entry) => entry.creator);

describe('Discover’s merged list', () => {
	it('shows the ring’s members and the directory’s people, labelled by where they came from', async () => {
		await ring.rebuild();
		expect(names()).toEqual(expect.arrayContaining(['nori', 'sam', 'Jericho George']));
		const jericho = ring.pool.find((entry) => entry.creator === 'Jericho George')!;
		expect(sourceLabel(jericho)).toBe('Listed by YipDen');
		expect(offersRemoval(jericho)).toBe(true);
		const nori = ring.pool.find((entry) => entry.creator === 'nori')!;
		expect(sourceLabel(nori)).toBe('IndieNodes member');
		expect(offersRemoval(nori)).toBe(false);
	});

	it('never shows the person who opted out', async () => {
		await ring.rebuild();
		expect(names()).not.toContain('Opted Out Example');
	});

	it('shows nobody from the directory until the opt-out list has been read', async () => {
		sources.optOutsKnown = false;
		await ring.rebuild();
		expect(names().sort()).toEqual(['nori', 'sam']);
	});

	it('follows the source switches in Settings', async () => {
		sources.toggles = { indienodes: false };
		await ring.rebuild();
		expect(names()).toEqual(['Jericho George']);
	});

	it('shows one card for someone the ring and the directory both list, as the ring member', async () => {
		sources.people = [
			[
				...seed,
				personFromDirectoryEntry(
					{ id: 'nori-copy', name: 'Nori (directory copy)', site_url: 'https://frammyjammy.com/' },
					{ source: 'yipden', sourceName: 'YipDen', listing: 'curated' }
				)
			]
		];
		await ring.rebuild();
		expect(names().filter((name) => name.startsWith('Nori') || name === 'nori')).toEqual(['nori']);
	});

	it('gives a person with no website a link to visit, and kinds to filter by', async () => {
		await ring.rebuild();
		const jericho = ring.pool.find((entry) => entry.creator === 'Jericho George')!;
		expect(jericho.source_url).toBe('https://jerichords.carrd.co/');
		expect([...kindsOfEntry(jericho)].sort()).toEqual(['listen', 'watch']);
		ring.setKind('watch');
		expect(ring.visible.map((entry) => entry.creator)).toEqual(['Jericho George']);
		ring.setKind('all');
		ring.setTag('composer');
		expect(ring.visible.map((entry) => entry.creator)).toEqual(['Jericho George']);
	});
});
