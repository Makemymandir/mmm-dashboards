// ============================================
// final-quotation.js — Final Quotation Builder
// Phase 7.3b — Complete with all bug fixes
// ============================================

let quotation       = null;
let lines           = [];
let project         = null;
let materialCatalog = [];
let suppliers       = [];
let masterData      = {};
let currentSection  = null;
let selectedMaterial = null;
let selectedMaster  = null;

const SECTIONS = [
  { key: 'material',  label: 'Material',  icon: '🪵' },
  { key: 'cnc',       label: 'CNC',       icon: '⚙️' },
  { key: 'decor',     label: 'Decor',     icon: '✨' },
  { key: 'hardware',  label: 'Hardware',  icon: '🔩' },
  { key: 'lighting',  label: 'Lighting',  icon: '💡' },
  { key: 'labour',    label: 'Labour',    icon: '👷' },
  { key: 'logistics', label: 'Logistics', icon: '🚚' }
];

const MASTER_KEYS = {
  cnc:      'cnc',
  decor:    'decor',
  hardware: 'hardware',
  lighting: 'lighting'
};

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('#materialSearchGroup')) {
    var d1 = document.getElementById('materialDropdown');
    if (d1) d1.style.display = 'none';
  }
  if (!e.target.closest('#masterSearchGroup')) {
    var d2 = document.getElementById('masterDropdown');
    if (d2) d2.style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;

  const params      = new URLSearchParams(window.location.search);
  const quotationId = params.get('quotation_id');
  const projectId   = params.get('project_id');

  loadCatalogData();

  if (quotationId) {
    await loadQuotation(quotationId);
  } else if (projectId) {
    await createNewQuotation(projectId);
  } else {
    showError('No quotation or project specified.');
  }
});

async function loadCatalogData() {
  try {
    const [matResult, suppResult] = await Promise.all([
      api.call('get_material_catalog', {}),
      api.call('get_suppliers', {})
    ]);
    if (matResult.ok)  materialCatalog = matResult.materials  || [];
    if (suppResult.ok) suppliers       = suppResult.suppliers || [];

    const masterKeys = ['cnc', 'decor', 'hardware', 'lighting'];
    for (var i = 0; i < masterKeys.length; i++) {
      var r = await api.call('list_master', { master_key: masterKeys[i] });
      if (r.ok) masterData[masterKeys[i]] = r.rows || [];
    }
  } catch (err) {
    console.error('Error loading catalog data:', err);
  }
}

async function loadQuotation(quotationId) {
  try {
    const result = await api.call('get_quotation', { quotation_id: quotationId });
    if (!result.ok) { showError(result.error || 'Quotation not found'); return; }
    quotation = result.quotation;
    lines     = result.lines || [];
    const projResult = await api.call('get_project', { project_id: quotation.project_id });
    if (!projResult.ok) { showError('Project not found'); return; }
    project = projResult.project;
    document.getElementById('backLink').href = 'project.html?id=' + encodeURIComponent(project.project_id) + '&tab=quotations';
    renderPage();
  } catch (err) {
    console.error(err);
    showError('Connection error');
  }
}

async function createNewQuotation(projectId) {
  try {
    const projResult = await api.call('get_project', { project_id: projectId });
    if (!projResult.ok) { showError('Project not found'); return; }
    project = projResult.project;
    const user   = api.getCurrentUser();
    const result = await api.call('create_quotation', { project_id: projectId, username: user.username });
    if (!result.ok) { showError(result.error || 'Failed to create quotation'); return; }
    const qResult = await api.call('get_quotation', { quotation_id: result.quotation_id });
    if (!qResult.ok) { showError('Failed to load new quotation'); return; }
    quotation = qResult.quotation;
    lines     = [];
    document.getElementById('backLink').href = 'project.html?id=' + encodeURIComponent(project.project_id) + '&tab=quotations';
    window.history.replaceState({}, '', 'final-quotation.html?quotation_id=' + encodeURIComponent(quotation.quotation_id));
    renderPage();
  } catch (err) {
    console.error(err);
    showError('Connection error');
  }
}

// ─────────────────────────────────────────
// RENDER PAGE
// ─────────────────────────────────────────

