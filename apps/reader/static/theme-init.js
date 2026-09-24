/*
 * Applied before first paint, so the app never renders light and then flips to dark.
 *
 * A separate file rather than an inline script because the Content Security Policy is
 * script-src 'self' with no unsafe-inline, and that directive is worth more than one request
 * from local storage.
 */
try {
	var storedTheme = localStorage.getItem('yipden:theme');
	if (storedTheme === 'light' || storedTheme === 'dark') {
		document.documentElement.dataset.theme = storedTheme;
	}

	var storedSkin = localStorage.getItem('yipden:skin');
	if (storedSkin === 'glass' || storedSkin === 'forest') {
		document.documentElement.dataset.skin = storedSkin;
	}
} catch {
	/* Private mode, or site data blocked. The defaults are a fine answer. */
}
