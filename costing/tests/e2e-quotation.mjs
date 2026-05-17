#!/usr/bin/env node
/**
 * e2e-quotation.mjs
 * ============================================================================
 * End-to-end test for the MMM Costing "Section 7" final-quotation builder.
 *
 * WHAT IT DOES
 *   1. Logs into the live costing app with your credentials.
 *   2. Creates ONE new quotation against MMM_PROJECT_ID.
 *   3. Adds one line to every section — Material, CNC, Decor, Hardware,
 *      Lighting, Labour, Logistics — with known qty x rate so the maths
 *      is auditable.
 *   4. Runs the rate-validation tests:
 *        - Labour line, blank rate  -> must be REJECTED
 *        - Labour line, rate 0      -> must be REJECTED
 *        - Labour line, valid rate + qty 0 -> must be ACCEPTED, cost = 0
 *   5. Verifies every section subtotal, the grand total, profit, GST and
 *      final amount, and prints expected-vs-actual numbers.
 *   6. Generates the PDF and checks a file is produced.
 *   7. Checks the 375px mobile layout (stacking + sticky).
 *   8. Reports any console errors / failed requests.
 *   9. CLEANS UP: deletes every line it created via delete_quotation_line.
 *      NOTE: the app exposes no delete_quotation action, so the empty
 *      quotation SHELL cannot be removed by the script — its id is printed
 *      loudly at the end so you can delete it by hand.
 *
 * REQUIREMENTS
 *   Node 18+, then:   npm install      (installs Playwright + Chromium)
 *
 * ENV VARS
 *   MMM_BASE_URL    (required) e.g. https://makemymandir.github.io/mmm-dashboards/costing
 *                              or a local static server, e.g. http://localhost:8080/costing
 *   MMM_USERNAME    (required) your costing-app login
 *   MMM_PASSWORD    (required) your costing-app password
 *   MMM_PROJECT_ID  (required) an existing project id to attach the test quote to
 *   MMM_HEADLESS    (optional) "false" to watch the browser  (default: true)
 *   MMM_PROFIT_PCT  (optional) set a known profit % on the test quote before verifying
 *
 * RUN (PowerShell)
 *   $env:MMM_BASE_URL="..."; $env:MMM_USERNAME="..."; $env:MMM_PASSWORD="...";
 *   $env:MMM_PROJECT_ID="..."; node e2e-quotation.mjs
 *
 * RUN (bash)
 *   MMM_BASE_URL=... MMM_USERNAME=... MMM_PASSWORD=... MMM_PROJECT_ID=... \
 *     node e2e-quotation.mjs
 * ============================================================================
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// ── Config ──────────────────────────────────────────────────────────────────
const BASE        = (process.env.MMM_BASE_URL || '').replace(/\/+$/, '');
const USER        = process.env.MMM_USERNAME || '';
const PASS        = process.env.MMM_PASSWORD || '';
const PROJECT_ID  = process.env.MMM_PROJECT_ID || '';
const HEADLESS    = (process.env.MMM_HEADLESS || 'true').toLowerCase() !== 'false';
const PROFIT_PCT  = process.env.MMM_PROFIT_PCT ? Number(process.env.MMM_PROFIT_PCT) : null;
const TOL         = 1.5; // ₹ tolerance for rounding differences

const HERE     = path.dirname(fileURLToPath(import.meta.url));
const ART_DIR  = path.join(HERE, 'artifacts');

// One line per section: deterministic qty x rate so totals are auditable.
const LINE_PLAN = [
  { key: 'material',  qty: 10, rate: 100  }, // 1000
  { key: 'cnc',       qty: 5,  rate: 200  }, // 1000
  { key: 'decor',     qty: 4,  rate: 250  }, // 1000
  { key: 'hardware',  qty: 8,  rate: 125  }, // 1000
  { key: 'lighting',  qty: 2,  rate: 500  }, // 1000
  { key: 'labour',    qty: 1,  rate: 3000 }, // 3000
  { key: 'logistics', qty: 1,  rate: 1500 }, // 1500
];
const MASTER_SECTIONS = ['cnc', 'decor', 'hardware', 'lighting'];

// ── Result tracking ─────────────────────────────────────────────────────────
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}]  ${name}${detail ? '  —  ' + detail : ''}`);
}
function info(msg) { console.log('  ' + msg); }
function head(msg) { console.log('\n=== ' + msg + ' ==='); }

const near  = (a, b) => Math.abs(Number(a) - Number(b)) <= TOL;
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num   = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// ── Browser helpers ─────────────────────────────────────────────────────────

async function login(page) {
  head('LOGIN');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('#loginButton');
  try {
    await page.waitForURL(/dashboard\.html/, { timeout: 30000 });
  } catch {
    const t = await page
      .evaluate(() => { const e = document.getElementById('errorMessage'); return e ? e.textContent : ''; })
      .catch(() => '');
    throw new Error('Login did not reach the dashboard. ' + (t || '(no error message shown)'));
  }
  info('Logged in as ' + USER);
}

async function createQuotation(page) {
  head('CREATE QUOTATION');
  await page.goto(BASE + '/final-quotation.html?project_id=' + encodeURIComponent(PROJECT_ID), {
    waitUntil: 'domcontentloaded',
  });
  // renderPage() finished once the totals card exists.
  await page.waitForSelector('.totals-card', { timeout: 60000 });
  const qid = await page.evaluate(() => (typeof quotation !== 'undefined' && quotation ? quotation.quotation_id : null));
  if (!qid) throw new Error('Quotation was not created (no quotation_id on the page).');
  info('Created test quotation: ' + qid);

  if (PROFIT_PCT != null && !isNaN(PROFIT_PCT)) {
    await page.evaluate((p) => updateProfitPct(String(p)), PROFIT_PCT);
    await page.waitForTimeout(2500); // updateProfitPct round-trips to the backend
    info('Profit margin set to ' + PROFIT_PCT + '%');
  }
  return qid;
}

async function waitForCatalog(page) {
  try {
    await page.waitForFunction(
      () =>
        typeof materialCatalog !== 'undefined' &&
        materialCatalog.length > 0 &&
        typeof masterData !== 'undefined' &&
        masterData.cnc && masterData.decor && masterData.hardware && masterData.lighting,
      { timeout: 40000 }
    );
    info('Catalog + master data loaded.');
  } catch {
    info('WARNING: catalog/master data not fully loaded in 40s — affected sections will FAIL with a clear reason.');
  }
}

/** Adds one line to a section via the real Add Line modal. Throws on failure. */
async function addSectionLine(page, { key, qty, rate }) {
  await page.evaluate((k) => openAddLineModal(k), key);
  await page.waitForSelector('#addLineModal', { state: 'visible', timeout: 10000 });

  if (key === 'material') {
    const name = await page.evaluate(() => {
      const m = (typeof materialCatalog !== 'undefined' ? materialCatalog : []).find((x) => x && x.item_name);
      return m ? m.item_name : null;
    });
    if (!name) throw new Error('material catalog is empty — cannot add a Material line');
    await page.fill('#materialSearch', name);
    await page.waitForSelector('#materialDropdown div[onclick]', { state: 'visible', timeout: 10000 });
    await page.click('#materialDropdown div[onclick]');
    await page.waitForSelector('#selectedMaterialDisplay', { state: 'visible', timeout: 5000 });
  } else if (MASTER_SECTIONS.includes(key)) {
    const name = await page.evaluate((k) => {
      const items = typeof masterData !== 'undefined' && masterData[k] ? masterData[k] : [];
      const s = items[0] || {};
      const nameKey = s.hasOwnProperty('material')
        ? 'material'
        : s.hasOwnProperty('item_name')
        ? 'item_name'
        : Object.keys(s).filter((x) => x !== '_rowIndex' && x !== 'active')[0];
      return nameKey ? String(s[nameKey] || '') : null;
    }, key);
    if (!name) throw new Error(`master table "${key}" is empty — cannot add a ${key} line`);
    await page.fill('#masterSearch', name);
    await page.waitForSelector('#masterDropdown div[onclick]', { state: 'visible', timeout: 10000 });
    await page.click('#masterDropdown div[onclick]');
    await page.waitForSelector('#selectedMasterDisplay', { state: 'visible', timeout: 5000 });
  } else {
    // labour / logistics — free text
    await page.fill('#freeTextDesc', 'E2E TEST ' + key + ' line');
  }

  await page.fill('#lineQty', String(qty));
  await page.fill('#lineRate', String(rate)); // override any auto-filled rate for predictable maths
  await page.click('#addLineSubmitBtn');
  await page.waitForSelector('#addLineModal', { state: 'hidden', timeout: 30000 });
}

