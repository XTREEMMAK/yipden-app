import { safeUrl } from '@yipden/ring-client';

/**
 * Resolve a URL found in a feed against the document it came from, then check it.
 *
 * Feeds are full of relative links, and a relative link is only meaningful next to the address
 * it was published at. Resolution happens first so the safety check sees the address the device
 * would actually request, not the fragment the feed wrote down.
 */
export function absoluteUrl(value: unknown, baseUrl?: string): string | null {
	if (typeof value !== 'string') return null;
	const raw = value.trim();
	if (!raw || raw.startsWith('#')) return null;

	try {
		const resolved = baseUrl ? new URL(raw, baseUrl).toString() : raw;
		return safeUrl(resolved)?.toString() ?? null;
	} catch {
		return null;
	}
}

/** Two URLs that differ only in scheme case, trailing slash or fragment are one URL. */
export function sameUrl(a: string | null, b: string | null): boolean {
	if (!a || !b) return false;
	const normalize = (value: string) => value.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
	return normalize(a) === normalize(b);
}
