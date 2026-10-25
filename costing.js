// Pure costing logic. Shared by the browser app and the Node tests.
(function (root) {
  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Compute the cost breakdown of one product.
  // items: array of { id, name, unit, cost }
  // product: { components: [{ itemId, qty }], wastePct, labor, overheadPct, markupPct }
  function computeProduct(product, items) {
    var byId = {};
    (items || []).forEach(function (it) { byId[it.id] = it; });

    var lines = (product.components || []).map(function (c) {
      var item = byId[c.itemId];
      var qty = num(c.qty);
      var unitCost = item ? num(item.cost) : 0;
      return {
        itemId: c.itemId,
        name: item ? item.name : '(missing item)',
        unit: item ? item.unit : '',
        qty: qty,
        unitCost: unitCost,
        total: qty * unitCost,
        missing: !item
      };
    });

    var materials = lines.reduce(function (s, l) { return s + l.total; }, 0);
    var waste = materials * num(product.wastePct) / 100;
    var labor = num(product.labor);
    var overhead = (materials + waste + labor) * num(product.overheadPct) / 100;
    var totalCost = materials + waste + labor + overhead;
    var markup = totalCost * num(product.markupPct) / 100;
    var price = totalCost + markup;

    return {
      lines: lines,
      materials: round2(materials),
      waste: round2(waste),
      labor: round2(labor),
      overhead: round2(overhead),
      totalCost: round2(totalCost),
      markup: round2(markup),
      price: round2(price),
      profit: round2(markup),
      marginPct: price > 0 ? round2((price - totalCost) / price * 100) : 0
    };
  }

  // Price an order of a per-sq-ft product (e.g. tarpaulin).
  // The product's materials, waste, labor and overhead are per sq ft; its selling
  // price is product.ratePerSqft. order: { width, height, qty, rate } in feet;
  // order.rate overrides the product rate (for discounts) when given.
  // product.minPrice is the lowest price charged per piece (e.g. ₱200).
  function computeSqftOrder(product, items, order) {
    order = order || {};
    var perSqft = computeProduct(product, items);
    var width = num(order.width);
    var height = num(order.height);
    var qty = order.qty == null || order.qty === '' ? 1 : num(order.qty);
    var baseRate = num(product.ratePerSqft);
    var rate = order.rate == null || order.rate === '' ? baseRate : num(order.rate);
    var minPrice = num(product.minPrice);
    var area = width * height;
    var totalArea = area * qty;
    var computedPiece = area * rate;
    var piece = Math.max(computedPiece, minPrice);
    var regularPiece = Math.max(area * baseRate, minPrice);
    var total = piece * qty;
    var cost = totalArea * perSqft.totalCost;

    return {
      area: round2(area),
      totalArea: round2(totalArea),
      baseRate: baseRate,
      rate: rate,
      computedPerPiece: round2(computedPiece),
      minPrice: minPrice,
      minApplied: computedPiece < minPrice,
      pricePerPiece: round2(piece),
      total: round2(total),
      discount: round2((regularPiece - piece) * qty),
      costPerSqft: perSqft.totalCost,
      cost: round2(cost),
      profit: round2(total - cost),
      marginPct: total > 0 ? round2((total - cost) / total * 100) : 0
    };
  }

  // Sorted price tiers: [{ minQty, price }] from the lowest quantity up.
  function sortedTiers(product) {
    return (product.tiers || [])
      .map(function (t) { return { minQty: Math.max(1, Math.floor(num(t.minQty))), price: num(t.price) }; })
      .sort(function (a, b) { return a.minQty - b.minQty; });
  }

  // The tier that applies to qty: the one with the highest minQty not above qty.
  function tierFor(product, qty) {
    var tiers = sortedTiers(product);
    var match = tiers[0] || null;
    tiers.forEach(function (t) { if (t.minQty <= qty) match = t; });
    return match;
  }

  // Sliding price per piece: startPrice at 1 pc, going down by the same amount
  // for each added piece until bulkPrice at bulkQty pcs and above. Rounded to
  // whole pesos. The order total never goes down when a piece is added.
  function scalePrice(product, qty) {
    var start = num(product.startPrice), bulk = num(product.bulkPrice);
    var bulkQty = Math.max(1, Math.floor(num(product.bulkQty)));
    if (qty >= bulkQty || bulkQty <= 1) return bulk;
    return Math.round(start - (start - bulk) * (Math.max(1, qty) - 1) / (bulkQty - 1));
  }

  // Price an order of a product whose price per piece depends on quantity
  // (e.g. mugs: 1-12 pcs ₱150, 13-24 ₱100, 25+ ₱80). order: { qty, price };
  // order.price overrides the tier price (for discounts) when given.
  function computeTierOrder(product, items, order) {
    order = order || {};
    var qty = order.qty == null || order.qty === '' ? 1 : num(order.qty);
    var scale = product.pricing === 'scale';
    var tier = scale ? null : tierFor(product, qty);
    var regular = scale ? scalePrice(product, qty) : tier ? tier.price : 0;
    var price = order.price == null || order.price === '' ? regular : num(order.price);
    var total = price * qty;
    var unitCost = computeProduct(product, items).totalCost;
    var cost = unitCost * qty;
    return {
      qty: qty,
      tier: tier,
      hasPrice: scale ? num(product.startPrice) > 0 || num(product.bulkPrice) > 0 : !!tier,
      regularPrice: regular,
      price: price,
      total: round2(total),
      discount: round2((regular - price) * qty),
      unitCost: unitCost,
      cost: round2(cost),
      profit: round2(total - cost),
      marginPct: total > 0 ? round2((total - cost) / total * 100) : 0
    };
  }

  // Length units in feet, for rolls measured in mixed units (e.g. 4.5 ft x 50 m).
  var FEET_PER = { ft: 1, m: 3.28084, in: 1 / 12, cm: 0.0328084, yd: 3 };

  // Area of a roll in sq ft, or in sq in when areaUnit is 'sqin'.
  function rollArea(width, widthUnit, length, lengthUnit, areaUnit) {
    var sqft = num(width) * (FEET_PER[widthUnit] || 1) * num(length) * (FEET_PER[lengthUnit] || 1);
    return areaUnit === 'sqin' ? sqft * 144 : sqft;
  }

  var api = {
    rollArea: rollArea,
    computeProduct: computeProduct, computeSqftOrder: computeSqftOrder,
    computeTierOrder: computeTierOrder, sortedTiers: sortedTiers, scalePrice: scalePrice, round2: round2
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Costing = api;
})(this);