function renderPage() {
  var p = project;
  var q = quotation;
  var html = '';

  html += '<div class="quotation-header-card">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">';
  html += '<div>';
  html += '<div class="project-id-large">' + escapeHtml(q.quotation_id) + '</div>';
  html += '<h1 class="project-client-name">' + escapeHtml(p.client_name) + '</h1>';
  html += '<div class="project-meta">' + escapeHtml(p.framework) + ' · ' + escapeHtml(p.location || '') + ' · ' + escapeHtml(p.type_of_space || '') + '</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">';
  html += '<select class="quotation-status-select" onchange="updateQuotationField(\'status\', this.value)">';
  ['Draft','Sent','Accepted','Rejected'].forEach(function(s) {
    html += '<option value="' + s + '" ' + (q.status === s ? 'selected' : '') + '>' + s + '</option>';
  });
  html += '</select>';
  html += '<button class="btn-primary" onclick="generatePdf()">Download PDF</button>';
  html += '</div></div>';

  html += '<div class="quotation-meta-grid">';
  html += '<div class="quotation-meta-item"><span class="quotation-meta-label">Customer Type</span>';
  html += '<select class="quotation-meta-input" onchange="updateQuotationField(\'customer_type\', this.value)">';
  html += '<option value="B2C" ' + (q.customer_type === 'B2C' ? 'selected' : '') + '>B2C</option>';
  html += '<option value="B2B" ' + (q.customer_type === 'B2B' ? 'selected' : '') + '>B2B</option>';
  html += '</select></div>';

  html += '<div class="quotation-meta-item"><span class="quotation-meta-label">Valid Until</span>';
  html += '<input type="date" class="quotation-meta-input" value="' + formatDateInput(q.valid_until) + '" onchange="updateQuotationField(\'valid_until\', this.value)"></div>';

  html += '<div class="quotation-meta-item"><span class="quotation-meta-label">Version</span>';
  html += '<span class="quotation-meta-value">FQ' + q.version + '</span></div>';

  html += '<div class="quotation-meta-item"><span class="quotation-meta-label">Created By</span>';
  html += '<span class="quotation-meta-value">' + escapeHtml(q.created_by) + '</span></div>';
  html += '</div></div>';

  html += '<div class="quotation-layout">';
  html += '<div id="sectionsArea">';
  SECTIONS.forEach(function(s) { html += renderSectionCard(s); });
  html += '</div>';
  html += '<div id="totalsArea">' + renderTotalsCard() + '</div>';
  html += '</div>';

  document.getElementById('content').innerHTML = html;
}

// ─────────────────────────────────────────
// SECTION CARDS
// ─────────────────────────────────────────

function renderSectionCard(section) {
  var sectionLines = lines.filter(function(l) {
    return String(l.line_type || '').toLowerCase() === section.key;
  });
  var sectionCost  = sectionLines.reduce(function(sum, l) { return sum + (parseFloat(l.line_cost) || 0); }, 0);
  var hasValue     = sectionCost > 0;
  var subtotalText = hasValue ? formatINR(sectionCost) : 'No items yet';

  var html = '<div class="section-card" id="section-' + section.key + '">';
  html += '<div class="section-header" onclick="toggleSection(\'' + section.key + '\')">';
  html += '<div class="section-header-left">';
  html += '<span style="font-size:1.3rem;">' + section.icon + '</span>';
  html += '<span class="section-title">' + section.label + '</span>';
  html += '<span class="section-subtotal ' + (hasValue ? 'has-value' : '') + '">' + subtotalText + '</span>';
  html += '</div>';
  html += '<span class="section-toggle" id="toggle-' + section.key + '">▼</span>';
  html += '</div>';
  html += '<div class="section-body" id="body-' + section.key + '">';

  if (sectionLines.length === 0) {
    html += '<div class="section-empty">No items added yet. Click below to add.</div>';
  } else {
    html += renderSectionLines(sectionLines, section.key);
  }

  html += '<button class="section-add-btn" onclick="openAddLineModal(\'' + section.key + '\')">+ Add ' + section.label + ' Line</button>';
  html += '</div></div>';
  return html;
}

