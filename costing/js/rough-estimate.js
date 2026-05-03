let project = null;
let rates = null;
let viewingEstimate = null;

const MATERIALS = [
  { key: 'real_silver',    label: 'Real Silver',     rateKey: 'Real Silver',     defaultChecked: false },
  { key: 'marble',          label: 'Marble',           rateKey: 'Marble',           defaultChecked: true  },
  { key: 'solid_surface',   label: 'Solid Surface',    rateKey: 'Solid Surface',    defaultChecked: true  },
  { key: 'solid_wood',      label: 'Solid Wood',       rateKey: 'Solid Wood',       defaultChecked: true  },
  { key: 'hdhmr_duco',      label: 'HDHMR + Duco',     rateKey: 'HDHMR + Duco',     defaultChecked: true  },
  { key: 'acrylic_prelam',  label: 'Acrylic + Prelam', rateKey: 'Acrylic + Prelam', defaultChecked: true  }
];

const FRAMEWORK_ICONS = {
  'Sinhasan':            'framework-sinhasan.png',
  'Wall/Floor Mounted':  'framework-wfm.png',
  'Back Panel':          'framework-bpn.png',
  'Open Cabinet':        'framework-ocm.png',
  'Cabinet with Door':   'framework-cmd.png',
  'Mandir Room':         'framework-mdr.png'
};

document.addEventListener('DOMContentLoaded', async function() {
  if (!api.requireLogin()) return;
  const user = api.getCurrentUser();
  document.getElementById('userName').textContent = user.displayName;
  document.getElementById('userRole').textContent = user.role;
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project_id');
  const estimateId = params.get('estimate_id');
  if (estimateId) {
    await loadExistingEstimate(estimateId);
  } else if (projectId) {
    document.getElementById('backLink').href = 'project.html?id=' + encodeURIComponent(projectId);
    await loadDataForCreate(projectId);
  } else {
    showError('No project or estimate specified');
  }
});

async function loadDataForCreate(projectId) {
  try {
    const [projResult, ratesResult] = await Promise.all([
      api.call('get_project', { project_id: projectId }),
      api.call('get_rough_rates', {})
    ]);
    if (!projResult.ok) { showError(projResult.error || 'Project not found'); return; }
    if (!ratesResult.ok) { showError(ratesResult.error || 'Could not load rates'); return; }
    project = projResult.project;
    rates = ratesResult.rates;
    renderBuilder();
  } catch (err) { console.error(err); showError('Connection error'); }
}

async function loadExistingEstimate(estimateId) {
  try {
    const result = await api.call('get_rough_estimate', { estimate_id: estimateId });
    if (!result.ok) { showError(result.error || 'Estimate not found'); return; }
    viewingEstimate = result.estimate;
    const projResult = await api.call('get_project', { project_id: viewingEstimate.project_id });
    if (!projResult.ok) { showError('Project not found'); return; }
    project = projResult.project;
    rates = (viewingEstimate.snapshot && viewingEstimate.snapshot.rates_at_creation) || {};
    document.getElementById('backLink').href = 'project.html?id=' + encodeURIComponent(project.project_id) + '&tab=rough';
    renderViewer();
  } catch (err) { console.error(err); showError('Connection error'); }
}

function showError(msg) {
  document.getElementById('content').innerHTML = '<div class="empty-state"><h3>' + escapeHtml(msg) + '</h3></div>';
}

