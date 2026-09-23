/*
 * Applied before first paint, so the app never renders light and then flips to dark.
 *
 * A separate file rather than an inline script because the Content Security Policy is
 * script-src 'self' with no unsafe-inline, and that directive is worth more than one request
 * from local storage.
 */
try {
	var stored = localStorage.getItem('yipden:theme');
	if (stored === 'light' || stored === 'dark') {
		document.documentElement.dataset.theme = stored;
	}
} catch {
	/* Private mode, or site data blocked. The system theme is a fine answer. */
}
