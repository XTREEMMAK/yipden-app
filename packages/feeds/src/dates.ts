/**
 * Date handling for feeds, which is its own small disaster.
 *
 * RSS specifies RFC 822, Atom specifies RFC 3339, JSON Feed specifies RFC 3339, and real feeds
 * publish whatever their generator felt like. The job here is to get an ISO string or an honest
 * null, never a wrong date, because Feeds is sorted by this and nothing else.
 */

/** A date this far out is a generator bug, not a publication date. */
const MAX_FUTURE_MS = 48 * 60 * 60 * 1000;
const MIN_YEAR = 1990;

/**
 * Parse a feed date into an ISO 8601 string, or null when it cannot be trusted.
 *
 * Null is a real answer, not a failure to be papered over with the current time. A yip stamped
 * "now" because its feed had a malformed date would jump to the top of a chronological reader
 * and stay there, which is exactly the kind of false ranking this product refuses.
 */
export function parseDate(value: unknown, now: Date = new Date()): string | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		// Unix seconds or milliseconds, as some JSON feeds emit.
		const ms = value > 1e11 ? value : value * 1000;
		return validate(new Date(ms), now);
	}
	if (typeof value !== 'string') return null;

	const raw = value.trim();
	if (!raw) return null;

	const direct = new Date(raw);
	if (!Number.isNaN(direct.getTime())) return validate(direct, now);

	// RFC 822 with a named military or obsolete zone that Date refuses, and the common case of
	// a two digit year. Retry with the zone dropped rather than discarding the date entirely.
	const withoutZone = raw.replace(/\s+(?:UT|[A-IK-Za-ik-z])$/, ' GMT');
	const retry = new Date(withoutZone);
	if (!Number.isNaN(retry.getTime())) return validate(retry, now);

	return null;
}

function validate(date: Date, now: Date): string | null {
	const time = date.getTime();
	if (!Number.isFinite(time)) return null;
	if (date.getUTCFullYear() < MIN_YEAR) return null;
	if (time > now.getTime() + MAX_FUTURE_MS) return null;
	return date.toISOString();
}

/** Newest first, with undated items last rather than scattered through the middle. */
export function byPublishedDescending(
	a: { publishedAt: string | null },
	b: { publishedAt: string | null }
): number {
	if (a.publishedAt === b.publishedAt) return 0;
	if (!a.publishedAt) return 1;
	if (!b.publishedAt) return -1;
	return a.publishedAt < b.publishedAt ? 1 : -1;
}

/** "PT1H2M3S", "1:02:03" or "3723", the three spellings podcast feeds use, into seconds. */
export function parseDuration(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
	if (typeof value !== 'string') return undefined;

	const raw = value.trim();
	if (!raw) return undefined;

	if (/^\d+$/.test(raw)) {
		const seconds = Number(raw);
		return seconds > 0 ? seconds : undefined;
	}

	const iso = raw.match(/^P?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
	if (iso && (iso[1] || iso[2] || iso[3])) {
		const total = Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
		return total > 0 ? Math.round(total) : undefined;
	}

	const clock = raw.split(':').map((part) => Number(part.trim()));
	if (clock.length >= 2 && clock.length <= 3 && clock.every((part) => Number.isFinite(part))) {
		const total = clock.reduce((sum, part) => sum * 60 + part, 0);
		return total > 0 ? Math.round(total) : undefined;
	}

	return undefined;
}