function renderBuilder() {
  const p = project;
  const initialW = p.width_ft || '';
  const initialD = p.depth_ft || '';
  const initialH = p.height_ft || '';
  document.getElementById('content').innerHTML = `
    <div class="project-header">
      <div class="project-header-left">
        <div class="project-id-large">${p.project_id} · New Rough Estimate</div>
        <h1 class="project-client-name">${escapeHtml(p.client_name)}</h1>
        <div class="project-meta">${escapeHtml(p.location || 'No location')} · ${escapeHtml(p.framework)} · ${escapeHtml(p.type_of_space || 'Space type not set')}</div>
      </div>
    </div>
    <div class="rough-layout">
      <div class="card">
        <div class="card-header"><h3>Specifications</h3></div>
        <div class="form-row form-row-3">
          <div class="form-group"><label for="re_width">Width (ft)</label><input type="number" id="re_width" step="0.1" min="0" value="${initialW}" oninput="recalc()"></div>
          <div class="form-group"><label for="re_depth">Depth (ft)</label><input type="number" id="re_depth" step="0.1" min="0" value="${initialD}" oninput="recalc()"></div>
          <div class="form-group"><label for="re_height">Height (ft)</label><input type="number" id="re_height" step="0.1" min="0" value="${initialH}" oninput="recalc()"></div>
        </div>
        <div class="cft-display"><span class="cft-label">Cubic Feet (internal only)</span><span class="cft-value" id="cftValue">—</span></div>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--grey-light);">
        <h4 style="margin-bottom: 12px; font-size: 0.95rem;">Materials to compare</h4>
        <p style="color: var(--grey); font-size: 0.85rem; margin-bottom: 16px;">Tick or untick materials to include in the comparison.</p>
        <div class="materials-checkboxes">
          ${MATERIALS.map(m => `<label class="material-check"><input type="checkbox" id="mat_${m.key}" ${m.defaultChecked ? 'checked' : ''} onchange="recalc()"><span>${m.label}</span><span class="material-rate">${formatRate(m.rateKey)}</span></label>`).join('')}
        </div>
        <div id="builderError" class="error-message" style="display:none; margin-top: 16px;"></div>
        <div style="display: flex; gap: 12px; margin-top: 24px; justify-content: flex-end;">
          <button class="btn-secondary" onclick="window.location.href='project.html?id=${p.project_id}'">Cancel</button>
          <button class="btn-primary" onclick="saveEstimate()" id="saveBtn">Save & Generate PDF</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Live Preview</h3></div>
        <div id="previewArea"><p style="color: var(--grey);">Enter dimensions to see prices.</p></div>
      </div>
    </div>
  `;
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
  const checked = MATERIALS.filter(m => document.getElementById('mat_' + m.key).checked);
  const previewArea = document.getElementById('previewArea');
  if (cft === 0 || checked.length === 0) {
    previewArea.innerHTML = '<p style="color: var(--grey);">Enter dimensions and select at least one material to see prices.</p>';
    return;
  }
  let html = '<table class="preview-table"><thead><tr><th>Material</th><th style="text-align:right;">Starting Price</th></tr></thead><tbody>';
  checked.forEach(m => {
    let priceDisplay;
    if (m.key === 'real_silver') {
      priceDisplay = '<span style="color: var(--orange); font-weight: 600;">On Request</span>';
    } else {
      const price = cft * (rates[m.rateKey] || 0);
      priceDisplay = '<strong>' + formatINR(price) + '</strong>';
    }
    html += '<tr><td>' + m.label + '</td><td style="text-align:right;">' + priceDisplay + '</td></tr>';
  });
  html += '</tbody></table><div class="preview-disclaimer"><strong>Note:</strong> Design Fees, Installation, Transport, Packing, Insurance, GST (18%) are extra. Final pricing may vary based on design, customization, and site conditions.</div>';
  previewArea.innerHTML = html;
}

async function saveEstimate() {
  const w = parseFloat(document.getElementById('re_width').value) || 0;
  const d = parseFloat(document.getElementById('re_depth').value) || 0;
  const h = parseFloat(document.getElementById('re_height').value) || 0;
  const errorEl = document.getElementById('builderError');
  const btn = document.getElementById('saveBtn');
  errorEl.style.display = 'none';
  if (w <= 0 || d <= 0 || h <= 0) { errorEl.textContent = 'Please enter all three dimensions greater than 0.'; errorEl.style.display = 'block'; return; }
  const checked = MATERIALS.filter(m => document.getElementById('mat_' + m.key).checked);
  if (checked.length === 0) { errorEl.textContent = 'Please select at least one material to compare.'; errorEl.style.display = 'block'; return; }
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const result = await api.call('create_rough_estimate', {
      project_id: project.project_id, width: w, depth: d, height: h,
      materials_included: checked.map(m => m.label)
    });
    if (result.ok) {
      btn.textContent = 'Generating PDF...';
      const pdfData = {
        estimate_id: result.estimate_id,
        width: w, depth: d, height: h,
        cubic_feet: result.prices.cubic_feet,
        prices: result.prices,
        materials_included: checked.map(m => m.label)
      };
      await generatePdf(pdfData);
      setTimeout(() => { window.location.href = 'project.html?id=' + encodeURIComponent(project.project_id) + '&tab=rough'; }, 1500);
    } else {
      errorEl.textContent = result.error || 'Failed to save';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save & Generate PDF';
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Save & Generate PDF';
  }
}

