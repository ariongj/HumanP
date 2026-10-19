# HumanPlus

Albanian management and research workspace with procurement, medical notices, medicines, product references, licensed operators, tender readiness, budgets, financial scenarios, partners, catalogue review and original documents. The current publishing target is **GitHub Pages**, with application source in `ariongj/HumanP`.

## Ready-to-use password-protected panel

Open **https://ariongj.github.io/HumanP/** and sign in. The complete supplied package is already included, encrypted: all 17 datasets and 356 source documents load automatically after login. There is no package picker or import step. Each opening verifies all 373 object hashes. Logout clears the unlocked data and locks other open tabs; a page reload requires login again. Credentials are delivered separately and are never committed.

The static GitHub site uses a strong generated credential to derive an AES-256-GCM decryption key with PBKDF2-SHA256 (600,000 iterations, random salt and IV). This protects the data itself, rather than merely hiding the interface. It is a single shared credential, not a server account system with individual users or remote revocation. The public repository holds only the encrypted snapshot and application code. Browser drafts and subsequently entered actuals stay in the browser profile; they are not uploaded.

The cryptographic APIs follow the [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) and [AES-GCM parameter](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) documentation.

## Shared brand and supplier filters

**Filtrat e gjithë panelit** selects a brand/source model mention and one or more suppliers across products, procurement, medical evidence, charts, overview, presentation, reports and source tables. Existing brand pickers and supplier charts update the same selection. Suppliers combine with OR; brand and supplier combine with AND. Navigation and procurement population changes preserve the selection. Local year, search and column filters narrow it further. Procurement saved views also retain the shared brand and supplier selection.

Connections use full procedure identifiers and normalized complete source names. Related procurement is procedure context, not verified brand sales or product prices. Manufacturer/model aliases and consortium membership are not inferred. Budget context requires an exact source institution name. Medicine and catalogue records without a documented relationship show no matches; operational plans and whole-package metadata are explicitly identified as outside entity filtering.

CSV uses the displayed population. HTML/JSON reports and presentation briefs also record the shared selection. Dataset JSON applies entity filters to linked tables while retaining source metadata. Resetting the shared filters restores the original populations. The raw encrypted package is unchanged.

`tests/global_filters_browser_qa.py` checks brand-only, supplier-only, combined and empty selections; existing picker/chart propagation; matching source IDs in tables, CSV and reports; the separate national 2024 population; navigation, reset and mobile rendering.

## Connected record workspace

Tables support saved column order, widths, visibility, density, grouping and a pinned first column. Drag a column edge or use its arrow keys to resize it. Layout preferences stay in the browser profile. Procurement opens with its records; the analytical view uses the same filters.

Column filters in procurement, budgets, products, brands, medicine and licence registries, medical notices, partners, documents, reports and all source datasets feed the parent view. Charts, headline counts and exports therefore use the same filtered records. Procurement saved views retain column filters and population scope. Product and procurement selections can open a report and return to the analysis with their filters.

Record details include **Lidhjet e rekordit**. Links use published procedure/notice IDs, complete source names or explicit document references. Alternative procurement populations are deduplicated only by stable row ID for this connection view. Brand/model mentions do not create inferred manufacturer links; consortium names are retained whole. A record can be followed into related evidence and back without changing the original page filters. Budget tables and notice stages retain their separate bases.

`tests/connected_workspace_browser_qa.py` checks layouts, saved filters, chart/CSV/report reconciliation, evidence traversal and mobile containment with the protected preloaded package.

## Data, reports, products and brands

The overview links directly to presentation, data, reports, products and brands. **Të dhënat** indexes all 17 embedded datasets and exposes their nested tables, search, source inspection, filtered CSV and complete JSON downloads. Record populations and overlapping source tables remain separate.

**Raportet** provides procurement, budget/payment and product/brand reports. Year, population and category/brand filters drive the same charts, rows and exports. Downloadable HTML includes every selected row, beyond on-screen pagination, and can be printed or saved as PDF. JSON includes full source fields. Budget allocations, Treasury payments and audited payments remain separate, with unavailable totals left unknown.

**Markat** distinguishes the 11 curated product references from 19 brand/model title mentions in the 2024 procurement sources. Names retain their original spelling and verification caveats; model mentions do not create inferred manufacturer or distributor relationships. Products retain specifications, manufacturer references and procurement evidence. Neither page treats lot values as device prices or references as confirmed stock.

