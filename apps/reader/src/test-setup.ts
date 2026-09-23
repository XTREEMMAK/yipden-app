/**
 * jsdom does not implement real media playback and logs a console error every time
 * `HTMLMediaElement.play()` or `.pause()` is called. Stubbing them keeps test output readable;
 * the player's own logic already guards against a non-promise return from `play()` (see
 * `safePlay` in player.svelte.ts), which is the real behavior being defended against here, not
 * just this stub.
 */
if (typeof HTMLMediaElement !== 'undefined') {
	HTMLMediaElement.prototype.play = () => Promise.resolve();
	HTMLMediaElement.prototype.pause = () => {};
	HTMLMediaElement.prototype.load = () => {};
}