function renderViewer() {
  const e = viewingEstimate;
  const p = project;
  const snap = e.snapshot || {};
  document.getElementById('content').innerHTML = `
    <div class="project-header">
      <div class="project-header-left">
        <div class="project-id-large">${e.estimate_id}</div>
        <h1 class="project-client-name">${escapeHtml(p.client_name)}</h1>
        <div class="project-meta">${escapeHtml(p.framework)} · ${snap.width || '?'} × ${snap.depth || '?'} × ${snap.height || '?'} ft · Created ${formatDate(e.created_at)} by ${escapeHtml(e.created_by)}</div>
      </div>
      <div class="project-header-right"><button class="btn-primary" onclick="redownloadPdf()" id="dlBtn">Download PDF</button></div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Estimate Details</h3></div>
      <table class="preview-table">
        <thead><tr><th>Material</th><th style="text-align:right;">Starting Price</th></tr></thead>
        <tbody>${renderViewerRows(snap.materials_included || [])}</tbody>
      </table>
      <div class="preview-disclaimer" style="margin-top: 20px;"><strong>Note:</strong> Design Fees, Installation, Transport, Packing, Insurance, GST (18%) are extra. Final pricing may vary based on design, customization, and site conditions.</div>
    </div>
  `;
}

function renderViewerRows(includedLabels) {
  const e = viewingEstimate;
  let html = '';
  MATERIALS.forEach(m => {
    if (!includedLabels.includes(m.label)) return;
    let priceDisplay;
    if (m.key === 'real_silver') {
      priceDisplay = '<span style="color: var(--orange); font-weight: 600;">On Request</span>';
    } else {
      priceDisplay = '<strong>' + formatINR(e[m.key]) + '</strong>';
    }
    html += '<tr><td>' + m.label + '</td><td style="text-align:right;">' + priceDisplay + '</td></tr>';
  });
  return html;
}

