import { describe, expect, it } from 'vitest';
import { parseLayout } from '../src/index.js';
const layout = {
	version: 3,
	realm: 0,
	board: { width: 960, height: 3200 },
	regions: [{ type: 'cover', x: 10, y: 20, w: 100, h: 40, group: 'g_test' }]
};
describe('prototype map compatibility', () => {
	it('retains geometry/groups through JSON roundtrip and upgrades old board metadata', () => {
		expect(parseLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
		expect(
			parseLayout({ ...layout, version: 2, board: { width: 960, height: 1600 } }).board.height
		).toBe(3200);
	});
	it('rejects unsupported versions, realm ids and out-of-board geometry', () => {
		expect(() => parseLayout({ ...layout, version: 4 })).toThrow();
		expect(() => parseLayout({ ...layout, realm: 4 })).toThrow();
		expect(() => parseLayout({ ...layout, regions: [{ ...layout.regions[0], x: 950 }] })).toThrow();
	});
	it('bounds region counts and strips unknown executable fields', () => {
		expect(() =>
			parseLayout({ ...layout, regions: Array.from({ length: 81 }, () => layout.regions[0]) })
		).toThrow();
		expect(
			parseLayout({ ...layout, regions: [{ ...layout.regions[0], action: 'eval()' }] })
		).toEqual(layout);
	});
});
