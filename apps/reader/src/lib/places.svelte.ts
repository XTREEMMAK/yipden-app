import { FeedHttp, linksBackTo, scanPage } from '@yipden/feeds';
import { safeUrl } from '@yipden/ring-client';
import type { SiteFacts } from './creatorProfile.svelte.js';
import { hostOf } from './hosts.js';
import { httpFetch } from './platform/http.js';
import { isUnder } from './sources.js';
import { store } from './store/index.js';
import type { PlaceEvidence, PlaceRecord, PlaceRole } from './store/types.js';
import { verdictKey } from './verdicts.svelte.js';

/**
 * Where a creator is, and how sure that is (the Creator Database, step 3, 2026-10-06).
 *
 * Their own site is the strongest witness: a place it names as theirs (`rel=me`) is filled in
 * the moment their profile reads it, and a place that names their site back is linked both ways.
 * The reader adds what the site does not say, and their word is recorded as theirs alone. A
 * place's standing comes from that evidence, never from how many people agree; this is what the
 * v2.0 shared table will mirror.
 */

/** Strongest first. */
export const EVIDENCE_ORDER: readonly PlaceEvidence[] = [
	'two-way',
	'their-site',
	'their-page',
	'you'
];

export const EVIDENCE_LABELS: Record<PlaceEvidence, string> = {
	'two-way': 'Linked both ways',
	'their-site': 'Their site says it is theirs',
	'their-page': 'Their site links it',
	you: 'Added by you'
};

export const ROLE_LABELS: Record<PlaceRole, string> = {
	profile: 'Profile',
	site: 'Site',
	shop: 'Shop',
	commissions: 'Commissions',
	support: 'Support'
};

const SHOP_HOSTS = [
	'etsy.com',
	'gumroad.com',
	'bigcartel.com',
	'storenvy.com',
	'myshopify.com',
	'itch.io',
	'redbubble.com',
	'teepublic.com',
	'inprnt.com'
];
const SUPPORT_HOSTS = [
	'patreon.com',
	'ko-fi.com',
	'buymeacoffee.com',
	'liberapay.com',
	'opencollective.com',
	'subscribestar.com'
];
const COMMISSION_HOSTS = ['vgen.co', 'artistree.io'];

/** What a place most likely is, from its address. The reader can say otherwise. */
export function roleOf(url: string): PlaceRole {
	const host = hostOf(url).toLowerCase();
	const path = safeUrl(url)?.pathname.toLowerCase() ?? '';
	if (COMMISSION_HOSTS.some((name) => isUnder(host, name)) || /commission/.test(path))
		return 'commissions';
	if (SHOP_HOSTS.some((name) => isUnder(host, name)) || /\/(shop|store)\b/.test(path))
		return 'shop';
	if (SUPPORT_HOSTS.some((name) => isUnder(host, name))) return 'support';
	return 'profile';
}

/** Re-look for a two-way link no more often than this. */
const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;
/** Places checked for a two-way link per profile visit: a few polite requests, not a crawl. */
const CHECKS_PER_VISIT = 6;

/** Within one strength: where they are first, then where to buy from or support them. */
const ROLE_ORDER: readonly PlaceRole[] = ['profile', 'site', 'shop', 'commissions', 'support'];

const placeId = (creatorKey: string, key: string) => `${creatorKey}::${key}`;
const rank = (evidence: PlaceEvidence) => EVIDENCE_ORDER.indexOf(evidence);

class PlacesState {
	records = $state<PlaceRecord[]>([]);
	loaded = $state(false);
	private loading: Promise<void> | null = null;
	/** The polite client two-way checks go through; a test hands in its own. */
	http: FeedHttp | null = null;

	load(): Promise<void> {
		this.loading ??= (async () => {
			await store.init();
			this.records = await store.listPlaces();
			this.loaded = true;
		})();
		return this.loading;
	}

	/** A creator's places, under any of their keys: strongest evidence first, hidden ones out. */
	placesFor(creatorKeys: ReadonlySet<string>): PlaceRecord[] {
		const seen = new Set<string>();
		return this.records
			.filter((record) => creatorKeys.has(record.creatorKey) && !record.hidden)
			.sort(
				(a, b) =>
					rank(a.evidence) - rank(b.evidence) ||
					ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
					a.key.localeCompare(b.key)
			)
			.filter((record) => {
				if (seen.has(record.key)) return false;
				seen.add(record.key);
				return true;
			});
	}

	private async save(record: PlaceRecord): Promise<void> {
		await store.putPlace(record);
		this.records = [record, ...this.records.filter((entry) => entry.id !== record.id)];
	}

