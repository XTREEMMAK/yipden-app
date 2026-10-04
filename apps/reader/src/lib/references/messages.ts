import type { AddTrackResult } from '../creatorNotes.svelte.js';
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
			return `Added to ${creatorName}, on this phone only.`;
		case 'already-added':
			return kind === 'audio' ? 'That track is already added.' : 'That is already kept.';
		case 'full':
			return `That is as many ${things} as one creator can have here.`;
		case 'not-own-site':
			return kind === 'text'
				? `That page is not on ${creatorName}’s own site, so it cannot be kept for them.`
				: `That is not on ${creatorName}’s own site, so it cannot be kept for them.`;
		case 'missing':
			return kind === 'text'
				? 'That page is not there any more.'
				: 'That file is not there any more.';
		case 'unsafe':
			return 'That link cannot be used. It has to be a public https address.';
	}
}
