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

const { computeSqftOrder } = require('../costing.js');
const tarp = {
  pricing: 'sqft', ratePerSqft: 25,
  components: [{ itemId: 'b', qty: 2 }], labor: 3 // ₱1 ink + ₱3 labor = ₱4 per sq ft
};

test('sq ft order uses width x height x rate', () => {
  const r = computeSqftOrder(tarp, items, { width: 4, height: 4 });
  assert.strictEqual(r.area, 16);
  assert.strictEqual(r.total, 400);
  assert.strictEqual(r.discount, 0);
  assert.strictEqual(r.cost, 64);
  assert.strictEqual(r.profit, 336);
});

test('sq ft order rate can be overridden for a discount', () => {
  const r = computeSqftOrder(tarp, items, { width: 4, height: 4, qty: 2, rate: 20 });
  assert.strictEqual(r.totalArea, 32);
  assert.strictEqual(r.pricePerPiece, 320);
  assert.strictEqual(r.total, 640);
  assert.strictEqual(r.discount, 160);
});

test('sq ft order below the minimum is charged the minimum per piece', () => {
  const small = Object.assign({}, tarp, { minPrice: 200 });
  const r = computeSqftOrder(small, items, { width: 2, height: 3, qty: 2 }); // 6 sq ft x 25 = 150
  assert.strictEqual(r.computedPerPiece, 150);
  assert.ok(r.minApplied);
  assert.strictEqual(r.pricePerPiece, 200);
  assert.strictEqual(r.total, 400);
  assert.strictEqual(r.discount, 0);
});

test('minimum does not affect orders above it, and caps discounts', () => {
  const t = Object.assign({}, tarp, { minPrice: 200 });
  assert.strictEqual(computeSqftOrder(t, items, { width: 4, height: 4 }).total, 400);
  // 3x3 = 9 sq ft: regular ₱225, discounted to ₱20 = ₱180 -> floored at ₱200
  const d = computeSqftOrder(t, items, { width: 3, height: 3, rate: 20 });
  assert.strictEqual(d.total, 200);
  assert.strictEqual(d.discount, 25);
});

test('per sq inch pricing uses the same width x height x rate formula', () => {
  const sticker = { pricing: 'sqin', ratePerSqft: 5, minPrice: 0 };
  const r = computeSqftOrder(sticker, items, { width: 2, height: 2, qty: 10 });
  assert.strictEqual(r.area, 4);
  assert.strictEqual(r.pricePerPiece, 20);
  assert.strictEqual(r.total, 200);
});

const { computeTierOrder } = require('../costing.js');
const mug = { pricing: 'tier', tiers: [{ minQty: 25, price: 80 }, { minQty: 1, price: 150 }, { minQty: 13, price: 100 }] };

test('tier pricing picks the price for the quantity', () => {
  assert.strictEqual(computeTierOrder(mug, items, { qty: 1 }).total, 150);
  assert.strictEqual(computeTierOrder(mug, items, { qty: 12 }).total, 1800);
  assert.strictEqual(computeTierOrder(mug, items, { qty: 13 }).total, 1300);
  assert.strictEqual(computeTierOrder(mug, items, { qty: 24 }).price, 100);
  assert.strictEqual(computeTierOrder(mug, items, { qty: 25 }).total, 2000);
  assert.strictEqual(computeTierOrder(mug, items, { qty: 100 }).price, 80);
});

test('tier price can be overridden for a discount', () => {
  const r = computeTierOrder(mug, items, { qty: 10, price: 130 });
  assert.strictEqual(r.total, 1300);
  assert.strictEqual(r.discount, 200);
});

const { scalePrice } = require('../costing.js');
const mugScale = { pricing: 'scale', startPrice: 150, bulkPrice: 80, bulkQty: 24 };

test('sliding price goes from start price to bulk price', () => {
  assert.strictEqual(scalePrice(mugScale, 1), 150);
  assert.strictEqual(scalePrice(mugScale, 12), 117);
  assert.strictEqual(scalePrice(mugScale, 13), 113);
  assert.strictEqual(scalePrice(mugScale, 24), 80);
  assert.strictEqual(scalePrice(mugScale, 100), 80);
});

test('sliding price total never drops when a piece is added', () => {
  let prev = 0;
  for (let q = 1; q <= 60; q++) {
    const t = computeTierOrder(mugScale, items, { qty: q }).total;
    assert.ok(t > prev, 'total for ' + q + ' pcs (' + t + ') should be above ' + prev);
    prev = t;
  }
});