	private async drop(id: string): Promise<void> {
		await store.removePlace(id);
		this.records = this.records.filter((entry) => entry.id !== id);
	}

	/**
	 * Bring a creator's places in line with what their site says now. A place it names becomes
	 * theirs-by-their-site (never lowered from two-way); one it stopped naming loses that standing
	 * and goes, unless the reader added it too. Places the reader hid stay hidden.
	 */
	async syncFromSite(creatorKey: string, facts: SiteFacts): Promise<void> {
		await this.load();
		const now = new Date().toISOString();
		const named = new Map(facts.places.map((place) => [verdictKey(place.url), place.url]));
		for (const [key, url] of named) {
			const id = placeId(creatorKey, key);
			const existing = this.records.find((record) => record.id === id);
			if (existing?.hidden) continue;
			if (existing && rank(existing.evidence) <= rank('their-site')) continue;
			await this.save({
				id,
				creatorKey,
				url: existing?.url ?? url,
				key,
				role: existing?.role ?? roleOf(url),
				evidence: 'their-site',
				addedAt: existing?.addedAt ?? now
			});
		}
		const linked = new Set(facts.linked);
		for (const record of this.records.filter((entry) => entry.creatorKey === creatorKey)) {
			if (record.hidden || named.has(record.key)) continue;
			if (record.evidence === 'two-way' || record.evidence === 'their-site') {
				// No longer named: still linked is still something, otherwise it goes.
				if (linked.has(record.key)) await this.save({ ...record, evidence: 'their-page' });
				else await this.drop(record.id);
			} else if (record.evidence === 'you' && linked.has(record.key)) {
				await this.save({ ...record, evidence: 'their-page' });
			}
		}
	}

	/**
	 * Look for the other half of a two-way link: the place's own page naming their site with
	 * `rel=me`. Mastodon profiles do; many platforms render with script and say nothing, so a
	 * place that cannot be shown two-way keeps the standing it has.
	 */
	async verify(creatorKey: string, siteUrls: readonly string[], now = Date.now()): Promise<void> {
		await this.load();
		const due = this.records.filter(
			(record) =>
				record.creatorKey === creatorKey &&
				!record.hidden &&
				record.evidence === 'their-site' &&
				(!record.checkedAt || now - Date.parse(record.checkedAt) > RECHECK_MS)
		);
		this.http ??= new FeedHttp({ fetch: httpFetch });
		for (const record of due.slice(0, CHECKS_PER_VISIT)) {
			let backs = false;
			try {
				const response = await this.http.get(record.url, { accept: 'text/html' });
				const page = scanPage(response.body, response.url);
				backs = siteUrls.some((site) => linksBackTo(page, site));
			} catch {
				// Unreachable or refused: asked again next month.
			}
			const current = this.records.find((entry) => entry.id === record.id) ?? record;
			await this.save({
				...current,
				...(backs ? { evidence: 'two-way' as const } : {}),
				checkedAt: new Date(now).toISOString()
			});
		}
	}

	/**
	 * A place the reader adds. Their site is asked first: what it names or links is recorded at
	 * that strength, so the reader's say-so is only ever the last word, not the only one.
	 */
	async add(
		creatorKey: string,
		url: string,
		role: PlaceRole,
		facts: SiteFacts | null | undefined
	): Promise<PlaceRecord | null> {
		await this.load();
		const safe = safeUrl(url)?.toString();
		if (!safe) return null;
		const key = verdictKey(safe);
		const id = placeId(creatorKey, key);
		const existing = this.records.find((record) => record.id === id);
		const evidence: PlaceEvidence = facts?.places.some((place) => verdictKey(place.url) === key)
			? 'their-site'
			: facts?.linked.includes(key)
				? 'their-page'
				: 'you';
		const best =
			existing && rank(existing.evidence) < rank(evidence) ? existing.evidence : evidence;
		const record: PlaceRecord = {
			id,
			creatorKey,
			url: safe,
			key,
			role,
			evidence: best,
			addedAt: existing?.addedAt ?? new Date().toISOString()
		};
		await this.save(record);
		return record;
	}

	/** Take a place away: the reader's own goes; one their site names is hidden, so it stays gone. */
	async remove(record: PlaceRecord): Promise<void> {
		await this.load();
		if (record.evidence === 'you') await this.drop(record.id);
		else await this.save({ ...record, hidden: true });
	}

	async setRole(record: PlaceRecord, role: PlaceRole): Promise<void> {
		await this.save({ ...record, role });
	}
}

export const places = new PlacesState();
