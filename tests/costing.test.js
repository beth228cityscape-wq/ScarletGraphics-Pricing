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

const { rollArea, round2 } = require('../costing.js');

test('roll area converts mixed units', () => {
  // Olfa vinyl roll: 4.5 ft x 50 m
  const sqft = rollArea(4.5, 'ft', 50, 'm');
  assert.strictEqual(round2(sqft), 738.19);
  assert.strictEqual(round2(3600 / sqft), 4.88);
  assert.strictEqual(round2(rollArea(1, 'ft', 1, 'ft', 'sqin')), 144);
});

const { computeSizeOrder } = require('../costing.js');
const sticker = {
  pricing: 'sizes', bulkQty: 1000, minOrder: 500,
  sizes: [{ w: 2, h: 2, price: 1 }, { w: 2, h: 3, price: 1.5 }, { w: 5, h: 5, price: 4.5 }]
};

test('size pricing uses the bulk price from 1000 pcs', () => {
  const r = computeSizeOrder(sticker, items, { width: 3, height: 2, qty: 1000 });
  assert.strictEqual(r.mode, 'bulk');
  assert.strictEqual(r.total, 1500);
});

test('size pricing below 1000 pcs adds a shrinking fee and never drops below ₱500', () => {
  assert.strictEqual(computeSizeOrder(sticker, items, { width: 2, height: 2, qty: 1 }).total, 500.5);
  assert.strictEqual(computeSizeOrder(sticker, items, { width: 2, height: 2, qty: 500 }).total, 750);
  let prev = 0;
  for (let q = 1; q <= 1200; q++) {
    const t = computeSizeOrder(sticker, items, { width: 5, height: 5, qty: q }).total;
    assert.ok(t >= 500 && t > prev, q + ' pcs');
    prev = t;
  }
});

test('optional per sq in price is used when cheaper for small orders', () => {
  const s2 = Object.assign({}, sticker, { ratePerSqft: 5, minPrice: 0 });
  const r = computeSizeOrder(s2, items, { width: 2, height: 2, qty: 3 }); // 3 x 4 sq in x 5 = 60
  assert.strictEqual(r.mode, 'retail');
  assert.strictEqual(r.total, 60);
  assert.strictEqual(computeSizeOrder(s2, items, { width: 2, height: 2, qty: 1000 }).mode, 'bulk');
});

test('unknown size without a per sq in price has no price', () => {
  assert.strictEqual(computeSizeOrder(sticker, items, { width: 7, height: 7, qty: 10 }).mode, null);
});

const { compute3dPrint } = require('../costing.js');

test('3D print price: material, electricity, wear, labor, failure, markup', () => {
  const r = compute3dPrint({
    filaments: [{ grams: 100, costPerKg: 1000 }], hours: 5, minutes: 30,
    includePrinter: true, kwhRate: 12, watts: 250, printerPrice: 15000, lifespanHours: 2000,
    includeLabor: true, laborRate: 50, laborHours: 0.5,
    includeBusiness: true, failurePct: 5, markupPct: 30
  });
  assert.strictEqual(r.material, 100);
  assert.strictEqual(r.electricity, 16.5);
  assert.strictEqual(r.wear, 41.25);
  assert.strictEqual(r.labor, 25);
  assert.strictEqual(r.subtotal, 182.75);
  assert.strictEqual(r.failure, 9.14);
  assert.strictEqual(r.profit, 57.57);
  assert.strictEqual(r.price, 249.45);
});

test('3D print sections can be left out', () => {
  const r = compute3dPrint({ filaments: [{ grams: 50, costPerKg: 800 }, { grams: 10, costPerKg: 1200 }], hours: 2 });
  assert.strictEqual(r.material, 52);
  assert.strictEqual(r.price, 52);
});

const { computeVariantOrder } = require('../costing.js');
const cards = { pricing: 'variants', packSize: 100, variants: [
  { name: 'Single Face', price: 350 }, { name: 'Double Face', price: 450 }, { name: 'Laminated', price: 650 }
] };

test('variant pricing is price per pack times number of packs', () => {
  const r = computeVariantOrder(cards, { variant: 1, sets: 3 });
  assert.strictEqual(r.pieces, 300);
  assert.strictEqual(r.total, 1350);
  assert.strictEqual(computeVariantOrder(cards, { variant: 2, sets: 1 }).total, 650);
});

test('variant price can be overridden for a discount', () => {
  const r = computeVariantOrder(cards, { variant: 0, sets: 2, price: 300 });
  assert.strictEqual(r.total, 600);
  assert.strictEqual(r.discount, 100);
});

const { computeAreaTierOrder } = require('../costing.js');
const sintra = { pricing: 'areaTiers', minPrice: 200, areaTiers: [{ minArea: 0, rate: 1.8 }, { minArea: 386.1, rate: 1.5 }, { minArea: 864, rate: 1.2 }, { minArea: 1297, rate: 1 }] };

test('sintra: ₱1.80/sq in up to A2 with a ₱200 minimum', () => {
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 8, height: 10 }).total, 200);
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 11.7, height: 16.5 }).total, 347.49);
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 16.5, height: 23.4 }).total, 694.98);
});

test('sintra: ₱1.50/sq in above A2, never cheaper than A2', () => {
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 17, height: 24 }).total, 694.98);
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 24, height: 36, qty: 2 }).total, 2592);
  let prev = 0;
  for (let w = 1; w <= 60; w += 0.5) {
    const t = computeAreaTierOrder(sintra, { width: w, height: w }).total;
    assert.ok(t >= prev, w + ' in');
    prev = t;
  }
});

test('sintra rate can be overridden for a discount', () => {
  const r = computeAreaTierOrder(sintra, { width: 24, height: 36, rate: 1.4 });
  assert.strictEqual(r.total, 1209.6);
  assert.strictEqual(r.discount, 86.4);
});

test('sintra: ₱1.20 from 864 sq in and ₱1.00 from 1297 sq in, never cheaper than the bracket below', () => {
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 24, height: 36 }).total, 1296);
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 30, height: 40 }).total, 1440);
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 36, height: 37 }).total, 1556.4);
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 36, height: 48 }).total, 1728);
  assert.strictEqual(computeAreaTierOrder(sintra, { width: 48, height: 96 }).total, 4608);
});

const pins = { pricing: 'tier', addOnName: 'Packaging', addOnPrice: 5, tiers: [{ minQty: 1, price: 30 }, { minQty: 10, price: 24 }, { minQty: 50, price: 18 }] };

test('button pins: price by quantity, packaging adds ₱5 per piece', () => {
  assert.strictEqual(computeTierOrder(pins, [], { qty: 9 }).total, 270);
  assert.strictEqual(computeTierOrder(pins, [], { qty: 10 }).total, 240);
  assert.strictEqual(computeTierOrder(pins, [], { qty: 50 }).total, 900);
  const r = computeTierOrder(pins, [], { qty: 20, addOn: true });
  assert.strictEqual(r.total, 580);
  assert.strictEqual(r.addOnTotal, 100);
  const d = computeTierOrder(pins, [], { qty: 20, price: 20, addOn: true });
  assert.strictEqual(d.total, 500);
  assert.strictEqual(d.discount, 80);
});