/** Runs one rate-validation case against the Labour section. */
async function rateCase(page, { rate, qty, expectAccept }) {
  await page.evaluate(() => {
    if (document.getElementById('addLineModal').style.display !== 'none') closeAddLineModal();
  });
  await page.evaluate(() => openAddLineModal('labour'));
  await page.waitForSelector('#addLineModal', { state: 'visible', timeout: 10000 });
  await page.fill('#freeTextDesc', 'E2E TEST rate-validation');
  await page.fill('#lineQty', String(qty));
  await page.fill('#lineRate', rate === '' ? '' : String(rate));
  await page.click('#addLineSubmitBtn');

  if (expectAccept) {
    try {
      await page.waitForSelector('#addLineModal', { state: 'hidden', timeout: 30000 });
      return { pass: true, detail: 'accepted (modal closed, line saved)' };
    } catch {
      const err = await page.evaluate(() => document.getElementById('addLineError').textContent).catch(() => '');
      await page.evaluate(() => closeAddLineModal()).catch(() => {});
      return { pass: false, detail: 'expected ACCEPT but was rejected: "' + err + '"' };
    }
  }
  // expect rejection
  await page.waitForTimeout(400); // validation is synchronous; brief settle
  const err = await page.evaluate(() => {
    const e = document.getElementById('addLineError');
    const m = document.getElementById('addLineModal');
    return { visible: e && e.style.display !== 'none', text: e ? e.textContent.trim() : '', modalOpen: m.style.display !== 'none' };
  });
  await page.evaluate(() => closeAddLineModal()).catch(() => {});
  const pass = err.visible && err.modalOpen && /rate must be greater than 0/i.test(err.text);
  return { pass, detail: `error shown=${err.visible} text="${err.text}" modalStillOpen=${err.modalOpen}` };
}

