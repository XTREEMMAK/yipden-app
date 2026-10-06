/**
 * A site's host the way people say it: `lena.example`, never `www.lena.example`. The address
 * itself when it is not one, so a label never goes blank over a bad link.
 */
export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}
