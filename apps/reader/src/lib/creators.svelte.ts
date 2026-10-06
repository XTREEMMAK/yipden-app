import { resolveProfile } from '@yipden/feeds';
import { safeUrl } from '@yipden/ring-client';
import { isUnder, PLATFORM_NAMES } from './sources.js';
import { store } from './store/index.js';
import type { CreatorRecord, HomeKind } from './store/types.js';
import { verdictKey } from './verdicts.svelte.js';

/**
 * The Creator Database's step 2 (2026-10-06): one creator, several addresses, and a home.
 *
 * YipDen is website-first, not website-only. A creator's home is the best address known for them,
 * their own domain first, so someone with only a Bluesky account is still a full entry, shown
 * honestly as having no site of their own; when they get one, it becomes their home.
 *
 * Most creators have one address and no record here. A record is written only when the reader
 * says two addresses are the same person, or picks a home. Its `id` is the key everything about
 * them is already filed under, so nothing moves; see `CreatorRecord`.
 */

/** Hosts where people make their own hand-made sites, each site at its own subdomain. */
const SITE_HOSTS = [
	'neocities.org',
	'nekoweb.org',
	'github.io',
	'gitlab.io',
	'codeberg.page',
	'pages.dev',
	'netlify.app',
	'vercel.app',
	'glitch.me',
	'carrd.co',
	'bearblog.dev',
	'micro.blog',
	'omg.lol',
	'wordpress.com',
	'blogspot.com',
	'substack.com',
	'tilde.club',
	'tilde.town',
	'sdf.org'
];

/**
 * Platforms a creator can post to but cannot take their readers away from: every known platform
 * but the hosts of hand-made sites and Bluesky (an open protocol, ranked by `resolveProfile`).
 */
const CLOSED_HOSTS = Object.keys(PLATFORM_NAMES).filter(
	(host) => !SITE_HOSTS.includes(host) && host !== 'bsky.app'
);

const HOME_ORDER: readonly HomeKind[] = [
	'own-site',
	'hosted-site',
	'open-profile',
	'closed-profile'
];

function hostOf(url: string): string | null {
	const parsed = safeUrl(url);
	return parsed ? parsed.hostname.toLowerCase().replace(/^www\./, '') : null;
}

const under = (host: string, names: readonly string[]) => names.some((name) => isUnder(host, name));

/** What kind of home an address would make. */
export function homeKindOf(url: string): HomeKind {
	const host = hostOf(url);
	if (!host) return 'closed-profile';
	const resolved = resolveProfile(url);
	const kind =
		resolved.status === 'resolved'
			? resolved.match.kind
			: resolved.status === 'needs-page'
				? resolved.kind
				: null;
	// Bluesky, Mastodon and PeerTube: open protocols a creator can leave with their followers.
	if (kind === 'bluesky' || kind === 'mastodon' || kind === 'peertube') return 'open-profile';
	if (under(host, CLOSED_HOSTS)) return 'closed-profile';
	// A site on a host, unless it is the host's own front page or a profile on it.
	if (under(host, SITE_HOSTS)) {
		return SITE_HOSTS.includes(host) ? 'closed-profile' : 'hosted-site';
	}
	return 'own-site';
}

/** The strongest of several addresses, in the order given when two are as strong. */
export function strongestHome(urls: readonly string[]): string | null {
	let best: { url: string; rank: number } | null = null;
	for (const url of urls) {
		const rank = HOME_ORDER.indexOf(homeKindOf(url));
		if (!best || rank < best.rank) best = { url, rank };
	}
	return best?.url ?? null;
}

/** How a home is described on a profile. */
export const HOME_LABELS: Record<HomeKind, string> = {
	'own-site': 'Their own site',
	'hosted-site': 'Their hand-made site',
	'open-profile': 'No site of their own: an open profile',
	'closed-profile': 'No site of their own: a platform profile'
};

class CreatorsState {
	records = $state<CreatorRecord[]>([]);
	loaded = $state(false);
	private loading: Promise<void> | null = null;

	/** Every key a creator is filed under, to the creator's own id. */
	private byKey = $derived(
		new Map(
			this.records.flatMap((record) => [
				[record.id, record] as const,
				...record.aliases.map((alias) => [alias.key, record] as const)
			])
		)
	);

	load(): Promise<void> {
		this.loading ??= (async () => {
			await store.init();
			this.records = await store.listCreators();
			this.loaded = true;
		})();
		return this.loading;
	}

	/** The record an address belongs to, if it has one. */
	recordFor(url: string): CreatorRecord | null {
		return this.byKey.get(verdictKey(url)) ?? null;
	}

	/** The creator an address is: their own id when linked to others, else its own key. */
	idFor(url: string): string {
		return this.recordFor(url)?.id ?? verdictKey(url);
	}

