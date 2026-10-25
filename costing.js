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

  var api = { computeProduct: computeProduct, round2: round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Costing = api;
})(this);
