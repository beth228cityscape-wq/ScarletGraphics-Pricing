const test = require('node:test');
const assert = require('node:assert');
const { computeProduct } = require('../costing.js');

const items = [
  { id: 'a', name: 'Sticker paper', unit: 'sheet', cost: 12 },
  { id: 'b', name: 'Ink', unit: 'ml', cost: 0.5 }
];

test('computes materials, waste, labor, overhead, markup', () => {
  const r = computeProduct({
    components: [{ itemId: 'a', qty: 2 }, { itemId: 'b', qty: 10 }],
    wastePct: 10, labor: 20, overheadPct: 10, markupPct: 50
  }, items);
  assert.strictEqual(r.materials, 29);       // 24 + 5
  assert.strictEqual(r.waste, 2.9);
  assert.strictEqual(r.labor, 20);
  assert.strictEqual(r.overhead, 5.19);      // 51.9 * 10%
  assert.strictEqual(r.totalCost, 57.09);
  assert.strictEqual(r.price, 85.64);        // 57.09 * 1.5 = 85.635
  assert.strictEqual(r.marginPct, 33.33);
});

test('missing items cost zero and are flagged', () => {
  const r = computeProduct({ components: [{ itemId: 'zzz', qty: 3 }] }, items);
  assert.strictEqual(r.materials, 0);
  assert.ok(r.lines[0].missing);
});

test('empty product prices at zero', () => {
  const r = computeProduct({}, items);
  assert.strictEqual(r.price, 0);
  assert.strictEqual(r.marginPct, 0);
});
