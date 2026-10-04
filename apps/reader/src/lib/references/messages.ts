import type { AddTrackResult } from '../creatorNotes.svelte.js';

/** What keeping something says back, in the same words wherever it is kept from. */
export function keepMessage(result: AddTrackResult, creatorName: string): string {
	switch (result) {
		case 'added':
			return `Added to ${creatorName}, on this phone only.`;
		case 'already-added':
			return 'That track is already added.';
		case 'full':
			return 'That is as many tracks as one creator can have here.';
		case 'not-own-site':
			return `That is not on ${creatorName}’s own site, so it cannot be kept for them.`;
		case 'missing':
			return 'That file is not there any more.';
		case 'unsafe':
			return 'That link cannot be used. It has to be a public https address.';
	}
}
