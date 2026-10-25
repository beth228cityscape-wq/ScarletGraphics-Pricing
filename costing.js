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
        name: item ? item.name : '(nawawalang item)',
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
  function computeSqftOrder(product, items, order) {
    order = order || {};
    var perSqft = computeProduct(product, items);
    var width = num(order.width);
    var height = num(order.height);
    var qty = order.qty == null || order.qty === '' ? 1 : num(order.qty);
    var baseRate = num(product.ratePerSqft);
    var rate = order.rate == null || order.rate === '' ? baseRate : num(order.rate);
    var area = width * height;
    var totalArea = area * qty;
    var total = totalArea * rate;
    var cost = totalArea * perSqft.totalCost;

    return {
      area: round2(area),
      totalArea: round2(totalArea),
      baseRate: baseRate,
      rate: rate,
      pricePerPiece: round2(area * rate),
      total: round2(total),
      discount: round2(totalArea * (baseRate - rate)),
      costPerSqft: perSqft.totalCost,
      cost: round2(cost),
      profit: round2(total - cost),
      marginPct: total > 0 ? round2((total - cost) / total * 100) : 0
    };
  }

  var api = { computeProduct: computeProduct, computeSqftOrder: computeSqftOrder, round2: round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Costing = api;
})(this);
