# HumanPlus company workspace — private pilot

A separate server-backed service for company accounts, shared tender work and a private daily-report inbox. The encrypted research panel remains available at `/archive.html` and retains its existing data password. Its build artifact is included by deployment packaging, never committed a second time.

## Run and test

Requires Node 22.13 or newer (validated with 22.23). Run `npm ci` to install the pinned HTML parser, then `npm test` in this folder. Configure `HP_ORIGIN`, `HP_DATA_DIR`, `HP_BOOTSTRAP_EMAIL` and `HP_BOOTSTRAP_PASSWORD` privately, then run `npm start`. Production additionally requires `NODE_ENV=production` and HTTPS. Set `HOST=0.0.0.0` behind the host's HTTPS proxy. The host supplies `PORT`.

The initial owner is created only when the user table is empty. Remove bootstrap variables after first startup. Never put credentials, databases or company data in Git. Session cookies are HttpOnly, same-site and Secure in production; passwords use salted scrypt. State-changing requests require the configured Origin and per-session CSRF token. Owner, member and viewer roles are checked server-side. Company membership is rechecked on every request. Invitation URLs are single-use bearer credentials, expire after 72 hours, and must be shared privately. An invitation to an existing account requires its existing password.

Company records, tender notes, tasks, comments, audit events, reports and deliveries live in SQLite outside the deployment tree. Hostinger's directory is `/home/u312639377/domains/tender.itdks.tech/humanplus-data`. Releasing a build must never replace that directory. SQLite is a deliberate single-host pilot choice; before multi-host expansion, migrate to a managed relational database and validate equivalent tenancy constraints.

## Reports and delivery

Run `node worker.mjs` from an external scheduler every minute, loading the same environment as the server. It checks a timezone-aware 10:00 Europe/Tirane schedule, including DST. It reads the locally collected healthcare feed, creates one report per company/local date, and adds one private inbox record per active member. It performs no GitHub fetch. Retrying or restarting does not duplicate a report or delivery. A stale-source report can recover in place if fresh data arrives later that day.

A scheduler tick after 10:00 is catch-up, not proof of delivery at exactly 10:00. Reports carry source, generation and delivery timestamps. The worker logs completion counts. External scheduler monitoring, escalation and a measured delivery SLO are still needed before a contractual uptime promise.

Run `node collect-worker.mjs` from a separate Hostinger scheduler every minute with the same environment. The durable scheduler starts at **09:00 Europe/Tirane**, ahead of the 10:00 report. It reads the official Kosovo publication listing directly, checks new notices and recent/open matched notices, and keeps all known source records in the persistent database. GitHub is used for source control and an optional manual archive workflow only. The legacy encrypted archive is a historical snapshot; live daily results appear in the company workspace.

A 25-minute lease prevents overlapping collection and fences out expired workers. Collection has a 20-minute deadline, at most two concurrent requests, 20-second request timeouts, two retries and 12 MB response caps. Failed runs preserve last-known facts and retry after 15, 30, 60 and then 120 minutes, capped at 12 attempts per local date. Jobs catch up after downtime; they do not claim delivery occurred at 10:00 if it was late. Failed or incomplete collection cannot advance the last successful check. The panel shows collection status, last successful check and next retry.

Deployment packaging may include the existing public `monitor/state.json`, `feed.json` and `ai-report.json` under `bootstrap/` to seed the first run. Initialization uses insert-if-absent and never overwrites persistent state on deployment. `profile.json` contains the healthcare classification rules. Keep this copy in sync when intentionally changing the profile.

AI commentary is generated after successful collection using the existing OpenAI key in Hostinger private environment settings (`OPENAI_API_KEY`). Only public metadata and the public HumanPlus source profile are sent. The daily request is capped at eight candidate procedures, 32,000 input bytes and 5,000 output tokens, with one durably claimed attempt per Kosovo date and no request retries. Model/API charges remain separate from hosting. Commentary is attached only when the source timestamp, notice and complete related-context fingerprints match. If AI fails, factual reports still arrive and the AI status is shown. Late AI can enrich that same report without duplicate inbox deliveries. Requirements remain unknown until the official dossier has been extracted and reviewed. Other sectors can create company workspaces, but are explicitly labelled as not covered by the current healthcare source.

Delivery currently means a durable private **panel inbox**. ChatGPT/ARI, email and browser push are not connected. Do not advertise them as active.

## Operations

The worker creates a daily consistent SQLite backup and retains 14 daily files outside releases. These backups are on the same host; off-site copies and a scheduled restore drill remain release gates for paying customers. A production restart and restore check must confirm persistence before onboarding real company documents.

Run `npm test` for HTTP account/tenancy tests and report idempotency/freshness/DST tests. A browser smoke test must cover desktop/mobile login, saving a tender, owner/stage/notes, tasks/comments, invitations and report visibility. The existing research panel has its own typecheck, 59 tests and encrypted-bundle integrity check.

Before broad commercial launch: independent security review; verified account recovery and stronger identity controls; monitored source collection and delivery; off-site backup/restore evidence; contractual privacy/retention policies; usage limits and cost accounting; source rights; company capability and dossier-evidence workflows. This release is an invite-only pilot, not a declaration that every sale-readiness gate has passed.

## Connected workspace release — October 2026

Today, Tenders, Pipeline, Library and Reports share search, year, tender category, buyer, publication stage, deadline, product, brand, recorded supplier, bid stage and owner filters. Counts and the category chart use the same visible notice IDs; CSV exports include the whole filtered result, beyond the current page. Clearing filters restores all source notices. Company briefing interests affect daily report candidates but do not hide notices in the explorer. The historical encrypted archive remains a separate snapshot, outside these live-source filters.

The library includes 11 original supplied product research records with source links and verification limits. It distinguishes research from company-added products; it never treats a lot value as a product unit price or claims stock or brand authorization. Connections are exact procedure identifiers, bounded model/name mentions, or explicit company links with a required reason. Private entries and links are scoped to active company membership. Updates use optimistic versions, writer roles, Origin and CSRF checks. Database schema upgrades are additive.

New report snapshots retain every qualifying candidate. Older snapshots remain unchanged and the interface discloses any previous 30-row limit. Filters on historical reports show the intersection with the currently available source IDs; they do not rewrite historical facts. The pipeline supports keyboard-accessible stage changes and preserves server-side version-conflict protection.

The GitHub workspace workflow tests and packages this Node application. Its artifact is an installation package, not a deployment to `tender.itdks.tech`. GitHub Pages cannot run the private server API. A Hostinger deployment must retain the existing environment, persistent database, minute schedulers and encrypted archive. Never replace `HP_DATA_DIR` or initialize another owner on an existing installation. Rollback should restore the prior application release while keeping the persistent database (the added catalog tables can remain).
