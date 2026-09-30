import { store, type Verdict, type VerdictRecord } from './store/index.js';

/**
 * Liked and not-for-me creators, for the IndieNodes ring and partner rings alike.
 *
 * One verdict per creator, keyed by their site, so the same person is judged once however they
 * were found. Local to this device, exported only in the reader's own backup.
 */

/** The creator's site without scheme, `www.`, query, hash or trailing slash, lowercased. */
export function verdictKey(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.hostname.replace(/^www\./i, '')}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
	} catch {
		return url.trim().toLowerCase();
	}
}

export interface VerdictDraft {
	url: string;
	name: string;
	source: VerdictRecord['source'];
	via?: string;
	thumbUrl?: string;
}

class VerdictState {
	items = $state<VerdictRecord[]>([]);
	loaded = $state(false);

	private byId = $derived(new Map(this.items.map((item) => [item.id, item])));
	/** Keys of creators marked not for me, for filtering lists. */
	hiddenKeys = $derived(
		new Set(this.items.filter((item) => item.verdict === 'hidden').map((item) => item.id))
	);

	liked = $derived(this.items.filter((item) => item.verdict === 'liked'));
	hidden = $derived(this.items.filter((item) => item.verdict === 'hidden'));

	async load(): Promise<void> {
		await store.init();
		this.items = await store.listVerdicts();
		this.loaded = true;
	}

	verdictFor(url: string): Verdict | null {
		return this.byId.get(verdictKey(url))?.verdict ?? null;
	}

	isHidden(url: string): boolean {
		return this.hiddenKeys.has(verdictKey(url));
	}

	/** Mark a verdict, or take it back when the creator already has that same one. */
	async toggle(draft: VerdictDraft, verdict: Verdict): Promise<Verdict | null> {
		const id = verdictKey(draft.url);
		if (this.byId.get(id)?.verdict === verdict) {
			await this.clear(draft.url);
			return null;
		}
		const record: VerdictRecord = {
			id,
			url: draft.url,
			name: draft.name,
			verdict,
			source: draft.source,
			...(draft.via ? { via: draft.via } : {}),
			...(draft.thumbUrl ? { thumbUrl: draft.thumbUrl } : {}),
			at: new Date().toISOString()
		};
		await store.setVerdict(record);
		this.items = [record, ...this.items.filter((item) => item.id !== id)];
		return verdict;
	}

	async clear(url: string): Promise<void> {
		const id = verdictKey(url);
		await store.removeVerdict(id);
		this.items = this.items.filter((item) => item.id !== id);
	}
}

export const verdicts = new VerdictState();