	/**
	 * Every address that is this creator, theirs first: the one they are filed under, then what
	 * was linked to it. `url` itself when nothing was.
	 */
	addressesFor(url: string): string[] {
		const record = this.recordFor(url);
		if (!record) return [url];
		const first = record.home;
		const rest = [record.id, ...record.aliases.map((alias) => alias.key)]
			.map((key) => (key === verdictKey(first) ? null : this.urlForKey(record, key)))
			.filter((entry): entry is string => entry !== null);
		return [first, ...rest];
	}

	/** Their home: the chosen or strongest address, or `url` itself for an unlinked creator. */
	homeFor(url: string): string {
		return this.recordFor(url)?.home ?? url;
	}

	private urlForKey(record: CreatorRecord, key: string): string {
		if (key === record.id) return record.url;
		return record.aliases.find((alias) => alias.key === key)?.url ?? record.url;
	}

	/**
	 * Say `other` is the same person as `url`. Whatever either was linked to comes along, and the
	 * home becomes the strongest address of all, unless the reader had chosen one.
	 */
	async merge(url: string, other: string): Promise<CreatorRecord | null> {
		await this.load();
		const target = safeUrl(url)?.toString();
		const incoming = safeUrl(other)?.toString();
		if (!target || !incoming || this.idFor(target) === this.idFor(incoming)) return null;

		const now = new Date().toISOString();
		const base = this.recordFor(target);
		const joining = this.recordFor(incoming);
		const id = base?.id ?? verdictKey(target);
		const idUrl = base?.url ?? target;
		const known = new Map<string, string>();
		const add = (address: string) => {
			const key = verdictKey(address);
			if (key !== id && !known.has(key)) known.set(key, address);
		};
		for (const alias of base?.aliases ?? []) add(alias.url);
		add(target);
		if (joining) {
			add(this.urlForKey(joining, joining.id));
			for (const alias of joining.aliases) add(alias.url);
		}
		add(incoming);

		const addresses = [base?.home ?? target, ...known.values()];
		const homeChosen = Boolean(base?.homeChosen);
		const home = homeChosen && base ? base.home : (strongestHome(addresses) ?? target);
		const record: CreatorRecord = {
			id,
			url: idUrl,
			home,
			homeKind: homeKindOf(home),
			...(homeChosen ? { homeChosen } : {}),
			aliases: [...known.entries()].map(([key, address]) => ({
				url: address,
				key,
				addedAt:
					base?.aliases.find((alias) => alias.key === key)?.addedAt ??
					joining?.aliases.find((alias) => alias.key === key)?.addedAt ??
					now
			})),
			updatedAt: now
		};
		await store.putCreator(record);
		if (joining) await store.removeCreator(joining.id);
		this.records = [
			record,
			...this.records.filter((entry) => entry.id !== id && entry.id !== joining?.id)
		];
		return record;
	}

	/** Take one address back out. A record left with nothing linked is removed. */
	async unlink(url: string): Promise<void> {
		await this.load();
		const record = this.recordFor(url);
		const key = verdictKey(url);
		if (!record || key === record.id) return;
		const aliases = record.aliases.filter((alias) => alias.key !== key);
		const addresses = [this.urlForKey(record, record.id), ...aliases.map((alias) => alias.url)];
		if (!aliases.length && !record.homeChosen) {
			await store.removeCreator(record.id);
			this.records = this.records.filter((entry) => entry.id !== record.id);
			return;
		}
		const homeGone = verdictKey(record.home) === key;
		const home =
			homeGone || !record.homeChosen ? (strongestHome(addresses) ?? addresses[0]!) : record.home;
		const next: CreatorRecord = {
			...record,
			home,
			homeKind: homeKindOf(home),
			...(homeGone ? { homeChosen: false } : {}),
			aliases,
			updatedAt: new Date().toISOString()
		};
		await store.putCreator(next);
		this.records = this.records.map((entry) => (entry.id === record.id ? next : entry));
	}

	/** The reader's own choice of home, among the creator's addresses. */
	async chooseHome(url: string, home: string): Promise<void> {
		await this.load();
		const safeHome = safeUrl(home)?.toString();
		if (!safeHome) return;
		const record = this.recordFor(url);
		const id = record?.id ?? verdictKey(url);
		const addresses = record ? this.addressesFor(url) : [url];
		if (!addresses.some((address) => verdictKey(address) === verdictKey(safeHome))) return;
		const next: CreatorRecord = {
			id,
			url: record?.url ?? url,
			home: safeHome,
			homeKind: homeKindOf(safeHome),
			homeChosen: true,
			aliases: record?.aliases ?? [],
			updatedAt: new Date().toISOString()
		};
		await store.putCreator(next);
		this.records = [next, ...this.records.filter((entry) => entry.id !== id)];
	}
}

export const creators = new CreatorsState();
