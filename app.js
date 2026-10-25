(function () {
  var STORAGE_KEY = 'scarlet-costing-v1';
  var peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  // Built-in price categories for the Price Calculator. They are area-priced
  // products; their rate and minimum are changed under Settings.
  var BUILTINS = [
    { id: 'tarpaulin', name: 'Tarpaulin', pricing: 'sqft', ratePerSqft: 25, minPrice: 200 },
    { id: 'sticker', name: 'Sticker', pricing: 'sqin', ratePerSqft: 0, minPrice: 0 },
    { id: 'mug', name: 'Mug', pricing: 'scale', startPrice: 150, bulkPrice: 80, bulkQty: 24 }
  ];
  var TIER_LABEL = 'Per piraso (depende sa dami)';
  var SCALE_LABEL = 'Per piraso (pababa ang presyo)';
  var AREA = {
    sqft: { dim: 'ft', area: 'sq ft', label: 'Per sq ft' },
    sqin: { dim: 'in', area: 'sq in', label: 'Per sq inch' }
  };

  var state = ensureBuiltins(load());
  var editingProduct = null; // working copy of the product in the form
  var calcId = 'tarpaulin'; // category selected in the Price Calculator

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        return { items: data.items || [], products: data.products || [] };
      }
    } catch (e) { /* fall through to empty state */ }
    return { items: [], products: [] };
  }

  function blankProduct(fields) {
    return Object.assign({
      name: '', pricing: 'unit', components: [], wastePct: 0, labor: 0,
      overheadPct: 0, markupPct: 0, ratePerSqft: 0, minPrice: 0, tiers: [],
      startPrice: 0, bulkPrice: 0, bulkQty: 0
    }, fields);
  }

  function ensureBuiltins(st) {
    // The first Mug used 150/100/80 tiers, which made 12 pcs cost more than 13.
    st.products.forEach(function (p) {
      if (p.id === 'mug' && p.pricing === 'tier' &&
          JSON.stringify(p.tiers) === '[{"minQty":1,"price":150},{"minQty":13,"price":100},{"minQty":25,"price":80}]') {
        Object.assign(p, { pricing: 'scale', startPrice: 150, bulkPrice: 80, bulkQty: 24 });
      }
    });
    BUILTINS.forEach(function (b) {
      if (st.products.some(function (p) { return p.id === b.id; })) return;
      // Adopt a matching product made by hand before the built-in one existed.
      var own = st.products.find(function (p) {
        return p.pricing === b.pricing && (p.name || '').trim().toLowerCase() === b.name.toLowerCase();
      });
      if (own) own.id = b.id;
      else st.products.push(blankProduct(b));
    });
    return st;
  }

  function isBuiltin(id) {
    return BUILTINS.some(function (b) { return b.id === id; });
  }

  function isArea(p) { return !!(p && AREA[p.pricing]); }
  function isTier(p) { return !!(p && p.pricing === 'tier'); }
  function isScale(p) { return !!(p && p.pricing === 'scale'); }
  function isPiece(p) { return isTier(p) || isScale(p); }
  function isCategory(p) { return isArea(p) || isPiece(p); }

  function pricingLabel(p) {
    return isTier(p) ? TIER_LABEL : isScale(p) ? SCALE_LABEL : AREA[p.pricing].label;
  }

  // "1-12 pcs: ₱150 · 13-24 pcs: ₱100 · 25+ pcs: ₱80"
  function tierRange(tiers, i) {
    var t = tiers[i], next = tiers[i + 1];
    if (!next) return t.minQty + '+';
    return next.minQty - 1 > t.minQty ? t.minQty + '-' + (next.minQty - 1) : String(t.minQty);
  }

  function tierSummary(p) {
    if (isScale(p)) {
      return peso.format(p.startPrice || 0) + ' sa 1 pc, pababa hanggang ' + peso.format(p.bulkPrice || 0) +
        ' mula ' + (p.bulkQty || 0) + ' pcs';
    }
    var tiers = Costing.sortedTiers(p);
    if (!tiers.length) return 'wala pang presyo';
    return tiers.map(function (t, i) {
      return tierRange(tiers, i) + ' pcs: ' + peso.format(t.price);
    }).join(' · ');
  }

  // Price categories shown in the Price Calculator, built-ins first.
  function areaProducts() {
    var order = BUILTINS.map(function (b) { return b.id; });
    return state.products.filter(isCategory).sort(function (a, b) {
      var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia < 0) ia = 99;
      if (ib < 0) ib = 99;
      return ia - ib || a.name.localeCompare(b.name);
    });
  }

  function findProduct(id) {
    return state.products.find(function (p) { return p.id === id; });
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // In-page yes/no dialog. The browser's confirm() is blocked when the app runs
  // inside an embedded page, which made delete buttons silently do nothing.
  function askConfirm(message, onYes, yesLabel) {
    var dlg = $('#confirm');
    $('#confirm-msg').textContent = message;
    $('#confirm-yes').textContent = yesLabel || 'Oo, burahin';
    dlg.hidden = false;
    $('#confirm-yes').focus();
    function close(yes) {
      dlg.hidden = true;
      $('#confirm-yes').onclick = $('#confirm-no').onclick = dlg.onclick = document.onkeydown = null;
      if (yes) onYes();
    }
    $('#confirm-yes').onclick = function () { close(true); };
    $('#confirm-no').onclick = function () { close(false); };
    dlg.onclick = function (e) { if (e.target === dlg) close(false); };
    document.onkeydown = function (e) { if (e.key === 'Escape') close(false); };
  }

  function sortedItems() {
    return state.items.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  // ---------- Tabs ----------
  document.querySelectorAll('nav button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('nav button').forEach(function (b) { b.classList.toggle('active', b === btn); });
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab);
      });
    });
  });

  // ---------- Items ----------
  var itemForm = $('#item-form');

  function renderItems() {
    var q = $('#item-search').value.trim().toLowerCase();
    var rows = sortedItems().filter(function (it) {
      return !q || (it.name + ' ' + (it.category || '')).toLowerCase().indexOf(q) !== -1;
    });
    $('#item-rows').innerHTML = rows.map(function (it) {
      return '<tr><td>' + esc(it.name) + '</td><td>' + esc(it.category) + '</td><td>' + esc(it.unit) +
        '</td><td class="num muted">' + (it.packQty ? peso.format(it.packPrice) + ' / ' + fmt(it.packQty) + ' ' + esc(it.unit) : '') +
        '</td><td class="num">' + peso.format(it.cost) + '</td><td class="row-actions">' +
        '<button data-edit="' + it.id + '">Edit</button>' +
        '<button data-del="' + it.id + '" class="danger">Burahin</button></td></tr>';
    }).join('');
    $('#item-empty').hidden = state.items.length > 0;

    var cats = {};
    state.items.forEach(function (it) { if (it.category) cats[it.category] = true; });
    $('#category-list').innerHTML = Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c) + '">';
    }).join('');
  }

  function resetItemForm() {
    itemForm.reset();
    itemForm.id.value = '';
    updatePackCost();
    $('#item-form-title').textContent = 'Bagong item';
    $('#item-cancel').hidden = true;
  }

  // Cost per unit = pack price / pieces per pack, when both are filled in.
  function packCost() {
    var price = parseFloat(itemForm.packPrice.value), qty = parseFloat(itemForm.packQty.value);
    return price > 0 && qty > 0 ? price / qty : null;
  }

  function updatePackCost() {
    var c = packCost();
    itemForm.cost.readOnly = c !== null;
    if (c !== null) itemForm.cost.value = Math.round(c * 10000) / 10000;
    var unit = itemForm.unit.value.trim() || 'unit';
    $('#pack-note').textContent = c !== null
      ? peso.format(parseFloat(itemForm.packPrice.value)) + ' ÷ ' + fmt(itemForm.packQty.value) + ' = ' + peso.format(c) + ' kada ' + unit
      : '';
  }

  ['packPrice', 'packQty', 'unit'].forEach(function (k) { itemForm[k].addEventListener('input', updatePackCost); });

  itemForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      id: itemForm.id.value || uid(),
      name: itemForm.name.value.trim(),
      category: itemForm.category.value.trim(),
      unit: itemForm.unit.value.trim(),
      cost: packCost() !== null ? packCost() : (parseFloat(itemForm.cost.value) || 0),
      packPrice: packCost() !== null ? parseFloat(itemForm.packPrice.value) : 0,
      packQty: packCost() !== null ? parseFloat(itemForm.packQty.value) : 0
    };
    var idx = state.items.findIndex(function (it) { return it.id === data.id; });
    if (idx >= 0) state.items[idx] = data; else state.items.push(data);
    save();
    resetItemForm();
    renderAll();
  });

  $('#item-cancel').addEventListener('click', resetItemForm);
  $('#item-search').addEventListener('input', renderItems);

  $('#item-rows').addEventListener('click', function (e) {
    var editId = e.target.dataset.edit, delId = e.target.dataset.del;
    if (editId) {
      var it = state.items.find(function (x) { return x.id === editId; });
      itemForm.id.value = it.id;
      itemForm.name.value = it.name;
      itemForm.category.value = it.category || '';
      itemForm.unit.value = it.unit;
      itemForm.cost.value = Math.round(it.cost * 10000) / 10000;
      itemForm.packPrice.value = it.packQty ? it.packPrice : '';
      itemForm.packQty.value = it.packQty || '';
      updatePackCost();
      $('#item-form-title').textContent = 'I-edit ang item';
      $('#item-cancel').hidden = false;
      itemForm.scrollIntoView({ behavior: 'smooth' });
    } else if (delId) {
      var usedIn = state.products.filter(function (p) {
        return p.components.some(function (c) { return c.itemId === delId; });
      }).map(function (p) { return p.name; });
      var msg = usedIn.length
        ? 'Ginagamit ito sa: ' + usedIn.join(', ') + '. Burahin pa rin?'
        : 'Burahin ang item na ito?';
      askConfirm(msg, function () {
        state.items = state.items.filter(function (x) { return x.id !== delId; });
        save();
        renderAll();
      });
    }
  });

  // ---------- Products ----------
  var productForm = $('#product-form');

  function renderProductList() {
    var list = state.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('#product-list').innerHTML = list.map(function (p) {
      var r = Costing.computeProduct(p, state.items);
      var active = editingProduct && editingProduct.id === p.id ? ' class="active"' : '';
      var per = isArea(p) ? '/' + AREA[p.pricing].area : '';
      var price = isPiece(p) ? tierSummary(p) : isArea(p)
        ? 'Cost ' + peso.format(r.totalCost) + per + ' · <strong>' + peso.format(p.ratePerSqft || 0) + per + '</strong>'
        : 'Cost ' + peso.format(r.totalCost) + ' · <strong>' + peso.format(r.price) + '</strong>';
      return '<li' + active + ' data-id="' + p.id + '"><span>' + esc(p.name) + '</span>' +
        '<span class="muted">' + price + '</span></li>';
    }).join('');
    $('#product-empty').hidden = state.products.length > 0;
  }

  function openProduct(p, keepOrder) {
    editingProduct = JSON.parse(JSON.stringify(p));
    productForm.hidden = false;
    productForm.id.value = p.id || '';
    productForm.name.value = p.name || '';
    ['wastePct', 'labor', 'overheadPct', 'markupPct', 'ratePerSqft', 'minPrice'].forEach(function (k) {
      productForm[k].value = p[k] || 0;
    });
    productForm.pricing.value = p.pricing || 'unit';
    if (!keepOrder) $('#order-rate').value = p.ratePerSqft || 0;
    applyPricingMode();
    $('#product-form-title').textContent = p.id ? 'I-edit ang product' : 'Bagong product';
    $('#product-delete').hidden = !p.id || isBuiltin(p.id);
    $('#product-duplicate').hidden = !p.id;
    renderComponents();
    renderProductList();
  }

  function readProductForm() {
    editingProduct.name = productForm.name.value.trim();
    ['wastePct', 'labor', 'overheadPct', 'markupPct', 'ratePerSqft', 'minPrice'].forEach(function (k) {
      editingProduct[k] = parseFloat(productForm[k].value) || 0;
    });
    editingProduct.pricing = productForm.pricing.value;
  }

  function applyPricingMode() {
    var a = AREA[productForm.pricing.value];
    productForm.dataset.pricing = a ? 'area' : /^(tier|scale)$/.test(productForm.pricing.value) ? 'tier' : 'unit';
    $('.unit-word').textContent = a ? a.area : 'piraso';
    productForm.querySelectorAll('.area-word').forEach(function (el) { el.textContent = a ? a.area : ''; });
    productForm.querySelectorAll('.dim-word').forEach(function (el) { el.textContent = a ? a.dim : ''; });
  }

  function itemOptions(selected) {
    return '<option value="">— pumili —</option>' + sortedItems().map(function (it) {
      return '<option value="' + it.id + '"' + (it.id === selected ? ' selected' : '') + '>' +
        esc(it.name) + ' (' + esc(it.unit) + ')</option>';
    }).join('');
  }

  function renderComponents() {
    var r = Costing.computeProduct(editingProduct, state.items);
    $('#component-rows').innerHTML = editingProduct.components.map(function (c, i) {
      var line = r.lines[i];
      return '<tr data-i="' + i + '"><td><select data-field="itemId">' + itemOptions(c.itemId) + '</select></td>' +
        '<td class="num"><input data-field="qty" type="number" step="any" min="0" value="' + esc(c.qty) + '"></td>' +
        '<td class="num">' + peso.format(line.unitCost) + '</td>' +
        '<td class="num">' + peso.format(line.total) + '</td>' +
        '<td><button type="button" data-remove="' + i + '" class="danger" aria-label="Alisin">✕</button></td></tr>';
    }).join('');
    renderBreakdown();
  }

  function renderBreakdown() {
    var r = Costing.computeProduct(editingProduct, state.items);
    var lines = r.lines;
    var sqft = isArea(editingProduct);
    var per = sqft ? AREA[editingProduct.pricing].area : '';
    var rows = [
      ['Materials', r.materials],
      ['Waste (' + (editingProduct.wastePct || 0) + '%)', r.waste],
      ['Labor', r.labor],
      ['Overhead (' + (editingProduct.overheadPct || 0) + '%)', r.overhead],
      ['Total cost (puhunan)' + (sqft ? ' per ' + per : ''), r.totalCost, 'subtotal']
    ];
    var tier = isPiece(editingProduct);
    if (tier) {
      rows[rows.length - 1][0] = 'Total cost (puhunan) kada piraso';
    } else if (sqft) {
      rows.push(['Presyo per ' + per, editingProduct.ratePerSqft || 0, 'total']);
      if (editingProduct.minPrice) rows.push(['Minimum kada piraso', editingProduct.minPrice]);
    } else {
      rows.push(['Markup (' + (editingProduct.markupPct || 0) + '%)', r.markup]);
      rows.push(['Selling price', r.price, 'total']);
    }
    $('#breakdown').innerHTML = rows.map(function (row) {
      return '<div class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span>' + peso.format(row[1]) + '</span></div>';
    }).join('') + (tier ? '<p class="muted">Presyo: ' + tierSummary(editingProduct) + '. Pinapalitan sa Settings.</p>' : sqft ? '' : '<p class="muted">Tubo: ' + peso.format(r.profit) + ' kada piraso · Margin ' + r.marginPct + '%</p>');

    // Keep the cost and total cells in the component table in sync without re-rendering inputs.
    document.querySelectorAll('#component-rows tr').forEach(function (tr, i) {
      var cells = tr.querySelectorAll('td.num');
      if (lines[i]) {
        cells[1].textContent = peso.format(lines[i].unitCost);
        cells[2].textContent = peso.format(lines[i].total);
      }
    });

    var qty = Math.max(1, parseInt($('#order-qty').value, 10) || 1);
    var out;
    if (tier) {
      out = tierOrderRows(editingProduct, { qty: qty });
    } else if (sqft) {
      out = sqftOrderRows(editingProduct, {
        width: $('#order-width').value, height: $('#order-height').value,
        qty: qty, rate: $('#order-rate').value
      });
    } else {
      out = [
        ['Total (' + qty + ' pcs)', peso.format(r.price * qty), 'total'],
        ['Puhunan', peso.format(r.totalCost * qty)],
        ['Tubo', peso.format(r.profit * qty)]
      ];
    }
    $('#order-total').innerHTML = rowsHtml(out);
  }

  function sqftOrderRows(product, order) {
    var o = Costing.computeSqftOrder(product, state.items, order);
    var a = AREA[product.pricing];
    var out = [
      ['Sukat', fmt(order.width) + ' × ' + fmt(order.height) + ' ' + a.dim + ' = ' + fmt(o.area) + ' ' + a.area],
      ['Kada piraso', fmt(o.area) + ' ' + a.area + ' × ' + peso.format(o.rate) + ' = ' + peso.format(o.computedPerPiece)]
    ];
    if (o.minApplied) out.push(['Minimum na presyo (mas mababa sa ' + peso.format(o.minPrice) + ')', peso.format(o.pricePerPiece) + ' kada piraso', 'minimum']);
    if (o.discount > 0) out.push(['Discount (mula ' + peso.format(o.baseRate) + '/' + a.area + ')', '−' + peso.format(o.discount), 'discount']);
    if (o.discount < 0) out.push(['Dagdag (mula ' + peso.format(o.baseRate) + '/' + a.area + ')', '+' + peso.format(-o.discount)]);
    out.push(['Total (' + order.qty + ' pcs)', peso.format(o.total), 'total']);
    // Cost and profit only mean something once per-sq-ft materials or labor are filled in.
    if (o.costPerSqft > 0) {
      out.push(['Puhunan', peso.format(o.cost)]);
      out.push(['Tubo', peso.format(o.profit) + ' (' + o.marginPct + '%)']);
    }
    return out;
  }

  function tierOrderRows(product, order) {
    var o = Costing.computeTierOrder(product, state.items, order);
    if (!o.hasPrice) return [['Wala pang presyo', 'I-set sa Settings']];
    var note = '';
    if (o.tier) {
      var tiers = Costing.sortedTiers(product);
      note = ' (presyo ng ' + tierRange(tiers, tiers.findIndex(function (t) { return t.minQty === o.tier.minQty; })) + ' pcs)';
    } else if (o.qty < (product.bulkQty || 0)) {
      var save = (product.startPrice || 0) - o.regularPrice;
      if (save > 0) note = ' (' + peso.format(save) + ' mas mura kaysa isahan)';
    }
    var out = [
      ['Presyo para sa ' + o.qty + ' pcs', peso.format(o.regularPrice) + ' kada piraso' + note]
    ];
    if (o.discount > 0) out.push(['Discount (' + peso.format(o.price) + ' kada piraso)', '−' + peso.format(o.discount), 'discount']);
    if (o.discount < 0) out.push(['Dagdag (' + peso.format(o.price) + ' kada piraso)', '+' + peso.format(-o.discount)]);
    out.push(['Total (' + o.qty + ' pcs × ' + peso.format(o.price) + ')', peso.format(o.total), 'total']);
    if (o.unitCost > 0) {
      out.push(['Puhunan', peso.format(o.cost)]);
      out.push(['Tubo', peso.format(o.profit) + ' (' + o.marginPct + '%)']);
    }
    return out;
  }

  function rowsHtml(rows) {
    return rows.map(function (row) {
      return '<div class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span>' + row[1] + '</span></div>';
    }).join('');
  }

  function fmt(n) {
    return (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-PH');
  }

  // ---------- Price Calculator ----------
  var calcDims = {}; // last width/height typed per category
  var calcRateTouched = false; // true once the rate is typed in (a discount)

  function renderCalc(resetRate) {
    var cats = areaProducts();
    var p = findProduct(calcId) || cats[0];
    calcId = p.id;
    if (resetRate) calcRateTouched = false;
    var tier = isPiece(p);
    var a = AREA[p.pricing];
    var qty = Math.max(1, parseInt($('#calc-qty').value, 10) || 1);
    $('#calc-categories').innerHTML = cats.map(function (c) {
      return '<button type="button" role="tab" data-cat="' + c.id + '"' + (c.id === calcId ? ' class="active"' : '') + '>' + esc(c.name) + '</button>';
    }).join('');
    ['#calc-width', '#calc-height'].forEach(function (sel) {
      $(sel).closest('label').style.display = tier ? 'none' : '';
    });
    document.querySelectorAll('.calc-dim').forEach(function (el) { el.textContent = a ? a.dim : ''; });
    $('#calc-rate-label').textContent = tier ? 'Presyo kada piraso' : 'Presyo per ' + a.area;

    if (tier) {
      var t = Costing.computeTierOrder(p, state.items, { qty: qty });
      if (!calcRateTouched) $('#calc-rate').value = t.regularPrice;
      $('#calc-note').textContent = t.hasPrice
        ? 'Naka-set: ' + tierSummary(p) + '. Mapapalitan sa Settings.'
        : 'Wala pang presyo ang ' + p.name + '. I-set muna sa Settings.';
      $('#calc-total').innerHTML = rowsHtml(tierOrderRows(p, { qty: qty, price: $('#calc-rate').value }));
      return;
    }

    if (!calcRateTouched) $('#calc-rate').value = p.ratePerSqft || 0;
    $('#calc-note').textContent = p.ratePerSqft
      ? 'Naka-set: ' + peso.format(p.ratePerSqft) + ' per ' + a.area +
        (p.minPrice ? ', minimum ' + peso.format(p.minPrice) + ' kada piraso' : '') + '. Mapapalitan sa Settings.'
      : 'Wala pang presyo ang ' + p.name + '. I-set muna sa Settings.';
    $('#calc-total').innerHTML = rowsHtml(sqftOrderRows(p, {
      width: $('#calc-width').value, height: $('#calc-height').value, qty: qty, rate: $('#calc-rate').value
    }));
  }

  function selectCalc(id) {
    calcDims[calcId] = [$('#calc-width').value, $('#calc-height').value];
    calcId = id;
    var p = findProduct(id);
    var dims = calcDims[id] || (p.pricing === 'sqin' ? ['2', '2'] : p.pricing === 'sqft' ? ['4', '4'] : ['', '']);
    $('#calc-width').value = dims[0];
    $('#calc-height').value = dims[1];
    renderCalc(true);
  }

  $('#calc-categories').addEventListener('click', function (e) {
    var id = e.target.dataset.cat;
    if (id && id !== calcId) selectCalc(id);
  });
  ['#calc-width', '#calc-height', '#calc-qty', '#calc-rate'].forEach(function (sel) {
    $(sel).addEventListener('input', function () {
      if (sel === '#calc-rate') calcRateTouched = $('#calc-rate').value !== '';
      renderCalc(false);
    });
  });

  // ---------- Settings: price per category ----------
  var priceConfig = $('#price-config');

  function renderPriceConfig() {
    $('#price-config-rows').innerHTML = areaProducts().map(function (p) {
      var labels = Object.keys(AREA).map(function (k) { return [k, AREA[k].label]; }).concat([['tier', TIER_LABEL], ['scale', SCALE_LABEL]]);
      var unitSel = '<select data-field="pricing">' + labels.map(function (l) {
        return '<option value="' + l[0] + '"' + (l[0] === p.pricing ? ' selected' : '') + '>' + l[1] + '</option>';
      }).join('') + '</select>';
      var name = isBuiltin(p.id) ? esc(p.name) : '<input data-field="name" value="' + esc(p.name) + '" required>';
      var priceCells = isScale(p)
        ? '<td colspan="2"><div class="scale">' +
            '<span>₱</span><input data-field="startPrice" type="number" min="0" step="1" value="' + (p.startPrice || 0) + '" aria-label="Presyo sa 1 piraso">' +
            '<span>sa 1 pc, pababa hanggang ₱</span><input data-field="bulkPrice" type="number" min="0" step="1" value="' + (p.bulkPrice || 0) + '" aria-label="Pinakamababang presyo">' +
            '<span>mula</span><input data-field="bulkQty" type="number" min="2" step="1" value="' + (p.bulkQty || 0) + '" aria-label="Mula ilang piraso"><span>pcs</span></div></td>'
        : isTier(p)
        ? '<td colspan="2"><div class="tiers">' + Costing.sortedTiers(p).map(function (t, i) {
            return '<div class="tier" data-tier="' + i + '"><span>Mula</span>' +
              '<input data-tier-field="minQty" type="number" min="1" step="1" value="' + t.minQty + '" aria-label="Mula ilang piraso">' +
              '<span>pcs: ₱</span><input data-tier-field="price" type="number" min="0" step="0.01" value="' + t.price + '" aria-label="Presyo kada piraso">' +
              '<button type="button" class="danger" data-remove-tier="' + i + '" aria-label="Alisin">✕</button></div>';
          }).join('') + '<button type="button" data-add-tier>+ Tier</button>' + tierWarning(p) + '</div></td>'
        : '<td class="num"><input data-field="ratePerSqft" type="number" step="0.01" min="0" value="' + (p.ratePerSqft || 0) + '"></td>' +
          '<td class="num"><input data-field="minPrice" type="number" step="0.01" min="0" value="' + (p.minPrice || 0) + '"></td>';
      return '<tr data-id="' + p.id + '"><td>' + name + '</td>' +
        '<td>' + (isBuiltin(p.id) ? pricingLabel(p) : unitSel) + '</td>' +
        priceCells +
        '<td>' + (isBuiltin(p.id) ? '' : '<button type="button" class="danger" data-remove-cat="' + p.id + '" aria-label="Burahin">✕</button>') + '</td></tr>';
    }).join('');
  }

  // Warn when the last piece of a tier costs more in total than the first of the next.
  function tierWarning(p) {
    var tiers = Costing.sortedTiers(p);
    var bad = [];
    for (var i = 1; i < tiers.length; i++) {
      var q = tiers[i].minQty;
      if ((q - 1) * tiers[i - 1].price > q * tiers[i].price) {
        bad.push((q - 1) + ' pcs (' + peso.format((q - 1) * tiers[i - 1].price) + ') ay mas mahal kaysa ' +
          q + ' pcs (' + peso.format(q * tiers[i].price) + ')');
      }
    }
    return bad.length ? '<p class="warn">Paalala: ' + bad.join('; ') + '.</p>' : '';
  }

  function readPriceConfig() {
    priceConfig.querySelectorAll('#price-config-rows tr').forEach(function (tr) {
      var p = findProduct(tr.dataset.id);
      tr.querySelectorAll('[data-field]').forEach(function (el) {
        var f = el.dataset.field;
        p[f] = f === 'name' ? (el.value.trim() || p.name) : f === 'pricing' ? el.value : (parseFloat(el.value) || 0);
      });
      var tierRows = tr.querySelectorAll('.tier');
      if (tierRows.length || isTier(p)) {
        p.tiers = Array.prototype.map.call(tierRows, function (row) {
          return {
            minQty: Math.max(1, parseInt(row.querySelector('[data-tier-field="minQty"]').value, 10) || 1),
            price: parseFloat(row.querySelector('[data-tier-field="price"]').value) || 0
          };
        });
      }
      if (isTier(p) && !p.tiers.length) p.tiers = [{ minQty: 1, price: p.ratePerSqft || 0 }];
    });
  }

  // Switching a category's pricing, or adding or removing a tier, redraws the table.
  $('#price-config-rows').addEventListener('change', function (e) {
    if (e.target.dataset.field !== 'pricing') return;
    readPriceConfig();
    renderPriceConfig();
  });

  priceConfig.addEventListener('submit', function (e) {
    e.preventDefault();
    readPriceConfig();
    save();
    if (editingProduct && isArea(editingProduct)) openProduct(findProduct(editingProduct.id) || editingProduct);
    renderAll();
    renderCalc(true);
    $('#price-config-msg').textContent = 'Na-save ang mga presyo.';
  });

  $('#category-add').addEventListener('click', function () {
    readPriceConfig(); // keep prices typed but not yet saved
    state.products.push(blankProduct({ id: uid(), name: 'Bagong category', pricing: 'sqin' }));
    save();
    renderAll();
    var inputs = priceConfig.querySelectorAll('input[data-field="name"]');
    if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
  });

  // "sq ft", "sqft", "ft", "per sq ft" -> sqft; anything with "in" -> sqin.
  function parseAreaUnit(text) {
    var t = (text || '').toLowerCase().replace(/[^a-z]/g, '');
    if (/ft|feet|foot/.test(t)) return 'sqft';
    if (/in/.test(t)) return 'sqin';
    return null;
  }

  // "1-12:150; 13-24:100; 25+:80" -> [{ minQty: 1, price: 150 }, ...]
  function parseTiers(text) {
    var tiers = [];
    String(text || '').split(/[;\/|]|,(?=\s*\d+\s*(?:-|\+|:|=))/).forEach(function (part) {
      var m = part.match(/(\d+)\s*(?:-\s*\d+|\+|pcs?|and above|pataas)?[^:=]*[:=]\s*₱?\s*([\d,.]+)/i);
      if (m) tiers.push({ minQty: parseInt(m[1], 10), price: parseFloat(m[2].replace(/,/g, '')) });
    });
    return tiers;
  }

  function parseMoney(text) {
    var n = parseFloat(String(text || '').replace(/[₱,\s]/g, ''));
    return isFinite(n) ? n : null;
  }

  $('#paste-categories-import').addEventListener('click', function () {
    var text = $('#paste-categories').value.trim();
    if (!text) return;
    readPriceConfig(); // keep prices typed but not yet saved
    var added = 0, updated = 0, skipped = [];
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var cols = line.split(line.indexOf('\t') >= 0 ? '\t' : ',').map(function (c) { return c.trim(); });
      var name = cols[0], unit = parseAreaUnit(cols[1]), rate = parseMoney(cols[2]);
      var min = parseMoney(cols[3]) || 0;
      if (/pc|piraso|tier|dami/i.test(cols[1] || '')) {
        var tiers = parseTiers(cols[2]);
        if (!tiers.length) { skipped.push(name); return; }
        var ex = areaProducts().find(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
        if (ex) {
          if (!isBuiltin(ex.id)) ex.pricing = 'tier';
          ex.tiers = tiers;
          updated++;
        } else {
          state.products.push(blankProduct({ id: uid(), name: name, pricing: 'tier', tiers: tiers }));
          added++;
        }
        return;
      }
      if (!name || !unit || rate === null) {
        if (!/^category$/i.test(name)) skipped.push(name || line); // header row is skipped quietly
        return;
      }
      var existing = areaProducts().find(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
      if (existing) {
        if (!isBuiltin(existing.id)) existing.pricing = unit;
        existing.ratePerSqft = rate;
        existing.minPrice = min;
        updated++;
      } else {
        state.products.push(blankProduct({ id: uid(), name: name, pricing: unit, ratePerSqft: rate, minPrice: min }));
        added++;
      }
    });
    save();
    renderAll();
    renderCalc(true);
    $('#paste-categories').value = '';
    $('#price-config-msg').textContent = added + ' bagong category, ' + updated + ' na-update.' +
      (skipped.length ? ' Hindi nabasa: ' + skipped.join(', ') + ' (tingnan ang Sukat at Presyo).' : '');
  });

  $('#price-config-rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr && (e.target.dataset.removeTier !== undefined || e.target.dataset.addTier !== undefined)) {
      readPriceConfig();
      var p = findProduct(tr.dataset.id);
      p.tiers = Costing.sortedTiers(p);
      if (e.target.dataset.addTier !== undefined) {
        var last = p.tiers[p.tiers.length - 1];
        p.tiers.push({ minQty: last ? last.minQty + 1 : 1, price: last ? last.price : 0 });
      } else {
        p.tiers.splice(+e.target.dataset.removeTier, 1);
      }
      renderPriceConfig();
      return;
    }
    var id = e.target.dataset.removeCat;
    if (!id) return;
    askConfirm('Burahin ang category na ito?', function () {
      state.products = state.products.filter(function (p) { return p.id !== id; });
      save();
      if (editingProduct && editingProduct.id === id) { editingProduct = null; productForm.hidden = true; }
      renderAll();
    });
  });

  $('#product-new').addEventListener('click', function () {
    openProduct(blankProduct({ components: [{ itemId: '', qty: 1 }], minPrice: 200 }));
    productForm.name.focus();
  });

  $('#product-list').addEventListener('click', function (e) {
    var li = e.target.closest('li');
    if (!li) return;
    openProduct(state.products.find(function (p) { return p.id === li.dataset.id; }));
  });

  $('#component-add').addEventListener('click', function () {
    editingProduct.components.push({ itemId: '', qty: 1 });
    renderComponents();
  });

  $('#component-rows').addEventListener('input', function (e) {
    var tr = e.target.closest('tr');
    var field = e.target.dataset.field;
    if (!tr || !field) return;
    var c = editingProduct.components[+tr.dataset.i];
    c[field] = e.target.value;
    renderBreakdown();
  });

  $('#component-rows').addEventListener('click', function (e) {
    var i = e.target.dataset.remove;
    if (i === undefined) return;
    editingProduct.components.splice(+i, 1);
    renderComponents();
  });

  productForm.addEventListener('input', function (e) {
    if (e.target.closest('#component-rows') || e.target.closest('.qty-calc')) return;
    // Keep the order rate in step with the product rate until the user types a discount.
    if (e.target.name === 'ratePerSqft' && parseFloat($('#order-rate').value) === editingProduct.ratePerSqft) {
      $('#order-rate').value = e.target.value;
    }
    readProductForm();
    applyPricingMode();
    renderBreakdown();
  });
  productForm.addEventListener('change', function (e) {
    if (e.target.name === 'pricing') { readProductForm(); applyPricingMode(); renderBreakdown(); }
  });
  ['#order-qty', '#order-width', '#order-height', '#order-rate'].forEach(function (sel) {
    $(sel).addEventListener('input', renderBreakdown);
  });

  productForm.addEventListener('submit', function (e) {
    e.preventDefault();
    readProductForm();
    var p = editingProduct;
    p.components = p.components
      .filter(function (c) { return c.itemId; })
      .map(function (c) { return { itemId: c.itemId, qty: parseFloat(c.qty) || 0 }; });
    if (!p.id) p.id = uid();
    var idx = state.products.findIndex(function (x) { return x.id === p.id; });
    if (idx >= 0) state.products[idx] = p; else state.products.push(p);
    save();
    openProduct(p, true);
    if (isArea(p)) { renderPriceConfig(); renderCalc(p.id === calcId); }
  });

  $('#product-duplicate').addEventListener('click', function () {
    readProductForm();
    var copy = JSON.parse(JSON.stringify(editingProduct));
    copy.id = '';
    copy.name = copy.name + ' (copy)';
    openProduct(copy);
  });

  $('#product-delete').addEventListener('click', function () {
    if (!editingProduct.id) return;
    var id = editingProduct.id;
    askConfirm('Burahin ang product na ito?', function () {
      state.products = state.products.filter(function (p) { return p.id !== id; });
      save();
      editingProduct = null;
      productForm.hidden = true;
      renderAll();
    });
  });

  // ---------- Backup / import ----------
  function setMsg(text) { $('#settings-msg').textContent = text; }

  function download(name, content, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $('#export-json').addEventListener('click', function () {
    var date = new Date().toISOString().slice(0, 10);
    download('scarlet-costing-' + date + '.json', JSON.stringify(state, null, 2), 'application/json');
  });

  $('#import-json').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    file.text().then(function (text) {
      var data = JSON.parse(text);
      if (!Array.isArray(data.items) || !Array.isArray(data.products)) throw new Error('bad file');
      askConfirm('Papalitan nito ang lahat ng kasalukuyang data. Ituloy?', function () {
        state = ensureBuiltins({ items: data.items, products: data.products });
        save();
        editingProduct = null;
        productForm.hidden = true;
        renderAll();
        setMsg('Na-import: ' + state.items.length + ' items, ' + state.products.length + ' products.');
      }, 'Oo, palitan');
    }).catch(function () { setMsg('Hindi ma-basa ang file. Siguraduhing JSON export ito ng app.'); });
    e.target.value = '';
  });

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  $('#export-csv').addEventListener('click', function () {
    var header = ['Product', 'Pricing', 'Materials', 'Waste', 'Labor', 'Overhead', 'Total cost', 'Markup', 'Selling price', 'Margin %'];
    var rows = state.products.map(function (p) {
      var r = Costing.computeProduct(p, state.items);
      if (isPiece(p)) {
        return [p.name, pricingLabel(p).toLowerCase(), r.materials, r.waste, r.labor, r.overhead, r.totalCost, '', tierSummary(p), ''];
      }
      if (isArea(p)) {
        var rate = p.ratePerSqft || 0;
        var margin = rate > 0 ? Costing.round2((rate - r.totalCost) / rate * 100) : 0;
        return [p.name, 'per ' + AREA[p.pricing].area, r.materials, r.waste, r.labor, r.overhead, r.totalCost, '', rate, margin];
      }
      return [p.name, 'per piraso', r.materials, r.waste, r.labor, r.overhead, r.totalCost, r.markup, r.price, r.marginPct];
    });
    var csv = [header].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\n');
    download('scarlet-costing.csv', csv, 'text/csv');
  });

  $('#paste-import').addEventListener('click', function () {
    var text = $('#paste-items').value.trim();
    if (!text) return;
    var added = 0, updated = 0;
    text.split(/\r?\n/).forEach(function (line) {
      var cols = line.split(line.indexOf('\t') >= 0 ? '\t' : ',').map(function (s) { return s.trim(); });
      var cost = parseFloat((cols[3] || '').replace(/[₱,\s]/g, ''));
      if (!cols[0] || !isFinite(cost)) return; // skips header rows and blanks
      var packQty = parseFloat((cols[4] || '').replace(/[,\s]/g, ''));
      var pack = packQty > 0 ? { packPrice: cost, packQty: packQty } : { packPrice: 0, packQty: 0 };
      if (packQty > 0) cost = cost / packQty;
      var existing = state.items.find(function (it) { return it.name.toLowerCase() === cols[0].toLowerCase(); });
      if (existing) {
        existing.category = cols[1] || existing.category;
        existing.unit = cols[2] || existing.unit;
        existing.cost = cost;
        Object.assign(existing, pack);
        updated++;
      } else {
        state.items.push(Object.assign({ id: uid(), name: cols[0], category: cols[1] || '', unit: cols[2] || 'pc', cost: cost }, pack));
        added++;
      }
    });
    save();
    renderAll();
    $('#paste-items').value = '';
    setMsg(added + ' bagong items, ' + updated + ' na-update.');
  });

  function renderAll() {
    renderItems();
    renderProductList();
    renderPriceConfig();
    renderCalc(false);
    if (editingProduct && !productForm.hidden) renderComponents();
  }

  $('#calc-width').value = '4';
  $('#calc-height').value = '4';
  renderAll();
})();