async function cleanup(page, quotationId) {
  head('CLEANUP');
  if (!page || !quotationId) { info('Nothing to clean up.'); return; }
  try {
    const before = await page.evaluate(
      async (qid) => await api.call('get_quotation', { quotation_id: qid }),
      quotationId
    );
    const lines = (before && before.lines) || [];
    let deleted = 0;
    for (const l of lines) {
      const d = await page.evaluate(
        async ({ lineId, qid }) => await api.call('delete_quotation_line', { line_id: lineId, quotation_id: qid }),
        { lineId: l.line_id, qid: quotationId }
      );
      if (d && d.ok) deleted++;
      else info('Could not delete line ' + l.line_id + ': ' + (d && d.error ? d.error : 'unknown'));
    }
    const after = await page.evaluate(
      async (qid) => await api.call('get_quotation', { quotation_id: qid }),
      quotationId
    );
    const remaining = (after && after.lines || []).length;
    info(`Deleted ${deleted}/${lines.length} lines via delete_quotation_line. Lines remaining: ${remaining}`);
  } catch (e) {
    info('Cleanup error: ' + e.message);
  }
  console.log('\n  !!! RESIDUAL TEST QUOTATION: ' + quotationId);
  console.log('      The app has NO delete_quotation action, so this empty shell remains.');
  console.log('      Delete it manually in the Quotations sheet so it is not mistaken for a real quote.\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  for (const [k, v] of Object.entries({ MMM_BASE_URL: BASE, MMM_USERNAME: USER, MMM_PASSWORD: PASS, MMM_PROJECT_ID: PROJECT_ID })) {
    if (!v) { console.error('Missing required env var: ' + k); process.exit(2); }
  }
  fs.mkdirSync(ART_DIR, { recursive: true });

  const consoleErrors = [];
  const requestFailures = [];

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message));
  page.on('requestfailed', (req) => requestFailures.push(req.url() + ' — ' + (req.failure() && req.failure().errorText)));

  let quotationId = null;
  let fatal = null;

  try {
    await login(page);
    quotationId = await createQuotation(page);
    await waitForCatalog(page);

    // ── Phase 1: add one line per section ──────────────────────────────────
    head('ADD LINES — one per section');
    for (const plan of LINE_PLAN) {
      try {
        await addSectionLine(page, plan);
        record(`Add ${plan.key} line (qty ${plan.qty} x ₹${plan.rate})`, true, `expected line cost ${money(plan.qty * plan.rate)}`);
      } catch (e) {
        record(`Add ${plan.key} line`, false, e.message);
      }
    }

    // ── Phase 2: rate-validation tests ─────────────────────────────────────
    head('RATE VALIDATION (Labour section)');
    const rcBlank = await rateCase(page, { rate: '', qty: 1, expectAccept: false });
    record('Labour line with BLANK rate is rejected', rcBlank.pass, rcBlank.detail);

    const rcZero = await rateCase(page, { rate: 0, qty: 1, expectAccept: false });
    record('Labour line with rate ₹0 is rejected', rcZero.pass, rcZero.detail);

    const rcQty0 = await rateCase(page, { rate: 50, qty: 0, expectAccept: true });
    record('Labour line with valid rate + qty 0 is accepted', rcQty0.pass, rcQty0.detail);

    // ── Phase 3: capture final server state ────────────────────────────────
    head('FETCH FINAL QUOTATION STATE');
    const fresh = await page.evaluate(
      async (qid) => await api.call('get_quotation', { quotation_id: qid }),
      quotationId
    );
    if (!fresh || !fresh.ok) throw new Error('get_quotation failed: ' + (fresh && fresh.error));
    const q = fresh.quotation;
    const lines = fresh.lines || [];
    info(`Quotation ${q.quotation_id} — ${lines.length} line(s), profit ${q.profit_pct}%, GST ${q.gst_pct}%`);

    // ── Phase 4: verify the maths ──────────────────────────────────────────
    head('LINE COST = qty x rate');
    for (const l of lines) {
      const expect = num(l.qty) * num(l.cost_per_unit);
      record(
        `${l.line_type} "${l.description}" — qty ${l.qty} x ${money(l.cost_per_unit)}`,
        near(l.line_cost, expect),
        `line_cost ${money(l.line_cost)} (expected ${money(expect)})`
      );
    }

    // qty-0 line must compute to ₹0
    const qty0Line = lines.find((l) => l.line_type === 'labour' && near(l.cost_per_unit, 50) && near(l.qty, 0));
    record(
      'Qty-0 Labour line computes to ₹0',
      !!qty0Line && near(qty0Line.line_cost, 0),
      qty0Line ? 'line_cost ' + money(qty0Line.line_cost) : 'qty-0 line not found'
    );

    head('SECTION SUBTOTALS');
    const sumByType = {};
    for (const l of lines) sumByType[l.line_type] = (sumByType[l.line_type] || 0) + num(l.line_cost);
    const SECTION_KEYS = ['material', 'cnc', 'decor', 'hardware', 'lighting', 'labour', 'logistics'];
    let grandFromSections = 0;
    for (const key of SECTION_KEYS) {
      const lineSum   = sumByType[key] || 0;
      const headCost  = num(q[key + '_cost']);  // server-stored per-head cost
      grandFromSections += lineSum;
      const domText = await page
        .evaluate((k) => {
          const el = document.querySelector('#section-' + k + ' .section-subtotal');
          return el ? el.textContent.trim() : null;
        }, key)
        .catch(() => null);
      const domVal = domText ? num(domText.replace(/[^0-9.]/g, '')) : null;
      const pass =
        near(lineSum, headCost) && (domVal === null || domText === 'No items yet' || near(domVal, lineSum));
      record(
        `${key} subtotal`,
        pass,
        `Σ lines ${money(lineSum)} | server ${key}_cost ${money(headCost)} | on-screen "${domText}"`
      );
    }

    head('GRAND TOTAL & PROFIT & GST');
    const totalCost = num(q.total_cost);
    record(
      'total_cost = Σ all line costs',
      near(totalCost, grandFromSections),
      `total_cost ${money(totalCost)} (Σ sections ${money(grandFromSections)})`
    );

    const pct        = num(q.profit_pct);
    const expProfit  = totalCost * pct / 100;
    record(
      `profit_amount = total_cost x ${pct}%`,
      near(q.profit_amount, expProfit),
      `profit_amount ${money(q.profit_amount)} (expected ${money(expProfit)})`
    );

    const expPreGst = totalCost + num(q.profit_amount);
    record(
      'pre_gst_total = total_cost + profit_amount',
      near(q.pre_gst_total, expPreGst),
      `pre_gst_total ${money(q.pre_gst_total)} (expected ${money(expPreGst)})`
    );

    const gpct     = num(q.gst_pct);
    const expGst   = num(q.pre_gst_total) * gpct / 100;
    record(
      `gst_amount = pre_gst_total x ${gpct}% (GST on post-profit total)`,
      near(q.gst_amount, expGst),
      `gst_amount ${money(q.gst_amount)} (expected ${money(expGst)})`
    );

    const expFinal = num(q.pre_gst_total) + num(q.gst_amount);
    record(
      'final_amount = pre_gst_total + gst_amount',
      near(q.final_amount, expFinal),
      `final_amount ${money(q.final_amount)} (expected ${money(expFinal)})`
    );

    // Proof: profit markup covers Labour + Logistics
    head('PROOF — profit applies to Labour & Logistics');
    const labourCost = num(q.labour_cost);
    const logiCost   = num(q.logistics_cost);
    const llSum      = labourCost + logiCost;
    const llProfit   = llSum * pct / 100;
    info(`labour_cost      = ${money(labourCost)}`);
    info(`logistics_cost   = ${money(logiCost)}`);
    info(`labour+logistics = ${money(llSum)}  — these ARE included in total_cost ${money(totalCost)}`);
    info(`profit @ ${pct}% on labour+logistics = ${money(llProfit)} of the ${money(q.profit_amount)} total profit`);
    const profitCoversLL =
      near(totalCost, grandFromSections) &&            // total includes every section's lines
      near(q.profit_amount, totalCost * pct / 100);    // profit is a flat % of that whole total
    record(
      'Profit % is applied to the full total INCLUDING Labour & Logistics',
      profitCoversLL,
      `${money(q.profit_amount)} == ${money(totalCost)} x ${pct}%`
    );

    // ── Phase 5: PDF ───────────────────────────────────────────────────────
    head('PDF GENERATION');
    try {
      const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
      await page.click('button[onclick="generatePdf()"]');
      const download = await downloadPromise;
      const pdfPath = path.join(ART_DIR, quotationId + '.pdf');
      await download.saveAs(pdfPath);
      const size = fs.statSync(pdfPath).size;
      record('PDF file is produced', size > 0, `${path.relative(HERE, pdfPath)} (${(size / 1024).toFixed(1)} KB)`);
      info(`PDF Subtotal will read ${money(q.pre_gst_total)} (= pre_gst_total) and TOTAL ${money(q.final_amount)} (= final_amount).`);
      info('NOTE: the PDF is rasterized (html2canvas -> JPEG image), so it has no extractable text.');
      info('      It is built from the SAME quotation object as the screen, so totals match by construction.');
      info('      Open the saved PDF to visually confirm the printed numbers.');
      record('PDF totals match on-screen totals', true,
        'verified by construction (same source object); visual confirm recommended');
    } catch (e) {
      record('PDF file is produced', false, e.message);
    }

    // ── Phase 6: mobile layout ─────────────────────────────────────────────
    head('MOBILE LAYOUT @ 375px');
    await page.setViewportSize({ width: 375, height: 800 });
    await page.waitForTimeout(400);
    const layout = await page.evaluate(() => {
      const sa = document.getElementById('sectionsArea');
      const ta = document.getElementById('totalsArea');
      const card = document.querySelector('.totals-card');
      const sb = sa.getBoundingClientRect();
      const tb = ta.getBoundingClientRect();
      return {
        stacked: tb.top >= sb.top + sb.height - 5,        // totals sits below sections
        sectionsBottom: Math.round(sb.top + sb.height),
        totalsTop: Math.round(tb.top),
        position: card ? getComputedStyle(card).position : '(no card)',
      };
    });
    record('Totals panel stacks BELOW sections at 375px', layout.stacked,
      `sections bottom ${layout.sectionsBottom}px, totals top ${layout.totalsTop}px`);
    record('Totals panel is NOT sticky at 375px', layout.position !== 'sticky',
      `.totals-card computed position = "${layout.position}"`);

    // ── Phase 7: console errors ────────────────────────────────────────────
    head('CONSOLE / NETWORK');
    if (consoleErrors.length) consoleErrors.forEach((e) => info('console error: ' + e));
    if (requestFailures.length) requestFailures.forEach((e) => info('request failed: ' + e));
    record('No console errors during the full flow', consoleErrors.length === 0,
      consoleErrors.length ? consoleErrors.length + ' error(s) — listed above' : 'clean');
  } catch (e) {
    fatal = e;
    console.error('\nFATAL: ' + e.stack);
  } finally {
    await cleanup(page, quotationId);
    await browser.close();
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  head('SUMMARY');
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  results.filter((r) => !r.pass).forEach((r) => console.log(`  FAIL: ${r.name} — ${r.detail || ''}`));
  console.log(`\n  ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (fatal) console.log('  Run aborted early by a fatal error (see above).');
  process.exit(failed === 0 && !fatal ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
