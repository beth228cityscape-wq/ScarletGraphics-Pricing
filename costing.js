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

  // Bulk price per piece for a sticker size, matching W x H in either orientation.
  function sizePrice(product, width, height) {
    var w = num(width), h = num(height);
    var match = (product.sizes || []).find(function (sz) {
      return (num(sz.w) === w && num(sz.h) === h) || (num(sz.w) === h && num(sz.h) === w);
    });
    return match ? num(match.price) : null;
  }

  // Price an order of a size-priced product (e.g. stickers).
  // - bulkQty pcs and up: the size's bulk price per piece.
  // - fewer: the bulk price plus a small-order fee of minOrder that shrinks to
  //   nothing at bulkQty, so the order is never below minOrder and the total
  //   always rises with quantity (no jump at bulkQty).
  // - if a per-sq-in price (ratePerSqft) is set, small orders priced by area
  //   (with minPrice per piece) are used when that comes out cheaper.
  // order: { width, height, qty, rate } in inches; order.rate overrides the
  // per-sq-in price.
  function computeSizeOrder(product, items, order) {
    order = order || {};
    var qty = order.qty == null || order.qty === '' ? 1 : num(order.qty);
    var area = num(order.width) * num(order.height);
    var bulk = sizePrice(product, order.width, order.height);
    var bulkQty = num(product.bulkQty) || 1000;
    var minOrder = num(product.minOrder);
    var rate = order.rate == null || order.rate === '' ? num(product.ratePerSqft) : num(order.rate);

    var bulkTotal = null, mode = null;
    if (bulk !== null) {
      if (qty >= bulkQty || bulk * bulkQty <= minOrder) {
        bulkTotal = Math.max(qty * bulk, qty >= bulkQty ? 0 : minOrder);
        mode = 'bulk';
      } else {
        bulkTotal = qty * bulk + minOrder * (1 - qty / bulkQty);
        mode = 'small';
      }
    }
    var retailPiece = rate > 0 ? Math.max(area * rate, num(product.minPrice)) : null;
    var retailTotal = retailPiece !== null && area > 0 ? qty * retailPiece : null;

    var total = bulkTotal;
    if (retailTotal !== null && (total === null || retailTotal < total)) {
      total = retailTotal;
      mode = 'retail';
    }
    return {
      area: round2(area),
      qty: qty,
      bulkPrice: bulk,
      bulkQty: bulkQty,
      minOrder: minOrder,
      rate: rate,
      mode: mode, // 'bulk' | 'small' | 'retail' | null (no price)
      smallFee: mode === 'small' ? round2(bulkTotal - qty * bulk) : 0,
      total: total === null ? 0 : round2(total),
      perPiece: total === null || qty <= 0 ? 0 : round2(total / qty)
    };
  }

  // 3D print job price.
  // job: { filaments: [{ grams, costPerKg }], hours, minutes,
  //   includePrinter, kwhRate, watts, printerPrice, lifespanHours,
  //   includeLabor, laborRate, laborHours,
  //   includeBusiness, failurePct, markupPct }
  // Failure is a % of the subtotal; markup is a % of subtotal + failure.
  function compute3dPrint(job) {
    job = job || {};
    var material = (job.filaments || []).reduce(function (sum, f) {
      return sum + num(f.grams) / 1000 * num(f.costPerKg);
    }, 0);
    var hours = num(job.hours) + num(job.minutes) / 60;
    var electricity = 0, wear = 0, labor = 0, failure = 0, profit = 0;
    if (job.includePrinter) {
      electricity = num(job.watts) / 1000 * hours * num(job.kwhRate);
      wear = num(job.lifespanHours) > 0 ? num(job.printerPrice) / num(job.lifespanHours) * hours : 0;
    }
    if (job.includeLabor) labor = num(job.laborRate) * num(job.laborHours);
    var subtotal = material + electricity + wear + labor;
    if (job.includeBusiness) {
      failure = subtotal * num(job.failurePct) / 100;
      profit = (subtotal + failure) * num(job.markupPct) / 100;
    }
    return {
      hours: hours,
      material: round2(material),
      electricity: round2(electricity),
      wear: round2(wear),
      labor: round2(labor),
      subtotal: round2(subtotal),
      failure: round2(failure),
      profit: round2(profit),
      price: round2(subtotal + failure + profit)
    };
  }

  // Price an order of a product sold in packs with variants (e.g. business
  // cards: ₱350 per 100 pcs single face). order: { variant, sets, price };
  // order.price overrides the variant's price per pack (for discounts).
  function computeVariantOrder(product, order) {
    order = order || {};
    var v = (product.variants || [])[num(order.variant)] || null;
    var sets = order.sets == null || order.sets === '' ? 1 : num(order.sets);
    var regular = v ? num(v.price) : 0;
    var price = order.price == null || order.price === '' ? regular : num(order.price);
    var packSize = num(product.packSize) || 1;
    return {
      variant: v,
      sets: sets,
      packSize: packSize,
      pieces: sets * packSize,
      regularPrice: regular,
      price: price,
      total: round2(price * sets),
      discount: round2((regular - price) * sets),
      perPiece: round2(price / packSize * 100) / 100
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
    compute3dPrint: compute3dPrint,
    computeVariantOrder: computeVariantOrder,
    computeProduct: computeProduct, computeSqftOrder: computeSqftOrder,
    computeTierOrder: computeTierOrder, computeSizeOrder: computeSizeOrder, sizePrice: sizePrice, sortedTiers: sortedTiers, scalePrice: scalePrice, round2: round2
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Costing = api;
})(this);
