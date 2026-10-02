/*
 * Derives YipDen_Fox.png (the fox and its howl, without the arch) from YipDen_Logo.webp. See
 * README.md. Needs sharp, installed the same way generate-icons.cjs's tools are.
 *
 * The source is two shapes: the fox, and the arch with the two howl marks fused into it where
 * they cross its stroke. The arch is symmetric and its left side carries no marks, so its band is
 * the left side plus that side mirrored; removing the band frees the marks, and each mark is
 * bridged back across the gap with the hull of its own pieces on either side.
 */
const path = require('path');
const sharp = require('sharp');

const HERE = __dirname;
const SOURCE = path.join(HERE, 'YipDen_Logo.webp');
const OUT = path.join(HERE, 'YipDen_Fox.png');

function components(on, w, h) {
	const label = new Int32Array(w * h);
	const list = [];
	const stack = [];
	for (let i = 0; i < w * h; i++) {
		if (!on[i] || label[i]) continue;
		const id = list.length + 1;
		const pixels = [];
		label[i] = id;
		stack.push(i);
		while (stack.length) {
			const p = stack.pop();
			pixels.push(p);
			const x = p % w;
			for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
				if (q >= 0 && q < w * h && on[q] && !label[q]) {
					label[q] = id;
					stack.push(q);
				}
			}
		}
		list.push({ id, pixels });
	}
	return { label, list };
}

/** Chebyshev dilation by r, as a separable max filter. */
function dilate(mask, w, h, r) {
	const tmp = new Uint8Array(w * h);
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		let count = 0;
		for (let x = -r; x < w; x++) {
			const add = x + r;
			if (add < w && mask[y * w + add]) count++;
			const drop = x - r - 1;
			if (drop >= 0 && mask[y * w + drop]) count--;
			if (x >= 0) tmp[y * w + x] = count > 0 ? 1 : 0;
		}
	}
	for (let x = 0; x < w; x++) {
		let count = 0;
		for (let y = -r; y < h; y++) {
			const add = y + r;
			if (add < h && tmp[add * w + x]) count++;
			const drop = y - r - 1;
			if (drop >= 0 && tmp[drop * w + x]) count--;
			if (y >= 0) out[y * w + x] = count > 0 ? 1 : 0;
		}
	}
	return out;
}

function hull(points) {
	const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper = [];
	for (const p of pts.reverse()) {
		while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
		upper.push(p);
	}
	return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function insideConvex(poly, x, y) {
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
	}
	return true;
}

async function main() {
	const { data, info } = await sharp(SOURCE)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width: w, height: h, channels } = info;
	const on = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) on[i] = data[i * channels + 3] > 128 ? 1 : 0;

	const { label, list } = components(on, w, h);
	// The arch reaches the image's left edge; the fox does not.
	const archId = list.find((c) => c.pixels.some((p) => p % w < 40)).id;
	const arch = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) arch[i] = label[i] === archId ? 1 : 0;

	// The mirror axis, from the arch's two legs low down, where nothing else crosses them.
	const centers = [];
	for (let y = Math.round(h * 0.65); y < Math.round(h * 0.95); y += 8) {
		let a = -1;
		let d = -1;
		for (let x = 0; x < w; x++) if (arch[y * w + x]) (a < 0 && (a = x), (d = x));
		if (a >= 0 && d > a) centers.push(a + d);
	}
	centers.sort((p, q) => p - q);
	const twiceAxis = centers[Math.floor(centers.length / 2)];

	// The band: the mark-free left half, and that half mirrored onto the right.
	const band = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		for (let x = 0; 2 * x < twiceAxis; x++) {
			if (!arch[y * w + x]) continue;
			band[y * w + x] = 1;
			const m = twiceAxis - x;
			if (m >= 0 && m < w) band[y * w + m] = 1;
		}
	}
	const cut = dilate(band, w, h, 6);

	// What is left of the arch shape outside the band: the howl marks, in pieces.
	const marks = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) marks[i] = arch[i] && !cut[i] ? 1 : 0;
	const pieces = components(marks, w, h).list.filter((c) => c.pixels.length > 400);
	const keep = new Uint8Array(w * h);
	for (const piece of pieces) for (const p of piece.pixels) keep[p] = 1;

	// Bridge each mark across the band. Each mark is two pieces, one either side; the pieces are
	// paired by how close their band-side edges are, then each pair's edge pixels are hulled.
	const near = dilate(cut, w, h, 28);
	const edges = pieces
		.map((piece) => piece.pixels.filter((p) => near[p]).map((p) => [p % w, Math.floor(p / w)]))
		.filter((points) => points.length);
	const centroid = (points) => [
		points.reduce((sum, p) => sum + p[0], 0) / points.length,
		points.reduce((sum, p) => sum + p[1], 0) / points.length
	];
	const centres = edges.map(centroid);
	const unpaired = new Set(edges.keys());
	const bridges = [];
	while (unpaired.size >= 2) {
		let best = null;
		for (const a of unpaired) {
			for (const b of unpaired) {
				if (b <= a) continue;
				const d = Math.hypot(centres[a][0] - centres[b][0], centres[a][1] - centres[b][1]);
				if (!best || d < best.d) best = { a, b, d };
			}
		}
		unpaired.delete(best.a);
		unpaired.delete(best.b);
		bridges.push([...edges[best.a], ...edges[best.b]]);
	}
	for (const points of bridges) {
		const poly = hull(points);
		if (poly.length < 3) continue;
		const xs = poly.map((p) => p[0]);
		const ys = poly.map((p) => p[1]);
		for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
			for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
				const i = y * w + x;
				if (cut[i] && arch[i] && insideConvex(poly, x, y)) keep[i] = 1;
			}
		}
	}

	const out = Buffer.alloc(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		if ((on[i] && label[i] !== archId) || keep[i]) {
			out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
			out[i * 4 + 3] = 255;
		}
	}
	await sharp(out, { raw: { width: w, height: h, channels: 4 } })
		.png()
		.toFile(OUT);
	console.log(
		`Wrote ${path.basename(OUT)}: fox plus ${pieces.length} mark pieces, ${bridges.length} bridges.`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
