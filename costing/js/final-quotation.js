// ============================================
// final-quotation.js — Final Quotation Builder
// ============================================

let quotation  = null;
let lines      = [];
let project    = null;

const SECTIONS = [
  { key: 'material',  label: 'Material',  icon: '🪵' },
  { key: 'cnc',       label: 'CNC',       icon: '⚙️' },
  { key: 'decor',     label: 'Decor',     icon: '✨' },
  { key: 'hardware',  label: 'Hardware',  icon: '🔩' },
  { key: 'lighting',  label: 'Lighting',  icon: '💡' },
  { key: 'labour',    label: 'Labour',    icon: '👷' },
  { key: 'logistics', label: 'Logistics', icon: '🚚' }
];

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;

  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;

  const params      = new URLSearchParams(window.location.search);
  const quotationId = params.get('quotation_id');
  const projectId   = params.get('project_id');

  if (quotationId) {
    await loadQuotation(quotationId);
  } else if (projectId) {
    await createNewQuotation(projectId);
  } else {
    showError('No quotation or project specified.');
  }
});

// ─────────────────────────────────────────
// LOAD EXISTING QUOTATION
// ─────────────────────────────────────────

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

// ─────────────────────────────────────────
// CREATE NEW QUOTATION
// ─────────────────────────────────────────

async function createNewQuotation(projectId) {
  try {
    const projResult = await api.call('get_project', { project_id: projectId });
    if (!projResult.ok) { showError('Project not found'); return; }
    project = projResult.project;

    const user   = api.getCurrentUser();
    const result = await api.call('create_quotation', {
      project_id: projectId,
      username:   user.username
    });

    if (!result.ok) { showError(result.error || 'Failed to create quotation'); return; }

    const qResult = await api.call('get_quotation', { quotation_id: result.quotation_id });
    if (!qResult.ok) { showError('Failed to load new quotation'); return; }

    quotation = qResult.quotation;
    lines     = [];

    document.getElementById('backLink').href = 'project.html?id=' + encodeURIComponent(project.project_id) + '&tab=quotations';

    // Update URL without reload so refresh works
    window.history.replaceState({}, '', 'final-quotation.html?quotation_id=' + encodeURIComponent(quotation.quotation_id));

    renderPage();
  } catch (err) {
    console.error(err);
    showError('Connection error');
  }
}

// ─────────────────────────────────────────
// RENDER FULL PAGE
// ─────────────────────────────────────────

function renderPage() {
  const p = project;
  const q = quotation;

  const html = `
    <div class="quotation-header-card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
        <div>
          <div class="project-id-large">${escapeHtml(q.quotation_id)}</div>
          <h1 class="project-client-name">${escapeHtml(p.client_name)}</h1>
          <div class="project-meta">${escapeHtml(p.framework)} · ${escapeHtml(p.location || '')} · ${escapeHtml(p.type_of_space || '')}</div>
        </div>
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <select class="quotation-status-select" onchange="updateQuotationField('status', this.value)" id="statusSelect">
            <option value="Draft"    ${q.status === 'Draft'    ? 'selected' : ''}>Draft</option>
            <option value="Sent"     ${q.status === 'Sent'     ? 'selected' : ''}>Sent</option>
            <option value="Accepted" ${q.status === 'Accepted' ? 'selected' : ''}>Accepted</option>
            <option value="Rejected" ${q.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
          </select>
          <button class="btn-primary" onclick="generatePdf()">Download PDF</button>
        </div>
      </div>

      <div class="quotation-meta-grid">
        <div class="quotation-meta-item">
          <span class="quotation-meta-label">Customer Type</span>
          <select class="quotation-meta-input" onchange="updateQuotationField('customer_type', this.value)">
            <option value="B2C" ${q.customer_type === 'B2C' ? 'selected' : ''}>B2C</option>
            <option value="B2B" ${q.customer_type === 'B2B' ? 'selected' : ''}>B2B</option>
          </select>
        </div>
        <div class="quotation-meta-item">
          <span class="quotation-meta-label">Valid Until</span>
          <input type="date" class="quotation-meta-input"
                 value="${formatDateInput(q.valid_until)}"
                 onchange="updateQuotationField('valid_until', this.value)">
        </div>
        <div class="quotation-meta-item">
          <span class="quotation-meta-label">Version</span>
          <span class="quotation-meta-value">FQ${q.version}</span>
        </div>
        <div class="quotation-meta-item">
          <span class="quotation-meta-label">Created By</span>
          <span class="quotation-meta-value">${escapeHtml(q.created_by)}</span>
        </div>
      </div>
    </div>

    <div class="quotation-layout">
      <div id="sectionsArea">
        ${SECTIONS.map(s => renderSectionCard(s)).join('')}
      </div>

      <div id="totalsArea">
        ${renderTotalsCard()}
      </div>
    </div>
  `;

  document.getElementById('content').innerHTML = html;
}

