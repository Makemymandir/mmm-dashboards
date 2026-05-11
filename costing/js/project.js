// ============================================
// project.js — Single project view, edit, tabs
// ============================================

let currentProject = null;
let isEditMode     = false;
let activeTab      = 'details';
let roughEstimates = [];
let quotations     = [];

const STAGE_CONFIG = {
  'Inquiry':           { color: '#757575', bg: '#F5F5F5',  phase: 'DISCOVER' },
  'Consultation Done': { color: '#1565C0', bg: '#E3F2FD',  phase: 'DISCOVER' },
  'Design Fee Paid':   { color: '#6A1B9A', bg: '#F3E5F5',  phase: 'DISCOVER' },
  '2D Design':         { color: '#E65100', bg: '#FFF3E0',  phase: 'DESIGN'   },
  '3D Design':         { color: '#BF360C', bg: '#FBE9E7',  phase: 'DESIGN'   },
  'Design Approved':   { color: '#2E7D32', bg: '#E8F5E9',  phase: 'DESIGN'   },
  'In Production':     { color: '#00695C', bg: '#E0F2F1',  phase: 'DELIVER'  },
  'Dispatched':        { color: '#1B5E20', bg: '#E8F5E9',  phase: 'DELIVER'  },
  'Installed':         { color: '#1B5E20', bg: '#C8E6C9',  phase: 'DELIVER'  },
  'Closed':            { color: '#1B5E20', bg: '#A5D6A7',  phase: 'DELIVER'  },
  'On Hold':           { color: '#F57F17', bg: '#FFFDE7',  phase: 'OTHER'    },
  'Lost':              { color: '#C62828', bg: '#FFEBEE',  phase: 'OTHER'    },
  'Lead':              { color: '#757575', bg: '#F5F5F5',  phase: 'DISCOVER' },
  'Active':            { color: '#1565C0', bg: '#E3F2FD',  phase: 'DESIGN'   },
  'Won':               { color: '#2E7D32', bg: '#E8F5E9',  phase: 'DELIVER'  },
};

function getStage(status) {
  return STAGE_CONFIG[status] || { color: '#757575', bg: '#F5F5F5', phase: 'OTHER' };
}

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;

  const params    = new URLSearchParams(window.location.search);
  const projectId = params.get('id');
  const initTab   = params.get('tab');

  if (initTab && ['details','rough','quotations'].includes(initTab)) {
    activeTab = initTab;
  }

  if (!projectId) { showError('No project selected'); return; }
  await loadProject(projectId);
});

async function loadProject(projectId) {
  const container = document.getElementById('projectContent');
  const cacheKey  = 'mmm_project_' + projectId;
  const cached    = sessionStorage.getItem(cacheKey);

  if (cached) {
    try {
      var c = JSON.parse(cached);
      if (Date.now() - (c._cachedAt || 0) < 5 * 60 * 1000) {
        currentProject = c;
        render();
        if (activeTab === 'rough')      loadRoughEstimates();
        if (activeTab === 'quotations') loadQuotations();
      }
    } catch (e) { sessionStorage.removeItem(cacheKey); }
  } else {
    container.innerHTML = '<div style="padding:80px;text-align:center;"><div style="font-size:2.5rem;margin-bottom:16px;">🛕</div><div style="color:var(--grey);">Loading project...</div></div>';
  }

  try {
    const result = await api.call('get_project', { project_id: projectId });
    if (!result.ok) { showError(result.error || 'Project not found'); return; }
    currentProject = result.project;
    currentProject._cachedAt = Date.now();
    sessionStorage.setItem(cacheKey, JSON.stringify(currentProject));
    render();
    if (activeTab === 'rough')      loadRoughEstimates();
    if (activeTab === 'quotations') loadQuotations();
  } catch (err) {
    console.error(err);
    if (!currentProject) showError('Connection error. Please refresh.');
  }
}

async function loadRoughEstimates() {
  if (!currentProject) return;
  const container = document.getElementById('roughListContainer');
  if (!container) return;

  const cacheKey = 'mmm_rough_' + currentProject.project_id;
  const cached   = sessionStorage.getItem(cacheKey);
  if (cached && roughEstimates.length === 0) {
    try { roughEstimates = JSON.parse(cached); renderRoughList(); } catch (e) {}
  } else if (roughEstimates.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--grey);">Loading...</div>';
  }

  try {
    const result = await api.call('list_rough_estimates', { project_id: currentProject.project_id });
    if (!result.ok) { if (!roughEstimates.length) container.innerHTML = '<div class="empty-tab"><h3>Error</h3></div>'; return; }
    roughEstimates = result.estimates;
    sessionStorage.setItem(cacheKey, JSON.stringify(roughEstimates));
    renderRoughList();
  } catch (err) {
    console.error(err);
    if (!roughEstimates.length) container.innerHTML = '<div class="empty-tab"><h3>Connection error</h3></div>';
  }
}

