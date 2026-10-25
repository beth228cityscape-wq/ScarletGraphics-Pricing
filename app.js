(function () {
  var STORAGE_KEY = 'scarlet-costing-v1';
  var peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

  var state = load();
  var editingProduct = null; // working copy of the product in the form

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
    $('#item-form-title').textContent = 'Bagong item';
    $('#item-cancel').hidden = true;
  }

  itemForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      id: itemForm.id.value || uid(),
      name: itemForm.name.value.trim(),
      category: itemForm.category.value.trim(),
      unit: itemForm.unit.value.trim(),
      cost: parseFloat(itemForm.cost.value) || 0
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
      itemForm.cost.value = it.cost;
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
      if (confirm(msg)) {
        state.items = state.items.filter(function (x) { return x.id !== delId; });
        save();
        renderAll();
      }
    }
  });

  // ---------- Products ----------
  var productForm = $('#product-form');

  function renderProductList() {
    var list = state.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('#product-list').innerHTML = list.map(function (p) {
      var r = Costing.computeProduct(p, state.items);
      var active = editingProduct && editingProduct.id === p.id ? ' class="active"' : '';
      var price = p.pricing === 'sqft'
        ? 'Cost ' + peso.format(r.totalCost) + '/sq ft · <strong>' + peso.format(p.ratePerSqft || 0) + '/sq ft</strong>'
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
    ['wastePct', 'labor', 'overheadPct', 'markupPct', 'ratePerSqft'].forEach(function (k) {
      productForm[k].value = p[k] || 0;
    });
    productForm.pricing.value = p.pricing || 'unit';
    if (!keepOrder) $('#order-rate').value = p.ratePerSqft || 0;
    applyPricingMode();
    $('#product-form-title').textContent = p.id ? 'I-edit ang product' : 'Bagong product';
    $('#product-delete').hidden = !p.id;
    $('#product-duplicate').hidden = !p.id;
    renderComponents();
    renderProductList();
  }

  function readProductForm() {
    editingProduct.name = productForm.name.value.trim();
    ['wastePct', 'labor', 'overheadPct', 'markupPct', 'ratePerSqft'].forEach(function (k) {
      editingProduct[k] = parseFloat(productForm[k].value) || 0;
    });
    editingProduct.pricing = productForm.pricing.value;
  }

  function applyPricingMode() {
    var sqft = productForm.pricing.value === 'sqft';
    productForm.dataset.pricing = sqft ? 'sqft' : 'unit';
    $('.unit-word').textContent = sqft ? 'sq ft' : 'piraso';
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
    var sqft = editingProduct.pricing === 'sqft';
    var rows = [
      ['Materials', r.materials],
      ['Waste (' + (editingProduct.wastePct || 0) + '%)', r.waste],
      ['Labor', r.labor],
      ['Overhead (' + (editingProduct.overheadPct || 0) + '%)', r.overhead],
      ['Total cost (puhunan)' + (sqft ? ' per sq ft' : ''), r.totalCost, 'subtotal']
    ];
    if (sqft) {
      rows.push(['Presyo per sq ft', editingProduct.ratePerSqft || 0, 'total']);
    } else {
      rows.push(['Markup (' + (editingProduct.markupPct || 0) + '%)', r.markup]);
      rows.push(['Selling price', r.price, 'total']);
    }
    $('#breakdown').innerHTML = rows.map(function (row) {
      return '<div class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span>' + peso.format(row[1]) + '</span></div>';
    }).join('') + (sqft ? '' : '<p class="muted">Tubo: ' + peso.format(r.profit) + ' kada piraso · Margin ' + r.marginPct + '%</p>');

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
    if (sqft) {
      var o = Costing.computeSqftOrder(editingProduct, state.items, {
        width: $('#order-width').value, height: $('#order-height').value,
        qty: qty, rate: $('#order-rate').value
      });
      out = [
        ['Sukat', fmt($('#order-width').value) + ' × ' + fmt($('#order-height').value) + ' ft = ' + fmt(o.area) + ' sq ft'],
        ['Kada piraso', fmt(o.area) + ' sq ft × ' + peso.format(o.rate) + ' = ' + peso.format(o.pricePerPiece)]
      ];
      if (o.discount > 0) out.push(['Discount (mula ' + peso.format(o.baseRate) + '/sq ft)', '−' + peso.format(o.discount), 'discount']);
      if (o.discount < 0) out.push(['Dagdag (mula ' + peso.format(o.baseRate) + '/sq ft)', '+' + peso.format(-o.discount)]);
      out.push(['Total (' + qty + ' pcs)', peso.format(o.total), 'total']);
      out.push(['Puhunan', peso.format(o.cost)]);
      out.push(['Tubo', peso.format(o.profit) + ' (' + o.marginPct + '%)']);
    } else {
      out = [
        ['Total (' + qty + ' pcs)', peso.format(r.price * qty), 'total'],
        ['Puhunan', peso.format(r.totalCost * qty)],
        ['Tubo', peso.format(r.profit * qty)]
      ];
    }
    $('#order-total').innerHTML = out.map(function (row) {
      return '<div class="' + (row[2] || '') + '"><span>' + row[0] + '</span><span>' + row[1] + '</span></div>';
    }).join('');
  }

  function fmt(n) {
    return (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-PH');
  }

  $('#product-new').addEventListener('click', function () {
    openProduct({ name: '', pricing: 'unit', components: [{ itemId: '', qty: 1 }], wastePct: 0, labor: 0, overheadPct: 0, markupPct: 0, ratePerSqft: 0 });
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
  });

  $('#product-duplicate').addEventListener('click', function () {
    readProductForm();
    var copy = JSON.parse(JSON.stringify(editingProduct));
    copy.id = '';
    copy.name = copy.name + ' (copy)';
    openProduct(copy);
  });

  $('#product-delete').addEventListener('click', function () {
    if (!editingProduct.id || !confirm('Burahin ang product na ito?')) return;
    var id = editingProduct.id;
    state.products = state.products.filter(function (p) { return p.id !== id; });
    save();
    editingProduct = null;
    productForm.hidden = true;
    renderProductList();
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
      if (!confirm('Papalitan nito ang lahat ng kasalukuyang data. Ituloy?')) return;
      state = { items: data.items, products: data.products };
      save();
      editingProduct = null;
      productForm.hidden = true;
      renderAll();
      setMsg('Na-import: ' + state.items.length + ' items, ' + state.products.length + ' products.');
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
      if (p.pricing === 'sqft') {
        var rate = p.ratePerSqft || 0;
        var margin = rate > 0 ? Costing.round2((rate - r.totalCost) / rate * 100) : 0;
        return [p.name, 'per sq ft', r.materials, r.waste, r.labor, r.overhead, r.totalCost, '', rate, margin];
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
      var existing = state.items.find(function (it) { return it.name.toLowerCase() === cols[0].toLowerCase(); });
      if (existing) {
        existing.category = cols[1] || existing.category;
        existing.unit = cols[2] || existing.unit;
        existing.cost = cost;
        updated++;
      } else {
        state.items.push({ id: uid(), name: cols[0], category: cols[1] || '', unit: cols[2] || 'pc', cost: cost });
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
    if (editingProduct && !productForm.hidden) renderComponents();
  }

  renderAll();
})();
