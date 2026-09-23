/**
 * Saving a text file to the reader's device.
 *
 * This is the browser's own mechanism: a Blob, an object URL, and a click on a hidden anchor
 * with `download` set. It works in every browser this app tests in and in a Capacitor WebView
 * reaches for it too, though Android's own "Save As" sheet on top of it is a WebView behavior
 * this app does not control.
 *
 * A native `@capacitor/filesystem` and `@capacitor/share` pair would give a more reliable,
 * predictable save-and-share flow, but both are native dependencies, and native dependencies
 * are asked about before they are added. This is the without-asking answer for v0.9; see
 * DECISIONS.md.
 */
export function downloadTextFile(filename: string, contents: string, mimeType = 'text/xml'): void {
	const blob = new Blob([contents], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.rel = 'noopener';
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

/** Opens the system file picker and resolves with the chosen file's text, or null if canceled. */
export function pickTextFile(accept: string): Promise<string | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.style.position = 'fixed';
		input.style.opacity = '0';
		input.style.pointerEvents = 'none';

		const cleanup = () => input.remove();

		input.addEventListener('change', () => {
			const file = input.files?.[0];
			if (!file) {
				cleanup();
				resolve(null);
				return;
			}
			file
				.text()
				.then((text) => {
					cleanup();
					resolve(text);
				})
				.catch(() => {
					cleanup();
					resolve(null);
				});
		});

		// Canceling the picker fires no event in most browsers; a window focus back is the
		// closest signal, given after the change event would have already fired if one came.
		window.addEventListener(
			'focus',
			() =>
				setTimeout(() => {
					if (document.body.contains(input)) {
						cleanup();
						resolve(null);
					}
				}, 300),
			{ once: true }
		);

		document.body.appendChild(input);
		input.click();
	});
}