// ─────────────────────────────────────────
// SECTION CARDS
// ─────────────────────────────────────────

function renderSectionCard(section) {
  const sectionLines = lines.filter(function(l) {
    return String(l.line_type).toLowerCase() === section.key;
  });

  const sectionCost  = sectionLines.reduce(function(sum, l) {
    return sum + (parseFloat(l.line_cost) || 0);
  }, 0);

  const hasValue     = sectionCost > 0;
  const subtotalText = hasValue ? formatINR(sectionCost) : 'No items yet';

  return `
    <div class="section-card" id="section-${section.key}">
      <div class="section-header" onclick="toggleSection('${section.key}')">
        <div class="section-header-left">
          <span style="font-size: 1.3rem;">${section.icon}</span>
          <span class="section-title">${section.label}</span>
          <span class="section-subtotal ${hasValue ? 'has-value' : ''}">${subtotalText}</span>
        </div>
        <span class="section-toggle" id="toggle-${section.key}">▼</span>
      </div>
      <div class="section-body" id="body-${section.key}">
        ${sectionLines.length === 0
          ? '<div class="section-empty">No items added yet. Click below to add.</div>'
          : renderSectionLines(sectionLines, section.key)
        }
        <button class="section-add-btn" onclick="openAddLineModal('${section.key}')">
          + Add ${section.label} Line
        </button>
      </div>
    </div>
  `;
}

