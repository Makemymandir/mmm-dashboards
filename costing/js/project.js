// ============================================
// project.js — Single project view, edit, tabs
// ============================================

let currentProject = null;
let isEditMode = false;
let activeTab = 'details';
let roughEstimates = [];
let loadedRoughOnce = false;

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  
  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;
  
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id');
  const initialTab = params.get('tab');
  
  if (initialTab && ['details', 'rough', 'quote'].includes(initialTab)) {
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
    
    if (!result.ok) {
      showError(result.error || 'Project not found');
      return;
    }
    
    currentProject = result.project;
    render();
    
    // If we landed directly on the rough estimates tab, load them
    if (activeTab === 'rough') {
      loadRoughEstimates();
    }
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
    const result = await api.call('list_rough_estimates', { 
      project_id: currentProject.project_id 
    });
    
    if (!result.ok) {
      container.innerHTML = '<div class="empty-tab"><h3>Error</h3><p>' + escapeHtml(result.error) + '</p></div>';
      return;
    }
    
    roughEstimates = result.estimates;
    loadedRoughOnce = true;
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
    container.innerHTML = `
      <div class="empty-tab">
        <h3>No rough estimates yet</h3>
        <p>Generate a quick price comparison across all 6 materials.</p>
        <button class="btn-primary" onclick="newRoughEstimate()">+ New Rough Estimate</button>
      </div>
    `;
    return;
  }
  
  let html = `
    <div class="card">
      <div class="card-header">
        <h3>Rough Estimates (${roughEstimates.length})</h3>
        <button class="btn-primary" onclick="newRoughEstimate()">+ New Rough Estimate</button>
      </div>
      <table class="project-table" style="border-radius: 0; box-shadow: none;">
        <thead>
          <tr>
            <th>Estimate ID</th>
            <th>Created</th>
            <th>By</th>
            <th>CFT</th>
            <th style="text-align:right;">Solid Surface</th>
            <th style="text-align:right;">Solid Wood</th>
            <th style="text-align:right;">HDHMR+Duco</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
  `;
  
  roughEstimates.forEach(e => {
    html += `
      <tr>
        <td><span class="project-id-cell">${e.estimate_id}</span></td>
        <td style="color:var(--grey);font-size:0.85rem;">${formatDate(e.created_at)}</td>
        <td style="color:var(--grey);font-size:0.85rem;">${escapeHtml(e.created_by || '')}</td>
        <td>${e.cubic_feet ? Number(e.cubic_feet).toFixed(2) : '—'}</td>
        <td style="text-align:right;">${formatINR(e.solid_surface)}</td>
        <td style="text-align:right;">${formatINR(e.solid_wood)}</td>
        <td style="text-align:right;">${formatINR(e.hdhmr_duco)}</td>
        <td style="text-align:right;">
          <button class="btn-text" onclick="viewRoughEstimate('${e.estimate_id}')">View</button>
        </td>
      </tr>
    `;
  });
  
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function newRoughEstimate() {
  if (!currentProject) return;
  window.location.href = 'rough-estimate.html?project_id=' + encodeURIComponent(currentProject.project_id);
}

function viewRoughEstimate(estimateId) {
  // For now, just show a toast saying "PDF generation coming next"
  // We'll wire this up properly in Section 6.3
  toast('PDF view coming in next step', 'success');
}

function showError(msg) {
  document.getElementById('projectContent').innerHTML = 
    '<div class="empty-state"><h3>' + escapeHtml(msg) + '</h3></div>';
}

