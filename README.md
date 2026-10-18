# HumanPlus

Albanian management and research workspace with procurement, medical notices, medicines, product references, licensed operators, tender readiness, budgets, financial scenarios, partners, catalogue review and original documents. The current publishing target is **GitHub Pages**, with application source in `ariongj/HumanP`.

## Complete private presentation panel

`HumanPlus-Presentation-Ready.html` is the private, ready-to-open edition. It embeds the entire reviewed package: all 17 datasets and 218 original documents. Open the HTML directly in a current browser; no server, package picker, previous storage, login, or network request is needed. Each opening verifies the 235 source hashes. The HTML remains outside this public repository and must not be placed in Pages assets under the source-only publishing policy.

```bash
npm run build:portable
python3 scripts/package-presentation.py \
  --package /absolute/private/HumanPlus-Private-2026-10-18.humanplus \
  --output /absolute/private/HumanPlus-Presentation-Ready.html
```

The packager rejects output inside the application checkout. It verifies the full package before embedding it, generates an IIFE for file URLs, and allows only its exact inline script hash under a network-disabled content security policy. `dist-portable` contains application code only and is ignored. The final private HTML contains the full data and should be shared only with the intended audience.

The presentation opens with medical evidence and includes five chapters: medical notices, historical procurement, the research ecosystem, editable monthly scenarios, and sources/actions. Presentation mode hides application navigation, supports chapter controls and Escape, and retains the source drill-downs. Filters, findings, CSV and brief exports use the same selected records. Notice and procedure counts remain distinct; partial coverage and missing financial actuals remain explicit. The simple editable scenario is not an approved forecast or cash model. Its assumptions persist locally when storage is available. Use the full financial module for the 39-month model.

Connections also supports direct monthly actuals entry without CSV. The user provides month, three reconciled totals and a source reference, reviews the merged dataset and confirms before saving. Other months are retained. Browser drafts and entered results do not modify the embedded source package or automatically travel with the HTML; export them before moving devices.

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

The public site contains code, styles and content hashes only. Open the separate `.humanplus` package using the file picker. It is read and hash-verified entirely in the browser, then saved atomically as a compressed Blob in IndexedDB. All 17 datasets and 218 documents reopen automatically after refresh, a new tab, or a browser restart. The package is never uploaded. Each startup checks the manifest fingerprint and verifies every object hash before showing the panel. The Pages content security policy disables fetch/XHR/network connections (`connect-src 'none'`). This is a local-data application hosted on a public site, not a server-authenticated private site. Original documents and filtered CSVs are downloaded from browser memory. External source links open only when selected.

Scenario drafts, saved filters, review notes, tender checklists and imported monthly actuals use browser-local storage. Export backups before clearing storage or changing devices. “Ruajtja e të dhënave” opens storage controls, including a downloadable backup of the full package. “Fshi të dhënat lokale dhe mbyll” clears the saved package, drafts and actuals and closes other open HumanPlus tabs to the setup screen. A shared browser profile shares the saved sources as well as drafts. There is no cross-device sync or GitHub authentication for the dataset. Initial setup is once per browser/profile; the earlier in-memory release cannot supply a persistent copy after it has closed. Browser data clearing or eviction requires restoring the package. Storage failures are visible and leave the current session usable; retry saving from Connections. An incompatible or damaged saved package is rejected without silently using it or deleting drafts.

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

The expanded ZIP includes every source-data file from the 17 October bundle, byte-identical, as well as the new material; only shared package metadata changed. It is also the superset of the base 18 October ZIP: their common data files are identical; metadata/index files differ. Preparation checks all 224 indexed source hashes, 39 declared datasets, JSON/CSV structure and documented Excel-row overlays. It matches historical classification by exact row key. Standalone product records are reconciled by ID with conflicting known values rejected; byte-identical documents are retained once and a distinct standalone workbook is retained separately. Original source files remain unchanged.

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

`npm test` runs 25 synthetic calculation, filter, source-link and API-contract tests. When the original private workbook JSON exists in the sibling private bundle, an independent allowlisted evaluator checks all 39 periods in all three scenarios against workbook formulas. That one test is explicitly skipped on public CI, where the private source is absent.

`tests/pages_browser_qa.py` requires Playwright/Chromium and the separately prepared private package. It checks invalid-package rejection, real-data import, counts, exports, linked evidence, local actuals, original XLSX downloads, persisted drafts, the original 15 modules, 320px layouts and the absence of data network requests. `tests/vault_persistence_qa.py` additionally closes and restarts Chromium with the same profile, verifies byte-identical package/document backups, rejects stale snapshots, simulates unavailable storage and successful retry, and checks explicit deletion across tabs. `tests/presentation_browser_qa.py` opens the complete HTML directly from disk in clean profiles with networking blocked and IndexedDB unavailable; it verifies source reconciliation, linked evidence, all five chapters at 320px, editable scenarios, manual actuals, and original document hashes. Screenshots and receipts are written outside the repository. `scripts/check-pages.mjs` checks the public build's file types, relative asset paths and network policy; local source-canary verification complements it.

## Retained server adapter

The previous Vinext/Cloudflare implementation remains available through `npm run dev`, `npm run build` and `npm run start`; publishing it is not part of the GitHub Pages workflow. It expects a private Sites ingress and `BUCKET` R2 binding. `lib/private-api.ts` checks trusted identity for reads and uses immutable allowlisted imports. Do not expose it on an unauthenticated independent server or trust browser-supplied identity headers. `scripts/upload-bundle.mjs --local` is for its loopback preview. The existing Site has not been redeployed by this GitHub update.
