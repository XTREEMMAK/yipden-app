import { goto } from '$app/navigation';
import type { AddTrackResult } from '../creatorNotes.svelte.js';
import { libraryHref } from '../library.js';
import { toast } from '../toast.svelte.js';
import { verdictKey } from '../verdicts.svelte.js';
import type { ReferenceKind } from './types.js';

/** What keeping something says back, in the same words wherever it is kept from. */
export function keepMessage(
	result: AddTrackResult,
	creatorName: string,
	kind: ReferenceKind = 'audio'
): string {
	const things = {
		audio: 'tracks',
		image: 'pictures',
		screenshot: 'screenshots',
		text: 'passages'
	}[kind];
	switch (result) {
		case 'added':
			return 'Kept to Library, on this phone only.';
		case 'already-added':
			return kind === 'audio' ? 'That track is already added.' : 'That is already kept.';
		case 'full':
			return `That is as many ${things} as one creator can have here.`;
		case 'not-own-site':
			return kind === 'text'
				? `That page is not on ${creatorName}’s own site, so it cannot be kept for them.`
				: `That is not on ${creatorName}’s own site. Open their site and keep it from the page that links it.`;
		case 'missing':
			return kind === 'text'
				? 'That page is not there any more.'
				: 'That file is not there any more.';
		case 'unsafe':
			return 'That link cannot be used. It has to be a public https address.';
	}
}

/**
 * Say what keeping did. Something kept gets a View that opens the Library at that creator, with
 * the new item picked out. `beforeView` runs first, for a screen that has to get out of the way
 * (the in-app browser's sheet closes the site).
 */
export function showKept(
	result: AddTrackResult,
	creator: { url: string; name: string },
	kind: ReferenceKind = 'audio',
	beforeView?: () => void
): void {
	const message = keepMessage(result, creator.name, kind);
	if (result !== 'added') {
		toast.show(message);
		return;
	}
	toast.show(message, {
		label: 'View',
		run: () => {
			beforeView?.();
			void goto(libraryHref({ creatorId: verdictKey(creator.url) }));
		}
	});
}
