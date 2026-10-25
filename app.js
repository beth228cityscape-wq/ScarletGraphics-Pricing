(function () {
  var STORAGE_KEY = 'scarlet-costing-v1';
  var peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  // Built-in price categories for the Price Calculator. They are area-priced
  // products; their rate and minimum are changed under Settings.
  var BUILTINS = [
    { id: 'tarpaulin', name: 'Tarpaulin', pricing: 'sqft', ratePerSqft: 25, minPrice: 200 },
    { id: 'sticker', name: 'Sticker', pricing: 'sizes', ratePerSqft: 0, minPrice: 0, bulkQty: 1000, minOrder: 500, sizes: [
      { w: 1, h: 1, price: 1 }, { w: 1.5, h: 1.5, price: 1 }, { w: 2, h: 2, price: 1 },
      { w: 2, h: 3, price: 1.5 }, { w: 2, h: 4, price: 1.75 }, { w: 2, h: 5, price: 2 },
      { w: 2.5, h: 2.5, price: 1.5 }, { w: 3, h: 3, price: 2 }, { w: 3, h: 4, price: 2.25 },
      { w: 3, h: 5, price: 2.75 }, { w: 4, h: 4, price: 3 }, { w: 4, h: 5, price: 3.5 },
      { w: 5, h: 5, price: 4.5 }
    ] },
    { id: 'mug', name: 'Mug', pricing: 'scale', startPrice: 150, bulkPrice: 80, bulkQty: 24 },
    { id: 'sintra', name: 'Sintra Board', pricing: 'areaTiers', minPrice: 200, areaTiers: [
      { minArea: 0, rate: 1.8 }, { minArea: 386.1, rate: 1.5 }, { minArea: 864, rate: 1.2 }, { minArea: 1297, rate: 1 }
    ] },
    { id: 'business-cards', name: 'Business Cards', pricing: 'variants', packSize: 100, variants: [
      { name: 'Single Face', price: 350 }, { name: 'Double Face', price: 450 },
      { name: 'Laminated (Matte or Glossy)', price: 650 }
    ] }
  ];
  var TIER_LABEL = 'Per piece (by quantity)';
  var SCALE_LABEL = 'Per piece (sliding price)';
  var SIZES_LABEL = 'Per piece by size (bulk list)';
  var VARIANTS_LABEL = 'Per pack, with variants';
  var AREA_TIERS_LABEL = 'Per sq in, rate by size';
  // Paper sizes in inches, used to name sq in thresholds.
  var PAPER = [['A4', 8.3, 11.7], ['A3', 11.7, 16.5], ['A2', 16.5, 23.4], ['A1', 23.4, 33.1], ['A0', 33.1, 46.8]];
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
        return { items: data.items || [], products: data.products || [], print3d: data.print3d || null };
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
    // Packs are costed per pc and rolls per sq ft (items saved earlier may say otherwise).
    st.items.forEach(function (it) {
      if (it.rollWidth > 0 && it.rollLength > 0) it.unit = 'sq ft';
      else if (it.packQty > 0) it.unit = 'pc';
    });
    // Sticker started as a plain per-sq-in price; it is now priced by size.
    st.products.forEach(function (p) {
      if (p.id === 'sticker' && p.pricing === 'sqin') {
        var b = BUILTINS.find(function (x) { return x.id === 'sticker'; });
        Object.assign(p, { pricing: 'sizes', bulkQty: b.bulkQty, minOrder: b.minOrder, sizes: JSON.parse(JSON.stringify(b.sizes)) });
      }
    });
    // The first Mug used 150/100/80 tiers, which made 12 pcs cost more than 13.
    st.products.forEach(function (p) {
      if (p.id === 'mug' && p.pricing === 'tier' &&
          JSON.stringify(p.tiers) === '[{"minQty":1,"price":150},{"minQty":13,"price":100},{"minQty":25,"price":80}]') {
        Object.assign(p, { pricing: 'scale', startPrice: 150, bulkPrice: 80, bulkQty: 24 });
      }
    });
    // Sintra first had only the A2 break; big boards now get ₱1.20 and ₱1.00 brackets.
    st.products.forEach(function (p) {
      if (p.id === 'sintra' && p.pricing === 'areaTiers' &&
          JSON.stringify(p.areaTiers) === '[{"minArea":0,"rate":1.8},{"minArea":386.1,"rate":1.5}]') {
        p.areaTiers = JSON.parse(JSON.stringify(BUILTINS.find(function (x) { return x.id === 'sintra'; }).areaTiers));
      }
    });
    BUILTINS.forEach(function (b) {
      if (st.products.some(function (p) { return p.id === b.id; })) return;
      // Adopt a matching product made by hand before the built-in one existed.
      var own = st.products.find(function (p) {
        return p.pricing === b.pricing && (p.name || '').trim().toLowerCase() === b.name.toLowerCase();
      });
      if (own) own.id = b.id;
      else st.products.push(blankProduct(JSON.parse(JSON.stringify(b))));
    });
    return st;
  }

  function isBuiltin(id) {
    return BUILTINS.some(function (b) { return b.id === id; });
  }

  function isArea(p) { return !!(p && AREA[p.pricing]); }
  function isTier(p) { return !!(p && p.pricing === 'tier'); }
  function isScale(p) { return !!(p && p.pricing === 'scale'); }
  function isSizes(p) { return !!(p && p.pricing === 'sizes'); }
  function isVariants(p) { return !!(p && p.pricing === 'variants'); }
  function isAreaTiers(p) { return !!(p && p.pricing === 'areaTiers'); }
  function isPiece(p) { return isTier(p) || isScale(p) || isSizes(p) || isVariants(p) || isAreaTiers(p); }

  // "A2 (16.5 × 23.4 in)" when an area matches a paper size, else "386.1 sq in".
  function areaName(area) {
    var hit = PAPER.find(function (s) { return Math.abs(s[1] * s[2] - area) < 0.5; });
    return hit ? hit[0] + ' (' + hit[1] + ' × ' + hit[2] + ' in)' : fmt(area) + ' sq in';
  }
  function isCategory(p) { return isArea(p) || isPiece(p); }

  function pricingLabel(p) {
    return isTier(p) ? TIER_LABEL : isScale(p) ? SCALE_LABEL : isSizes(p) ? SIZES_LABEL : isVariants(p) ? VARIANTS_LABEL : isAreaTiers(p) ? AREA_TIERS_LABEL : AREA[p.pricing].label;
  }

  // "1-12 pcs: ₱150 · 13-24 pcs: ₱100 · 25+ pcs: ₱80"
  function tierRange(tiers, i) {
    var t = tiers[i], next = tiers[i + 1];
    if (!next) return t.minQty + '+';
    return next.minQty - 1 > t.minQty ? t.minQty + '-' + (next.minQty - 1) : String(t.minQty);
  }

  function tierSummary(p) {
    if (isAreaTiers(p)) {
      var ts = (p.areaTiers || []).slice().sort(function (a, b) { return a.minArea - b.minArea; });
      return ts.map(function (t, i) {
        return unitMoney(t.rate) + '/sq in ' + (i === 0 ? (ts[1] ? 'up to ' + areaName(ts[1].minArea) : '') : 'above ' + areaName(t.minArea));
      }).join(', ') + (p.minPrice ? ', minimum ' + peso.format(p.minPrice) + ' per piece' : '');
    }
    if (isVariants(p)) {
      return (p.variants || []).map(function (v) { return v.name + ' ' + peso.format(v.price); }).join(' · ') +
        ' per ' + fmt(p.packSize) + ' pcs';
    }
    if (isSizes(p)) {
      return (p.sizes || []).length + ' sizes, bulk price from ' + fmt(p.bulkQty) + ' pcs, minimum order ' +
        peso.format(p.minOrder || 0) + (p.ratePerSqft ? ', small orders ' + unitMoney(p.ratePerSqft) + ' per sq in' : '');
    }
    if (isScale(p)) {
      return peso.format(p.startPrice || 0) + ' for 1 pc, sliding down to ' + peso.format(p.bulkPrice || 0) +
        ' from ' + (p.bulkQty || 0) + ' pcs';
    }
    var tiers = Costing.sortedTiers(p);
    if (!tiers.length) return 'no price yet';
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
    $('#confirm-yes').textContent = yesLabel || 'Yes, delete';
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
      return !q || (it.name + ' ' + (it.category || '') + ' ' + (it.supplier || '')).toLowerCase().indexOf(q) !== -1;
    });
    $('#item-rows').innerHTML = rows.map(function (it) {
      var bought = isRoll(it)
        ? peso.format(it.packPrice) + ' / ' + fmt(it.rollWidth) + ' ' + it.rollWidthUnit + ' × ' + fmt(it.rollLength) + ' ' + it.rollLengthUnit
        : it.packQty ? peso.format(it.packPrice) + ' / ' + fmt(it.packQty) + ' pcs' : '';
      return '<tr><td>' + esc(it.name) + (it.supplier ? '<div class="muted small">' + esc(it.supplier) + '</div>' : '') +
        '</td><td>' + esc(it.category) + '</td><td>' + esc(it.unit) +
        '</td><td class="num muted">' + bought +
        '</td><td class="num">' + unitMoney(it.cost) + ' <span class="muted">/ ' + esc(it.unit) + '</span></td><td class="row-actions">' +
        '<button data-edit="' + it.id + '">Edit</button>' +
        '<button data-del="' + it.id + '" class="danger">Delete</button></td></tr>';
    }).join('');
    $('#item-empty').hidden = state.items.length > 0;

    var cats = {};
    state.items.forEach(function (it) { if (it.category) cats[it.category] = true; });
    $('#category-list').innerHTML = Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c) + '">';
    }).join('');
    var sups = {};
    state.items.forEach(function (it) { if (it.supplier) sups[it.supplier] = true; });
    $('#supplier-list').innerHTML = Object.keys(sups).sort().map(function (c) {
      return '<option value="' + esc(c) + '">';
    }).join('');
  }

  function resetItemForm() {
    itemForm.reset();
    itemForm.id.value = '';
    updatePackCost();
    $('#item-form-title').textContent = 'New item';
    $('#item-cancel').hidden = true;
  }

  function isRoll(it) { return it.rollWidth > 0 && it.rollLength > 0; }

  // Reads the pack/roll fields. Returns how the cost per unit is derived from
  // them, or null when the cost per unit is typed in directly.
  function boughtAs() {
    var f = itemForm;
    var price = parseFloat(f.packPrice.value);
    if (!(price > 0)) return null;
    var w = parseFloat(f.rollWidth.value), l = parseFloat(f.rollLength.value);
    if (w > 0 && l > 0) {
      // Rolls (vinyl, tarpaulin) are always costed per sq ft.
      var area = Costing.rollArea(w, f.rollWidthUnit.value, l, f.rollLengthUnit.value, 'sqft');
      return {
        cost: price / area,
        fields: { packPrice: price, packQty: 0, rollWidth: w, rollWidthUnit: f.rollWidthUnit.value, rollLength: l, rollLengthUnit: f.rollLengthUnit.value },
        note: fmt(w) + ' ' + f.rollWidthUnit.value + ' × ' + fmt(l) + ' ' + f.rollLengthUnit.value + ' = ' +
          fmt(area) + ' sq ft → ' + peso.format(price) + ' ÷ ' + fmt(area) + ' = '
      };
    }
    var qty = parseFloat(f.packQty.value);
    if (qty > 0) {
      return {
        cost: price / qty,
        fields: { packPrice: price, packQty: qty, rollWidth: 0, rollLength: 0 },
        note: peso.format(price) + ' ÷ ' + fmt(qty) + ' = '
      };
    }
    return null;
  }

  function updatePackCost() {
    var f = itemForm;
    // Rolls are costed per sq ft and packs per pc, so their unit is fixed.
    var roll = parseFloat(f.rollWidth.value) > 0 && parseFloat(f.rollLength.value) > 0;
    var pack = !roll && parseFloat(f.packQty.value) > 0;
    if (roll) f.unit.value = 'sq ft';
    else if (pack) f.unit.value = 'pc';
    f.unit.readOnly = roll || pack;
    var b = boughtAs();
    f.cost.readOnly = b !== null;
    if (b) f.cost.value = Math.round(b.cost * 10000) / 10000;
    var unit = f.unit.value.trim() || 'unit';
    var c = b ? unitMoney(b.cost) : '';
    $('#pack-note').textContent = b ? b.note + c + ' per ' + unit : '';
  }

  ['packPrice', 'packQty', 'unit', 'rollWidth', 'rollLength', 'rollWidthUnit', 'rollLengthUnit'].forEach(function (k) {
    itemForm[k].addEventListener('input', updatePackCost);
    itemForm[k].addEventListener('change', updatePackCost);
  });

  itemForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var b = boughtAs();
    var data = Object.assign({
      id: itemForm.id.value || uid(),
      name: itemForm.name.value.trim(),
      category: itemForm.category.value.trim(),
      supplier: itemForm.supplier.value.trim(),
      unit: itemForm.unit.value.trim(),
      cost: b ? b.cost : (parseFloat(itemForm.cost.value) || 0),
      packPrice: 0, packQty: 0, rollWidth: 0, rollLength: 0
    }, b ? b.fields : {});
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
      itemForm.supplier.value = it.supplier || '';
      itemForm.packPrice.value = it.packQty || isRoll(it) ? it.packPrice : '';
      itemForm.packQty.value = it.packQty || '';
      itemForm.rollWidth.value = isRoll(it) ? it.rollWidth : '';
      itemForm.rollLength.value = isRoll(it) ? it.rollLength : '';
      itemForm.rollWidthUnit.value = it.rollWidthUnit || 'ft';
      itemForm.rollLengthUnit.value = it.rollLengthUnit || 'm';
      updatePackCost();
      $('#item-form-title').textContent = 'Edit item';
      $('#item-cancel').hidden = false;
      itemForm.scrollIntoView({ behavior: 'smooth' });
    } else if (delId) {
      var usedIn = state.products.filter(function (p) {
        return p.components.some(function (c) { return c.itemId === delId; });
      }).map(function (p) { return p.name; });
      var msg = usedIn.length
        ? 'This item is used in: ' + usedIn.join(', ') + '. Delete anyway?'
        : 'Delete this item?';
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
    $('#product-form-title').textContent = p.id ? 'Edit product' : 'New product';
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
    productForm.dataset.pricing = a ? 'area' : /^(tier|scale|sizes|variants|areaTiers)$/.test(productForm.pricing.value) ? 'tier' : 'unit';
    $('.unit-word').textContent = a ? a.area : 'piece';
    productForm.querySelectorAll('.area-word').forEach(function (el) { el.textContent = a ? a.area : ''; });
    productForm.querySelectorAll('.dim-word').forEach(function (el) { el.textContent = a ? a.dim : ''; });
  }

  function itemOptions(selected) {
    return '<option value="">— choose —</option>' + sortedItems().map(function (it) {
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
        '<td class="num">' + unitMoney(line.unitCost) + '</td>' +
        '<td class="num">' + peso.format(line.total) + '</td>' +
        '<td><button type="button" data-remove="' + i + '" class="danger" aria-label="Remove">✕</button></td></tr>';
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
      ['Total cost' + (sqft ? ' per ' + per : ''), r.totalCost, 'subtotal']
    ];
    var tier = isPiece(editingProduct);
    if (tier) {
      rows[rows.length - 1][0] = 'Total cost per piece';
    } else if (sqft) {
      rows.push(['Price per ' + per, editingProduct.ratePerSqft || 0, 'total']);
      if (editingProduct.minPrice) rows.push(['Minimum per piece', editingProduct.minPrice]);
    } else {
      rows.push(['Markup (' + (editingProduct.markupPct || 0) + '%)', r.markup]);
      rows.push(['Selling price', r.price, 'total']);
    }
    $('#breakdown').innerHTML = rows.map(function (row) {
      return '<div class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span>' + peso.format(row[1]) + '</span></div>';
    }).join('') + (tier ? '<p class="muted">Price: ' + tierSummary(editingProduct) + '. Change it in Settings.</p>' : sqft ? '' : '<p class="muted">Profit: ' + peso.format(r.profit) + ' per piece · Margin ' + r.marginPct + '%</p>');

    // Keep the cost and total cells in the component table in sync without re-rendering inputs.
    document.querySelectorAll('#component-rows tr').forEach(function (tr, i) {
      var cells = tr.querySelectorAll('td.num');
      if (lines[i]) {
        cells[1].textContent = unitMoney(lines[i].unitCost);
        cells[2].textContent = peso.format(lines[i].total);
      }
    });

    var qty = Math.max(1, parseInt($('#order-qty').value, 10) || 1);
    var out;
    if (isSizes(editingProduct) || isVariants(editingProduct) || isAreaTiers(editingProduct)) {
      out = [['Price', 'Use the Price Calculator']];
    } else if (tier) {
      out = tierOrderRows(editingProduct, { qty: qty });
    } else if (sqft) {
      out = sqftOrderRows(editingProduct, {
        width: $('#order-width').value, height: $('#order-height').value,
        qty: qty, rate: $('#order-rate').value
      });
    } else {
      out = [
        ['Total (' + pcs(qty) + ')', peso.format(r.price * qty), 'total'],
        ['Cost', peso.format(r.totalCost * qty)],
        ['Profit', peso.format(r.profit * qty)]
      ];
    }
    $('#order-total').innerHTML = rowsHtml(out);
  }

  function sqftOrderRows(product, order) {
    var o = Costing.computeSqftOrder(product, state.items, order);
    var a = AREA[product.pricing];
    var out = [
      ['Size', fmt(order.width) + ' × ' + fmt(order.height) + ' ' + a.dim + ' = ' + fmt(o.area) + ' ' + a.area],
      ['Per piece', fmt(o.area) + ' ' + a.area + ' × ' + peso.format(o.rate) + ' = ' + peso.format(o.computedPerPiece)]
    ];
    if (o.minApplied) out.push(['Minimum price (below ' + peso.format(o.minPrice) + ')', peso.format(o.pricePerPiece) + ' per piece', 'minimum']);
    if (o.discount > 0) out.push(['Discount (from ' + peso.format(o.baseRate) + '/' + a.area + ')', '−' + peso.format(o.discount), 'discount']);
    if (o.discount < 0) out.push(['Surcharge (from ' + peso.format(o.baseRate) + '/' + a.area + ')', '+' + peso.format(-o.discount)]);
    out.push(['Total (' + pcs(order.qty) + ')', peso.format(o.total), 'total']);
    // Cost and profit only mean something once per-sq-ft materials or labor are filled in.
    if (o.costPerSqft > 0) {
      out.push(['Cost', peso.format(o.cost)]);
      out.push(['Profit', peso.format(o.profit) + ' (' + o.marginPct + '%)']);
    }
    return out;
  }

  function tierOrderRows(product, order) {
    var o = Costing.computeTierOrder(product, state.items, order);
    if (!o.hasPrice) return [['No price yet', 'Set it in Settings']];
    var note = '';
    if (o.tier) {
      var tiers = Costing.sortedTiers(product);
      note = ' (price for ' + tierRange(tiers, tiers.findIndex(function (t) { return t.minQty === o.tier.minQty; })) + ' pcs)';
    } else if (o.qty < (product.bulkQty || 0)) {
      var save = (product.startPrice || 0) - o.regularPrice;
      if (save > 0) note = ' (' + peso.format(save) + ' less than buying 1)';
    }
    var out = [
      ['Price for ' + pcs(o.qty), peso.format(o.regularPrice) + ' per piece' + note]
    ];
    if (o.discount > 0) out.push(['Discount (' + peso.format(o.price) + ' per piece)', '−' + peso.format(o.discount), 'discount']);
    if (o.discount < 0) out.push(['Surcharge (' + peso.format(o.price) + ' per piece)', '+' + peso.format(-o.discount)]);
    out.push(['Total (' + pcs(o.qty) + ' × ' + peso.format(o.price) + ')', peso.format(o.total), 'total']);
    if (o.unitCost > 0) {
      out.push(['Cost', peso.format(o.cost)]);
      out.push(['Profit', peso.format(o.profit) + ' (' + o.marginPct + '%)']);
    }
    return out;
  }

  function areaTierOrderRows(product, order) {
    var o = Costing.computeAreaTierOrder(product, order);
    if (!o.tier) return [['No price yet', 'Set it in Settings']];
    var out = [
      ['Size', fmt(order.width) + ' × ' + fmt(order.height) + ' in = ' + fmt(o.area) + ' sq in'],
      ['Per piece', fmt(o.area) + ' sq in × ' + unitMoney(o.rate) + ' = ' + peso.format(o.computedPerPiece)]
    ];
    if (o.minApplied) out.push(['Minimum price (below ' + peso.format(product.minPrice) + ')', peso.format(o.pricePerPiece) + ' per piece', 'minimum']);
    if (o.bracketFloorApplied) {
      var name = areaName(o.tier.minArea).split(' ')[0];
      out.push(['Not less than the ' + name + ' price', peso.format(o.pricePerPiece) + ' per piece', 'minimum']);
    }
    if (o.discount > 0) out.push(['Discount', '−' + peso.format(o.discount), 'discount']);
    if (o.discount < 0) out.push(['Surcharge', '+' + peso.format(-o.discount)]);
    out.push(['Total (' + pcs(o.qty) + ')', peso.format(o.total), 'total']);
    return out;
  }

  function variantOrderRows(product, order) {
    var o = Costing.computeVariantOrder(product, order);
    if (!o.variant) return [['No price yet', 'Set it in Settings']];
    var out = [
      [esc(o.variant.name), peso.format(o.regularPrice) + ' per ' + fmt(o.packSize) + ' pcs'],
      ['Quantity', fmt(o.sets) + ' × ' + fmt(o.packSize) + ' = ' + fmt(o.pieces) + ' pcs']
    ];
    if (o.discount > 0) out.push(['Discount (' + peso.format(o.price) + ' per ' + fmt(o.packSize) + ' pcs)', '−' + peso.format(o.discount), 'discount']);
    if (o.discount < 0) out.push(['Surcharge (' + peso.format(o.price) + ' per ' + fmt(o.packSize) + ' pcs)', '+' + peso.format(-o.discount)]);
    out.push(['Total (' + fmt(o.pieces) + ' pcs)', peso.format(o.total), 'total']);
    return out;
  }

  function sizeOrderRows(product, order) {
    var o = Costing.computeSizeOrder(product, state.items, order);
    if (!o.mode) {
      return [['No price for this size', 'Add it to the size list in Settings, or set a price per sq in']];
    }
    var out = [['Size', fmt(order.width) + ' × ' + fmt(order.height) + ' in = ' + fmt(o.area) + ' sq in']];
    if (o.mode === 'bulk') {
      out.push(['Bulk price (' + fmt(o.bulkQty) + '+ pcs)', peso.format(o.bulkPrice) + ' per piece']);
    } else if (o.mode === 'small') {
      out.push(['Bulk price', peso.format(o.bulkPrice) + ' × ' + pcs(o.qty) + ' = ' + peso.format(o.bulkPrice * o.qty)]);
      out.push(['Small-order fee (below ' + fmt(o.bulkQty) + ' pcs)', '+' + peso.format(o.smallFee)]);
    } else {
      var raw = o.area * o.rate;
      out.push(['Small order, per sq in', fmt(o.area) + ' sq in × ' + unitMoney(o.rate) + ' = ' + unitMoney(raw) +
        (o.perPiece > raw + 0.005 ? ', minimum ' + peso.format(o.perPiece) : '') + ' per piece']);
    }
    out.push(['Total (' + pcs(o.qty) + ')', peso.format(o.total), 'total']);
    out.push(['Works out to', unitMoney(o.perPiece) + ' per piece']);
    if (o.mode !== 'bulk' && o.bulkPrice !== null) {
      out.push(['At ' + fmt(o.bulkQty) + ' pcs', peso.format(o.bulkPrice * o.bulkQty) + ' (' + peso.format(o.bulkPrice) + ' per piece)', 'hint']);
    }
    return out;
  }

  function rowsHtml(rows) {
    return rows.map(function (row) {
      return '<div class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span>' + row[1] + '</span></div>';
    }).join('');
  }

  // Peso amount that keeps small unit costs readable (₱0.0339 instead of ₱0.03).
  function unitMoney(n) {
    return n > 0 && n < 1 ? '₱' + (Math.round(n * 10000) / 10000) : peso.format(n);
  }

  function pcs(n) { return +n === 1 ? '1 pc' : fmt(n) + ' pcs'; }

  function fmt(n) {
    return (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-PH');
  }

  // ---------- Price Calculator ----------
  var calcDims = {}; // last width/height typed per category
  var calcRateTouched = false; // true once the rate is typed in (a discount)
  var calcVariant = 0; // variant picked for a per-pack category

  function renderCalc(resetRate) {
    var cats = areaProducts();
    var p = findProduct(calcId) || cats[0];
    calcId = p.id;
    if (resetRate) calcRateTouched = false;
    var sizes = isSizes(p);
    var variants = isVariants(p);
    var areaTiers = isAreaTiers(p);
    var tier = isPiece(p) && !sizes && !areaTiers;
    var a = sizes || areaTiers ? AREA.sqin : AREA[p.pricing];
    var qty = Math.max(1, parseInt($('#calc-qty').value, 10) || 1);
    $('#calc-categories').innerHTML = cats.map(function (c) {
      return '<button type="button" role="tab" data-cat="' + c.id + '"' + (c.id === calcId ? ' class="active"' : '') + '>' + esc(c.name) + '</button>';
    }).join('');
    ['#calc-width', '#calc-height'].forEach(function (sel) {
      $(sel).closest('label').style.display = tier ? 'none' : '';
    });
    document.querySelectorAll('.calc-dim').forEach(function (el) { el.textContent = a ? a.dim : ''; });
    $('#calc-variants').hidden = !variants;
    $('#calc-qty-label').textContent = variants ? 'Number of sets (' + fmt(p.packSize) + ' pcs each)' : 'Quantity (pcs)';
    $('#calc-rate-label').textContent = variants ? 'Price per ' + fmt(p.packSize) + ' pcs' : tier ? 'Price per piece' : areaTiers ? 'Price per sq in' : sizes ? 'Small-order price per sq in (optional)' : 'Price per ' + a.area;

    if (areaTiers) {
      var ao = Costing.computeAreaTierOrder(p, { width: $('#calc-width').value, height: $('#calc-height').value, qty: qty });
      if (!calcRateTouched) $('#calc-rate').value = ao.regularRate;
      $('#calc-note').textContent = (p.areaTiers || []).length
        ? 'Set to: ' + tierSummary(p) + '. Change it in Settings.'
        : p.name + ' has no price yet. Set it in Settings first.';
      $('#calc-total').innerHTML = rowsHtml(areaTierOrderRows(p, {
        width: $('#calc-width').value, height: $('#calc-height').value, qty: qty,
        rate: calcRateTouched ? $('#calc-rate').value : ''
      }));
      return;
    }

    if (variants) {
      var vs = p.variants || [];
      if (calcVariant >= vs.length) calcVariant = 0;
      $('#calc-variants').innerHTML = vs.map(function (v, i) {
        return '<button type="button" role="radio" aria-checked="' + (i === calcVariant) + '" data-variant="' + i + '"' +
          (i === calcVariant ? ' class="active"' : '') + '>' + esc(v.name) + '<small>' + peso.format(v.price) + '</small></button>';
      }).join('');
      var vo = Costing.computeVariantOrder(p, { variant: calcVariant, sets: qty });
      if (!calcRateTouched) $('#calc-rate').value = vo.regularPrice;
      $('#calc-note').textContent = vs.length
        ? 'Prices are per ' + fmt(p.packSize) + ' pcs. Change them in Settings.'
        : p.name + ' has no price yet. Set it in Settings first.';
      $('#calc-total').innerHTML = rowsHtml(variantOrderRows(p, { variant: calcVariant, sets: qty, price: $('#calc-rate').value }));
      return;
    }

    if (sizes) {
      if (!calcRateTouched) $('#calc-rate').value = p.ratePerSqft || '';
      $('#calc-note').textContent = 'Bulk price list from ' + fmt(p.bulkQty) + ' pcs. Below that, minimum order ' +
        peso.format(p.minOrder || 0) + '. Change it in Settings.';
      $('#calc-total').innerHTML = rowsHtml(sizeOrderRows(p, {
        width: $('#calc-width').value, height: $('#calc-height').value, qty: qty, rate: $('#calc-rate').value
      }));
      return;
    }

    if (tier) {
      var t = Costing.computeTierOrder(p, state.items, { qty: qty });
      if (!calcRateTouched) $('#calc-rate').value = t.regularPrice;
      $('#calc-note').textContent = t.hasPrice
        ? 'Set to: ' + tierSummary(p) + '. Change it in Settings.'
        : p.name + ' has no price yet. Set it in Settings first.';
      $('#calc-total').innerHTML = rowsHtml(tierOrderRows(p, { qty: qty, price: $('#calc-rate').value }));
      return;
    }

    if (!calcRateTouched) $('#calc-rate').value = p.ratePerSqft || 0;
    $('#calc-note').textContent = p.ratePerSqft
      ? 'Set to: ' + peso.format(p.ratePerSqft) + ' per ' + a.area +
        (p.minPrice ? ', minimum ' + peso.format(p.minPrice) + ' per piece' : '') + '. Change it in Settings.'
      : p.name + ' has no price yet. Set it in Settings first.';
    $('#calc-total').innerHTML = rowsHtml(sqftOrderRows(p, {
      width: $('#calc-width').value, height: $('#calc-height').value, qty: qty, rate: $('#calc-rate').value
    }));
  }

  function selectCalc(id) {
    calcDims[calcId] = [$('#calc-width').value, $('#calc-height').value];
    calcId = id;
    calcVariant = 0;
    var p = findProduct(id);
    var dims = calcDims[id] || (p.pricing === 'areaTiers' ? ['11.7', '16.5'] : p.pricing === 'sqin' || p.pricing === 'sizes' ? ['2', '2'] : p.pricing === 'sqft' ? ['4', '4'] : ['', '']);
    $('#calc-width').value = dims[0];
    $('#calc-height').value = dims[1];
    renderCalc(true);
  }

  $('#calc-variants').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-variant]');
    if (!btn) return;
    calcVariant = +btn.dataset.variant;
    renderCalc(true);
  });

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

  // ---------- 3D printing calculator ----------
  var P3D_DEFAULTS = {
    filaments: [{ name: 'PLA', grams: 100, costPerKg: 1000 }],
    hours: 5, minutes: 30,
    includePrinter: true, kwhRate: 12, watts: 250, printerPrice: 15000, lifespanHours: 2000,
    includeLabor: true, laborRate: 50, laborHours: 0.5,
    includeBusiness: true, failurePct: 5, markupPct: 30
  };
  var P3D_NUMBERS = ['hours', 'minutes', 'kwhRate', 'watts', 'printerPrice', 'lifespanHours', 'laborRate', 'laborHours', 'failurePct', 'markupPct'];
  var P3D_TOGGLES = ['includePrinter', 'includeLabor', 'includeBusiness'];
  var p3dForm = $('#p3d-form');
  var p3dView = 'internal';

  function p3dJob() {
    if (!state.print3d) state.print3d = JSON.parse(JSON.stringify(P3D_DEFAULTS));
    return state.print3d;
  }

  function fillP3d() {
    var job = p3dJob();
    P3D_NUMBERS.forEach(function (k) { p3dForm[k].value = job[k] == null ? '' : job[k]; });
    P3D_TOGGLES.forEach(function (k) { p3dForm[k].checked = !!job[k]; });
    $('#p3d-filaments').innerHTML = job.filaments.map(function (f, i) {
      return '<tr data-i="' + i + '">' +
        '<td><input data-f="name" value="' + esc(f.name || '') + '" placeholder="e.g. PLA" aria-label="Filament name"></td>' +
        '<td class="num"><input data-f="grams" type="number" min="0" step="0.1" value="' + (f.grams == null ? '' : f.grams) + '" aria-label="Weight in grams"></td>' +
        '<td class="num"><input data-f="costPerKg" type="number" min="0" step="0.01" value="' + (f.costPerKg == null ? '' : f.costPerKg) + '" aria-label="Cost per kg"></td>' +
        '<td>' + (job.filaments.length > 1 ? '<button type="button" class="danger" data-remove-filament="' + i + '" aria-label="Remove">✕</button>' : '') + '</td></tr>';
    }).join('');
    renderP3d();
  }

  function readP3d() {
    var job = p3dJob();
    P3D_NUMBERS.forEach(function (k) { job[k] = p3dForm[k].value === '' ? '' : parseFloat(p3dForm[k].value) || 0; });
    P3D_TOGGLES.forEach(function (k) { job[k] = p3dForm[k].checked; });
    job.filaments = Array.prototype.map.call($('#p3d-filaments').querySelectorAll('tr'), function (tr) {
      var v = function (f) { return tr.querySelector('[data-f="' + f + '"]').value; };
      return { name: v('name').trim(), grams: v('grams') === '' ? '' : parseFloat(v('grams')) || 0, costPerKg: v('costPerKg') === '' ? '' : parseFloat(v('costPerKg')) || 0 };
    });
  }

  function renderP3d() {
    var job = p3dJob();
    P3D_TOGGLES.forEach(function (k) { p3dForm[k].closest('fieldset').classList.toggle('off', !job[k]); });
    var r = Costing.compute3dPrint(job);
    var grams = job.filaments.reduce(function (sum, f) { return sum + (parseFloat(f.grams) || 0); }, 0);
    var time = Math.floor(r.hours) + 'h ' + Math.round((r.hours % 1) * 60) + 'm';
    var rows;
    if (p3dView === 'client') {
      rows = [
        ['Print time', time],
        ['Material', fmt(grams) + ' g'],
        ['Price', peso.format(r.price), 'total']
      ];
    } else {
      rows = [['Material cost', peso.format(r.material)]];
      if (job.includePrinter) {
        rows.push(['Electricity cost', peso.format(r.electricity)]);
        rows.push(['Printer wear and tear', peso.format(r.wear)]);
      }
      if (job.includeLabor) rows.push(['Labor cost', peso.format(r.labor)]);
      rows.push(['Subtotal', peso.format(r.subtotal), 'subtotal']);
      if (job.includeBusiness) {
        rows.push(['Failure cost (' + fmt(job.failurePct) + '%)', peso.format(r.failure)]);
        rows.push(['Profit (' + fmt(job.markupPct) + '%)', peso.format(r.profit)]);
      }
      rows.push(['Final price', peso.format(r.price), 'total']);
    }
    $('#p3d-total').innerHTML = rowsHtml(rows) +
      (p3dView === 'internal' ? '<p class="muted">Print time ' + time + ' · ' + fmt(grams) + ' g of filament</p>' : '');
  }

  p3dForm.addEventListener('input', function () { readP3d(); save(); renderP3d(); });
  p3dForm.addEventListener('change', function () { readP3d(); save(); renderP3d(); });
  $('#p3d-add-filament').addEventListener('click', function () {
    readP3d();
    p3dJob().filaments.push({ name: '', grams: '', costPerKg: '' });
    save();
    fillP3d();
    var names = $('#p3d-filaments').querySelectorAll('[data-f="name"]');
    names[names.length - 1].focus();
  });
  $('#p3d-filaments').addEventListener('click', function (e) {
    var i = e.target.dataset.removeFilament;
    if (i === undefined) return;
    readP3d();
    p3dJob().filaments.splice(+i, 1);
    save();
    fillP3d();
  });
  document.querySelectorAll('.p3d-result [data-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      p3dView = btn.dataset.view;
      document.querySelectorAll('.p3d-result [data-view]').forEach(function (b) { b.classList.toggle('active', b === btn); });
      renderP3d();
    });
  });

  // ---------- Settings: price per category ----------
  var priceConfig = $('#price-config');

  function renderPriceConfig() {
    $('#price-config-rows').innerHTML = areaProducts().map(function (p) {
      var labels = Object.keys(AREA).map(function (k) { return [k, AREA[k].label]; }).concat([['tier', TIER_LABEL], ['scale', SCALE_LABEL], ['sizes', SIZES_LABEL], ['variants', VARIANTS_LABEL], ['areaTiers', AREA_TIERS_LABEL]]);
      var unitSel = '<select data-field="pricing">' + labels.map(function (l) {
        return '<option value="' + l[0] + '"' + (l[0] === p.pricing ? ' selected' : '') + '>' + l[1] + '</option>';
      }).join('') + '</select>';
      var name = isBuiltin(p.id) ? esc(p.name) : '<input data-field="name" value="' + esc(p.name) + '" required>';
      var priceCells = isAreaTiers(p)
        ? '<td colspan="2"><div class="sizes-config">' +
            '<div class="tiers">' + (p.areaTiers || []).slice().sort(function (a, b) { return a.minArea - b.minArea; }).map(function (t, i) {
              return '<div class="area-tier-row tier"><span>From</span><input data-at-field="minArea" type="number" min="0" step="0.1" value="' + t.minArea + '" aria-label="From sq in">' +
                '<span>sq in' + (t.minArea > 0 ? ' (' + areaName(t.minArea).split(' ')[0] + ')' : '') + ': ₱</span><input data-at-field="rate" type="number" min="0" step="0.01" value="' + t.rate + '" aria-label="Price per sq in"><span>per sq in</span>' +
                (i > 0 ? '<button type="button" class="danger" data-remove-at="' + i + '" aria-label="Remove">✕</button>' : '') + '</div>';
            }).join('') + '<button type="button" data-add-at>+ Size bracket</button></div>' +
            '<div class="scale"><span>Minimum ₱</span><input data-field="minPrice" type="number" min="0" step="1" value="' + (p.minPrice || 0) + '" aria-label="Minimum per piece"><span>per piece</span></div>' +
            '<p class="muted small">Sizes: ' + PAPER.map(function (s) { return s[0] + ' = ' + fmt(s[1] * s[2]) + ' sq in'; }).join(' · ') + '</p>' +
          '</div></td>'
        : isVariants(p)
        ? '<td colspan="2"><div class="sizes-config">' +
            '<div class="scale"><span>Prices per</span><input data-field="packSize" type="number" min="1" step="1" value="' + (p.packSize || 1) + '" aria-label="Pieces per set"><span>pcs</span></div>' +
            '<div class="tiers">' + (p.variants || []).map(function (v, i) {
              return '<div class="variant-row tier"><input data-variant-field="name" value="' + esc(v.name) + '" aria-label="Variant name">' +
                '<span>₱</span><input data-variant-field="price" type="number" min="0" step="0.01" value="' + v.price + '" aria-label="Price">' +
                '<button type="button" class="danger" data-remove-variant="' + i + '" aria-label="Remove">✕</button></div>';
            }).join('') + '<button type="button" data-add-variant>+ Variant</button></div>' +
          '</div></td>'
        : isSizes(p)
        ? '<td colspan="2"><div class="sizes-config">' +
            '<div class="scale"><span>Bulk price from</span><input data-field="bulkQty" type="number" min="1" step="1" value="' + (p.bulkQty || 0) + '" aria-label="Bulk from how many pieces"><span>pcs. Below that, minimum order ₱</span>' +
            '<input data-field="minOrder" type="number" min="0" step="1" value="' + (p.minOrder || 0) + '" aria-label="Minimum order"></div>' +
            '<div class="scale"><span>Small orders (optional): ₱</span><input data-field="ratePerSqft" type="number" min="0" step="0.01" value="' + (p.ratePerSqft || '') + '" placeholder="0" aria-label="Price per sq in">' +
            '<span>per sq in, at least ₱</span><input data-field="minPrice" type="number" min="0" step="0.01" value="' + (p.minPrice || 0) + '" aria-label="Minimum per piece"><span>per piece</span></div>' +
            '<div class="tiers">' + (p.sizes || []).map(function (sz, i) {
              return '<div class="size-row tier"><input data-size-field="w" type="number" min="0" step="any" value="' + sz.w + '" aria-label="Width (in)">' +
                '<span>×</span><input data-size-field="h" type="number" min="0" step="any" value="' + sz.h + '" aria-label="Height (in)">' +
                '<span>in: ₱</span><input data-size-field="price" type="number" min="0" step="0.01" value="' + sz.price + '" aria-label="Bulk price per piece">' +
                '<button type="button" class="danger" data-remove-size="' + i + '" aria-label="Remove">✕</button></div>';
            }).join('') + '<button type="button" data-add-size>+ Size</button></div>' +
            '<details><summary>Paste a size list</summary><p class="muted small">One size per line, e.g. <code>2 x 3 inches ₱1.50</code>. Sizes already in the list get their price updated.</p>' +
            '<textarea data-paste-sizes rows="4"></textarea><button type="button" data-import-sizes>Add sizes</button></details>' +
          '</div></td>'
        : isScale(p)
        ? '<td colspan="2"><div class="scale">' +
            '<span>₱</span><input data-field="startPrice" type="number" min="0" step="1" value="' + (p.startPrice || 0) + '" aria-label="Price for 1 piece">' +
            '<span>for 1 pc, sliding down to ₱</span><input data-field="bulkPrice" type="number" min="0" step="1" value="' + (p.bulkPrice || 0) + '" aria-label="Lowest price">' +
            '<span>from</span><input data-field="bulkQty" type="number" min="2" step="1" value="' + (p.bulkQty || 0) + '" aria-label="From how many pieces"><span>pcs</span></div></td>'
        : isTier(p)
        ? '<td colspan="2"><div class="tiers">' + Costing.sortedTiers(p).map(function (t, i) {
            return '<div class="tier" data-tier="' + i + '"><span>From</span>' +
              '<input data-tier-field="minQty" type="number" min="1" step="1" value="' + t.minQty + '" aria-label="From how many pieces">' +
              '<span>pcs: ₱</span><input data-tier-field="price" type="number" min="0" step="0.01" value="' + t.price + '" aria-label="Price per piece">' +
              '<button type="button" class="danger" data-remove-tier="' + i + '" aria-label="Remove">✕</button></div>';
          }).join('') + '<button type="button" data-add-tier>+ Tier</button>' + tierWarning(p) + '</div></td>'
        : '<td class="num"><input data-field="ratePerSqft" type="number" step="0.01" min="0" value="' + (p.ratePerSqft || 0) + '"></td>' +
          '<td class="num"><input data-field="minPrice" type="number" step="0.01" min="0" value="' + (p.minPrice || 0) + '"></td>';
      return '<tr data-id="' + p.id + '"><td>' + name + '</td>' +
        '<td>' + (isBuiltin(p.id) ? pricingLabel(p) : unitSel) + '</td>' +
        priceCells +
        '<td>' + (isBuiltin(p.id) ? '' : '<button type="button" class="danger" data-remove-cat="' + p.id + '" aria-label="Delete">✕</button>') + '</td></tr>';
    }).join('');
  }

  // Warn when the last piece of a tier costs more in total than the first of the next.
  function tierWarning(p) {
    var tiers = Costing.sortedTiers(p);
    var bad = [];
    for (var i = 1; i < tiers.length; i++) {
      var q = tiers[i].minQty;
      if ((q - 1) * tiers[i - 1].price > q * tiers[i].price) {
        bad.push((q - 1) + ' pcs (' + peso.format((q - 1) * tiers[i - 1].price) + ') costs more than ' +
          q + ' pcs (' + peso.format(q * tiers[i].price) + ')');
      }
    }
    return bad.length ? '<p class="warn">Note: ' + bad.join('; ') + '.</p>' : '';
  }

  function readPriceConfig() {
    priceConfig.querySelectorAll('#price-config-rows tr').forEach(function (tr) {
      var p = findProduct(tr.dataset.id);
      tr.querySelectorAll('[data-field]').forEach(function (el) {
        var f = el.dataset.field;
        p[f] = f === 'name' ? (el.value.trim() || p.name) : f === 'pricing' ? el.value : (parseFloat(el.value) || 0);
      });
      if (isAreaTiers(p)) {
        p.areaTiers = Array.prototype.map.call(tr.querySelectorAll('.area-tier-row'), function (row) {
          var v = function (f) { return parseFloat(row.querySelector('[data-at-field="' + f + '"]').value) || 0; };
          return { minArea: v('minArea'), rate: v('rate') };
        });
        return;
      }
      if (isVariants(p)) {
        p.variants = Array.prototype.map.call(tr.querySelectorAll('.variant-row'), function (row) {
          return {
            name: row.querySelector('[data-variant-field="name"]').value.trim(),
            price: parseFloat(row.querySelector('[data-variant-field="price"]').value) || 0
          };
        }).filter(function (v) { return v.name; });
        return;
      }
      if (isSizes(p)) {
        p.sizes = Array.prototype.map.call(tr.querySelectorAll('.size-row'), function (row) {
          var v = function (f) { return parseFloat(row.querySelector('[data-size-field="' + f + '"]').value) || 0; };
          return { w: v('w'), h: v('h'), price: v('price') };
        }).filter(function (sz) { return sz.w > 0 && sz.h > 0; });
        return;
      }
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
    $('#price-config-msg').textContent = 'Prices saved.';
  });

  $('#category-add').addEventListener('click', function () {
    readPriceConfig(); // keep prices typed but not yet saved
    state.products.push(blankProduct({ id: uid(), name: 'New category', pricing: 'sqin' }));
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

  // "2 x 3 inches  ₱1.50" lines -> [{ w: 2, h: 3, price: 1.5 }, ...]
  function parseSizes(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = line.match(/([\d.]+)\s*(?:in(?:ch(?:es)?)?|")?\s*[x×*]\s*([\d.]+)[^\d₱]*₱?\s*([\d.,]+)/i);
      if (m) out.push({ w: parseFloat(m[1]), h: parseFloat(m[2]), price: parseFloat(m[3].replace(/,/g, '')) });
    });
    return out;
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
    $('#price-config-msg').textContent = added + ' new categories, ' + updated + ' updated.' +
      (skipped.length ? ' Could not read: ' + skipped.join(', ') + ' (check the unit and price).' : '');
  });

  $('#price-config-rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    var ds = e.target.dataset;
    if (tr && (ds.removeAt !== undefined || ds.addAt !== undefined)) {
      readPriceConfig();
      var ap = findProduct(tr.dataset.id);
      ap.areaTiers = (ap.areaTiers || []).sort(function (a, b) { return a.minArea - b.minArea; });
      if (ds.addAt !== undefined) {
        var last = ap.areaTiers[ap.areaTiers.length - 1];
        ap.areaTiers.push({ minArea: last ? Math.round(last.minArea * 2 + 1) : 0, rate: last ? last.rate : 0 });
      } else {
        ap.areaTiers.splice(+ds.removeAt, 1);
      }
      renderPriceConfig();
      return;
    }
    if (tr && (ds.removeVariant !== undefined || ds.addVariant !== undefined)) {
      readPriceConfig();
      var vp = findProduct(tr.dataset.id);
      vp.variants = vp.variants || [];
      if (ds.addVariant !== undefined) vp.variants.push({ name: 'New variant', price: 0 });
      else vp.variants.splice(+ds.removeVariant, 1);
      renderPriceConfig();
      if (ds.addVariant !== undefined) {
        var ns = $('#price-config-rows tr[data-id="' + vp.id + '"]').querySelectorAll('[data-variant-field="name"]');
        ns[ns.length - 1].select();
      }
      return;
    }
    if (tr && (ds.removeSize !== undefined || ds.addSize !== undefined || ds.importSizes !== undefined)) {
      readPriceConfig();
      var sp = findProduct(tr.dataset.id);
      sp.sizes = sp.sizes || [];
      if (ds.addSize !== undefined) {
        // An empty row; it is kept once a width and height are typed in.
        sp.sizes.push({ w: '', h: '', price: '' });
        renderPriceConfig();
        sp.sizes.pop();
        var ws = $('#price-config-rows tr[data-id="' + sp.id + '"]').querySelectorAll('[data-size-field="w"]');
        ws[ws.length - 1].focus();
        return;
      }
      if (ds.removeSize !== undefined) sp.sizes.splice(+ds.removeSize, 1);
      if (ds.importSizes !== undefined) {
        parseSizes(tr.querySelector('[data-paste-sizes]').value).forEach(function (n) {
          var ex = sp.sizes.find(function (sz) { return (sz.w === n.w && sz.h === n.h) || (sz.w === n.h && sz.h === n.w); });
          if (ex) ex.price = n.price; else sp.sizes.push(n);
        });
      }
      renderPriceConfig();
      return;
    }
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
    askConfirm('Delete this category?', function () {
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
    askConfirm('Delete this product?', function () {
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
      askConfirm('This replaces all your current data. Continue?', function () {
        state = ensureBuiltins({ items: data.items, products: data.products, print3d: data.print3d || state.print3d });
        save();
        editingProduct = null;
        productForm.hidden = true;
        renderAll();
        setMsg('Imported: ' + state.items.length + ' items, ' + state.products.length + ' products.');
      }, 'Yes, replace');
    }).catch(function () { setMsg('Could not read the file. Make sure it is a JSON export from this app.'); });
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
      return [p.name, 'per piece', r.materials, r.waste, r.labor, r.overhead, r.totalCost, r.markup, r.price, r.marginPct];
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
      var pack = packQty > 0 ? { packPrice: cost, packQty: packQty, unit: 'pc' } : { packPrice: 0, packQty: 0 };
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
    setMsg(added + ' new items, ' + updated + ' updated.');
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
  fillP3d();
  renderAll();
})();
