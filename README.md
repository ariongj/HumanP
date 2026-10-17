# HumanPlus — private management application

Albanian management and market-research app built with React, TypeScript, Vinext and Cloudflare Workers on Sites. It covers procurement, public budgets, monthly scenarios, prospects, catalogue review, strategy, source documents and data quality.

## Development

Requires Node >=22.13 and Python 3. The repository contains application code, synthetic tests and content hashes only. The private source bundle must be supplied separately.

```bash
npm ci
python3 scripts/prepare-bundle.py --bundle /absolute/private/bundle --output /absolute/private/objects
npm test
npm run typecheck
npm run dev -- --host 127.0.0.1 --port 4186
```

Sign in through the loopback development sign-in page. This creates the Sites starter's development-only mock session, never a production account. Import the staged objects using `scripts/upload-bundle.mjs --local` (the local sign-in cookie is used only on loopback). The expected R2 binding is `BUCKET`. The dev server stores its private local R2 data under ignored `.wrangler/`; never serve that directory. The source bundle and staged objects must remain outside this checkout.

```bash
node scripts/upload-bundle.mjs --local /absolute/private/objects
npm run build
npm run check:privacy
```

Sites publication uses the installed Sites workflow helper, which builds and uploads exact source commits and deployment archives. The tracked hosting manifest identifies the existing private Site; reuse its project ID. Do not create another Site for a revision. Private objects are uploaded separately after deployment; they are never included in Git, static output, or deployment archives.

## Authorization boundary

Hosted access is owner-private in the Sites access policy. Sites validates the browser/session at ingress and supplies trusted identity headers. Every private read, document download and CSV export checks identity again in `lib/private-api.ts`; these responses use `private, no-store`. Do not expose the Worker directly outside Sites or trust client-supplied identity headers on an independent server.

The content-addressed import endpoint permits the exact hashes and sizes in `lib/import-manifest.json`. In production it relies on the confirmed owner-private Sites ingress boundary so the deployment service can upload without a browser identity. It has no read/list operation and cannot accept unreviewed bytes or replace content for an existing hash. Local development additionally requires the starter's mock session. Do not change this Site to a public audience. New collaborators require a reviewed platform access-policy change.

No client password, public data directory, patient records, credentials, or personal payroll is used. The public-content endpoint always returns an empty approval list. Catalogue review forms create device-local drafts; they do not grant publication permission.

## Reproducible data preparation

`prepare-bundle.py` verifies the FILE_INDEX hashes and all dataset counts, parses JSON/CSV, applies the documented Excel-row overlays by source identity, and retains original fields plus correction provenance. Clinical field overrides retain prior values and review provenance. It stages domain-specific JSON and all available source files in a private directory. The generated import manifest contains only object keys, SHA-256, content types and sizes.

Source count gates: 3,613 market records; 200 employer prospects; 1,071 catalogue entries in 23 categories (957 analyses, 102 panels, 12 services). No duplicate candidate is removed. Unknown-currency rows never join EUR totals. Capital components do not get added to institutional totals.

## Validation

`npm test` runs synthetic financial cases, authorization and export checks. When the original workbook JSON is available in the sibling private bundle, it also compares all 39 monthly periods in all three scenarios with the actual workbook formulas using an independent allowlisted test evaluator. Without the private workbook that one parity test is explicitly skipped. No `eval` or formula execution is used in the app.

`tests/browser_qa.py` checks all nine views, anonymous denial, filters and exports, local drafts, catalogue and document search, downloads and 320px navigation. It requires Playwright and Chromium; executable paths and the local URL can be set through environment variables. Screenshots and reports go outside this checkout into `../artifacts/` and may contain private source information.

`npm run check:privacy` scans built client artifacts using source canaries. It is a targeted leak check, not a full security certification.

## Current limits

- Research ends at the supplied coverage boundaries; no new market, clinical or legal verification is claimed.
- Actual sales, costs, cash balances and business agreements are not populated. Forecasts remain scenarios.
- Scenario, review and action drafts are local to the browser/device; export them for review or backup. They are not shared live records or formal approval signatures.
- Catalogue signoffs require external evidence and explicit publication authorization. The current public export stays empty even when draft fields are filled.
- Document downloads preserve originals; generic download names correspond to the listed document IDs. All source dates and versions are available in the inspector.
- Printed tables show the selected page; use CSV export for the complete filtered population.