function renderSectionLines(sectionLines, lineType) {
  var html = '<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:0.9rem;">';
  html += '<thead><tr style="border-bottom:2px solid var(--grey-light);">';
  html += '<th style="text-align:left;padding:8px 6px;color:var(--grey);font-size:0.8rem;">Description</th>';
  if (lineType === 'material') {
    html += '<th style="text-align:left;padding:8px 6px;color:var(--grey);font-size:0.8rem;">Supplier</th>';
  }
  html += '<th style="text-align:right;padding:8px 6px;color:var(--grey);font-size:0.8rem;">Qty</th>';
  html += '<th style="text-align:left;padding:8px 6px;color:var(--grey);font-size:0.8rem;">Unit</th>';
  html += '<th style="text-align:right;padding:8px 6px;color:var(--grey);font-size:0.8rem;">Rate</th>';
  html += '<th style="text-align:right;padding:8px 6px;color:var(--grey);font-size:0.8rem;">Cost</th>';
  html += '<th style="padding:8px 6px;"></th>';
  html += '</tr></thead><tbody>';

  sectionLines.forEach(function(line) {
    html += '<tr style="border-bottom:1px solid #F5EDE4;">';
    html += '<td style="padding:10px 6px;">' + escapeHtml(line.description) + '</td>';
    if (lineType === 'material') {
      html += '<td style="padding:10px 6px;color:var(--grey);font-size:0.85rem;">' + escapeHtml(line.supplier_id_used || '—') + '</td>';
    }
    html += '<td style="text-align:right;padding:10px 6px;">' + (line.qty || 0) + '</td>';
    html += '<td style="padding:10px 6px;color:var(--grey);">' + escapeHtml(line.unit || '') + '</td>';
    html += '<td style="text-align:right;padding:10px 6px;">' + formatINR(line.cost_per_unit) + '</td>';
    html += '<td style="text-align:right;padding:10px 6px;font-weight:600;">' + formatINR(line.line_cost) + '</td>';
    html += '<td style="padding:10px 6px;text-align:right;">';
    html += '<button onclick="deleteLine(\'' + line.line_id + '\')" style="background:none;border:none;color:#E53935;cursor:pointer;font-size:1rem;" title="Remove line">✕</button>';
    html += '</td></tr>';
  });

  html += '</tbody></table>';
  return html;
}

function renderTotalsCard() {
  var q         = quotation;
  var profitPct = parseFloat(q.profit_pct)    || 40;
  var totalCost = parseFloat(q.total_cost)    || 0;
  var profitAmt = parseFloat(q.profit_amount) || 0;
  var preGst    = parseFloat(q.pre_gst_total) || 0;
  var gstAmt    = parseFloat(q.gst_amount)    || 0;
  var finalAmt  = parseFloat(q.final_amount)  || 0;

  var html = '<div class="totals-card"><h3>Quotation Summary</h3>';
  html += '<div class="profit-input-row"><label>Profit Margin</label>';
  // Use onblur so it only fires when user finishes typing, not on every keystroke
  html += '<input type="number" class="profit-input" id="profitInput" value="' + profitPct + '" min="0" max="100" step="1" onblur="updateProfitPct(this.value)">';
  html += '<span class="profit-pct-label">%</span></div>';

  html += '<div class="totals-row internal"><span class="totals-label">Total Cost (internal)</span><span class="totals-value">' + formatINR(totalCost) + '</span></div>';
  html += '<div class="totals-row internal"><span class="totals-label">Profit (' + profitPct + '%)</span><span class="totals-value">' + formatINR(profitAmt) + '</span></div>';
  html += '<hr class="totals-divider">';
  html += '<div class="totals-row"><span class="totals-label">Subtotal (excl. GST)</span><span class="totals-value">' + formatINR(preGst) + '</span></div>';
  html += '<div class="totals-row"><span class="totals-label">GST (' + (q.gst_pct || 18) + '%)</span><span class="totals-value">' + formatINR(gstAmt) + '</span></div>';
  html += '<hr class="totals-divider">';
  html += '<div class="totals-final"><span class="label">Total</span><span class="amount">' + formatINR(finalAmt) + '</span></div>';
  html += '<p class="totals-internal-note">⚠️ Internal view only. Client PDF distributes profit proportionally — not disclosed to client.</p>';
  html += '</div>';
  return html;
}

function toggleSection(key) {
  var body   = document.getElementById('body-' + key);
  var toggle = document.getElementById('toggle-' + key);
  if (!body) return;
  var isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (toggle) toggle.classList.toggle('open', !isOpen);
}