function render() {
  const p = currentProject;
  const container = document.getElementById('projectContent');
  
  container.innerHTML = `
    <!-- Project header -->
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
          <option value="Lead" ${p.status === 'Lead' ? 'selected' : ''}>Lead</option>
          <option value="Active" ${p.status === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Won" ${p.status === 'Won' ? 'selected' : ''}>Won</option>
          <option value="Lost" ${p.status === 'Lost' ? 'selected' : ''}>Lost</option>
        </select>
      </div>
    </div>
    
    <!-- Tabs -->
    <div class="tabs">
      <button class="tab ${activeTab === 'details' ? 'tab-active' : ''}" onclick="switchTab('details')">Project Details</button>
      <button class="tab ${activeTab === 'rough' ? 'tab-active' : ''}" onclick="switchTab('rough')">Rough Estimates</button>
      <button class="tab ${activeTab === 'quote' ? 'tab-active' : ''}" onclick="switchTab('quote')">Final Quotations</button>
    </div>
    
    <!-- Tab content -->
    <div id="tabDetails" class="tab-content ${activeTab === 'details' ? 'tab-content-active' : ''}">
      ${renderDetailsTab()}
    </div>
    
    <div id="tabRough" class="tab-content ${activeTab === 'rough' ? 'tab-content-active' : ''}">
      <div id="roughListContainer">
        <div class="loading">Loading...</div>
      </div>
    </div>
    
    <div id="tabQuote" class="tab-content ${activeTab === 'quote' ? 'tab-content-active' : ''}">
      <div class="empty-tab">
        <h3>No quotations yet</h3>
        <p>Final Quotation builder coming after Rough Estimate is built.</p>
      </div>
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
          <div class="form-group">
            <label>Client Name *</label>
            <input type="text" id="ed_client_name" value="${escapeAttr(p.client_name)}">
          </div>
          <div class="form-group">
            <label>Contact</label>
            <input type="tel" id="ed_contact" value="${escapeAttr(p.contact)}">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="ed_email" value="${escapeAttr(p.email)}">
          </div>
          <div class="form-group">
            <label>Location</label>
            <input type="text" id="ed_location" value="${escapeAttr(p.location)}">
          </div>
          <div class="form-group">
            <label>Type of Space</label>
            <select id="ed_type">
              <option value="" ${!p.type_of_space ? 'selected' : ''}>— Select —</option>
              <option value="Apartment" ${p.type_of_space === 'Apartment' ? 'selected' : ''}>Apartment</option>
              <option value="Bungalow" ${p.type_of_space === 'Bungalow' ? 'selected' : ''}>Bungalow</option>
              <option value="Commercial" ${p.type_of_space === 'Commercial' ? 'selected' : ''}>Commercial</option>
            </select>
          </div>
          <div class="form-group">
            <label>Framework <span style="color:var(--grey);font-weight:400;font-size:0.8rem;">(cannot be changed)</span></label>
            <input type="text" value="${escapeAttr(p.framework)}" disabled style="background:var(--grey-bg);">
          </div>
          <div class="form-group">
            <label>Width (ft)</label>
            <input type="number" step="0.1" id="ed_width" value="${p.width_ft || ''}">
          </div>
          <div class="form-group">
            <label>Depth (ft)</label>
            <input type="number" step="0.1" id="ed_depth" value="${p.depth_ft || ''}">
          </div>
          <div class="form-group">
            <label>Height (ft)</label>
            <input type="number" step="0.1" id="ed_height" value="${p.height_ft || ''}">
          </div>
          <div class="form-group">
            <label>Expected Completion</label>
            <input type="date" id="ed_completion" value="${formatDateForInput(p.expected_completion)}">
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
        ${detailItem('Width', p.width_ft ? p.width_ft + ' ft' : null)}
        ${detailItem('Depth', p.depth_ft ? p.depth_ft + ' ft' : null)}
        ${detailItem('Height', p.height_ft ? p.height_ft + ' ft' : null)}
        ${detailItem('Cubic Feet', p.width_ft && p.depth_ft && p.height_ft 
          ? (p.width_ft * p.depth_ft * p.height_ft).toFixed(2) + ' CFT'
          : null)}
        ${detailItem('Expected Completion', formatDate(p.expected_completion))}
        ${detailItem('Status', p.status)}
      </div>
      
      ${p.notes ? `
        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--grey-light);">
          <div class="detail-label" style="margin-bottom:8px;">Notes</div>
          <div style="white-space:pre-wrap;">${escapeHtml(p.notes)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function detailItem(label, value) {
  if (value === null || value === undefined || value === '') {
    return `
      <div class="detail-item">
        <div class="detail-label">${label}</div>
        <div class="detail-value detail-value-empty">—</div>
      </div>
    `;
  }
  return `
    <div class="detail-item">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function switchTab(name) {
  activeTab = name;
  render();
  if (name === 'rough') {
    loadRoughEstimates();
  }
}

function enterEditMode() {
  isEditMode = true;
  render();
}

function cancelEdit() {
  isEditMode = false;
  render();
}

async function saveEdit() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  const updated = {
    project_id: currentProject.project_id,
    client_name: document.getElementById('ed_client_name').value.trim(),
    contact: document.getElementById('ed_contact').value.trim(),
    email: document.getElementById('ed_email').value.trim(),
    location: document.getElementById('ed_location').value.trim(),
    type_of_space: document.getElementById('ed_type').value,
    width_ft: parseFloat(document.getElementById('ed_width').value) || '',
    depth_ft: parseFloat(document.getElementById('ed_depth').value) || '',
    height_ft: parseFloat(document.getElementById('ed_height').value) || '',
    expected_completion: document.getElementById('ed_completion').value,
    notes: document.getElementById('ed_notes').value.trim()
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
  } catch {
    return '';
  }
}

function formatDateForInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return '';
  }
}

function formatINR(num) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '—';
  if (typeof num === 'string' && num === 'On Request') return 'On Request';
  return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function toast(msg, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 2500);
}
