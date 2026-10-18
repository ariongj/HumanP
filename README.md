# HumanPlus

Albanian management and research workspace with procurement, medical notices, medicines, product references, licensed operators, tender readiness, budgets, financial scenarios, partners, catalogue review and original documents. The current publishing target is **GitHub Pages**, with application source in `ariongj/HumanP`.

## Ready-to-use password-protected panel

Open **https://ariongj.github.io/HumanP/** and sign in. The complete supplied package is already included, encrypted: all 17 datasets and 218 original documents load automatically after login. There is no package picker or import step. Each opening verifies all 235 object hashes. Logout clears the unlocked data and locks other open tabs; a page reload requires login again. Credentials are delivered separately and are never committed.

The static GitHub site uses a strong generated credential to derive an AES-256-GCM decryption key with PBKDF2-SHA256 (600,000 iterations, random salt and IV). This protects the data itself, rather than merely hiding the interface. It is a single shared credential, not a server account system with individual users or remote revocation. The public repository holds only the encrypted snapshot and application code. Browser drafts and subsequently entered actuals stay in the browser profile; they are not uploaded.

The cryptographic APIs follow the [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) and [AES-GCM parameter](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) documentation.

## Offline presentation copy

`HumanPlus-Presentation-Ready.html` is the private, ready-to-open edition. It embeds the entire reviewed package: all 17 datasets and 218 original documents. Open the HTML directly in a current browser; no server, package picker, previous storage, login, or network request is needed. Each opening verifies the 235 source hashes. This unencrypted offline HTML stays outside the public repository. GitHub Pages publishes only the password-encrypted edition.

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

Requires Node >=22.13. Live website: **https://ariongj.github.io/HumanP/**. Pages was enabled through the `gh-pages` publishing branch. The workflow `.github/workflows/pages.yml` tests/builds `main`, updates the protected HTML on `gh-pages`, and dispatches `publish.yml` on that branch. Deployment therefore respects the repository’s Pages environment branch restriction. No additional account token or external hosting is required. The publishing workflow is present on both branches; changes to that workflow must be kept synchronized. `SOURCE_COMMIT` in the published build identifies the application source revision.

The build reads `snapshots/publication.json`, checks the encrypted snapshot hash, builds the application, and embeds the ciphertext into one HTML file. The password is not needed by CI and is absent from the deployment. The Pages content security policy allows only the exact compiled script hash and disables fetch/XHR (`connect-src 'none'`). After successful decryption, the browser verifies every source object before showing the panel. Original documents and filtered CSVs download from browser memory.

Scenario drafts, saved filters, review notes, tender checklists and entered monthly actuals use browser-local storage. Export backups before clearing storage or changing devices. The supplied dataset needs no browser storage to load, including in a new browser. Connections offers a data backup after login. Logging out requires credentials to reopen the panel; saved drafts remain in the same browser profile.

To replace or rotate the encrypted snapshot, run `scripts/encrypt-snapshot.py` against the verified private package with a credentials JSON file **outside the checkout**, then update the digest in `snapshots/publication.json`. Use a fresh generated password of at least 24 characters. Never put credentials, decryption keys, or the plaintext package in GitHub. Previously downloaded copies remain usable with their original credential.

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

Monthly finance scenarios retain 39 periods and three source cases, the partial October fraction, delayed collections and unknown values. Actuals are only populated through explicit manual entry or CSV import; no real financial performance is invented. In Pages, confirmed imports stay in the current browser.

## Verification

`npm test` runs 26 synthetic calculation, filter, source-link, API-contract and authenticated-decryption tests. When the original private workbook JSON exists in the sibling private bundle, an independent allowlisted evaluator checks all 39 periods in all three scenarios against workbook formulas. That one test is explicitly skipped on public CI, where the private source is absent.

`tests/protected_panel_browser_qa.py` checks the deployed password-protected edition with a fresh browser: wrong credentials rejected, correct credentials open every dataset without import, linked evidence, five chapters at 320px, editable scenarios, manual actuals, hash-matched original documents, reload and logout. Set `PANEL_URL` for a live HTTPS check. Credentials and expected source data are read from local files outside the repository. `scripts/check-pages.mjs` checks the encrypted snapshot digest, envelope, exact script hash, no plaintext package and no external dependencies. Screenshots and test receipts stay outside the repository.

`tests/presentation_browser_qa.py` retains coverage for the private offline HTML. `tests/pages_browser_qa.py` and `tests/vault_persistence_qa.py` cover the older import-based build available through `npm run build:import`; this is not the current Pages deployment.

## Retained server adapter

The previous Vinext/Cloudflare implementation remains available through `npm run dev`, `npm run build` and `npm run start`; publishing it is not part of the GitHub Pages workflow. It expects a private Sites ingress and `BUCKET` R2 binding. `lib/private-api.ts` checks trusted identity for reads and uses immutable allowlisted imports. Do not expose it on an unauthenticated independent server or trust browser-supplied identity headers. `scripts/upload-bundle.mjs --local` is for its loopback preview. The existing Site has not been redeployed by this GitHub update.
