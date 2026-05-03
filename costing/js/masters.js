// ============================================
// masters.js — Masters Admin
// ============================================

let currentMasterKey = 'rough_rates';
let currentData = null;

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  
  const user = api.getCurrentUser();
  
  // Admin only
  if (user.role !== 'admin') {
    document.getElementById('mastersContent').innerHTML = 
      '<div class="empty-state"><h3>Admin access only</h3><p>You don\'t have permission to view this page.</p></div>';
    return;
  }
  
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;
  
  // Wire tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      switchTab(key);
    });
  });
  
  // Load default tab
  await loadMaster('rough_rates');
});

async function switchTab(key) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.key === key);
  });
  await loadMaster(key);
}

async function loadMaster(key) {
  currentMasterKey = key;
  const content = document.getElementById('mastersContent');
  content.innerHTML = '<p style="color: var(--grey);">Loading...</p>';
  
  try {
    const result = await api.call('list_master', { master_key: key });
    if (!result.ok) {
      content.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + escapeHtml(result.error) + '</p></div>';
      return;
    }
    
    currentData = result;
    renderTable(result);
  } catch (err) {
    console.error(err);
    content.innerHTML = '<div class="empty-state"><h3>Connection error</h3></div>';
  }
}

function renderTable(data) {
  const content = document.getElementById('mastersContent');
  
  if (!data.rows || data.rows.length === 0) {
    content.innerHTML = '<div class="empty-state"><h3>No rows yet</h3></div>';
    return;
  }
  
  // Filter out internal columns from display
  const visibleHeaders = data.headers.filter(h => 
    h !== '_rowIndex' && h.toLowerCase() !== 'created_at' && h.toLowerCase() !== 'created_by'
  );
  
  let html = `
    <div class="masters-toolbar">
      <input type="text" id="searchBox" placeholder="Search..." class="search-input" oninput="filterRows()">
      <span style="color: var(--grey); font-size: 0.9rem;">${data.rows.length} rows</span>
    </div>
    
    <div class="masters-table-wrap">
      <table class="masters-table" id="mastersTable">
        <thead>
          <tr>
            ${visibleHeaders.map(h => '<th>' + formatHeader(h) + '</th>').join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  data.rows.forEach(row => {
    html += '<tr data-row-index="' + row._rowIndex + '">';
    visibleHeaders.forEach(h => {
      const value = row[h];
      const isActive = h.toLowerCase() === 'active';
      const isEditable = isCellEditable(h);
      
      if (isActive) {
        html += '<td><input type="checkbox" ' + (value === true || value === 'TRUE' || value === 'true' ? 'checked' : '') + 
                ' onchange="updateCell(' + row._rowIndex + ', \'' + h + '\', this.checked)"></td>';
      } else if (isEditable) {
        html += '<td contenteditable="true" data-col="' + h + '" data-original="' + escapeHtml(String(value)) + '" ' +
                'onblur="handleEdit(this, ' + row._rowIndex + ')">' + escapeHtml(String(value || '')) + '</td>';
      } else {
        html += '<td>' + escapeHtml(String(value || '')) + '</td>';
      }
    });
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  
  content.innerHTML = html;
}

function isCellEditable(headerName) {
  // For now, all non-system columns are editable
  const systemCols = ['_rowIndex', 'id', 'created_at', 'created_by'];
  return !systemCols.includes(headerName.toLowerCase());
}

function formatHeader(h) {
  return h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function handleEdit(cell, rowIndex) {
  const original = cell.dataset.original;
  const newValue = cell.textContent.trim();
  const column = cell.dataset.col;
  
  if (newValue === original) return; // no change
  
  updateCell(rowIndex, column, newValue);
  cell.dataset.original = newValue;
}

async function updateCell(rowIndex, column, value) {
  const user = api.getCurrentUser();
  
  try {
    const result = await api.call('update_master_cell', {
      master_key: currentMasterKey,
      row_index: rowIndex,
      column: column,
      value: value,
      username: user.username
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

function filterRows() {
  const term = document.getElementById('searchBox').value.toLowerCase();
  const rows = document.querySelectorAll('#mastersTable tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(term) ? '' : 'none';
  });
}

// Helpers
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toast(msg, type) {
  type = type || 'success';
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
  }, 2000);
}
