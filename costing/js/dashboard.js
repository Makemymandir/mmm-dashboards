// ============================================
// dashboard.js — Project list, search, filter
// ============================================

let allProjects = [];
let currentSearch = '';
let currentStatus = 'all';
let searchDebounceTimer = null;

// On page load
document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  
  // Display logged-in user info
  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;
  
  // Load projects
  await loadProjects();
});

async function loadProjects() {
  const container = document.getElementById('projectListContainer');
  container.innerHTML = '<div class="loading">Loading projects...</div>';
  
  try {
    const result = await api.call('list_projects', {
      search: currentSearch,
      status: currentStatus
    });
    
    if (!result.ok) {
      container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + result.error + '</p></div>';
      return;
    }
    
    allProjects = result.projects;
    renderProjects(allProjects);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><h3>Connection error</h3><p>Could not load projects. Try refreshing.</p></div>';
  }
}

function renderProjects(projects) {
  const container = document.getElementById('projectListContainer');
  const countEl = document.getElementById('projectCount');
  
  countEl.textContent = projects.length === 0 
    ? 'No projects yet' 
    : projects.length + ' project' + (projects.length === 1 ? '' : 's');
  
  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No projects yet</h3>
        <p>Click "+ New Project" above to create your first project.</p>
      </div>`;
    return;
  }
  
  let html = `
    <table class="project-table">
      <thead>
        <tr>
          <th>Project ID</th>
          <th>Client</th>
          <th>Framework</th>
          <th>Size (W×D×H)</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  projects.forEach(p => {
    const sizeStr = (p.width_ft || p.depth_ft || p.height_ft) 
      ? `${p.width_ft || '?'} × ${p.depth_ft || '?'} × ${p.height_ft || '?'} ft`
      : '—';
    const createdStr = p.created_at ? formatDate(p.created_at) : '—';
    const status = p.status || 'Lead';
    
    html += `
      <tr onclick="openProject('${p.project_id}')">
        <td><span class="project-id-cell">${p.project_id}</span></td>
        <td><span class="client-name-cell">${escapeHtml(p.client_name)}</span><br><span style="color:var(--grey);font-size:0.8rem;">${escapeHtml(p.location || '')}</span></td>
        <td>${escapeHtml(p.framework || '—')}</td>
        <td>${sizeStr}</td>
        <td><span class="status-badge status-${status}">${status}</span></td>
        <td style="color:var(--grey);font-size:0.85rem;">${createdStr}</td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function onSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentSearch = document.getElementById('searchInput').value.trim();
    loadProjects();
  }, 300);
}

function setStatusFilter(status) {
  currentStatus = status;
  // Update chip UI
  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('chip-active', chip.dataset.status === status);
  });
  loadProjects();
}

function openProject(projectId) {
  window.location.href = 'project.html?id=' + encodeURIComponent(projectId);
}

// ============================================
// NEW PROJECT MODAL
// ============================================

function openNewProjectModal() {
  document.getElementById('newProjectModal').style.display = 'flex';
  document.getElementById('np_client_name').focus();
}

function closeNewProjectModal() {
  document.getElementById('newProjectModal').style.display = 'none';
  document.getElementById('newProjectForm').reset();
  document.getElementById('newProjectError').style.display = 'none';
}

async function createProject() {
  const errorEl = document.getElementById('newProjectError');
  const btn = document.getElementById('createProjectBtn');
  errorEl.style.display = 'none';
  
  const project = {
    client_name: document.getElementById('np_client_name').value.trim(),
    contact: document.getElementById('np_contact').value.trim(),
    email: document.getElementById('np_email').value.trim(),
    location: document.getElementById('np_location').value.trim(),
    type_of_space: document.getElementById('np_type').value,
    framework: document.getElementById('np_framework').value,
    width_ft: parseFloat(document.getElementById('np_width').value) || '',
    depth_ft: parseFloat(document.getElementById('np_depth').value) || '',
    height_ft: parseFloat(document.getElementById('np_height').value) || '',
    expected_completion: document.getElementById('np_completion').value,
    notes: document.getElementById('np_notes').value.trim()
  };
  
  if (!project.client_name) {
    errorEl.textContent = 'Client name is required';
    errorEl.style.display = 'block';
    return;
  }
  if (!project.framework) {
    errorEl.textContent = 'Design framework is required';
    errorEl.style.display = 'block';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Creating...';
  
  try {
    const result = await api.call('create_project', { project: project });
    
    if (result.ok) {
      // Redirect to the new project
      window.location.href = 'project.html?id=' + encodeURIComponent(result.project_id);
    } else {
      errorEl.textContent = result.error || 'Failed to create project';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create Project';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Network error. Try again.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Create Project';
  }
}