function refreshTotals() {
  var area = document.getElementById('totalsArea');
  if (area) area.innerHTML = renderTotalsCard();
}

function refreshSection(sectionKey) {
  var card = document.getElementById('section-' + sectionKey);
  if (!card) return;
  var section = SECTIONS.find(function(s) { return s.key === sectionKey; });
  if (!section) return;
  // Preserve open state
  var wasOpen = document.getElementById('body-' + sectionKey) &&
                document.getElementById('body-' + sectionKey).classList.contains('open');
  card.outerHTML = renderSectionCard(section);
  if (wasOpen) {
    var newBody   = document.getElementById('body-' + sectionKey);
    var newToggle = document.getElementById('toggle-' + sectionKey);
    if (newBody)   newBody.classList.add('open');
    if (newToggle) newToggle.classList.add('open');
  }
}

// ─────────────────────────────────────────
// ADD LINE MODAL
// ─────────────────────────────────────────

function openAddLineModal(sectionKey) {
  currentSection   = sectionKey;
  selectedMaterial = null;
  selectedMaster   = null;
  window._masterMatches = [];

  var titleStr = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
  document.getElementById('addLineTitle').textContent = 'Add ' + titleStr + ' Line';
  document.getElementById('addLineError').style.display = 'none';
  document.getElementById('addLineSubmitBtn').disabled = false;
  document.getElementById('addLineSubmitBtn').textContent = 'Add Line';
  document.getElementById('lineQty').value   = '1';
  document.getElementById('lineRate').value  = '';
  document.getElementById('lineNotes').value = '';
  document.getElementById('lineTotalDisplay').textContent = '₹0';

  var isMaterial  = sectionKey === 'material';
  var isMaster    = !!MASTER_KEYS[sectionKey];
  var isFreeText  = sectionKey === 'labour' || sectionKey === 'logistics';

  document.getElementById('materialSearchGroup').style.display = isMaterial  ? 'block' : 'none';
  document.getElementById('masterSearchGroup').style.display   = isMaster    ? 'block' : 'none';
  document.getElementById('freeTextGroup').style.display       = isFreeText  ? 'block' : 'none';

  if (isMaterial) {
    document.getElementById('materialSearch').value = '';
    document.getElementById('materialDropdown').style.display = 'none';
    document.getElementById('selectedMaterialDisplay').style.display = 'none';
    document.getElementById('supplierGroup').style.display = 'none';
  }

  if (isMaster) {
    document.getElementById('masterSearchLabel').textContent = 'Search ' + titleStr + ' Item';
    document.getElementById('masterSearch').value = '';
    document.getElementById('masterDropdown').style.display = 'none';
    document.getElementById('selectedMasterDisplay').style.display = 'none';
  }

  if (isFreeText) {
    document.getElementById('freeTextDesc').value = '';
  }

  var unitDefaults = { material: 'sqft', cnc: 'sqft', decor: 'piece', hardware: 'piece', lighting: 'piece', labour: 'lot', logistics: 'lot' };
  document.getElementById('lineUnit').value = unitDefaults[sectionKey] || 'sqft';

  document.getElementById('addLineModal').style.display = 'flex';

  setTimeout(function() {
    if (isMaterial)     document.getElementById('materialSearch').focus();
    else if (isMaster)  document.getElementById('masterSearch').focus();
    else                document.getElementById('freeTextDesc').focus();
  }, 100);
}

function closeAddLineModal() {
  document.getElementById('addLineModal').style.display = 'none';
  currentSection   = null;
  selectedMaterial = null;
  selectedMaster   = null;
  window._masterMatches = [];
}

// ─────────────────────────────────────────
// MATERIAL SEARCH
// ─────────────────────────────────────────