function renderSectionLines(sectionLines, lineType) {
  var html = '<table style="width:100%; border-collapse: collapse; margin-top: 12px; font-size: 0.9rem;">';
  html += '<thead><tr style="border-bottom: 2px solid var(--grey-light);">';
  html += '<th style="text-align:left; padding: 8px 6px; color: var(--grey); font-size: 0.8rem;">Description</th>';
  if (lineType === 'material') {
    html += '<th style="text-align:left; padding: 8px 6px; color: var(--grey); font-size: 0.8rem;">Supplier</th>';
  }
  html += '<th style="text-align:right; padding: 8px 6px; color: var(--grey); font-size: 0.8rem;">Qty</th>';
  html += '<th style="text-align:left; padding: 8px 6px; color: var(--grey); font-size: 0.8rem;">Unit</th>';
  html += '<th style="text-align:right; padding: 8px 6px; color: var(--grey); font-size: 0.8rem;">Rate</th>';
  html += '<th style="text-align:right; padding: 8px 6px; color: var(--grey); font-size: 0.8rem;">Cost</th>';
  html += '<th style="padding: 8px 6px;"></th>';
  html += '</tr></thead><tbody>';

  sectionLines.forEach(function(line) {
    html += '<tr style="border-bottom: 1px solid #F5EDE4;">';
    html += '<td style="padding: 10px 6px;">' + escapeHtml(line.description) + '</td>';
    if (lineType === 'material') {
      html += '<td style="padding: 10px 6px; color: var(--grey); font-size: 0.85rem;">' + escapeHtml(line.supplier_id_used || '—') + '</td>';
    }
    html += '<td style="text-align:right; padding: 10px 6px;">' + (line.qty || 0) + '</td>';
    html += '<td style="padding: 10px 6px; color: var(--grey);">' + escapeHtml(line.unit || '') + '</td>';
    html += '<td style="text-align:right; padding: 10px 6px;">' + formatINR(line.cost_per_unit) + '</td>';
    html += '<td style="text-align:right; padding: 10px 6px; font-weight: 600;">' + formatINR(line.line_cost) + '</td>';
    html += '<td style="padding: 10px 6px; text-align: right;">';
    html += '<button onclick="deleteLine(\'' + line.line_id + '\')" style="background:none; border:none; color:#E53935; cursor:pointer; font-size: 1rem;">✕</button>';
    html += '</td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

function toggleSection(key) {
  const body   = document.getElementById('body-' + key);
  const toggle = document.getElementById('toggle-' + key);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  toggle.classList.toggle('open', !isOpen);
}

// ─────────────────────────────────────────
// TOTALS CARD
// ─────────────────────────────────────────

function renderTotalsCard() {
  const q           = quotation;
  const profitPct   = parseFloat(q.profit_pct) || 40;
  const totalCost   = parseFloat(q.total_cost)   || 0;
  const profitAmt   = parseFloat(q.profit_amount) || 0;
  const preGst      = parseFloat(q.pre_gst_total) || 0;
  const gstAmt      = parseFloat(q.gst_amount)    || 0;
  const finalAmt    = parseFloat(q.final_amount)  || 0;

  return `
    <div class="totals-card">
      <h3>Quotation Summary</h3>

      <div class="profit-input-row">
        <label>Profit Margin</label>
        <input type="number" class="profit-input" id="profitInput"
               value="${profitPct}" min="0" max="100" step="1"
               onchange="updateProfitPct(this.value)">
        <span class="profit-pct-label">%</span>
      </div>

      <div class="totals-row internal">
        <span class="totals-label">Total Cost (internal)</span>
        <span class="totals-value">${formatINR(totalCost)}</span>
      </div>
      <div class="totals-row internal">
        <span class="totals-label">Profit (${profitPct}%)</span>
        <span class="totals-value">${formatINR(profitAmt)}</span>
      </div>

      <hr class="totals-divider">

      <div class="totals-row">
        <span class="totals-label">Subtotal (excl. GST)</span>
        <span class="totals-value">${formatINR(preGst)}</span>
      </div>
      <div class="totals-row">
        <span class="totals-label">GST (${q.gst_pct || 18}%)</span>
        <span class="totals-value">${formatINR(gstAmt)}</span>
      </div>

      <hr class="totals-divider">

      <div class="totals-final">
        <span class="label">Total</span>
        <span class="amount">${formatINR(finalAmt)}</span>
      </div>

      <p class="totals-internal-note">
        ⚠️ Internal view only. Client PDF shows proportionally distributed amounts — profit is not disclosed.
      </p>
    </div>
  `;
}

function refreshTotals() {
  const totalsArea = document.getElementById('totalsArea');
  if (totalsArea) totalsArea.innerHTML = renderTotalsCard();
}

function refreshSection(sectionKey) {
  const sectionCard = document.getElementById('section-' + sectionKey);
  if (!sectionCard) return;
  const section = SECTIONS.find(function(s) { return s.key === sectionKey; });
  if (!section) return;
  sectionCard.outerHTML = renderSectionCard(section);
}

// ─────────────────────────────────────────
// UPDATE QUOTATION FIELDS
// ─────────────────────────────────────────

async function updateQuotationField(field, value) {
  try {
    const updates = {};
    updates[field] = value;
    const result = await api.call('update_quotation', {
      quotation_id: quotation.quotation_id,
      updates: updates
    });
    if (result.ok) {
      quotation[field] = value;
      toast('Saved', 'success');
    } else {
      toast('Save failed', 'error');
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
  }
}

async function updateProfitPct(value) {
  const pct = parseFloat(value);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    toast('Enter a valid % between 0 and 100', 'error');
    return;
  }
  try {
    const result = await api.call('update_quotation', {
      quotation_id: quotation.quotation_id,
      updates: { profit_pct: pct }
    });
    if (result.ok) {
      // Reload quotation to get recalculated totals
      const qResult = await api.call('get_quotation', {
        quotation_id: quotation.quotation_id
      });
      if (qResult.ok) {
        quotation = qResult.quotation;
        refreshTotals();
        toast('Profit updated', 'success');
      }
    } else {
      toast('Save failed', 'error');
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
  }
}

// ─────────────────────────────────────────
// ADD LINE (placeholder — wired in 7.3b)
// ─────────────────────────────────────────

function openAddLineModal(sectionKey) {
  toast('Line entry coming in next update (Phase 7.3b)', 'success');
}

// ─────────────────────────────────────────
// DELETE LINE
// ─────────────────────────────────────────

async function deleteLine(lineId) {
  if (!confirm('Remove this line?')) return;
  try {
    const result = await api.call('delete_quotation_line', {
      line_id: lineId,
      quotation_id: quotation.quotation_id
    });
    if (result.ok) {
      lines = lines.filter(function(l) { return l.line_id !== lineId; });
      const line = lines.find(function(l) { return l.line_id === lineId; });
      // Reload quotation totals
      const qResult = await api.call('get_quotation', {
        quotation_id: quotation.quotation_id
      });
      if (qResult.ok) {
        quotation = qResult.quotation;
        refreshTotals();
      }
      // Re-render all sections
      SECTIONS.forEach(function(s) { refreshSection(s.key); });
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
// PDF (placeholder — wired in 7.4)
// ─────────────────────────────────────────

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
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
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
  if (num === null || num === undefined || num === '' || isNaN(num)) return '—';
  if (typeof num === 'string' && isNaN(parseFloat(num))) return num;
  return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
}

function toast(msg, type) {
  type = type || 'success';
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(function() { t.remove(); }, 300);
  }, 2500);
}
