/**
 * URL rules the reader applies to every address that arrives in ring data.
 *
 * Ring entries are third-party input, so their URLs reach the device as an `href`, an `<img
 * src>` or an audio source. Two OWASP concerns apply even with no server in the picture:
 * injection (a `javascript:` or `data:` URL rendered into a link) and request forgery (an
 * entry pointing the device at a host on the reader's own network). Both are refused here
 * once, so no caller has to remember.
 */

const MAX_URL_LENGTH = 2000;

/** Hostnames that resolve to the device or its network rather than the public internet. */
const PRIVATE_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback', 'broadcasthost']);
const PRIVATE_SUFFIXES = ['.local', '.localhost', '.internal', '.home.arpa'];

function isPrivateIpv4(host: string): boolean {
	const parts = host.split('.');
	if (parts.length !== 4) return false;
	const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
	if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return false;
	const [a = 0, b = 0] = octets;
	if (a === 10 || a === 127 || a === 0) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	// Carrier-grade NAT, benchmarking, multicast and reserved space.
	if (a === 198 && (b === 18 || b === 19)) return true;
	if (a >= 224) return true;
	return false;
}

function isPrivateIpv6(host: string): boolean {
	const address = host.replace(/^\[|\]$/g, '').toLowerCase();
	if (address === '::1' || address === '::') return true;
	// Unique local (fc00::/7) and link local (fe80::/10).
	if (/^f[cd][0-9a-f]{2}:/.test(address)) return true;
	if (/^fe[89ab][0-9a-f]:/.test(address)) return true;
	// IPv4-mapped addresses carry IPv4 rules with them. The URL parser rewrites the readable
	// ::ffff:127.0.0.1 form into hex groups, so both spellings have to be recognized.
	const dotted = address.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
	if (dotted?.[1]) return isPrivateIpv4(dotted[1]);

	const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (hex?.[1] && hex[2]) {
		const high = parseInt(hex[1], 16);
		const low = parseInt(hex[2], 16);
		const octets = [(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255];
		return isPrivateIpv4(octets.join('.'));
	}

	return false;
}

/** True when a hostname points at the reader's own device or local network. */
export function isPrivateHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	if (PRIVATE_HOSTNAMES.has(host)) return true;
	if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
	if (isPrivateIpv6(host)) return true;
	return isPrivateIpv4(host);
}

/**
 * Parse a ring URL, or return null when it is unsafe to use.
 *
 * https only: the ring's own schema requires it, member media is served over it, and a
 * reader that silently accepted http would downgrade every creator's traffic.
 */
export function safeUrl(value: unknown): URL | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return null;
	}

	if (url.protocol !== 'https:') return null;
	if (url.username || url.password) return null;
	if (!url.hostname || isPrivateHost(url.hostname)) return null;
	return url;
}

/**
 * Canonical string form of a ring URL, or null when unsafe.
 *
 * A bare origin gets its root slash so `https://example.com` and `https://example.com/` are
 * one key; deeper paths keep whatever trailing slash the creator published, because a path
 * is the creator's to spell and rewriting it can miss.
 */
export function normalizeUrl(value: unknown): string | null {
	const url = safeUrl(value);
	if (!url) return null;
	url.hash = '';
	return url.toString();
}

/** Host shown to the reader, with the www prefix dropped. */
export function displayHost(value: unknown): string | null {
	const url = safeUrl(value);
	if (!url) return null;
	return url.hostname.replace(/^www\./, '');
}