async function redownloadPdf() {
  const btn = document.getElementById('dlBtn');
  btn.disabled = true;
  btn.textContent = 'Generating PDF...';
  const e = viewingEstimate;
  const snap = e.snapshot || {};
  const pdfData = {
    estimate_id: e.estimate_id,
    width: snap.width, depth: snap.depth, height: snap.height,
    cubic_feet: e.cubic_feet,
    prices: {
      real_silver: 'On Request',
      marble: e.marble,
      solid_surface: e.solid_surface,
      solid_wood: e.solid_wood,
      hdhmr_duco: e.hdhmr_duco,
      acrylic_prelam: e.acrylic_prelam
    },
    materials_included: snap.materials_included || []
  };
  try {
    await generatePdf(pdfData);
  } catch (err) {
    console.error(err);
    toast('PDF generation failed: ' + err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Download PDF';
}

async function generatePdf(data) {
  console.log('=== PDF GENERATION START ===');
  const html = buildPdfHtml(data);
  const root = document.getElementById('pdfRoot');
  root.innerHTML = '<div id="pdfContent">' + html + '</div>';
  root.style.position = 'fixed';
  root.style.top = '0';
  root.style.left = '-9999px';
  root.style.width = '210mm';
  root.style.background = 'white';
  await waitForImages(root);
  const imgs = root.querySelectorAll('img');
  imgs.forEach((img, i) => {
    console.log('Image ' + i + ': src=' + img.src + ', complete=' + img.complete + ', naturalWidth=' + img.naturalWidth);
  });
  const filename = data.estimate_id + '.pdf';
  const targetEl = document.getElementById('pdfContent');
  console.log('Target element height:', targetEl.offsetHeight);
  const opt = {
    margin: 0,
    filename: filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false, allowTaint: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };
  try {
    await html2pdf().from(targetEl).set(opt).save();
    console.log('=== PDF GENERATION COMPLETE ===');
  } catch (err) {
    console.error('PDF generation failed:', err);
  }
  setTimeout(() => {
    root.innerHTML = '';
    root.style.position = '';
    root.style.top = '';
    root.style.left = '';
    root.style.width = '';
    root.style.background = '';
  }, 1000);
}

function buildPdfHtml(data) {
  const p = project;
  const frameworkIcon = FRAMEWORK_ICONS[p.framework] || 'logo.png';
  const includedLabels = data.materials_included || [];
  const includedMats = MATERIALS.filter(m => includedLabels.includes(m.label));
  let comparisonCols = '';
  let priceRow = '';
  let extraRows = ['Design Fees', 'Installation', 'Transport', 'Packing', 'Insurance', 'GST (18%)']
    .map(label => '<tr><td class="row-label">' + label + '</td>' + includedMats.map(() => '<td>Extra</td>').join('') + '</tr>').join('');
  includedMats.forEach(m => {
    comparisonCols += '<th>' + m.label + '</th>';
    let price;
    if (m.key === 'real_silver') { price = 'On Request'; } else { price = formatINR(data.prices[m.key]); }
    priceRow += '<td><strong>' + price + '</strong></td>';
  });
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const completionDate = p.expected_completion ? formatDate(p.expected_completion) : '—';
  return `
    <div class="pdf-page">
      <div class="pdf-header">
        <img src="assets/logo.png" class="pdf-logo" crossorigin="anonymous">
        <img src="assets/${frameworkIcon}" class="pdf-framework-icon" crossorigin="anonymous">
      </div>
      <table class="pdf-info-table">
        <tr><td class="label">Client Name</td><td>${escapeHtml(p.client_name)}</td><td class="label">Location</td><td>${escapeHtml(p.location || '')}</td></tr>
        <tr><td class="label">Mobile</td><td>${escapeHtml(p.contact || '')}</td><td class="label">Email</td><td>${escapeHtml(p.email || '')}</td></tr>
        <tr><td class="label">Type of Space</td><td>${escapeHtml(p.type_of_space || '')}</td><td class="label">Expected Completion</td><td>${completionDate}</td></tr>
        <tr><td class="label">Estimate ID</td><td>${escapeHtml(data.estimate_id)}</td><td class="label">Date</td><td>${today}</td></tr>
      </table>
      <table class="pdf-specs-table">
        <tr><td colspan="3" class="specs-header">Mandir Specifications (in feet)</td></tr>
        <tr><th>Width</th><th>Depth</th><th>Height</th></tr>
        <tr><td><strong>${data.width}</strong></td><td><strong>${data.depth}</strong></td><td><strong>${data.height}</strong></td></tr>
      </table>
      <table class="pdf-framework-row">
        <tr><td class="label">Design Framework</td><td colspan="3"><strong>${escapeHtml(p.framework)}</strong></td></tr>
      </table>
      <div class="pdf-estimate-title">ROUGH ESTIMATE</div>
      <table class="pdf-estimate-table">
        <thead><tr><th class="row-label">Description</th>${comparisonCols}</tr></thead>
        <tbody><tr class="price-row"><td class="row-label">Starting Price</td>${priceRow}</tr>${extraRows}</tbody>
      </table>
      <div class="pdf-disclaimer">
        <strong>DISCLAIMER:</strong> This is a preliminary estimate based on initial inputs. Final pricing will be confirmed after design finalisation and may vary based on design development, materials, and site conditions. All mandirs are customised, and changes during the design process may impact the final cost. Additional charges such as design fees, installation, transport, and taxes are extra unless specified. Estimated timelines will be shared after final design approval. All designs remain the intellectual property of Make My Mandir. Unauthorized use will lead to legal action.
      </div>
      <div class="pdf-footer">
        <div class="pdf-footer-block"><div class="pdf-footer-label">Address</div><strong>Make My Mandir</strong><br>Shankarseth Road, Bhawani Peth,<br>Pune – 411042</div>
        <div class="pdf-footer-block"><div class="pdf-footer-label">Contact</div><strong>+91 77679 62441</strong><br>info@makemymandir.com</div>
        <div class="pdf-footer-block"><div class="pdf-footer-label">Online</div>makemymandir.com<br>@make_my_mandir</div>
      </div>
    </div>
    <div class="html2pdf__page-break"></div>
    <div style="width: 210mm; height: 297mm; padding: 0; margin: 0; overflow: hidden; box-sizing: border-box; display: block;">
      <img src="assets/process-page.png" style="width: 210mm; height: 297mm; display: block; object-fit: cover; margin: 0; padding: 0;" crossorigin="anonymous">
    </div>
  `;
}

function waitForImages(container) {
  const imgs = container.querySelectorAll('img');
  const promises = Array.from(imgs).map(img => {
    if (img.complete && img.naturalHeight > 0) return Promise.resolve();
    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
  });
  return Promise.all(promises);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatINR(num) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '—';
  if (typeof num === 'string') return num;
  return '₹' + Number(num).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
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
  }, 2500);
}
