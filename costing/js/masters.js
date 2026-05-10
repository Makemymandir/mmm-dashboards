// ============================================
// masters.js — Masters Admin (with Material Rates UI)
// ============================================

let currentMasterKey   = 'rough_rates';
let currentData        = null;
let selectedMaterialId = null;
let selectedMaterialName = null;
let allMaterials       = [];

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;

  const user = api.getCurrentUser();
  if (user.role !== 'admin') {
    document.getElementById('mastersContent').innerHTML =
      '<div class="empty-state"><h3>Admin access only</h3></div>';
    return;
  }

  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;

  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.dataset.key); });
  });

  await loadMaster('rough_rates');
});

async function switchTab(key) {
  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.key === key);
  });
  await loadMaster(key);
}

async function loadMaster(key) {
  currentMasterKey = key;
  const content = document.getElementById('mastersContent');
  content.innerHTML = '<p style="color:var(--grey);">Loading...</p>';

  try {
    var result;

    if (key === 'suppliers') {
      result = await api.call('get_suppliers', {});
      if (!result.ok) { content.innerHTML = '<div class="empty-state"><h3>' + escapeHtml(result.error) + '</h3></div>'; return; }
      currentData = {
        ok: true,
        headers: ['supplier_id','supplier_name','location','contact','categories','active','notes'],
        rows: result.suppliers,
        master_key: 'suppliers'
      };
      renderTable(currentData);
      return;
    }

    if (key === 'cost_settings') {
      result = await api.call('get_cost_settings', {});
      if (!result.ok) { content.innerHTML = '<div class="empty-state"><h3>' + escapeHtml(result.error) + '</h3></div>'; return; }
      renderCostSettings(result.settings);
      return;
    }

    if (key === 'material_rates') {
      await renderMaterialRatesUI();
      return;
    }

    result = await api.call('list_master', { master_key: key });
    if (!result.ok) { content.innerHTML = '<div class="empty-state"><h3>' + escapeHtml(result.error) + '</h3></div>'; return; }
    currentData = result;
    renderTable(result);

  } catch (err) {
    console.error(err);
    content.innerHTML = '<div class="empty-state"><h3>Connection error</h3></div>';
  }
}

// ─────────────────────────────────────────
// MATERIAL RATES UI
// ─────────────────────────────────────────

