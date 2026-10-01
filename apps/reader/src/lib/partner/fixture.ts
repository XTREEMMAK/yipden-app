import type { PartnerCandidate } from '@yipden/ring-client';
import type { PartnerSource } from './registry.js';

/**
 * A made up ring in a made up shape, so the tab, the "via" label and the save action can be
 * built and tested before any real partner ring has an adapter. Nothing about this document is a
 * claim about how any real ring publishes, and it is never part of a release build.
 */

const DOCUMENT = {
	ring: { title: 'Fixture Ring', home: 'https://fixture-ring.example/' },
	sites: [
		{
			slug: 'ash-and-ember',
			title: 'Ash & Ember',
			href: 'https://ash.example.com/',
			about: 'Zines about small fires.',
			genre: 'Zines',
			responsive: true
		},
		{
			slug: 'big-monitor-club',
			title: 'Big Monitor Club',
			href: 'https://bmc.example.org/',
			about: 'Dense, wide, best on a big screen.',
			genre: 'Art',
			responsive: false,
			// A platform link, not a file: exercises the honest "Open on X" labelling, not just
			// the "Listen" default a direct file gets.
			sample: 'https://soundcloud.com/bmc/a-track'
		},
		{ title: 'Unsafe entry', href: 'http://insecure.example.com/' }
	]
};

export const fixtureSource: PartnerSource = {
	adapter: {
		ring: { id: 'fixture-ring', name: 'Fixture Ring', hubUrl: 'https://fixture-ring.example/' },
		capabilities: ['layout', 'preview', 'tags'],
		read(document): PartnerCandidate[] {
			const sites = (document as { sites?: unknown }).sites;
			if (!Array.isArray(sites)) return [];
			return sites.map((site) => ({
				id: site?.slug,
				name: site?.title,
				url: site?.href,
				blurb: site?.about,
				layout: site?.responsive === false ? 'desktop-first' : 'mobile-friendly',
				previewUrl: site?.sample,
				tags: site?.genre ? [site.genre] : []
			}));
		}
	},
	load: async () => DOCUMENT
};