function renderRoughList() {
  const container = document.getElementById('roughListContainer');
  if (!container) return;
  if (roughEstimates.length === 0) {
    container.innerHTML = '<div class="empty-tab"><h3>No rough estimates yet</h3><p>Generate a quick price comparison.</p><button class="btn-primary" onclick="newRoughEstimate()">+ New Rough Estimate</button></div>';
    return;
  }
  var html = '<div class="card"><div class="card-header"><h3>Rough Estimates (' + roughEstimates.length + ')</h3><button class="btn-primary" onclick="newRoughEstimate()">+ New Rough Estimate</button></div>';
  html += '<table class="project-table" style="border-radius:0;box-shadow:none;"><thead><tr>';
  html += '<th>Estimate ID</th><th>Created</th><th>By</th><th>CFT</th>';
  html += '<th style="text-align:right;">Solid Surface</th><th style="text-align:right;">Solid Wood</th><th style="text-align:right;">HDHMR+Duco</th><th></th>';
  html += '</tr></thead><tbody>';
  roughEstimates.forEach(function(e) {
    html += '<tr>';
    html += '<td><span class="project-id-cell">' + escapeHtml(e.estimate_id) + '</span></td>';
    html += '<td style="color:var(--grey);font-size:0.85rem;">' + formatDate(e.created_at) + '</td>';
    html += '<td style="color:var(--grey);font-size:0.85rem;">' + escapeHtml(e.created_by || '') + '</td>';
    html += '<td>' + (e.cubic_feet ? Number(e.cubic_feet).toFixed(2) : '—') + '</td>';
    html += '<td style="text-align:right;">' + formatINR(e.solid_surface) + '</td>';
    html += '<td style="text-align:right;">' + formatINR(e.solid_wood) + '</td>';
    html += '<td style="text-align:right;">' + formatINR(e.hdhmr_duco) + '</td>';
    html += '<td style="text-align:right;"><button class="btn-text" onclick="viewRoughEstimate(\'' + e.estimate_id + '\')">View</button></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

async function loadQuotations() {
  if (!currentProject) return;
  const container = document.getElementById('quotationsListContainer');
  if (!container) return;
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--grey);">Loading...</div>';
  try {
    const result = await api.call('list_quotations', { project_id: currentProject.project_id });
    if (!result.ok) { container.innerHTML = '<div class="empty-tab"><h3>Error</h3></div>'; return; }
    quotations = result.quotations || [];
    renderQuotationsList();
  } catch (err) {
    container.innerHTML = '<div class="empty-tab"><h3>Connection error</h3></div>';
  }
}

function renderQuotationsList() {
  const container = document.getElementById('quotationsListContainer');
  if (!container) return;
  var html = '<div style="display:flex;justify-content:flex-end;margin-bottom:16px;">';
  html += '<a href="final-quotation.html?project_id=' + encodeURIComponent(currentProject.project_id) + '" class="btn-primary">+ New Quotation</a>';
  html += '</div>';
  if (quotations.length === 0) {
    html += '<div class="empty-tab"><h3>No quotations yet</h3><p>Click "+ New Quotation" to create the first one.</p></div>';
    container.innerHTML = html;
    return;
  }
  var statusColors = { 'Draft':'status-Lead', 'Sent':'status-Active', 'Accepted':'status-Won', 'Rejected':'status-Lost' };
  html += '<div class="card"><table class="project-table" style="border-radius:0;box-shadow:none;"><thead><tr>';
  html += '<th>Quotation ID</th><th>Status</th><th>Type</th><th style="text-align:right;">Final Amount</th><th>Created</th><th></th>';
  html += '</tr></thead><tbody>';
  quotations.forEach(function(q) {
    var sc = statusColors[q.status] || 'status-Lead';
    var fa = parseFloat(q.final_amount) || 0;
    html += '<tr>';
    html += '<td><span class="project-id-cell">' + escapeHtml(q.quotation_id) + '</span></td>';
    html += '<td><span class="status-badge ' + sc + '">' + escapeHtml(q.status) + '</span></td>';
    html += '<td>' + escapeHtml(q.customer_type || 'B2C') + '</td>';
    html += '<td style="text-align:right;"><strong>' + (fa > 0 ? formatINR(fa) : '—') + '</strong></td>';
    html += '<td style="color:var(--grey);font-size:0.85rem;">' + formatDate(q.created_at) + '</td>';
    html += '<td><a href="final-quotation.html?quotation_id=' + encodeURIComponent(q.quotation_id) + '" class="btn-text">Open →</a></td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function newRoughEstimate() {
  if (currentProject) window.location.href = 'rough-estimate.html?project_id=' + encodeURIComponent(currentProject.project_id);
}
function viewRoughEstimate(id) {
  window.location.href = 'rough-estimate.html?estimate_id=' + encodeURIComponent(id);
}
function showError(msg) {
  document.getElementById('projectContent').innerHTML =
    '<div class="empty-state"><h3>' + escapeHtml(msg) + '</h3><a href="dashboard.html" class="btn-primary" style="display:inline-block;margin-top:12px;">← Dashboard</a></div>';
}

function render() {
  const p     = currentProject;
  const stage = getStage(p.status);

  document.getElementById('projectContent').innerHTML = `
    <div class="project-header">
      <div class="project-header-left">
        <div class="project-id-large">${escapeHtml(p.project_id)}</div>
        <h1 class="project-client-name">${escapeHtml(p.client_name)}</h1>
        <div class="project-meta">${escapeHtml(p.location || '—')} · Created ${formatDate(p.created_at)} by ${escapeHtml(p.created_by || '—')}</div>
      </div>
      <div class="project-header-right">
        <select class="status-select" id="statusSelect" onchange="changeStatus(this.value)"
          style="border-color:${stage.color};color:${stage.color};font-weight:600;">
          <optgroup label="── DISCOVER">
            <option value="Inquiry"           ${p.status==='Inquiry'           ?'selected':''}>Inquiry</option>
            <option value="Consultation Done" ${p.status==='Consultation Done' ?'selected':''}>Consultation Done</option>
            <option value="Design Fee Paid"   ${p.status==='Design Fee Paid'   ?'selected':''}>Design Fee Paid</option>
          </optgroup>
          <optgroup label="── DESIGN">
            <option value="2D Design"         ${p.status==='2D Design'         ?'selected':''}>2D Design</option>
            <option value="3D Design"         ${p.status==='3D Design'         ?'selected':''}>3D Design</option>
            <option value="Design Approved"   ${p.status==='Design Approved'   ?'selected':''}>Design Approved</option>
          </optgroup>
          <optgroup label="── DELIVER">
            <option value="In Production"     ${p.status==='In Production'     ?'selected':''}>In Production</option>
            <option value="Dispatched"        ${p.status==='Dispatched'        ?'selected':''}>Dispatched</option>
            <option value="Installed"         ${p.status==='Installed'         ?'selected':''}>Installed</option>
            <option value="Closed"            ${p.status==='Closed'            ?'selected':''}>Closed</option>
          </optgroup>
          <optgroup label="── OTHER">
            <option value="On Hold"           ${p.status==='On Hold'           ?'selected':''}>On Hold</option>
            <option value="Lost"              ${p.status==='Lost'              ?'selected':''}>Lost</option>
          </optgroup>
        </select>
      </div>
    </div>

    <div class="tabs">
      <button class="tab ${activeTab==='details'    ?'tab-active':''}" data-tab="details"    onclick="switchTab('details')">Project Details</button>
      <button class="tab ${activeTab==='rough'      ?'tab-active':''}" data-tab="rough"      onclick="switchTab('rough')">Rough Estimates</button>
      <button class="tab ${activeTab==='quotations' ?'tab-active':''}" data-tab="quotations" onclick="switchTab('quotations')">Final Quotations</button>
    </div>

    <div id="tabDetails"    class="tab-content ${activeTab==='details'    ?'tab-content-active':''}">${renderDetailsTab()}</div>
    <div id="tabRough"      class="tab-content ${activeTab==='rough'      ?'tab-content-active':''}">
      <div id="roughListContainer"><div style="padding:40px;text-align:center;color:var(--grey);">Loading...</div></div>
    </div>
    <div id="tabQuotations" class="tab-content ${activeTab==='quotations' ?'tab-content-active':''}">
      <div id="quotationsListContainer"><div style="padding:40px;text-align:center;color:var(--grey);">Loading...</div></div>
    </div>
  `;
}

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach(function(b) {
    b.classList.toggle('tab-active', b.dataset.tab === name);
  });
  ['tabDetails','tabRough','tabQuotations'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('tab-content-active');
  });
  var map = { details:'tabDetails', rough:'tabRough', quotations:'tabQuotations' };
  var el  = document.getElementById(map[name]);
  if (el) el.classList.add('tab-content-active');
  if (name === 'rough')      loadRoughEstimates();
  if (name === 'quotations') loadQuotations();
  setTimeout(function() {
    var t = document.querySelector('.tabs');
    if (t) t.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 100);
}

function renderDetailsTab() {
  const p = currentProject;
  if (isEditMode) return renderEditForm(p);

  const cft = (p.width_ft && p.depth_ft && p.height_ft)
    ? (parseFloat(p.width_ft) * parseFloat(p.depth_ft) * parseFloat(p.height_ft)).toFixed(2) + ' CFT'
    : null;

  const stage     = getStage(p.status);
  const feeStatus = p.design_fee_status || 'Not Paid';
  const feeColor  = feeStatus === 'Paid' ? '#2E7D32' : feeStatus === 'Redeemable Used' ? '#6A1B9A' : '#C62828';
  const feeBg     = feeStatus === 'Paid' ? '#E8F5E9' : feeStatus === 'Redeemable Used' ? '#F3E5F5' : '#FFEBEE';

  return `
    <div class="card" style="padding:0;overflow:hidden;">

      <div style="background:linear-gradient(135deg,#E87722,#C5651C);padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="color:rgba(255,255,255,0.75);font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;font-weight:600;">
            ${stage.phase} · ${escapeHtml(p.status)}
          </div>
          <div style="color:#fff;font-size:1.4rem;font-weight:700;margin-top:2px;">${escapeHtml(p.client_name)}</div>
          <div style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-top:4px;">${escapeHtml(p.framework)} · ${escapeHtml(p.location || 'No location')}</div>
        </div>
        <button class="btn-secondary" onclick="enterEditMode()"
          style="background:rgba(255,255,255,0.15);border-color:rgba(255,255,255,0.3);color:#fff;">Edit</button>
      </div>

      <div style="padding:24px 28px 0;">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--orange);font-weight:700;margin-bottom:12px;">Client Information</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));border:1px solid #F0E6DC;border-radius:10px;overflow:hidden;">
          ${bRow('📞','Contact',       p.contact)}
          ${bRow('✉️','Email',         p.email)}
          ${bRow('📍','Location',      p.location)}
          ${bRow('👤','Customer Type', p.customer_type || 'B2C')}
          ${bRow('📣','Source',        p.source)}
          ${bRow('📅','Created',       formatDate(p.created_at))}
        </div>
      </div>

      <div style="padding:20px 28px 0;">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--orange);font-weight:700;margin-bottom:12px;">Mandir Specifications</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));border:1px solid #F0E6DC;border-radius:10px;overflow:hidden;">
          ${bRow('🔲','Framework', p.framework)}
          ${bRow('↔️','Width',     p.width_ft  ? p.width_ft  + ' ft' : null)}
          ${bRow('↕️','Depth',     p.depth_ft  ? p.depth_ft  + ' ft' : null)}
          ${bRow('📏','Height',    p.height_ft ? p.height_ft + ' ft' : null)}
          ${bRow('📦','Cubic Feet', cft)}
          ${bRow('💰','Design Fee',
            '<span style="background:' + feeBg + ';color:' + feeColor + ';padding:2px 8px;border-radius:10px;font-size:0.8rem;font-weight:600;">'
            + escapeHtml(feeStatus) + '</span>', true)}
        </div>
      </div>

      ${p.delivery_address ? `
      <div style="padding:20px 28px 0;">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--orange);font-weight:700;margin-bottom:12px;">Delivery Address</div>
        <div style="background:#F0F4FF;border-left:3px solid #1565C0;border-radius:0 8px 8px 0;padding:12px 16px;font-size:0.9rem;line-height:1.6;">${escapeHtml(p.delivery_address)}</div>
      </div>` : ''}

      ${p.consultation_notes ? `
      <div style="padding:20px 28px 0;">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--orange);font-weight:700;margin-bottom:12px;">Sales Consultation Notes</div>
        <div style="background:#FFF7F0;border-left:3px solid var(--orange);border-radius:0 8px 8px 0;padding:12px 16px;font-size:0.9rem;line-height:1.6;white-space:pre-wrap;">${escapeHtml(p.consultation_notes)}</div>
      </div>` : ''}

      ${p.notes ? `
      <div style="padding:20px 28px 0;">
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--orange);font-weight:700;margin-bottom:12px;">Notes</div>
        <div style="background:#FAFAFA;border-left:3px solid var(--grey-light);border-radius:0 8px 8px 0;padding:12px 16px;font-size:0.9rem;line-height:1.6;white-space:pre-wrap;">${escapeHtml(p.notes)}</div>
      </div>` : ''}

      <div style="background:#FAFAFA;border-top:1px solid #F0E6DC;padding:12px 28px;margin-top:20px;display:flex;gap:24px;font-size:0.78rem;color:var(--grey);">
        <span>Created ${formatDate(p.created_at)} by <strong>${escapeHtml(p.created_by || '—')}</strong></span>
        <span>ID: <strong>${escapeHtml(p.project_id)}</strong></span>
      </div>
    </div>
  `;
}