async function renderMaterialRatesUI() {
  const content = document.getElementById('mastersContent');

  // Load materials if not already loaded
  if (allMaterials.length === 0) {
    var r = await api.call('get_material_catalog', {});
    if (r.ok) allMaterials = r.materials || [];
  }

  var html = '<div style="display:grid;grid-template-columns:280px 1fr;gap:0;height:600px;border:1px solid var(--grey-light);border-radius:var(--radius);overflow:hidden;">';

  // LEFT PANEL — material list
  html += '<div style="border-right:1px solid var(--grey-light);display:flex;flex-direction:column;background:#FAFAFA;">';
  html += '<div style="padding:14px;border-bottom:1px solid var(--grey-light);background:white;">';
  html += '<input type="text" id="matSearchBox" placeholder="Search materials..." oninput="filterMaterialList()" style="width:100%;box-sizing:border-box;">';
  html += '</div>';
  html += '<div id="materialList" style="overflow-y:auto;flex:1;">';

  var categories = {};
  allMaterials.forEach(function(m) {
    var cat = m.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(m);
  });

  Object.keys(categories).sort().forEach(function(cat) {
    html += '<div class="mat-category-header" style="padding:8px 14px 4px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.8px;color:var(--orange);font-weight:700;background:#FFF7F0;border-bottom:1px solid #F5EDE4;">' + escapeHtml(cat) + '</div>';
    categories[cat].forEach(function(m) {
      var isSelected = m.material_id === selectedMaterialId;
      html += '<div class="mat-list-item" data-id="' + m.material_id + '" data-name="' + escapeHtml(m.item_name) + '" onclick="selectMaterialForRates(\'' + m.material_id + '\', \'' + escapeHtml(m.item_name).replace(/'/g, "\\'") + '\')" style="padding:10px 14px;cursor:pointer;font-size:0.88rem;border-bottom:1px solid #F5EDE4;background:' + (isSelected ? 'var(--orange-light)' : 'white') + ';color:' + (isSelected ? 'var(--orange-dark)' : 'var(--dark)') + ';font-weight:' + (isSelected ? '600' : '400') + ';">';
      html += escapeHtml(m.item_name);
      html += '</div>';
    });
  });

  html += '</div></div>';

  // RIGHT PANEL — rates
  html += '<div id="ratesPanel" style="display:flex;flex-direction:column;background:white;">';
  if (!selectedMaterialId) {
    html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--grey);text-align:center;padding:40px;">';
    html += '<div><div style="font-size:2rem;margin-bottom:12px;">←</div><div>Select a material to manage its supplier rates</div></div>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div>';
  content.innerHTML = html;

  // If a material was previously selected, reload its rates
  if (selectedMaterialId) {
    loadMaterialRates(selectedMaterialId, selectedMaterialName);
  }
}

function filterMaterialList() {
  var term  = document.getElementById('matSearchBox').value.toLowerCase().trim();
  var items = document.querySelectorAll('.mat-list-item');
  var headers = document.querySelectorAll('.mat-category-header');

  items.forEach(function(item) {
    var name = item.dataset.name.toLowerCase();
    item.style.display = name.includes(term) ? '' : 'none';
  });

  // Hide category headers if all items in that category are hidden
  headers.forEach(function(header) {
    var next = header.nextElementSibling;
    var anyVisible = false;
    while (next && !next.classList.contains('mat-category-header')) {
      if (next.style.display !== 'none') anyVisible = true;
      next = next.nextElementSibling;
    }
    header.style.display = anyVisible ? '' : 'none';
  });
}

async function selectMaterialForRates(materialId, materialName) {
  selectedMaterialId   = materialId;
  selectedMaterialName = materialName;

  // Highlight selected item
  document.querySelectorAll('.mat-list-item').forEach(function(item) {
    var isSelected = item.dataset.id === materialId;
    item.style.background    = isSelected ? 'var(--orange-light)' : 'white';
    item.style.color         = isSelected ? 'var(--orange-dark)'  : 'var(--dark)';
    item.style.fontWeight    = isSelected ? '600' : '400';
  });

  await loadMaterialRates(materialId, materialName);
}

async function loadMaterialRates(materialId, materialName) {
  var panel = document.getElementById('ratesPanel');
  if (!panel) return;

  panel.innerHTML = '<div style="padding:20px;color:var(--grey);">Loading rates...</div>';

  try {
    var [ratesResult, suppResult] = await Promise.all([
      api.call('get_material_rates', { material_id: materialId }),
      api.call('get_suppliers', {})
    ]);

    if (!ratesResult.ok) {
      panel.innerHTML = '<div style="padding:20px;color:red;">Error: ' + escapeHtml(ratesResult.error) + '</div>';
      return;
    }

    var rates     = ratesResult.rates || [];
    var suppliers = suppResult.ok ? (suppResult.suppliers || []) : [];

    var html = '';

    // Header
    html += '<div style="padding:16px 20px;border-bottom:1px solid var(--grey-light);background:#FAFAFA;display:flex;justify-content:space-between;align-items:center;">';
    html += '<div><div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.8px;color:var(--orange);font-weight:700;">Material</div>';
    html += '<div style="font-size:1rem;font-weight:600;color:var(--dark);margin-top:2px;">' + escapeHtml(materialName) + '</div></div>';
    html += '<button class="btn-primary" style="font-size:0.85rem;" onclick="openAddRateModal()">+ Add Supplier Rate</button>';
    html += '</div>';

    // Rates table
    html += '<div style="padding:16px 20px;overflow-y:auto;flex:1;">';

    if (rates.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:var(--grey);">No supplier rates yet. Click "+ Add Supplier Rate" to add one.</div>';
    } else {
      html += '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
      html += '<thead><tr style="border-bottom:2px solid var(--grey-light);">';
      html += '<th style="text-align:left;padding:8px 10px;color:var(--grey);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;">Supplier</th>';
      html += '<th style="text-align:right;padding:8px 10px;color:var(--grey);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;">Rate (₹/sqft)</th>';
      html += '<th style="text-align:center;padding:8px 10px;color:var(--grey);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;">Default</th>';
      html += '<th style="text-align:center;padding:8px 10px;color:var(--grey);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.5px;">Active</th>';
      html += '<th style="padding:8px 10px;"></th>';
      html += '</tr></thead><tbody>';

      rates.forEach(function(rate, idx) {
        var rowBg = idx % 2 === 0 ? 'white' : '#FFF7F0';
        html += '<tr style="border-bottom:1px solid #F5EDE4;background:' + rowBg + ';">';

        // Supplier name
        html += '<td style="padding:12px 10px;font-weight:500;">' + escapeHtml(rate.supplier_name) + '</td>';

        // Rate — editable inline
        html += '<td style="padding:12px 10px;text-align:right;">';
        html += '<input type="number" value="' + (rate.cost_per_unit || 0) + '" step="any" min="0" ';
        html += 'style="width:90px;text-align:right;padding:5px 8px;border:1.5px solid var(--grey-light);border-radius:6px;font-size:0.9rem;font-family:inherit;" ';
        html += 'onblur="saveRateField(\'' + rate.rate_id + '\', \'cost_per_unit\', this.value)" ';
        html += 'onkeydown="if(event.key===\'Enter\')this.blur()">';
        html += '</td>';

        // Default toggle
        html += '<td style="padding:12px 10px;text-align:center;">';
        if (rate.is_default) {
          html += '<span style="background:var(--orange);color:white;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;">★ Default</span>';
        } else {
          html += '<button onclick="setDefaultRate(\'' + rate.rate_id + '\')" style="background:none;border:1px solid var(--grey-light);border-radius:12px;padding:3px 10px;font-size:0.78rem;cursor:pointer;color:var(--grey);">Set Default</button>';
        }
        html += '</td>';

        // Active toggle
        html += '<td style="padding:12px 10px;text-align:center;">';
        html += '<input type="checkbox" ' + (rate.active ? 'checked' : '') + ' onchange="saveRateField(\'' + rate.rate_id + '\', \'active\', this.checked)" style="cursor:pointer;width:16px;height:16px;">';
        html += '</td>';

        // Notes
        html += '<td style="padding:12px 10px;">';
        html += '<input type="text" value="' + escapeHtml(rate.notes || '') + '" placeholder="Notes..." ';
        html += 'style="width:100%;padding:5px 8px;border:1.5px solid var(--grey-light);border-radius:6px;font-size:0.82rem;font-family:inherit;" ';
        html += 'onblur="saveRateField(\'' + rate.rate_id + '\', \'notes\', this.value)">';
        html += '</td>';

        html += '</tr>';
      });

      html += '</tbody></table>';
    }

    html += '</div>';

    // Store suppliers for the add modal
    window._ratesSuppliers = suppliers;
    window._ratesMaterialId = materialId;

    panel.innerHTML = html;

  } catch (err) {
    console.error(err);
    panel.innerHTML = '<div style="padding:20px;color:red;">Connection error</div>';
  }
}

async function saveRateField(rateId, field, value) {
  try {
    var result = await api.call('update_material_rate', {
      rate_id:     rateId,
      field:       field,
      value:       field === 'cost_per_unit' ? parseFloat(value) : value,
      material_id: window._ratesMaterialId
    });
    if (result.ok) {
      toast('Saved', 'success');
    } else {
      toast('Save failed: ' + (result.error || 'unknown'), 'error');
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
  }
}

async function setDefaultRate(rateId) {
  try {
    var result = await api.call('update_material_rate', {
      rate_id:     rateId,
      field:       'is_default',
      value:       true,
      material_id: window._ratesMaterialId
    });
    if (result.ok) {
      toast('Default updated', 'success');
      // Reload rates to reflect new default
      await loadMaterialRates(selectedMaterialId, selectedMaterialName);
    } else {
      toast('Failed: ' + (result.error || 'unknown'), 'error');
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
  }
}

function openAddRateModal() {
  var suppliers = window._ratesSuppliers || [];

  var suppOptions = '<option value="">— Select Supplier —</option>';
  suppliers.forEach(function(s) {
    suppOptions += '<option value="' + escapeHtml(s.supplier_id) + '">' + escapeHtml(s.supplier_name) + '</option>';
  });

  document.getElementById('addRowFields').innerHTML = `
    <div class="form-group" style="margin-bottom:16px;">
      <label>Supplier</label>
      <select id="ar_supplier" style="width:100%;">${suppOptions}</select>
    </div>
    <div class="form-group" style="margin-bottom:16px;">
      <label>Rate per sqft (₹)</label>
      <input type="number" id="ar_rate" min="0" step="any" placeholder="e.g. 165" style="width:100%;">
    </div>
    <div class="form-group" style="margin-bottom:16px;">
      <label>Notes (optional)</label>
      <input type="text" id="ar_notes" placeholder="e.g. Bulk discount on 50+ sheets" style="width:100%;">
    </div>
    <div class="form-group" style="margin-bottom:8px;display:flex;align-items:center;gap:10px;">
      <input type="checkbox" id="ar_default">
      <label for="ar_default" style="margin:0;cursor:pointer;">Set as default supplier for this material</label>
    </div>
  `;

  document.getElementById('addRowTitle').textContent = 'Add Supplier Rate — ' + (selectedMaterialName || '');
  document.getElementById('addRowError').style.display  = 'none';
  document.getElementById('addRowSubmitBtn').disabled    = false;
  document.getElementById('addRowSubmitBtn').textContent = 'Add Rate';
  document.getElementById('addRowModal').style.display   = 'flex';

  setTimeout(function() {
    var el = document.getElementById('ar_supplier');
    if (el) el.focus();
  }, 100);
}

async function submitAddRow() {
  // Override default submitAddRow for material_rates tab
  if (currentMasterKey === 'material_rates') {
    await submitAddRateRow();
    return;
  }

  // Original logic for other tabs
  const errorEl = document.getElementById('addRowError');
  const btn     = document.getElementById('addRowSubmitBtn');
  errorEl.style.display = 'none';

  const headers  = currentData ? currentData.headers : [];
  const skipCols = ['_rowindex','id','created_at','created_by','updated_at','updated_by'];
  const rowData  = {};
  var firstField = null, firstFieldValue = null;

  headers.forEach(function(h) {
    if (skipCols.includes(h.toLowerCase())) return;
    const id = 'addRow_' + h;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') {
      rowData[h] = el.checked;
    } else if (el.type === 'number') {
      rowData[h] = el.value === '' ? '' : parseFloat(el.value);
    } else {
      rowData[h] = el.value.trim();
    }
    if (firstField === null) { firstField = h; firstFieldValue = rowData[h]; }
  });

  if (firstFieldValue === '' || firstFieldValue === null || firstFieldValue === undefined) {
    errorEl.textContent = formatHeader(firstField) + ' is required.';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled = true; btn.textContent = 'Adding...';
  const user = api.getCurrentUser();

  try {
    const result = await api.call('add_master_row', { master_key: currentMasterKey, row_data: rowData, username: user.username });
    if (result.ok) {
      toast('Row added', 'success');
      closeAddRowModal();
      await loadMaster(currentMasterKey);
    } else {
      errorEl.textContent = result.error || 'Failed to add row';
      errorEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Add Row';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Connection error';
    errorEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Add Row';
  }
}

async function submitAddRateRow() {
  var errorEl    = document.getElementById('addRowError');
  var btn        = document.getElementById('addRowSubmitBtn');
  errorEl.style.display = 'none';

  var supplierId = document.getElementById('ar_supplier').value;
  var rate       = document.getElementById('ar_rate').value.trim();
  var notes      = document.getElementById('ar_notes').value.trim();
  var isDefault  = document.getElementById('ar_default').checked;

  if (!supplierId) { errorEl.textContent = 'Please select a supplier.'; errorEl.style.display = 'block'; return; }
  if (!rate || isNaN(parseFloat(rate))) { errorEl.textContent = 'Please enter a valid rate.'; errorEl.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Adding...';

  try {
    var result = await api.call('add_material_rate', {
      material_id:   window._ratesMaterialId,
      supplier_id:   supplierId,
      cost_per_unit: parseFloat(rate),
      is_default:    isDefault,
      notes:         notes
    });

    if (result.ok) {
      toast('Rate added', 'success');
      closeAddRowModal();
      await loadMaterialRates(selectedMaterialId, selectedMaterialName);
    } else {
      errorEl.textContent = result.error || 'Failed to add rate';
      errorEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Add Rate';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Connection error';
    errorEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Add Rate';
  }
}

function closeAddRowModal() {
  document.getElementById('addRowModal').style.display = 'none';
}

// ─────────────────────────────────────────
// COST SETTINGS
// ─────────────────────────────────────────

function renderCostSettings(settings) {
  const content = document.getElementById('mastersContent');
  var rows = [
    { key: 'default_profit_pct', label: 'Default Profit Margin (%)', value: settings.default_profit_pct },
    { key: 'gst_pct',            label: 'GST Rate (%)',               value: settings.gst_pct },
    { key: 'currency',           label: 'Currency Symbol',            value: settings.currency }
  ];
  var html = '<div class="card" style="max-width:500px;">';
  html += '<div class="card-header"><h3>Cost Settings</h3></div>';
  html += '<p style="color:var(--grey);margin-bottom:20px;font-size:0.9rem;">These values apply to all new quotations. Existing quotations are not affected.</p>';
  rows.forEach(function(row) {
    html += '<div class="form-group" style="margin-bottom:20px;">';
    html += '<label>' + row.label + '</label>';
    html += '<input type="text" value="' + escapeHtml(String(row.value || '')) + '" data-setting-key="' + row.key + '" onblur="saveCostSetting(this)" style="max-width:200px;">';
    html += '</div>';
  });
  html += '</div>';
  content.innerHTML = html;
}

async function saveCostSetting(input) {
  var key = input.dataset.settingKey;
  var val = input.value.trim();
  if (!val) { toast('Value cannot be empty', 'error'); return; }
  try {
    var result = await api.call('update_cost_setting', { setting_key: key, value: val });
    if (result.ok) toast('Saved', 'success');
    else toast('Save failed: ' + (result.error || 'unknown'), 'error');
  } catch (err) { toast('Connection error', 'error'); }
}

// ─────────────────────────────────────────
// STANDARD TABLE RENDERING
// ─────────────────────────────────────────

function renderTable(data) {
  const content = document.getElementById('mastersContent');
  const validRows = data.rows.filter(function(row) {
    var firstCol = data.headers[0];
    return row[firstCol] !== '' && row[firstCol] !== null && row[firstCol] !== undefined;
  });
  const visibleHeaders = data.headers.filter(function(h) {
    return h !== '_rowIndex' && h.toLowerCase() !== 'created_at' && h.toLowerCase() !== 'created_by' && h.toLowerCase() !== 'updated_at' && h.toLowerCase() !== 'updated_by';
  });

  var html = '<div class="masters-toolbar">';
  html += '<input type="text" id="searchBox" placeholder="Search..." class="search-input" oninput="filterRows()">';
  html += '<span style="color:var(--grey);font-size:0.9rem;">' + validRows.length + ' rows</span>';
  html += '<button class="btn-primary" onclick="openAddRowModal()">+ Add Row</button>';
  html += '</div>';

  if (validRows.length === 0) {
    html += '<div class="empty-state"><h3>No rows yet</h3><p>Click "+ Add Row" to create the first one.</p></div>';
    content.innerHTML = html;
    return;
  }

  html += '<div class="masters-table-wrap"><table class="masters-table" id="mastersTable"><thead><tr>';
  visibleHeaders.forEach(function(h) { html += '<th>' + formatHeader(h) + '</th>'; });
  html += '</tr></thead><tbody>';

  validRows.forEach(function(row) {
    html += '<tr data-row-index="' + row._rowIndex + '">';
    visibleHeaders.forEach(function(h) {
      var value = row[h];
      var isActive   = h.toLowerCase() === 'active';
      var isEditable = isCellEditable(h);
      if (isActive) {
        var isChecked = (value === true || value === 'TRUE' || value === 'true' || value === 1);
        html += '<td><input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="updateCell(' + row._rowIndex + ', \'' + h + '\', this.checked)"></td>';
      } else if (isEditable) {
        var safeVal = (value === null || value === undefined) ? '' : value;
        html += '<td contenteditable="true" data-col="' + h + '" data-original="' + escapeHtml(String(safeVal)) + '" onblur="handleEdit(this, ' + row._rowIndex + ')">' + escapeHtml(String(safeVal)) + '</td>';
      } else {
        var safeVal = (value === null || value === undefined) ? '' : value;
        html += '<td>' + escapeHtml(String(safeVal)) + '</td>';
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  content.innerHTML = html;
}

function openAddRowModal() {
  if (!currentData) return;
  if (currentMasterKey === 'cost_settings') return;

  var headers   = currentData.headers;
  var skipCols  = ['_rowindex','id','created_at','created_by','updated_at','updated_by'];
  var formFields = headers.filter(function(h) { return !skipCols.includes(h.toLowerCase()); });

  var html = '';
  formFields.forEach(function(h) {
    var id       = 'addRow_' + h;
    var isActive = h.toLowerCase() === 'active';
    var isRate   = h.toLowerCase().indexOf('rate') !== -1 || h.toLowerCase().indexOf('cost') !== -1;
    if (isActive) {
      html += '<div class="form-group" style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">';
      html += '<input type="checkbox" id="' + id + '" checked>';
      html += '<label for="' + id + '" style="margin:0;">Active</label></div>';
    } else {
      var inputType = isRate ? 'number' : 'text';
      var stepAttr  = isRate ? 'step="any"' : '';
      html += '<div class="form-group"><label for="' + id + '">' + formatHeader(h) + '</label>';
      html += '<input type="' + inputType + '" id="' + id + '" ' + stepAttr + ' placeholder="Enter ' + formatHeader(h).toLowerCase() + '"></div>';
    }
  });

  document.getElementById('addRowFields').innerHTML = html;
  document.getElementById('addRowTitle').textContent = 'Add New Row — ' + getMasterDisplayName(currentMasterKey);
  document.getElementById('addRowError').style.display  = 'none';
  document.getElementById('addRowSubmitBtn').disabled    = false;
  document.getElementById('addRowSubmitBtn').textContent = 'Add Row';
  document.getElementById('addRowModal').style.display   = 'flex';

  var firstInput = document.querySelector('#addRowFields input[type="text"], #addRowFields input[type="number"]');
  if (firstInput) firstInput.focus();
}

function isCellEditable(headerName) {
  var systemCols = ['_rowindex','id','created_at','created_by','updated_at','updated_by'];
  return !systemCols.includes(headerName.toLowerCase());
}

function formatHeader(h) {
  return h.replace(/_/g,' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function getMasterDisplayName(key) {
  var names = {
    'rough_rates':'Rough Rates','material':'Material Rates','cnc':'CNC Designs',
    'decor':'Decor','hardware':'Hardware','lighting':'Lighting',
    'suppliers':'Suppliers','cost_settings':'Cost Settings','material_rates':'Material Supplier Rates'
  };
  return names[key] || key;
}

function handleEdit(cell, rowIndex) {
  var original = cell.dataset.original;
  var newValue = cell.textContent.trim();
  var column   = cell.dataset.col;
  if (newValue === original) return;
  updateCell(rowIndex, column, newValue);
  cell.dataset.original = newValue;
}

async function updateCell(rowIndex, column, value) {
  var user = api.getCurrentUser();
  try {
    var result = await api.call('update_master_cell', {
      master_key: currentMasterKey, row_index: rowIndex,
      column: column, value: value, username: user.username
    });
    if (result.ok) toast('Saved', 'success');
    else toast('Save failed: ' + (result.error || 'unknown'), 'error');
  } catch (err) { console.error(err); toast('Connection error', 'error'); }
}

function filterRows() {
  var term = document.getElementById('searchBox').value.toLowerCase();
  var rows = document.querySelectorAll('#mastersTable tbody tr');
  rows.forEach(function(row) {
    row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function toast(msg, type) {
  type = type || 'success';
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(function() { t.remove(); }, 300);
  }, 2000);
}
