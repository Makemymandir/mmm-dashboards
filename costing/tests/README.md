# Costing Section 7 — E2E test

End-to-end test for the final-quotation builder (`costing/final-quotation.html`).
It drives the **real, deployed** app in a headless browser, builds one quotation
covering all 7 sections, verifies every number, and cleans up after itself.

## What it checks

- Rate validation — blank rate rejected, ₹0 rejected, valid-rate + qty 0 accepted (→ ₹0).
- Each of the 7 section subtotals = Σ(line qty × rate).
- Grand total = Σ of all section subtotals.
- Profit % applied to the full total, including Labour & Logistics (numbers printed).
- GST computed on the post-profit total.
- Final amount = pre-GST total + GST.
- PDF is produced (file saved to `artifacts/`).
- 375px mobile layout — totals panel stacks below sections, and whether it is sticky.
- No console errors during the flow.

## Prerequisites

- Node 18+
- Internet access (the app talks to the live Google Apps Script backend)
- A valid costing-app login and an existing project id

## Install

```bash
cd costing/tests
npm install        # installs Playwright and downloads Chromium
```

## Run

PowerShell:

```powershell
$env:MMM_BASE_URL   = "https://makemymandir.github.io/mmm-dashboards/costing"
$env:MMM_USERNAME   = "your-username"
$env:MMM_PASSWORD   = "your-password"
$env:MMM_PROJECT_ID = "PRJ-xxxx"
node e2e-quotation.mjs
```

bash:

```bash
MMM_BASE_URL="https://makemymandir.github.io/mmm-dashboards/costing" \
MMM_USERNAME="your-username" MMM_PASSWORD="your-password" \
MMM_PROJECT_ID="PRJ-xxxx" node e2e-quotation.mjs
```

| Env var          | Required | Notes                                                            |
|------------------|----------|------------------------------------------------------------------|
| `MMM_BASE_URL`   | yes      | Folder URL serving the costing app (deployed site or local)      |
| `MMM_USERNAME`   | yes      | Costing-app login                                                |
| `MMM_PASSWORD`   | yes      | Costing-app password                                             |
| `MMM_PROJECT_ID` | yes      | Existing project the test quotation is attached to               |
| `MMM_HEADLESS`   | no       | `false` to watch the browser (default `true`)                    |
| `MMM_PROFIT_PCT` | no       | Set a known profit % on the test quote before verifying          |

Exit code is `0` if every check passes, `1` otherwise.

## Cleanup / test data

The script deletes every line it created via `delete_quotation_line`.

The app exposes **no `delete_quotation` action**, so the empty quotation *shell*
cannot be removed automatically. The script prints its id loudly at the end —
delete that row by hand in the Quotations sheet so it is not mistaken for a real
quote.

Every test line is labelled `E2E TEST ...` in its description as a second safety net.
