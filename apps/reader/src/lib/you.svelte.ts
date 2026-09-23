import { exportOpml, parseOpml } from './opml.js';
import { store, type Feed, type Person } from './store/index.js';

/**
 * You's own state: the follow list grouped by person, and the actions the brief calls "your
 * follows file." Nothing here talks to the DOM; the page owns file pickers and downloads.
 */

export interface FollowRow {
	person: Person;
	feeds: Feed[];
}

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
		await store.unfollow(personId);
		this.rows = this.rows.filter((row) => row.person.id !== personId);
	}

	async clearCachedYips(): Promise<void> {
		await store.clearYips();
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
				failures: 0,
				enabled: true
			}));
			await store.follow(record, feeds);
			feedCount += feeds.length;
		}

		await this.load();
		return { people: imported.length, feeds: feedCount };
	}
}

export const you = new YouState();
