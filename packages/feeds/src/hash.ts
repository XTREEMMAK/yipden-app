/**
 * A yip's stable id: the same on every device, and on the v2.0 server, for the same entry.
 *
 * SHA-256, written out here rather than taken from WebCrypto, because `crypto.subtle` is async
 * and the parsers that stamp ids on items are not, and because this package must run unchanged
 * in a WebView, in Node and in the v2.0 poller. It hashes a few hundred bytes per yip; speed is
 * not the point, agreement is.
 *
 * Changing anything here (the input layout, the normalization, the length) changes every yip's
 * id everywhere and is a data migration, not a refactor.
 */

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 of a string's UTF-8 bytes, as lowercase hex. */
export function sha256Hex(input: string): string {
	const bytes = new TextEncoder().encode(input);
	const bitLength = bytes.length * 8;
	const padded = new Uint8Array((((bytes.length + 9 + 63) >> 6) << 6) >>> 0);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	// Inputs here are far below 2^32 bits, so the high word of the length is always zero.
	view.setUint32(padded.length - 4, bitLength >>> 0);
	view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));

	const h = new Uint32Array([
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	]);
	const w = new Uint32Array(64);

	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
		for (let i = 16; i < 64; i += 1) {
			const a = w[i - 15]!;
			const b = w[i - 2]!;
			const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
			const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
			w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
		}

		let a = h[0]!;
		let b = h[1]!;
		let c = h[2]!;
		let d = h[3]!;
		let e = h[4]!;
		let f = h[5]!;
		let g = h[6]!;
		let hh = h[7]!;
		for (let i = 0; i < 64; i += 1) {
			const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (hh + s1 + ch + K[i]! + w[i]!) >>> 0;
			const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (s0 + maj) >>> 0;
			hh = g;
			g = f;
			f = e;
			e = (d + t1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) >>> 0;
		}
		h[0] = h[0]! + a;
		h[1] = h[1]! + b;
		h[2] = h[2]! + c;
		h[3] = h[3]! + d;
		h[4] = h[4]! + e;
		h[5] = h[5]! + f;
		h[6] = h[6]! + g;
		h[7] = h[7]! + hh;
	}

	return Array.from(h, (word) => word.toString(16).padStart(8, '0')).join('');
}

/** The URL form every client agrees on: WHATWG-serialized, so host case and default ports match. */
function normalizeFeedId(sourceFeedId: string): string {
	try {
		return new URL(sourceFeedId).href;
	} catch {
		return sourceFeedId;
	}
}

/** 128 bits of the hash: collision-free for any number of yips one reader will ever hold. */
const ID_HEX_LENGTH = 32;

/**
 * A yip's id from its feed's canonical URL and the entry's own identifier.
 *
 * The entry identifier is the feed's own (RSS `guid`, Atom `id`, JSON Feed `id`), else the
 * entry's URL, else its title and date. Parsers already resolve that order into `entryId`;
 * `titleAndDate` is the last resort for a caller holding an entry with neither.
 */
export function stableYipId(
	sourceFeedId: string,
	entryId: string | null | undefined,
	titleAndDate?: { title: string; publishedAt: string | null }
): string {
	const identifier =
		entryId || (titleAndDate ? `${titleAndDate.title}\u0000${titleAndDate.publishedAt ?? ''}` : '');
	return sha256Hex(`${normalizeFeedId(sourceFeedId)}\n${identifier}`).slice(0, ID_HEX_LENGTH);
}
