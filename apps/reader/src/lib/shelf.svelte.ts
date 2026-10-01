import { safeUrl } from '@yipden/ring-client';
import { store, type ShelfItem } from './store/index.js';
import { toast } from './toast.svelte.js';

/**
 * The Shelf: links a reader set aside for later, on any member (Saved in You). Built first for
 * sites made for a bigger screen, now offered everywhere; Send hands one to another device.
 *
 * Local to this device, like follows and preferences, and only a list of addresses: nothing here
 * is fetched, mirrored or shared. It leaves the phone only when the reader exports it (see
 * `backup.ts` and `opml.ts`), which is why the Shelf has no export path of its own.
 */

export interface ShelfDraft {
	url: string;
	title: string;
	creator?: string;
	via?: string;
	thumbUrl?: string;
	from: ShelfItem['from'];
}

/** Bounds on what is stored, so one strange title cannot bloat a backup. */
const MAX_TITLE = 300;
const MAX_CREATOR = 100;

/**
 * A stored item from a draft, or null when the address is not one the app will ever open.
 * The address is the identity, so saving the same page twice is one entry.
 */
export function shelfItemFrom(draft: ShelfDraft, now: Date = new Date()): ShelfItem | null {
	const target = safeUrl(draft.url);
	if (!target) return null;
	const url = target.toString();
	const item: ShelfItem = {
		id: url,
		url,
		title: draft.title.trim().slice(0, MAX_TITLE) || target.hostname.replace(/^www\./, ''),
		from: draft.from,
		// An imported date can be anything; an unreadable one becomes the moment of import.
		savedAt: (Number.isNaN(now.getTime()) ? new Date() : now).toISOString()
	};
	const creator = draft.creator?.trim().slice(0, MAX_CREATOR);
	if (creator) item.creator = creator;
	const via = draft.via?.trim().slice(0, MAX_CREATOR);
	if (via) item.via = via;
	const thumb = draft.thumbUrl ? safeUrl(draft.thumbUrl) : null;
	if (thumb) item.thumbUrl = thumb.toString();
	return item;
}

class ShelfState {
	items = $state<ShelfItem[]>([]);
	loaded = $state(false);

	private ids = $derived(new Set(this.items.map((item) => item.id)));

	async load(): Promise<void> {
		await store.init();
		this.items = await store.listShelf();
		this.loaded = true;
	}

	/** Whether this address is on the shelf. Cheap enough to call from a template. */
	has(url: string): boolean {
		const target = safeUrl(url);
		return target ? this.ids.has(target.toString()) : false;
	}

	/** Save when absent, remove when present. Resolves to whether it is now saved. */
	async toggle(draft: ShelfDraft): Promise<boolean> {
		const item = shelfItemFrom(draft);
		if (!item) return false;
		if (this.ids.has(item.id)) {
			await this.remove(item.id);
			return false;
		}
		await store.saveToShelf(item);
		this.items = [item, ...this.items];
		return true;
	}

	async remove(id: string): Promise<void> {
		await store.removeFromShelf(id);
		this.items = this.items.filter((item) => item.id !== id);
	}
}

export const shelf = new ShelfState();

/** What every Save for later button does: toggle, then say what happened. */
export async function toggleShelf(draft: ShelfDraft): Promise<void> {
	try {
		const saved = await shelf.toggle(draft);
		toast.show(saved ? 'Saved for later. Find it under Saved in You.' : 'Removed from Saved.');
	} catch {
		toast.show('Could not save that on this phone.');
	}
}