function filterMaterials() {
  var term     = document.getElementById('materialSearch').value.toLowerCase().trim();
  var dropdown = document.getElementById('materialDropdown');

  if (!term) { dropdown.style.display = 'none'; return; }

  var matches = materialCatalog.filter(function(m) {
    return String(m.item_name || '').toLowerCase().includes(term) ||
           String(m.category  || '').toLowerCase().includes(term);
  }).slice(0, 15);

  if (matches.length === 0) {
    dropdown.innerHTML = '<div style="padding:12px;color:var(--grey);font-size:0.9rem;">No materials found</div>';
    dropdown.style.display = 'block';
    return;
  }

  var html = '';
  matches.forEach(function(m) {
    var defaultRate = m.default_rate
      ? (isNaN(parseFloat(m.default_rate.cost_per_unit)) ? 'On Request' : '₹' + m.default_rate.cost_per_unit + '/' + (m.unit || 'sqft'))
      : 'No rate set';
    html += '<div onclick="selectMaterial(\'' + m.material_id + '\')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #F5EDE4;font-size:0.9rem;" onmouseover="this.style.background=\'#FFF7F0\'" onmouseout="this.style.background=\'white\'">';
    html += '<strong>' + escapeHtml(m.item_name) + '</strong>';
    html += '<span style="color:var(--grey);margin-left:8px;font-size:0.8rem;">' + escapeHtml(m.category || '') + '</span>';
    html += '<span style="float:right;color:var(--orange);font-size:0.85rem;">' + defaultRate + '</span>';
    html += '</div>';
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function selectMaterial(materialId) {
  selectedMaterial = materialCatalog.find(function(m) { return m.material_id === materialId; });
  if (!selectedMaterial) return;

  document.getElementById('materialSearch').value = selectedMaterial.item_name;
  document.getElementById('materialDropdown').style.display = 'none';
  document.getElementById('selectedMaterialName').textContent = selectedMaterial.item_name;
  document.getElementById('selectedMaterialCategory').textContent = selectedMaterial.category || '';
  document.getElementById('selectedMaterialDisplay').style.display = 'block';

  var suppSelect = document.getElementById('supplierSelect');
  var suppRates  = selectedMaterial.supplier_rates || [];

  suppSelect.innerHTML = '<option value="">— Select Supplier —</option>';

  suppRates.forEach(function(rate) {
    var supp     = suppliers.find(function(s) { return s.supplier_id === rate.supplier_id; });
    var suppName = supp ? supp.supplier_name : rate.supplier_id;
    var costVal  = rate.cost_per_unit;
    var costDisplay = (costVal === 'on request' || isNaN(parseFloat(costVal)))
      ? 'On Request'
      : '₹' + costVal + '/' + (selectedMaterial.unit || 'sqft');

    var option = document.createElement('option');
    option.value = rate.supplier_id;
    option.dataset.rate = String(costVal);
    option.dataset.suppname = suppName;
    option.textContent = suppName + ' — ' + costDisplay;
    if (rate.is_default) option.selected = true;
    suppSelect.appendChild(option);
  });

  document.getElementById('supplierGroup').style.display = 'block';

  if (selectedMaterial.default_rate) {
    var defaultCost = selectedMaterial.default_rate.cost_per_unit;
    if (defaultCost !== 'on request' && !isNaN(parseFloat(defaultCost))) {
      document.getElementById('lineRate').value = defaultCost;
      calcLineTotal();
    }
  }

  document.getElementById('lineUnit').value = selectedMaterial.unit || 'sqft';
}

function onSupplierChange() {
  var select = document.getElementById('supplierSelect');
  var option = select.options[select.selectedIndex];
  if (!option || !option.dataset.rate) return;
  var rate = option.dataset.rate;
  if (rate !== 'on request' && !isNaN(parseFloat(rate))) {
    document.getElementById('lineRate').value = rate;
    calcLineTotal();
  } else {
    document.getElementById('lineRate').value = '';
    document.getElementById('lineTotalDisplay').textContent = 'On Request';
  }
}

// ─────────────────────────────────────────
// MASTER SEARCH (CNC / DECOR / HARDWARE / LIGHTING)
// Uses index-based selection to avoid JSON.stringify issues
// ─────────────────────────────────────────

function filterMasterItems() {
  var term     = document.getElementById('masterSearch').value.toLowerCase().trim();
  var dropdown = document.getElementById('masterDropdown');
  var key      = MASTER_KEYS[currentSection];
  var items    = masterData[key] || [];

  if (!term) { dropdown.style.display = 'none'; return; }

  // Determine which column is the name column
  var sampleRow = items[0] || {};
  var nameKey   = sampleRow.hasOwnProperty('material')  ? 'material'
                : sampleRow.hasOwnProperty('item_name') ? 'item_name'
                : Object.keys(sampleRow).filter(function(k) { return k !== '_rowIndex' && k !== 'active'; })[0] || 'item_name';
  var rateKey   = sampleRow.hasOwnProperty('rate')          ? 'rate'
                : sampleRow.hasOwnProperty('rate_per_sqft') ? 'rate_per_sqft'
                : null;

  var matches = items.filter(function(item) {
    return String(item[nameKey] || '').toLowerCase().includes(term);
  }).slice(0, 15);

  // Store on window so onclick can reference safely by index
  window._masterMatches = matches;
  window._masterNameKey = nameKey;
  window._masterRateKey = rateKey;

  if (matches.length === 0) {
    dropdown.innerHTML = '<div style="padding:12px;color:var(--grey);font-size:0.9rem;">No items found</div>';
    dropdown.style.display = 'block';
    return;
  }

  var html = '';
  matches.forEach(function(item, idx) {
    var name = String(item[nameKey] || '');
    var rate = rateKey ? item[rateKey] : '';
    var rateDisplay = (rate && rate !== 'on request' && !isNaN(parseFloat(rate))) ? '₹' + rate : (rate === 'on request' ? 'On Request' : '');
    html += '<div onclick="selectMasterItem(' + idx + ')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #F5EDE4;font-size:0.9rem;" onmouseover="this.style.background=\'#FFF7F0\'" onmouseout="this.style.background=\'white\'">';
    html += '<strong>' + escapeHtml(name) + '</strong>';
    if (rateDisplay) html += '<span style="float:right;color:var(--orange);font-size:0.85rem;">' + rateDisplay + '</span>';
    html += '</div>';
  });

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function selectMasterItem(idx) {
  var matches = window._masterMatches || [];
  var nameKey = window._masterNameKey || 'item_name';
  var rateKey = window._masterRateKey || null;

  var item = matches[idx];
  if (!item) return;

  selectedMaster = item;
  var name = String(item[nameKey] || '');
  var rate = rateKey ? item[rateKey] : '';

  document.getElementById('masterSearch').value = name;
  document.getElementById('masterDropdown').style.display = 'none';
  document.getElementById('selectedMasterName').textContent = name;
  document.getElementById('selectedMasterDisplay').style.display = 'block';

  if (rate && rate !== 'on request' && !isNaN(parseFloat(rate))) {
    document.getElementById('lineRate').value = parseFloat(rate);
    calcLineTotal();
  } else {
    document.getElementById('lineRate').value = '';
  }
}

// ─────────────────────────────────────────
// LINE TOTAL CALC
// ─────────────────────────────────────────

function calcLineTotal() {
  var qty   = parseFloat(document.getElementById('lineQty').value)  || 0;
  var rate  = parseFloat(document.getElementById('lineRate').value) || 0;
  var total = qty * rate;
  document.getElementById('lineTotalDisplay').textContent = formatINR(total);
}

// ─────────────────────────────────────────
// SUBMIT ADD LINE
// ─────────────────────────────────────────

async function submitAddLine() {
  var errorEl = document.getElementById('addLineError');
  var btn     = document.getElementById('addLineSubmitBtn');
  errorEl.style.display = 'none';

  var section      = currentSection;
  var qty          = parseFloat(document.getElementById('lineQty').value)  || 0;
  var rate         = parseFloat(document.getElementById('lineRate').value) || 0;
  var unit         = document.getElementById('lineUnit').value;
  var notes        = document.getElementById('lineNotes').value.trim();
  var user         = api.getCurrentUser();
  var description  = '';
  var refMasterId  = '';
  var supplierName = '';

  if (section === 'material') {
    if (!selectedMaterial) {
      errorEl.textContent = 'Please select a material from the search list.';
      errorEl.style.display = 'block';
      return;
    }
    description = selectedMaterial.item_name;
    refMasterId = selectedMaterial.material_id;

    var suppSel = document.getElementById('supplierSelect');
    var suppOpt = suppSel.options[suppSel.selectedIndex];
    supplierName = (suppOpt && suppOpt.dataset.suppname) ? suppOpt.dataset.suppname : '';

  } else if (MASTER_KEYS[section]) {
    if (!selectedMaster) {
      errorEl.textContent = 'Please select an item from the list.';
      errorEl.style.display = 'block';
      return;
    }
    var nameKey = window._masterNameKey || 'item_name';
    description = String(selectedMaster[nameKey] || '');
    refMasterId = selectedMaster._rowIndex ? String(selectedMaster._rowIndex) : '';

  } else {
    // Labour / Logistics — free text
    description = document.getElementById('freeTextDesc').value.trim();
    if (!description) {
      errorEl.textContent = 'Please enter a description.';
      errorEl.style.display = 'block';
      return;
    }
  }

  if (qty <= 0) {
    errorEl.textContent = 'Qty must be greater than 0.';
    errorEl.style.display = 'block';
    return;
  }

  // Only enforce rate > 0 for sections where a master rate applies
  var requiresRate = section === 'material' || MASTER_KEYS[section];
  if (requiresRate && rate <= 0) {
    errorEl.textContent = 'Please enter a rate greater than 0.';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Adding...';

  try {
    var result = await api.call('add_quotation_line', {
      quotation_id:     quotation.quotation_id,
      line_type:        section,
      ref_master_id:    refMasterId,
      description:      description,
      supplier_id_used: supplierName,
      qty:              qty,
      unit:             unit,
      cost_per_unit:    rate,
      notes:            notes,
      username:         user.username
    });

    if (result.ok) {
      var qResult = await api.call('get_quotation', { quotation_id: quotation.quotation_id });
      if (qResult.ok) {
        quotation = qResult.quotation;
        lines     = qResult.lines || [];
      }
      closeAddLineModal();
      refreshSection(section);
      refreshTotals();
      toast(description + ' added', 'success');
    } else {
      errorEl.textContent = result.error || 'Failed to add line';
      errorEl.style.display = 'block';
      btn.disabled    = false;
      btn.textContent = 'Add Line';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.style.display = 'block';
    btn.disabled    = false;
    btn.textContent = 'Add Line';
  }
}

// ─────────────────────────────────────────
// DELETE LINE
// ─────────────────────────────────────────

async function deleteLine(lineId) {
  if (!confirm('Remove this line?')) return;
  try {
    var result = await api.call('delete_quotation_line', {
      line_id:      lineId,
      quotation_id: quotation.quotation_id
    });
    if (result.ok) {
      var qResult = await api.call('get_quotation', { quotation_id: quotation.quotation_id });
      if (qResult.ok) { quotation = qResult.quotation; lines = qResult.lines || []; }
      SECTIONS.forEach(function(s) { refreshSection(s.key); });
      refreshTotals();
      toast('Line removed', 'success');
    } else {
      toast('Failed to remove line', 'error');
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
  }
}

// ─────────────────────────────────────────
// UPDATE QUOTATION FIELDS
// ─────────────────────────────────────────

async function updateQuotationField(field, value) {
  try {
    var updates = {};
    updates[field] = value;
    var result = await api.call('update_quotation', {
      quotation_id: quotation.quotation_id,
      updates: updates
    });
    if (result.ok) { quotation[field] = value; toast('Saved', 'success'); }
    else toast('Save failed', 'error');
  } catch (err) { toast('Connection error', 'error'); }
}

async function updateProfitPct(value) {
  var pct = parseFloat(value);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    toast('Enter a valid % between 0 and 100', 'error');
    return;
  }
  try {
    var result = await api.call('update_quotation', {
      quotation_id: quotation.quotation_id,
      updates: { profit_pct: pct }
    });
    if (result.ok) {
      var qResult = await api.call('get_quotation', { quotation_id: quotation.quotation_id });
      if (qResult.ok) { quotation = qResult.quotation; refreshTotals(); }
      toast('Profit updated', 'success');
    } else toast('Save failed', 'error');
  } catch (err) { toast('Connection error', 'error'); }
}

function generatePdf() {
  toast('PDF generation coming in Phase 7.4', 'success');
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function showError(msg) {
  document.getElementById('content').innerHTML =
    '<div class="empty-state"><h3>' + escapeHtml(msg) + '</h3></div>';
}

function formatDateInput(val) {
  if (!val) return '';
  try {
    var d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch (e) { return ''; }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatINR(num) {
  if (num === null || num === undefined || num === '') return '—';
  if (typeof num === 'string' && isNaN(parseFloat(num))) return num;
  var n = parseFloat(num);
  if (isNaN(n)) return '—';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
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
  }, 2500);
}