function bRow(icon, label, value, rawHtml) {
  var isEmpty = (value === null || value === undefined || value === '');
  var display = isEmpty ? '—' : (rawHtml ? value : escapeHtml(String(value)));
  return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #F0E6DC;background:' + (isEmpty ? '#FAFAFA' : '#fff') + ';">'
    + '<span style="font-size:1.1rem;width:24px;text-align:center;flex-shrink:0;">' + icon + '</span>'
    + '<div><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.6px;color:var(--grey);font-weight:600;margin-bottom:2px;">' + label + '</div>'
    + '<div style="font-size:0.9rem;font-weight:' + (isEmpty ? '400' : '500') + ';color:' + (isEmpty ? 'var(--grey)' : 'var(--dark)') + ';">' + display + '</div>'
    + '</div></div>';
}

function renderEditForm(p) {
  return `
    <div class="card">
      <div class="card-header">
        <h3>Edit Project</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" onclick="cancelEdit()">Cancel</button>
          <button class="btn-primary" onclick="saveEdit()" id="saveBtn">Save Changes</button>
        </div>
      </div>

      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--orange);font-weight:700;margin-bottom:12px;">Client Details</div>
      <div class="edit-form-grid">
        <div class="form-group"><label>Client Name *</label><input type="text" id="ed_client_name" value="${escapeAttr(p.client_name)}"></div>
        <div class="form-group"><label>WhatsApp</label><input type="tel" id="ed_contact" value="${escapeAttr(p.contact)}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="ed_email" value="${escapeAttr(p.email)}"></div>
        <div class="form-group"><label>City</label><input type="text" id="ed_location" value="${escapeAttr(p.location)}"></div>
        <div class="form-group">
          <label>Customer Type</label>
          <select id="ed_customer_type">
            <option value="B2C" ${p.customer_type === 'B2C' ? 'selected' : ''}>B2C (Retail)</option>
            <option value="B2B" ${p.customer_type === 'B2B' ? 'selected' : ''}>B2B (Trade)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Source</label>
          <select id="ed_source">
            <option value=""            ${!p.source                    ? 'selected' : ''}>— Select —</option>
            <option value="Configurator" ${p.source==='Configurator'  ? 'selected' : ''}>Configurator Form</option>
            <option value="Walk-in"      ${p.source==='Walk-in'       ? 'selected' : ''}>Walk-in</option>
            <option value="WhatsApp"     ${p.source==='WhatsApp'      ? 'selected' : ''}>WhatsApp Direct</option>
            <option value="Referral"     ${p.source==='Referral'      ? 'selected' : ''}>Referral</option>
            <option value="Instagram"    ${p.source==='Instagram'     ? 'selected' : ''}>Instagram</option>
            <option value="Google"       ${p.source==='Google'        ? 'selected' : ''}>Google Search</option>
            <option value="Other"        ${p.source==='Other'         ? 'selected' : ''}>Other</option>
          </select>
        </div>
      </div>

      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--orange);font-weight:700;margin:16px 0 12px;">Mandir Specs</div>
      <div class="edit-form-grid">
        <div class="form-group">
          <label>Framework <span style="color:var(--grey);font-size:0.8rem;">(cannot change)</span></label>
          <input type="text" value="${escapeAttr(p.framework)}" disabled style="background:var(--grey-bg);">
        </div>
        <div class="form-group"><label>Width (ft)</label><input type="number" step="0.5" id="ed_width"  value="${p.width_ft  || ''}"></div>
        <div class="form-group"><label>Depth (ft)</label><input type="number" step="0.5" id="ed_depth"  value="${p.depth_ft  || ''}"></div>
        <div class="form-group"><label>Height (ft)</label><input type="number" step="0.5" id="ed_height" value="${p.height_ft || ''}"></div>
        <div class="form-group">
          <label>Design Fee Status</label>
          <select id="ed_design_fee_status">
            <option value="Not Paid"        ${p.design_fee_status==='Not Paid'        ? 'selected' : ''}>Not Paid</option>
            <option value="Paid"            ${p.design_fee_status==='Paid'            ? 'selected' : ''}>Paid</option>
            <option value="Redeemable Used" ${p.design_fee_status==='Redeemable Used' ? 'selected' : ''}>Redeemable Used</option>
          </select>
        </div>
        <div class="form-group"><label>Expected Completion</label><input type="date" id="ed_completion" value="${formatDateForInput(p.expected_completion)}"></div>
      </div>

      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--orange);font-weight:700;margin:16px 0 12px;">Delivery &amp; Notes</div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Delivery Address</label>
        <textarea id="ed_delivery_address" rows="2" placeholder="Full delivery address for installation...">${escapeHtml(p.delivery_address || '')}</textarea>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Sales Consultation Notes</label>
        <textarea id="ed_consultation_notes" rows="3" placeholder="What did the client say? Requirements, preferences, budget discussed...">${escapeHtml(p.consultation_notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label>General Notes</label>
        <textarea id="ed_notes" rows="2">${escapeHtml(p.notes || '')}</textarea>
      </div>
    </div>
  `;
}

