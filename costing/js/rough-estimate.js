// ============================================
// rough-estimate.js — Rough Estimate Builder
// ============================================

let project = null;
let rates = null;
let isLoading = false;

const MATERIALS = [
  { key: 'real_silver',    label: 'Real Silver',     rateKey: 'Real Silver' },
  { key: 'marble',          label: 'Marble',           rateKey: 'Marble' },
  { key: 'solid_surface',   label: 'Solid Surface',    rateKey: 'Solid Surface' },
  { key: 'solid_wood',      label: 'Solid Wood',       rateKey: 'Solid Wood' },
  { key: 'hdhmr_duco',      label: 'HDHMR + Duco',     rateKey: 'HDHMR + Duco' },
  { key: 'acrylic_prelam',  label: 'Acrylic + Prelam', rateKey: 'Acrylic + Prelam' }
];

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  
  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;
  
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project_id');
  
  if (!projectId) {
    showError('No project specified');
    return;
  }
  
  document.getElementById('backLink').href = 'project.html?id=' + encodeURIComponent(projectId);
  
  await loadData(projectId);
});

async function loadData(projectId) {
  try {
    // Load project + rates in parallel
    const [projResult, ratesResult] = await Promise.all([
      api.call('get_project', { project_id: projectId }),
      api.call('get_rough_rates', {})
    ]);
    
    if (!projResult.ok) {
      showError(projResult.error || 'Project not found');
      return;
    }
    if (!ratesResult.ok) {
      showError(ratesResult.error || 'Could not load rates');
      return;
    }
    
    project = projResult.project;
    rates = ratesResult.rates;
    
    renderBuilder();
  } catch (err) {
    console.error(err);
    showError('Connection error');
  }
}

function showError(msg) {
  document.getElementById('content').innerHTML = 
    '<div class="empty-state"><h3>' + escapeHtml(msg) + '</h3></div>';
}

function renderBuilder() {
  const p = project;
  const initialW = p.width_ft || '';
  const initialD = p.depth_ft || '';
  const initialH = p.height_ft || '';
  
  document.getElementById('content').innerHTML = `
    <!-- Header card -->
    <div class="project-header">
      <div class="project-header-left">
        <div class="project-id-large">${p.project_id} · New Rough Estimate</div>
        <h1 class="project-client-name">${escapeHtml(p.client_name)}</h1>
        <div class="project-meta">
          ${escapeHtml(p.location || 'No location')} · 
          ${escapeHtml(p.framework)} · 
          ${escapeHtml(p.type_of_space || 'Space type not set')}
        </div>
      </div>
    </div>
    
    <!-- Two-column layout: inputs on left, results on right -->
    <div class="rough-layout">
      
      <!-- LEFT: Inputs -->
      <div class="card">
        <div class="card-header">
          <h3>Specifications</h3>
        </div>
        
        <div class="form-row form-row-3">
          <div class="form-group">
            <label for="re_width">Width (ft)</label>
            <input type="number" id="re_width" step="0.1" min="0" value="${initialW}" oninput="recalc()">
          </div>
          <div class="form-group">
            <label for="re_depth">Depth (ft)</label>
            <input type="number" id="re_depth" step="0.1" min="0" value="${initialD}" oninput="recalc()">
          </div>
          <div class="form-group">
            <label for="re_height">Height (ft)</label>
            <input type="number" id="re_height" step="0.1" min="0" value="${initialH}" oninput="recalc()">
          </div>
        </div>
        
        <div class="cft-display">
          <span class="cft-label">Cubic Feet</span>
          <span class="cft-value" id="cftValue">—</span>
        </div>
        
        <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--grey-light);">
        
        <h4 style="margin-bottom: 12px; font-size: 0.95rem;">Materials to compare</h4>
        <p style="color: var(--grey); font-size: 0.85rem; margin-bottom: 16px;">Untick any material you don't want shown in this estimate.</p>
        
        <div class="materials-checkboxes">
          ${MATERIALS.map(m => `
            <label class="material-check">
              <input type="checkbox" id="mat_${m.key}" checked onchange="recalc()">
              <span>${m.label}</span>
              <span class="material-rate">${formatRate(m.rateKey)}</span>
            </label>
          `).join('')}
        </div>
        
        <div id="builderError" class="error-message" style="display:none; margin-top: 16px;"></div>
        
        <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
          <button class="btn-secondary" onclick="window.location.href='project.html?id=${p.project_id}'">Cancel</button>
          <button class="btn-primary" onclick="saveEstimate()" id="saveBtn">Save Rough Estimate</button>
        </div>
      </div>
      
      <!-- RIGHT: Live preview -->
      <div class="card">
        <div class="card-header">
          <h3>Live Preview</h3>
        </div>
        
        <div id="previewArea">
          <p style="color: var(--grey);">Enter dimensions to see prices.</p>
        </div>
      </div>
    </div>
  `;
  
  // Initial calculation
  recalc();
}

