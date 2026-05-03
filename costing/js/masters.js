let currentMasterKey = 'rough_rates';
let currentData = null;

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  
  const user = api.getCurrentUser();
  
  if (user.role !== 'admin') {
    document.getElementById('mastersContent').innerHTML = 
      '<div class="empty-state"><h3>Admin access only</h3><p>You don\'t have permission to view this page.</p></div>';
    return;
  }
  
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      switchTab(key);
    });
  });
  
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
  
  const validRows = data.rows.filter(row => {
    const firstCol = data.headers[0];
    return row[firstCol] !== '' && row[firstCol] !== null && row[firstCol] !== undefined;
  });
  
  const visibleHeaders = data.headers.filter(h => 
    h !== '_rowIndex' && h.toLowerCase() !== 'created_at' && h.toLowerCase() !== 'created_by' && h.toLowerCase() !== 'updated_at' && h.toLowerCase() !== 'updated_by'
  );
  
  let html = '<div class="masters-toolbar">';
  html += '<input type="text" id="searchBox" placeholder="Search..." class="search-input" oninput="filterRows()">';
  html += '<span style="color: var(--grey); font-size: 0.9rem;">' + validRows.length + ' rows</span>';
  html += '<button class="btn-primary" onclick="openAddRowModal()">+ Add Row</button>';
  html += '</div>';
  
  if (validRows.length === 0) {
    html += '<div class="empty-state"><h3>No rows yet</h3><p>Click "+ Add Row" to create the first one.</p></div>';
    content.innerHTML = html;
    return;
  }
  
  html += '<div class="masters-table-wrap">';
  html += '<table class="masters-table" id="mastersTable">';
  html += '<thead><tr>';
  visibleHeaders.forEach(h => { html += '<th>' + formatHeader(h) + '</th>'; });
  html += '</tr></thead><tbody>';
  
  validRows.forEach(row => {
    html += '<tr data-row-index="' + row._rowIndex + '">';
    visibleHeaders.forEach(h => {
      const value = row[h];
      const isActive = h.toLowerCase() === 'active';
      const isEditable = isCellEditable(h);
      
      if (isActive) {
        const isChecked = (value === true || value === 'TRUE' || value === 'true' || value === 1);
        html += '<td><input type="checkbox" ' + (isChecked ? 'checked' : '') + 
                ' onchange="updateCell(' + row._rowIndex + ', \'' + h + '\', this.checked)"></td>';
      } else if (isEditable) {
        const safeVal = (value === null || value === undefined) ? '' : value;
        html += '<td contenteditable="true" data-col="' + h + '" data-original="' + escapeHtml(String(safeVal)) + '" ' +
                'onblur="handleEdit(this, ' + row._rowIndex + ')">' + escapeHtml(String(safeVal)) + '</td>';
      } else {
        const safeVal = (value === null || value === undefined) ? '' : value;
        html += '<td>' + escapeHtml(String(safeVal)) + '</td>';
      }
    });
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  content.innerHTML = html;
}

function isCellEditable(headerName) {
  const systemCols = ['_rowindex', 'id', 'created_at', 'created_by', 'updated_at', 'updated_by'];
  return !systemCols.includes(headerName.toLowerCase());
}

function formatHeader(h) {
  return h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function handleEdit(cell, rowIndex) {
  const original = cell.dataset.original;
  const newValue = cell.textContent.trim();
  const column = cell.dataset.col;
  
  if (newValue === original) return;
  
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

function openAddRowModal() {
  if (!currentData) return;
  
  const headers = currentData.headers;
  const skipCols = ['_rowindex', 'id', 'created_at', 'created_by', 'updated_at', 'updated_by'];
  const formFields = headers.filter(h => !skipCols.includes(h.toLowerCase()));
  
  let html = '';
  formFields.forEach(h => {
    const id = 'addRow_' + h;
    const isActive = h.toLowerCase() === 'active';
    const isRate = h.toLowerCase().indexOf('rate') !== -1;
    
    if (isActive) {
      html += '<div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">';
      html += '<input type="checkbox" id="' + id + '" checked>';
      html += '<label for="' + id + '" style="margin: 0;">Active (visible in new quotes)</label>';
      html += '</div>';
    } else {
      const inputType = isRate ? 'number' : 'text';
      const stepAttr = isRate ? 'step="any"' : '';
      html += '<div class="form-group">';
      html += '<label for="' + id + '">' + formatHeader(h) + '</label>';
      html += '<input type="' + inputType + '" id="' + id + '" ' + stepAttr + ' placeholder="Enter ' + formatHeader(h).toLowerCase() + '">';
      html += '</div>';
    }
  });
  
  document.getElementById('addRowFields').innerHTML = html;
  document.getElementById('addRowTitle').textContent = 'Add New Row — ' + getMasterDisplayName(currentMasterKey);
  document.getElementById('addRowError').style.display = 'none';
  document.getElementById('addRowSubmitBtn').disabled = false;
  document.getElementById('addRowSubmitBtn').textContent = 'Add Row';
  document.getElementById('addRowModal').style.display = 'flex';
  
  const firstInput = document.querySelector('#addRowFields input[type="text"], #addRowFields input[type="number"]');
  if (firstInput) firstInput.focus();
}

function closeAddRowModal() {
  document.getElementById('addRowModal').style.display = 'none';
}

function getMasterDisplayName(key) {
  const names = {
    'rough_rates': 'Rough Rates',
    'material': 'Material Rates',
    'cnc': 'CNC Designs',
    'decor': 'Decor',
    'hardware': 'Hardware',
    'lighting': 'Lighting'
  };
  return names[key] || key;
}

async function submitAddRow() {
  const errorEl = document.getElementById('addRowError');
  const btn = document.getElementById('addRowSubmitBtn');
  errorEl.style.display = 'none';
  
  const headers = currentData.headers;
  const skipCols = ['_rowindex', 'id', 'created_at', 'created_by', 'updated_at', 'updated_by'];
  const rowData = {};
  let firstField = null;
  let firstFieldValue = null;
  
  headers.forEach(h => {
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
    
    if (firstField === null) {
      firstField = h;
      firstFieldValue = rowData[h];
    }
  });
  
  if (firstFieldValue === '' || firstFieldValue === null || firstFieldValue === undefined) {
    errorEl.textContent = formatHeader(firstField) + ' is required.';
    errorEl.style.display = 'block';
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Adding...';
  
  const user = api.getCurrentUser();
  
  try {
    const result = await api.call('add_master_row', {
      master_key: currentMasterKey,
      row_data: rowData,
      username: user.username
    });
    
    if (result.ok) {
      toast('Row added', 'success');
      closeAddRowModal();
      await loadMaster(currentMasterKey);
    } else {
      errorEl.textContent = result.error || 'Failed to add row';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Add Row';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Connection error';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Add Row';
  }
}

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