`tests/workspace_sections_browser_qa.py` verifies the encrypted login, dataset index, source downloads, report/chart/filter reconciliation, printable report, product/brand navigation and mobile layouts. It reads credentials and fixtures outside the checkout and writes all plaintext exports and screenshots outside the checkout.

## Offline presentation copy

`HumanPlus-Presentation-Ready.html` is the private, ready-to-open edition. It embeds the entire reviewed package: all 17 datasets and 218 original documents. Open the HTML directly in a current browser; no server, package picker, previous storage, login, or network request is needed. Each opening verifies the 235 source hashes. This unencrypted offline HTML stays outside the public repository. GitHub Pages publishes only the password-encrypted edition.

```bash
npm run build:portable
python3 scripts/package-presentation.py \
  --package /absolute/private/HumanPlus-Private-2026-10-18.humanplus \
  --output /absolute/private/HumanPlus-Presentation-Ready.html
```

The packager rejects output inside the application checkout. It verifies the full package before embedding it, generates an IIFE for file URLs, and allows only its exact inline script hash under a network-disabled content security policy. `dist-portable` contains application code only and is ignored. The final private HTML contains the full data and should be shared only with the intended audience.

The presentation opens with medical evidence and includes six chapters: medical notices, historical procurement, the research ecosystem, editable monthly scenarios, sources/actions, and public budgets/payments. Presentation mode hides application navigation, supports chapter controls and Escape, and retains the source drill-downs. Filters, findings, CSV and brief exports use the same selected records. Notice and procedure counts remain distinct; partial coverage and missing financial actuals remain explicit. The simple editable scenario is not an approved forecast or cash model. Its assumptions persist locally when storage is available. Use the full financial module for the 39-month model.

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

Requires Node >=22.13. Live website: **https://ariongj.github.io/HumanP/**. Pages was enabled through the `gh-pages` publishing branch. The workflow `.github/workflows/pages.yml` tests/builds `main`, updates the protected HTML on `gh-pages`, and dispatches `publish.yml` on that branch. Deployment therefore respects the repository’s Pages environment branch restriction. No additional account token or external hosting is required. The publishing workflow is present on both branches; changes to that workflow must be kept synchronized. `SOURCE_COMMIT` in the published build identifies the application source revision.

The build reads `snapshots/publication.json`, checks each encrypted part and the combined snapshot hash, builds the application, and embeds the ciphertext into one HTML file. The password is not needed by CI and is absent from the deployment. The Pages content security policy allows only the exact compiled script hash and disables fetch/XHR (`connect-src 'none'`). After successful decryption, the browser verifies every source object before showing the panel. Original documents and filtered CSVs download from browser memory.

Scenario drafts, saved filters, review notes, tender checklists and entered monthly actuals use browser-local storage. Export backups before clearing storage or changing devices. The supplied dataset needs no browser storage to load, including in a new browser. Connections offers a data backup after login. Logging out requires credentials to reopen the panel; saved drafts remain in the same browser profile.

To replace or rotate the encrypted snapshot, run `scripts/encrypt-snapshot.py` against the verified private package with a credentials JSON file **outside the checkout**, then run `scripts/split-encrypted-snapshot.py --input /absolute/private/encrypted.json` to write the ciphertext parts and publication digests. The split format keeps each GitHub upload below 32 MiB; CI reconstructs the exact authenticated envelope. Use a fresh generated password of at least 24 characters. Never put credentials, decryption keys, or the plaintext package in GitHub. Previously downloaded copies remain usable with their original credential.

## Private data preparation

Keep attachments, extracted sources, staged objects, screenshots, credentials and plaintext packages **outside this checkout**. Only the explicitly prepared encrypted snapshot belongs in `snapshots`; never copy plaintext into `public`, `dist-pages`, workflow artifacts or releases.

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

The original prepared snapshot had 17 datasets and 218 downloadable source documents. The complete update retains the previous 220 documents and adds the official 2024 budget/audit sources and both newly supplied archives: 17 datasets, 356 downloadable documents, 373 verified objects. It includes:

