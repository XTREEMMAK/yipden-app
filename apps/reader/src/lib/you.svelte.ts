import type { DiscoveredFeed, DiscoveryResult } from '@yipden/feeds';
import { discoverWithDeadline } from './discovery.js';
import { exportOpml, parseOpml } from './opml.js';
import { player } from './player.svelte.js';
import { refreshAll, type FeedRefreshResult } from './refresh.js';
import { ringPlayer } from './ringPlayer.svelte.js';
import { store, type Feed, type Person } from './store/index.js';

/**
 * You's own state: the follow list grouped by person, and the actions the brief calls "your
 * follows file." Nothing here talks to the DOM; the page owns file pickers and downloads.
 */

export interface FollowRow {
	person: Person;
	feeds: Feed[];
}

export type AttachSourceResult =
	| { status: 'added'; refresh: FeedRefreshResult['status'] | 'missing' }
	| { status: 'already-attached' }
	| { status: 'belongs-to-other'; personName: string }
	| { status: 'missing-person' };

class YouState {
	rows = $state<FollowRow[]>([]);
	loaded = $state(false);

	async load(): Promise<void> {
		await store.init();
		const [people, feeds] = await Promise.all([store.listPeople(), store.listFeeds()]);
		const byPerson = new Map<string, Feed[]>();
		for (const feed of feeds)
			byPerson.set(feed.personId, [...(byPerson.get(feed.personId) ?? []), feed]);

		this.rows = people.map((person) => ({ person, feeds: byPerson.get(person.id) ?? [] }));
		this.loaded = true;
	}

	async unfollow(personId: string): Promise<void> {
		const person = this.rows.find((row) => row.person.id === personId)?.person;
		await store.unfollow(personId);
		player.removePerson(personId, person?.siteUrl);
		if (person?.ringId) ringPlayer.remove(person.ringId);
		// Do not leave this to the layout's fire-and-forget effect: the app may close now.
		await store.setSetting('ringQueue', ringPlayer.snapshot());
		this.rows = this.rows.filter((row) => row.person.id !== personId);
	}

	async clearCachedYips(): Promise<void> {
		await store.clearYips();
	}

	async setFeedEnabled(
		personId: string,
		feedId: string,
		enabled: boolean
	): Promise<FeedRefreshResult['status'] | 'missing'> {
		const row = this.rows.find((entry) => entry.person.id === personId);
		const feed = row?.feeds.find((entry) => entry.id === feedId);
		if (!feed) return 'missing';

		const updated = { ...feed, enabled };
		await store.updateFeed(updated);
		this.rows = this.rows.map((entry) =>
			entry.person.id === personId
				? {
						...entry,
						feeds: entry.feeds.map((candidate) => (candidate.id === feedId ? updated : candidate))
					}
				: entry
		);

		if (!enabled) return 'disabled';
		const result = await refreshAll({ feedIds: [feedId] });
		return result.feeds[0]?.status ?? 'missing';
	}

	async setPersonEnabled(personId: string, enabled: boolean): Promise<number> {
		const row = this.rows.find((entry) => entry.person.id === personId);
		if (!row) return 0;
		const changed = row.feeds.filter((feed) => feed.enabled !== enabled);
		await Promise.all(changed.map((feed) => store.updateFeed({ ...feed, enabled })));
		if (enabled && changed.length) await refreshAll({ feedIds: changed.map((feed) => feed.id) });
		await this.load();
		return changed.length;
	}

	async refreshPerson(personId: string): Promise<{ checked: number; failed: number }> {
		const row = this.rows.find((entry) => entry.person.id === personId);
		const feedIds = row?.feeds.filter((feed) => feed.enabled).map((feed) => feed.id) ?? [];
		if (!feedIds.length) return { checked: 0, failed: 0 };
		const result = await refreshAll({ feedIds });
		await this.load();
		return {
			checked: result.feeds.length,
			failed: result.feeds.filter((feed) => feed.status === 'failed').length
		};
	}

	async findSources(input: string): Promise<DiscoveryResult> {
		return discoverWithDeadline(input);
	}

	async addSource(personId: string, source: DiscoveredFeed): Promise<AttachSourceResult> {
		const row = this.rows.find((entry) => entry.person.id === personId);
		if (!row) return { status: 'missing-person' };

		const feed: Feed = {
			id: source.url,
			personId,
			url: source.url,
			kind: source.kind,
			title: source.title,
			// Selecting a result proves the source is fetchable, not that this creator owns it.
			verified: false,
			provenance: 'manual',
			failures: 0,
			enabled: true
		};
		const added = await store.addFeed(feed);
		if (added.status === 'belongs-to-other') {
			const owner = this.rows.find((entry) => entry.person.id === added.personId);
			return { status: 'belongs-to-other', personName: owner?.person.name ?? 'another creator' };
		}
		if (added.status === 'already-attached') return added;

		const refresh = await refreshAll({ feedIds: [feed.id] });
		await this.load();
		return { status: 'added', refresh: refresh.feeds[0]?.status ?? 'missing' };
	}

	async retryFeed(
		personId: string,
		feedId: string
	): Promise<FeedRefreshResult['status'] | 'missing'> {
		const row = this.rows.find((entry) => entry.person.id === personId);
		if (!row?.feeds.some((feed) => feed.id === feedId)) return 'missing';
		const refresh = await refreshAll({ feedIds: [feedId] });
		await this.load();
		return refresh.feeds[0]?.status ?? 'missing';
	}

	async removeManualSource(personId: string, feedId: string): Promise<boolean> {
		const row = this.rows.find((entry) => entry.person.id === personId);
		const feed = row?.feeds.find((entry) => entry.id === feedId);
		if (!feed || feed.provenance !== 'manual') return false;
		await store.removeFeed(personId, feedId);
		this.rows = this.rows.map((entry) =>
			entry.person.id === personId
				? { ...entry, feeds: entry.feeds.filter((candidate) => candidate.id !== feedId) }
				: entry
		);
		return true;
	}

	toOpml(): string {
		const feedsByPerson = new Map(this.rows.map((row) => [row.person.id, row.feeds]));
		return exportOpml(
			this.rows.map((row) => row.person),
			feedsByPerson
		);
	}

	/**
	 * Follow everyone an OPML file names.
	 *
	 * Straight from the file's own URLs, with no discovery round trip: OPML already names the
	 * feeds directly, and re-discovering them would be slower and could find something
	 * different than what the reader had before.
	 */
	async importOpml(xml: string): Promise<{ people: number; feeds: number }> {
		const imported = parseOpml(xml);
		let feedCount = 0;

		for (const person of imported) {
			const siteUrl = person.siteUrl ?? person.feeds[0]?.url;
			if (!siteUrl) continue;
			if (await store.isFollowing(siteUrl)) continue;

			const id = `opml:${siteUrl}`;
			const record: Person = {
				id,
				name: person.name,
				siteUrl,
				followedAt: new Date().toISOString()
			};
			const feeds: Feed[] = person.feeds.map((feed) => ({
				id: feed.url,
				personId: id,
				url: feed.url,
				kind: feed.kind,
				title: feed.title,
				verified: false,
				provenance: 'opml',
				failures: 0,
				enabled: feed.enabled !== false
			}));
			await store.follow(record, feeds);
			feedCount += feeds.length;
		}

		await this.load();
		return { people: imported.length, feeds: feedCount };
	}
}

export const you = new YouState();