function formatRate(rateKey) {
  if (rateKey === 'Real Silver') return 'On Request';
  const rate = rates[rateKey];
  if (!rate) return '—';
  return '₹' + Number(rate).toLocaleString('en-IN') + '/CFT';
}

function recalc() {
  const w = parseFloat(document.getElementById('re_width').value) || 0;
  const d = parseFloat(document.getElementById('re_depth').value) || 0;
  const h = parseFloat(document.getElementById('re_height').value) || 0;
  
  const cft = w * d * h;
  document.getElementById('cftValue').textContent = cft > 0 ? cft.toFixed(2) + ' CFT' : '—';
  
  // Get checked materials
  const checked = MATERIALS.filter(m => document.getElementById('mat_' + m.key).checked);
  
  const previewArea = document.getElementById('previewArea');
  
  if (cft === 0 || checked.length === 0) {
    previewArea.innerHTML = '<p style="color: var(--grey);">Enter dimensions and select at least one material to see prices.</p>';
    return;
  }
  
  let html = '<table class="preview-table">';
  html += '<thead><tr><th>Material</th><th style="text-align:right;">Starting Price</th></tr></thead><tbody>';
  
  checked.forEach(m => {
    let priceDisplay;
    if (m.key === 'real_silver') {
      priceDisplay = '<span style="color: var(--orange); font-weight: 600;">On Request</span>';
    } else {
      const price = cft * (rates[m.rateKey] || 0);
      priceDisplay = '<strong>' + formatINR(price) + '</strong>';
    }
    html += `<tr><td>${m.label}</td><td style="text-align:right;">${priceDisplay}</td></tr>`;
  });
  
  html += '</tbody></table>';
  
  html += `
    <div class="preview-disclaimer">
      <strong>Note:</strong> Design Fees, Installation, Transport, Packing, Insurance, GST (18%) are extra. 
      Final pricing may vary based on design, customization, and site conditions.
    </div>
  `;
  
  previewArea.innerHTML = html;
}

async function saveEstimate() {
  const w = parseFloat(document.getElementById('re_width').value) || 0;
  const d = parseFloat(document.getElementById('re_depth').value) || 0;
  const h = parseFloat(document.getElementById('re_height').value) || 0;
  
  const errorEl = document.getElementById('builderError');
  const btn = document.getElementById('saveBtn');
  errorEl.style.display = 'none';
  
  if (w <= 0 || d <= 0 || h <= 0) {
    errorEl.textContent = 'Please enter all three dimensions (Width, Depth, Height) greater than 0.';
    errorEl.style.display = 'block';
    return;
  }
  
  // Get checked materials
  const checked = MATERIALS.filter(m => document.getElementById('mat_' + m.key).checked);
  if (checked.length === 0) {
    errorEl.textContent = 'Please select at least one material to compare.';
    errorEl.style.display = 'block';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  try {
    const result = await api.call('create_rough_estimate', {
      project_id: project.project_id,
      width: w,
      depth: d,
      height: h,
      materials_included: checked.map(m => m.label)
    });
    
    if (result.ok) {
      // Redirect back to project, on Rough Estimates tab
      window.location.href = 'project.html?id=' + encodeURIComponent(project.project_id) + '&tab=rough';
    } else {
      errorEl.textContent = result.error || 'Failed to save';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save Rough Estimate';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Save Rough Estimate';
  }
}

// ============================================
// Helpers
// ============================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatINR(num) {
  if (num === null || num === undefined || isNaN(num)) return '₹0';
  return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
