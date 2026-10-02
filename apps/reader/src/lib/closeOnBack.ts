/**
 * Phone Back closes whatever is open on top, before it goes anywhere.
 *
 * An overlay that calls this (in `onMount`, returning the result) gets a history entry of its
 * own while it is open, so Android's Back button, or a browser's, lands on that entry's removal
 * and closes the overlay instead of leaving the screen or the app. Closed any other way (its own
 * button, Escape, a tap outside), the entry is taken back out so Back is not left with a step
 * that does nothing.
 *
 * `key` marks the entry. Overlays stack (a picture opened inside a partner ring's panel, which
 * has an entry itself): an overlay only closes when the entry now on top is no longer its own.
 */
export function closeOnBack(key: string, onclose: () => void): () => void {
	window.history.pushState({ ...window.history.state, [key]: true }, '', window.location.href);
	let open = true;

	const onPopState = () => {
		// Still on this overlay's entry: something opened above it was what closed.
		if (!open || window.history.state?.[key]) return;
		open = false;
		onclose();
	};
	window.addEventListener('popstate', onPopState);

	return () => {
		window.removeEventListener('popstate', onPopState);
		if (open && window.history.state?.[key]) window.history.back();
		open = false;
	};
}