- 5,394 procurement records: the original 3,613 plus 1,781 recovered 2024 awards and contextual records; duplicate candidates are retained and 2026 gaps remain.
- 117 medical notices, 96 procedure keys, 150 lot/stage records, 210 requirement rows, 83 correction/cancellation fields, 223 scope/duration fields and 19 explicit product evidence rows.
- 4,631 medicine registrations: 4,381 Active, 137 Suspended and 113 Withdrawn, as recorded in the supplied snapshot.
- 229 licence/depot records: 130 pharmaceutical and 99 medical-equipment records; these are not 229 unique legal companies.
- 11 brand/product references; shared procurement amounts are not summed as product prices.
- 1,071 BeoLab reference entries, 200 employer prospects, 100 institutions, 50 selected doctors and 5,781 registry entries.

Dates and statuses describe the supplied evidence, not newly verified current availability, legal eligibility or tender status. Unknown currencies stay outside EUR totals. Award/signing stages remain separate and joined by source identifiers; the app does not add them together as payments. Institutional capital components are not added twice. Catalogue public approval remains empty.

## 2024 procurement recovery

The [KRPP/PPRC dataset distributed by OCP](https://data.open-contracting.org/en/publication/115) supplies the missing year. The full archived JSONL snapshot (`kosovo/3446/full.jsonl.gz`, SHA-256 `b782bdb3c323b3a6b9bba72c906756744700752bd9287efe55dbab4fe1f1341b`) was downloaded on 18 October 2026; OCP records the upstream retrieval as 8 March 2026. A direct KRPP API sample request timed out, so this is a recovery from that historical mirror, not a fresh verification of current award status.

`scripts/recover-procurement-year.py` scans all 75,710 processes and selects by `award.date`, preserving the publisher's nonstandard singular `award` field. The archive contains 10,708 national award objects dated 2024. HumanPlus includes 1,773 within its healthcare-buyer and medical/laboratory-title research scope, covering 1,163 processes and all 12 months. Two hundred selected awards belong to processes released in other years and would be missed by downloading only the 2024 release partition.

One row represents one OCID + award UID, with suppliers kept together. Published award amounts are not verified contract totals or payments. Similar-award candidates remain flagged. New categories use the supplied historical keyword taxonomy; ambiguous laboratory, mixed and nonclinical cases remain for review. Healthcare institutions' nonmedical support purchases remain separate from medically positive purchases. This is not a census of national procurement. The original 3,613 rows and 218 documents remain unchanged.

Source rows retain award/process IDs, award date, raw archive line, source hashes and retrieval metadata. The document library includes `KRPP_OCP_2024_procedurat_burimore.jsonl.gz` and `HumanPlus_2024_burimi_dhe_metoda.json`. The year and month controls, historical charts, overview, buyer/operator links, source inspection and exports use the extended dataset. The 2024 budget is now included as described below; 2026 procurement gaps are unchanged.

Reproduce against a copy of the original prepared objects outside the checkout:

```bash
python3 scripts/recover-procurement-year.py \
  --archive /absolute/private/full.jsonl.gz \
  --baseline /absolute/private/expanded-objects \
  --output /absolute/private/procurement-2024-objects
```

Then package the updated objects, encrypt with the existing private credential file, and update the publication digest. `tests/verify_procurement_2024.py` independently reconciles every added record against its source award and verifies preservation of the original dataset. `tests/procurement_2024_browser_qa.py` checks the connected filters, charts, source download, export in the original procurement recovery release. The current combined release is verified by `tests/complete_2024_browser_qa.py`.

## Complete 2024 budget and archive integration

The 2024 budget is traced to [Law 08/L-260](https://gzk.rks-gov.net/ActDetail.aspx?ActID=85052), the Treasury annual financial report, the national and institution audit reports, and Prishtina’s annual financial report. The independent PDF extraction in `scripts/recover-budget-2024.py` is reconciled with the supplied tables by `scripts/merge-complete-archives.py`.

The panel includes EUR 263,660,768 in initial central allocations and EUR 98,801,349 in municipal health programmes 730 and 770 across all 38 municipalities. Views cover 20 central subprogrammes, 116 municipal hierarchy rows, 38 municipalities’ health grant financing, 209 curated capital funding rows across 184 projects, and 11 separate contextual capital candidates. The initial capital allocation for the curated rows is EUR 61,726,194. Programme parents and children, grants and expenditure, and capital funding and project totals overlap and are never added together.

Treasury payments for the three health institutions total EUR 239,722,563; the separately displayed institution audit totals are EUR 240,403,904 with different funding coverage. The reported function-07 expenditure is EUR 320,008,000, 10.4081% of the same report’s ten-function denominator. Prishtina’s nine health project cash rows cover the full 2024 year. Original rounded totals and differences of EUR 1 are retained. Supplied FSSH category references to the budget-revision page are corrected to the verified cash execution page, with the original reference retained.

The two supplied archives contain 315 distinct paths. All their original bytes are retained, deduplicated by SHA-256, with path aliases for shared files. JSON and CSV files can be opened in the document explorer, grouped into count charts, filtered and exported without a separate import. Superseded versions remain labeled as such. Documents and their embedded instructions are treated as evidence, never executed.

The healthcare/context procurement population is the stable-ID union of the prior 1,773 recovered records and the supplied 1,760 records: 1,752 overlap, 8 are added, and 21 prior context records remain. Alternate classifications are retained. A separate national-2024 view exposes 10,701 unique OCID + award UID rows. The archive has 10,708 occurrences; seven exact repeated UUID records are collapsed with `source_occurrences` preserved. This national population is not added to the health population. Award amounts remain unverified published amounts, not cash payments.

`tests/verify_complete_2024.py` checks every object hash, all 315 supplied paths, preservation of the prior documents and procurement facts, and budget totals at the correct grain. `tests/complete_2024_browser_qa.py` checks all 11 budget views, shared years, charts, hierarchy filters, CSVs, source downloads, the national population, document explorer and 320px presentation layout. The existing credential is retained; all data is embedded encrypted and loads automatically after login.

## Exploration and planning

The original advanced procurement filters, saved views, three-record comparison, table controls, source inspector and CSV exports remain available. Medical explorers filter by buyer, category, stage, scope, dates and text. Medicine filters include status, manufacturer, form, ATC and authorization holder. Licence filters include registry type and place. Charts, record counts and exports share the filtered population. Global search connects the old and new modules.

The tender model follows the supplied workbook: five weighted criteria, five mandatory confirmation gates, a proposed 70-point threshold and separate contribution/liquidity formulas. An unknown gate stops the result. Collateral is a liquidity need, not an expense. Missing cash inputs stay unknown. Results are proposed management judgments, not authorization to bid.

Monthly finance scenarios retain 39 periods and three source cases, the partial October fraction, delayed collections and unknown values. Actuals are only populated through explicit manual entry or CSV import; no real financial performance is invented. In Pages, confirmed imports stay in the current browser.

## Verification

`npm test` runs 40 synthetic calculation, filter, source-link, API-contract and authenticated-decryption tests. When the original private workbook JSON exists in the sibling private bundle, an independent allowlisted evaluator checks all 39 periods in all three scenarios against workbook formulas. That one test is explicitly skipped on public CI, where the private source is absent.

`tests/protected_panel_browser_qa.py` checks the deployed password-protected edition with a fresh browser: wrong credentials rejected, correct credentials open every dataset without import, linked evidence, five chapters at 320px, editable scenarios, manual actuals, hash-matched original documents, reload and logout. Set `PANEL_URL` for a live HTTPS check. Credentials and expected source data are read from local files outside the repository. `scripts/check-pages.mjs` checks the encrypted snapshot digest, envelope, exact script hash, no plaintext package and no external dependencies. Screenshots and test receipts stay outside the repository.

`tests/presentation_browser_qa.py` retains coverage for the private offline HTML. `tests/pages_browser_qa.py` and `tests/vault_persistence_qa.py` cover the older import-based build available through `npm run build:import`; this is not the current Pages deployment.

## Retained server adapter

The previous Vinext/Cloudflare implementation remains available through `npm run dev`, `npm run build` and `npm run start`; publishing it is not part of the GitHub Pages workflow. It expects a private Sites ingress and `BUCKET` R2 binding. `lib/private-api.ts` checks trusted identity for reads and uses immutable allowlisted imports. Do not expose it on an unauthenticated independent server or trust browser-supplied identity headers. `scripts/upload-bundle.mjs --local` is for its loopback preview. The existing Site has not been redeployed by this GitHub update.