function enterEditMode() { isEditMode = true;  render(); }
function cancelEdit()    { isEditMode = false; render(); }

async function saveEdit() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const clientName = document.getElementById('ed_client_name').value.trim();
  if (!clientName) {
    toast('Client name is required', 'error');
    btn.disabled = false;
    btn.textContent = 'Save Changes';
    return;
  }

  const updated = {
    project_id:          currentProject.project_id,
    client_name:         clientName,
    contact:             document.getElementById('ed_contact').value.trim(),
    email:               document.getElementById('ed_email').value.trim(),
    location:            document.getElementById('ed_location').value.trim(),
    width_ft:            document.getElementById('ed_width').value  !== '' ? parseFloat(document.getElementById('ed_width').value)  : '',
    depth_ft:            document.getElementById('ed_depth').value  !== '' ? parseFloat(document.getElementById('ed_depth').value)  : '',
    height_ft:           document.getElementById('ed_height').value !== '' ? parseFloat(document.getElementById('ed_height').value) : '',
    customer_type:       document.getElementById('ed_customer_type').value,
    source:              document.getElementById('ed_source').value,
    design_fee_status:   document.getElementById('ed_design_fee_status').value,
    expected_completion: document.getElementById('ed_completion').value,
    delivery_address:    document.getElementById('ed_delivery_address').value.trim(),
    consultation_notes:  document.getElementById('ed_consultation_notes').value.trim(),
    notes:               document.getElementById('ed_notes').value.trim()
  };

  try {
    const result = await api.call('update_project', { project: updated });
    if (result.ok) {
      Object.assign(currentProject, updated);
      currentProject._cachedAt = Date.now();
      sessionStorage.setItem('mmm_project_' + currentProject.project_id, JSON.stringify(currentProject));
      sessionStorage.removeItem('mmm_all_projects');
      isEditMode = false;
      render();
      toast('Project updated', 'success');
    } else {
      toast(result.error || 'Failed to save', 'error');
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

async function changeStatus(newStatus) {
  try {
    const result = await api.call('update_project', {
      project: { project_id: currentProject.project_id, status: newStatus }
    });
    if (result.ok) {
      currentProject.status = newStatus;
      currentProject._cachedAt = Date.now();
      sessionStorage.setItem('mmm_project_' + currentProject.project_id, JSON.stringify(currentProject));
      sessionStorage.removeItem('mmm_all_projects');
      render();
      toast('Stage → ' + newStatus, 'success');
    } else {
      toast(result.error || 'Failed', 'error');
      document.getElementById('statusSelect').value = currentProject.status;
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
  }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  } catch (e) { return ''; }
}

function formatDateForInput(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  } catch (e) { return ''; }
}

function formatINR(num) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '—';
  return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
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
