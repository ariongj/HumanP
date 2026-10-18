# HumanPlus

Albanian management and research workspace with procurement, medical notices, medicines, product references, licensed operators, tender readiness, budgets, financial scenarios, partners, catalogue review and original documents. The current publishing target is **GitHub Pages**, with application source in `ariongj/HumanP`.

## GitHub Pages

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build:pages
node scripts/check-pages.mjs
npm run preview:pages
```

Requires Node >=22.13. Live website: **https://ariongj.github.io/HumanP/**. Pages was enabled through the `gh-pages` publishing branch. The workflow `.github/workflows/pages.yml` tests/builds `main`, updates only public application assets on `gh-pages`, and dispatches `publish.yml` on that branch. Deployment therefore respects the repository’s Pages environment branch restriction. No additional account token or external hosting is required. The publishing workflow is present on both branches; changes to that workflow must be kept synchronized. `SOURCE_COMMIT` in the published build identifies the application source revision.

The public site contains code, styles and content hashes only. Open the separate `.humanplus` package using the file picker. It is read and hash-verified entirely in the browser, remains in memory until refresh/close, and is never uploaded. The Pages content security policy disables fetch/XHR/network connections (`connect-src 'none'`). This is a local-data application hosted on a public site, not a server-authenticated private site. Original documents and filtered CSVs are downloaded from browser memory. External source links open only when selected.

Scenario drafts, saved filters, review notes, tender checklists and imported monthly actuals use browser-local storage. Export backups before clearing storage or changing devices. “Mbyll paketën” closes the in-memory source data; “Fshi të dhënat lokale dhe mbyll” in Connections also clears HumanPlus drafts and actuals. A shared browser profile shares those local drafts. There is no cross-device sync or GitHub authentication for the dataset.

## Private data preparation

Keep attachments, extracted sources, staged objects, screenshots and packages **outside this checkout**. Never commit them or copy them into `public`, `dist-pages`, workflow artifacts or releases.

```bash
python3 scripts/prepare-bundle.py \
  --bundle /absolute/private/HumanPlus_Interactive_Data_2026-10-18 \
  --attachments /absolute/private/standalone-attachments \
  --output /absolute/private/expanded-objects
python3 scripts/package-private.py \
  --objects /absolute/private/expanded-objects \
  --output /absolute/private/HumanPlus-Private-2026-10-18.humanplus
```

The expanded ZIP is the superset of the base 18 October ZIP: their common data files are identical; metadata/index files differ. Preparation checks all 224 indexed source hashes, 39 declared datasets, JSON/CSV structure and documented Excel-row overlays. It matches historical classification by exact row key. Standalone product records are reconciled by ID with conflicting known values rejected; byte-identical documents are retained once and a distinct standalone workbook is retained separately. Original source files remain unchanged.

The prepared snapshot has 17 datasets and 218 downloadable source documents (235 objects). It includes:

- 3,613 historical procurement records, retaining duplicate candidates and the original coverage gaps.
- 117 medical notices, 96 procedure keys, 150 lot/stage records, 210 requirement rows, 83 correction/cancellation fields, 223 scope/duration fields and 19 explicit product evidence rows.
- 4,631 medicine registrations: 4,381 Active, 137 Suspended and 113 Withdrawn, as recorded in the supplied snapshot.
- 229 licence/depot records: 130 pharmaceutical and 99 medical-equipment records; these are not 229 unique legal companies.
- 11 brand/product references; shared procurement amounts are not summed as product prices.
- 1,071 BeoLab reference entries, 200 employer prospects, 100 institutions, 50 selected doctors and 5,781 registry entries.

Dates and statuses describe the supplied evidence, not newly verified current availability, legal eligibility or tender status. Unknown currencies stay outside EUR totals. Award/signing stages remain separate and joined by source identifiers; the app does not add them together as payments. Institutional capital components are not added twice. Catalogue public approval remains empty.

## Exploration and planning

The original advanced procurement filters, saved views, three-record comparison, table controls, source inspector and CSV exports remain available. Medical explorers filter by buyer, category, stage, scope, dates and text. Medicine filters include status, manufacturer, form, ATC and authorization holder. Licence filters include registry type and place. Charts, record counts and exports share the filtered population. Global search connects the old and new modules.

The tender model follows the supplied workbook: five weighted criteria, five mandatory confirmation gates, a proposed 70-point threshold and separate contribution/liquidity formulas. An unknown gate stops the result. Collateral is a liquidity need, not an expense. Missing cash inputs stay unknown. Results are proposed management judgments, not authorization to bid.

Monthly finance scenarios retain 39 periods and three source cases, the partial October fraction, delayed collections and unknown values. Actuals are only populated through explicit CSV import; no real financial performance is invented. In Pages, confirmed imports stay in the current browser.

## Verification

`npm test` runs 23 synthetic calculation, filter, source-link and API-contract tests. When the original private workbook JSON exists in the sibling private bundle, an independent allowlisted evaluator checks all 39 periods in all three scenarios against workbook formulas. That one test is explicitly skipped on public CI, where the private source is absent.

`tests/pages_browser_qa.py` requires Playwright/Chromium and the separately prepared private package. It checks invalid-package rejection, real-data import, counts, exports, linked evidence, local actuals, original XLSX downloads, persisted drafts, all 15 modules, 320px layouts and the absence of data network requests. Screenshots and receipts are written outside the repository. `scripts/check-pages.mjs` checks the public build's file types, relative asset paths and network policy; local source-canary verification complements it.

## Retained server adapter

The previous Vinext/Cloudflare implementation remains available through `npm run dev`, `npm run build` and `npm run start`; publishing it is not part of the GitHub Pages workflow. It expects a private Sites ingress and `BUCKET` R2 binding. `lib/private-api.ts` checks trusted identity for reads and uses immutable allowlisted imports. Do not expose it on an unauthenticated independent server or trust browser-supplied identity headers. `scripts/upload-bundle.mjs --local` is for its loopback preview. The existing Site has not been redeployed by this GitHub update.
