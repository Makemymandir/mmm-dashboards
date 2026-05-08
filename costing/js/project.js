// ============================================
// project.js — Single project view, edit, tabs
// ============================================

let currentProject = null;
let isEditMode = false;
let activeTab = 'details';
let roughEstimates = [];
let quotations = [];

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  
  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;
  
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id');
  const initialTab = params.get('tab');
  
  if (initialTab && ['details', 'rough', 'quotations'].includes(initialTab)) {
    activeTab = initialTab;
  }
  
  if (!projectId) {
    showError('No project selected');
    return;
  }
  
  await loadProject(projectId);
});

async function loadProject(projectId) {
  const container = document.getElementById('projectContent');
  container.innerHTML = '<div class="loading">Loading project...</div>';
  
  try {
    const result = await api.call('get_project', { project_id: projectId });
    if (!result.ok) { showError(result.error || 'Project not found'); return; }
    currentProject = result.project;
    render();
    if (activeTab === 'rough') loadRoughEstimates();
    if (activeTab === 'quotations') loadQuotations();
  } catch (err) {
    console.error(err);
    showError('Connection error');
  }
}

async function loadRoughEstimates() {
  if (!currentProject) return;
  const container = document.getElementById('roughListContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading rough estimates...</div>';
  try {
    const result = await api.call('list_rough_estimates', { project_id: currentProject.project_id });
    if (!result.ok) {
      container.innerHTML = '<div class="empty-tab"><h3>Error</h3><p>' + escapeHtml(result.error) + '</p></div>';
      return;
    }
    roughEstimates = result.estimates;
    renderRoughList();
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-tab"><h3>Connection error</h3></div>';
  }
}

function renderRoughList() {
  const container = document.getElementById('roughListContainer');
  if (!container) return;
  
  if (roughEstimates.length === 0) {
    container.innerHTML = '<div class="empty-tab"><h3>No rough estimates yet</h3><p>Generate a quick price comparison across all 6 materials.</p><button class="btn-primary" onclick="newRoughEstimate()">+ New Rough Estimate</button></div>';
    return;
  }
  
  var html = '<div class="card"><div class="card-header"><h3>Rough Estimates (' + roughEstimates.length + ')</h3><button class="btn-primary" onclick="newRoughEstimate()">+ New Rough Estimate</button></div>';
  html += '<table class="project-table" style="border-radius:0;box-shadow:none;"><thead><tr>';
  html += '<th>Estimate ID</th><th>Created</th><th>By</th><th>CFT</th><th style="text-align:right;">Solid Surface</th><th style="text-align:right;">Solid Wood</th><th style="text-align:right;">HDHMR+Duco</th><th></th>';
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
  container.innerHTML = '<div class="loading">Loading quotations...</div>';
  
  try {
    const result = await api.call('list_quotations', { project_id: currentProject.project_id });
    if (!result.ok) {
      container.innerHTML = '<div class="empty-tab"><h3>Error loading quotations</h3></div>';
      return;
    }
    quotations = result.quotations || [];
    renderQuotationsList();
  } catch (err) {
    console.error(err);
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
  
  const statusColors = { 'Draft': 'status-Lead', 'Sent': 'status-Active', 'Accepted': 'status-Won', 'Rejected': 'status-Lost' };
  
  html += '<div class="card"><table class="project-table" style="border-radius:0;box-shadow:none;"><thead><tr>';
  html += '<th>Quotation ID</th><th>Status</th><th>Type</th><th style="text-align:right;">Final Amount</th><th>Created</th><th></th>';
  html += '</tr></thead><tbody>';
  
  quotations.forEach(function(q) {
    const statusClass = statusColors[q.status] || 'status-Lead';
    const finalAmt    = parseFloat(q.final_amount) || 0;
    html += '<tr>';
    html += '<td><span class="project-id-cell">' + escapeHtml(q.quotation_id) + '</span></td>';
    html += '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(q.status) + '</span></td>';
    html += '<td>' + escapeHtml(q.customer_type || 'B2C') + '</td>';
    html += '<td style="text-align:right;"><strong>' + (finalAmt > 0 ? formatINR(finalAmt) : '—') + '</strong></td>';
    html += '<td style="color:var(--grey);font-size:0.85rem;">' + formatDate(q.created_at) + '</td>';
    html += '<td><a href="final-quotation.html?quotation_id=' + encodeURIComponent(q.quotation_id) + '" class="btn-text">Open →</a></td>';
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function newRoughEstimate() {
  if (!currentProject) return;
  window.location.href = 'rough-estimate.html?project_id=' + encodeURIComponent(currentProject.project_id);
}

function viewRoughEstimate(estimateId) {
  window.location.href = 'rough-estimate.html?estimate_id=' + encodeURIComponent(estimateId);
}

function showError(msg) {
  document.getElementById('projectContent').innerHTML = '<div class="empty-state"><h3>' + escapeHtml(msg) + '</h3></div>';
}

function render() {
  const p = currentProject;
  const container = document.getElementById('projectContent');
  
  container.innerHTML = `
    <div class="project-header">
      <div class="project-header-left">
        <div class="project-id-large">${p.project_id}</div>
        <h1 class="project-client-name">${escapeHtml(p.client_name)}</h1>
        <div class="project-meta">
          ${escapeHtml(p.location || 'No location')} · 
          Created ${formatDate(p.created_at)} by ${escapeHtml(p.created_by || 'unknown')}
        </div>
      </div>
      <div class="project-header-right">
        <select class="status-select" id="statusSelect" onchange="changeStatus(this.value)">
          <option value="Lead"   ${p.status === 'Lead'   ? 'selected' : ''}>Lead</option>
          <option value="Active" ${p.status === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Won"    ${p.status === 'Won'    ? 'selected' : ''}>Won</option>
          <option value="Lost"   ${p.status === 'Lost'   ? 'selected' : ''}>Lost</option>
        </select>
      </div>
    </div>
    
    <div class="tabs">
      <button class="tab ${activeTab === 'details'    ? 'tab-active' : ''}" onclick="switchTab('details')">Project Details</button>
      <button class="tab ${activeTab === 'rough'      ? 'tab-active' : ''}" onclick="switchTab('rough')">Rough Estimates</button>
      <button class="tab ${activeTab === 'quotations' ? 'tab-active' : ''}" onclick="switchTab('quotations')">Final Quotations</button>
    </div>
    
    <div id="tabDetails" class="tab-content ${activeTab === 'details' ? 'tab-content-active' : ''}">
      ${renderDetailsTab()}
    </div>
    
    <div id="tabRough" class="tab-content ${activeTab === 'rough' ? 'tab-content-active' : ''}">
      <div id="roughListContainer"><div class="loading">Loading...</div></div>
    </div>
    
    <div id="tabQuotations" class="tab-content ${activeTab === 'quotations' ? 'tab-content-active' : ''}">
      <div id="quotationsListContainer"><div class="loading">Loading...</div></div>
    </div>
  `;
}

function renderDetailsTab() {
  const p = currentProject;
  
  if (isEditMode) {
    return `
      <div class="card">
        <div class="card-header">
          <h3>Edit Project Details</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn-secondary" onclick="cancelEdit()">Cancel</button>
            <button class="btn-primary" onclick="saveEdit()" id="saveBtn">Save Changes</button>
          </div>
        </div>
        <div class="edit-form-grid">
          <div class="form-group"><label>Client Name *</label><input type="text" id="ed_client_name" value="${escapeAttr(p.client_name)}"></div>
          <div class="form-group"><label>Contact</label><input type="tel" id="ed_contact" value="${escapeAttr(p.contact)}"></div>
          <div class="form-group"><label>Email</label><input type="email" id="ed_email" value="${escapeAttr(p.email)}"></div>
          <div class="form-group"><label>Location</label><input type="text" id="ed_location" value="${escapeAttr(p.location)}"></div>
          <div class="form-group">
            <label>Type of Space</label>
            <select id="ed_type">
              <option value="" ${!p.type_of_space ? 'selected' : ''}>— Select —</option>
              <option value="Apartment"  ${p.type_of_space === 'Apartment'  ? 'selected' : ''}>Apartment</option>
              <option value="Bungalow"   ${p.type_of_space === 'Bungalow'   ? 'selected' : ''}>Bungalow</option>
              <option value="Villa"      ${p.type_of_space === 'Villa'      ? 'selected' : ''}>Villa</option>
              <option value="Office"     ${p.type_of_space === 'Office'     ? 'selected' : ''}>Office</option>
              <option value="Showroom"   ${p.type_of_space === 'Showroom'   ? 'selected' : ''}>Showroom</option>
              <option value="Other"      ${p.type_of_space === 'Other'      ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Framework <span style="color:var(--grey);font-weight:400;font-size:0.8rem;">(cannot change)</span></label>
            <input type="text" value="${escapeAttr(p.framework)}" disabled style="background:var(--grey-bg);">
          </div>
          <div class="form-group"><label>Width (ft)</label><input type="number" step="0.1" id="ed_width" value="${p.width_ft || ''}"></div>
          <div class="form-group"><label>Depth (ft)</label><input type="number" step="0.1" id="ed_depth" value="${p.depth_ft || ''}"></div>
          <div class="form-group"><label>Height (ft)</label><input type="number" step="0.1" id="ed_height" value="${p.height_ft || ''}"></div>
          <div class="form-group"><label>Expected Completion</label><input type="date" id="ed_completion" value="${formatDateForInput(p.expected_completion)}"></div>
          <div class="form-group">
            <label>Customer Type</label>
            <select id="ed_customer_type">
              <option value="B2C" ${p.customer_type === 'B2C' ? 'selected' : ''}>B2C (Retail)</option>
              <option value="B2B" ${p.customer_type === 'B2B' ? 'selected' : ''}>B2B (Trade)</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-top:16px;">
          <label>Notes</label>
          <textarea id="ed_notes" rows="3">${escapeHtml(p.notes || '')}</textarea>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="card">
      <div class="card-header">
        <h3>Project Details</h3>
        <button class="btn-secondary" onclick="enterEditMode()">Edit</button>
      </div>
      <div class="detail-grid">
        ${detailItem('Client Name', p.client_name)}
        ${detailItem('Contact', p.contact)}
        ${detailItem('Email', p.email)}
        ${detailItem('Location', p.location)}
        ${detailItem('Type of Space', p.type_of_space)}
        ${detailItem('Framework', p.framework)}
        ${detailItem('Customer Type', p.customer_type || 'B2C')}
        ${detailItem('Width', p.width_ft ? p.width_ft + ' ft' : null)}
        ${detailItem('Depth', p.depth_ft ? p.depth_ft + ' ft' : null)}
        ${detailItem('Height', p.height_ft ? p.height_ft + ' ft' : null)}
        ${detailItem('Cubic Feet', p.width_ft && p.depth_ft && p.height_ft ? (p.width_ft * p.depth_ft * p.height_ft).toFixed(2) + ' CFT' : null)}
        ${detailItem('Expected Completion', formatDate(p.expected_completion))}
        ${detailItem('Status', p.status)}
      </div>
      ${p.notes ? '<div style="margin-top:24px;padding-top:24px;border-top:1px solid var(--grey-light);"><div class="detail-label" style="margin-bottom:8px;">Notes</div><div style="white-space:pre-wrap;">' + escapeHtml(p.notes) + '</div></div>' : ''}
    </div>
  `;
}

function detailItem(label, value) {
  if (value === null || value === undefined || value === '') {
    return '<div class="detail-item"><div class="detail-label">' + label + '</div><div class="detail-value detail-value-empty">—</div></div>';
  }
  return '<div class="detail-item"><div class="detail-label">' + label + '</div><div class="detail-value">' + escapeHtml(String(value)) + '</div></div>';
}

function switchTab(name) {
  activeTab = name;

  // Just toggle visibility — don't re-render the whole page
  document.querySelectorAll('.tab').forEach(function(btn) {
    btn.classList.toggle('tab-active', btn.getAttribute('onclick').includes("'" + name + "'"));
  });
  document.querySelectorAll('.tab-content').forEach(function(div) {
    div.classList.remove('tab-content-active');
  });

  if (name === 'details') {
    document.getElementById('tabDetails').classList.add('tab-content-active');
  } else if (name === 'rough') {
    document.getElementById('tabRough').classList.add('tab-content-active');
    if (roughEstimates.length === 0) loadRoughEstimates();
  } else if (name === 'quotations') {
    document.getElementById('tabQuotations').classList.add('tab-content-active');
    if (quotations.length === 0) loadQuotations();
  }
}
function enterEditMode() { isEditMode = true; render(); }
function cancelEdit()    { isEditMode = false; render(); }

async function saveEdit() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  const updated = {
    project_id:          currentProject.project_id,
    client_name:         document.getElementById('ed_client_name').value.trim(),
    contact:             document.getElementById('ed_contact').value.trim(),
    email:               document.getElementById('ed_email').value.trim(),
    location:            document.getElementById('ed_location').value.trim(),
    type_of_space:       document.getElementById('ed_type').value,
    width_ft:            parseFloat(document.getElementById('ed_width').value) || '',
    depth_ft:            parseFloat(document.getElementById('ed_depth').value) || '',
    height_ft:           parseFloat(document.getElementById('ed_height').value) || '',
    expected_completion: document.getElementById('ed_completion').value,
    customer_type:       document.getElementById('ed_customer_type').value,
    notes:               document.getElementById('ed_notes').value.trim()
  };
  
  if (!updated.client_name) {
    toast('Client name is required', 'error');
    btn.disabled = false;
    btn.textContent = 'Save Changes';
    return;
  }
  
  try {
    const result = await api.call('update_project', { project: updated });
    if (result.ok) {
      Object.assign(currentProject, updated);
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
      toast('Status updated to ' + newStatus, 'success');
    } else {
      toast(result.error || 'Failed to update status', 'error');
      document.getElementById('statusSelect').value = currentProject.status;
    }
  } catch (err) {
    console.error(err);
    toast('Connection error', 'error');
    document.getElementById('statusSelect').value = currentProject.status;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function formatDateForInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  } catch { return ''; }
}

function formatINR(num) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '—';
  if (typeof num === 'string' && num === 'On Request') return 'On Request';
  return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
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
