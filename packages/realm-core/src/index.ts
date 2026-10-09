/** Prototype layout v2/v3 compatibility; live bindings and scenarios need a new authored schema. */
export type RegionType = 'cover' | 'water' | 'spawn' | 'exit';
export interface Region {
	type: RegionType;
	x: number;
	y: number;
	w?: number;
	h?: number;
	group?: string;
}
export interface RealmLayout {
	version: 3;
	realm: number;
	board: { width: 960; height: 3200 };
	regions: Region[];
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Expected a layout object.');
	return value as Record<string, unknown>;
}
function finite(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function parseLayout(value: unknown): RealmLayout {
	const input = record(value),
		board = record(input.board);
	if (
		![2, 3].includes(input.version as number) ||
		board.width !== 960 ||
		![1600, 3200].includes(board.height as number)
	) {
		throw new Error('Expected a prototype layout v2 or v3 for a 960 × 1600/3200 board.');
	}
	if (!Number.isInteger(input.realm) || !finite(input.realm) || input.realm < 0 || input.realm > 3)
		throw new Error('Invalid realm.');
	if (!Array.isArray(input.regions) || input.regions.length > 80)
		throw new Error('Layouts support up to 80 regions.');
	const regions = input.regions.map((value: unknown): Region => {
		const region = record(value);
		if (
			!['cover', 'water', 'spawn', 'exit'].includes(region.type as string) ||
			!finite(region.x) ||
			!finite(region.y) ||
			region.x < 0 ||
			region.y < 0 ||
			region.x > 960 ||
			region.y > 3200
		)
			throw new Error('Invalid region position or type.');
		const result: Region = { type: region.type as RegionType, x: region.x, y: region.y };
		if (region.group !== undefined) {
			if (typeof region.group !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(region.group))
				throw new Error('Invalid structure group.');
			result.group = region.group;
		}
		if (result.type === 'cover' || result.type === 'water') {
			if (
				!finite(region.w) ||
				!finite(region.h) ||
				region.w < 24 ||
				region.h < 24 ||
				region.x + region.w > 960 ||
				region.y + region.h > 3200
			)
				throw new Error('Invalid region size.');
			result.w = region.w;
			result.h = region.h;
		}
		return result;
	});
	return { version: 3, realm: input.realm, board: { width: 960, height: 3200 }, regions };
}
