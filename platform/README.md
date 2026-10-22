# HumanPlus company workspace — private pilot

A separate server-backed service for company accounts, shared tender work and a private daily-report inbox. The encrypted research panel remains available at `/archive.html` and retains its existing data password. Its build artifact is included by deployment packaging, never committed a second time.

## Run and test

Requires Node 22.13 or newer (validated with 22.23). No runtime packages are required. Run `npm test` in this folder. Configure `HP_ORIGIN`, `HP_DATA_DIR`, `HP_BOOTSTRAP_EMAIL` and `HP_BOOTSTRAP_PASSWORD` privately, then run `npm start`. Production additionally requires `NODE_ENV=production` and HTTPS. Set `HOST=0.0.0.0` behind the host's HTTPS proxy. The host supplies `PORT`.

The initial owner is created only when the user table is empty. Remove bootstrap variables after first startup. Never put credentials, databases or company data in Git. Session cookies are HttpOnly, same-site and Secure in production; passwords use salted scrypt. State-changing requests require the configured Origin and per-session CSRF token. Owner, member and viewer roles are checked server-side. Company membership is rechecked on every request. Invitation URLs are single-use bearer credentials, expire after 72 hours, and must be shared privately. An invitation to an existing account requires its existing password.

Company records, tender notes, tasks, comments, audit events, reports and deliveries live in SQLite outside the deployment tree. Hostinger's directory is `/home/u312639377/domains/tender.itdks.tech/humanplus-data`. Releasing a build must never replace that directory. SQLite is a deliberate single-host pilot choice; before multi-host expansion, migrate to a managed relational database and validate equivalent tenancy constraints.

## Reports and delivery

Run `node worker.mjs` from an external scheduler every minute, loading the same environment as the server. It checks a timezone-aware 10:00 Europe/Tirane schedule, including DST. It fetches the existing public healthcare feed, stores a durable source cache, creates one report per company/local date, and adds one private inbox record per active member. Retrying or restarting does not duplicate a report or delivery. A stale-source report can recover in place if fresh data arrives later that day.

A scheduler tick after 10:00 is catch-up, not proof of delivery at exactly 10:00. Reports carry source, generation and delivery timestamps. The worker logs completion counts. External scheduler monitoring, escalation and a measured delivery SLO are still needed before a contractual uptime promise.

The public upstream collector is still a separate GitHub workflow. At the initial release, GitHub blocked its run because of an account billing issue. This service cannot make stale source data fresh: it explicitly reports source unavailability instead of saying no opportunities exist. Moving the collector to an independent job is the next reliability milestone.

AI commentary is reused only when the notice and complete related-context fingerprints match the existing AI report. No private company data is sent to an AI service, and this workspace does not incur new model calls. Requirements remain unknown until the official dossier has been extracted and reviewed. Other sectors can create company workspaces, but are explicitly labelled as not covered by the current healthcare source.

Delivery currently means a durable private **panel inbox**. ChatGPT/ARI, email and browser push are not connected. Do not advertise them as active.

## Operations

The worker creates a daily consistent SQLite backup and retains 14 daily files outside releases. These backups are on the same host; off-site copies and a scheduled restore drill remain release gates for paying customers. A production restart and restore check must confirm persistence before onboarding real company documents.

Run `npm test` for HTTP account/tenancy tests and report idempotency/freshness/DST tests. A browser smoke test must cover desktop/mobile login, saving a tender, owner/stage/notes, tasks/comments, invitations and report visibility. The existing research panel has its own typecheck, 59 tests and encrypted-bundle integrity check.

Before broad commercial launch: independent security review; verified account recovery and stronger identity controls; monitored source collection and delivery; off-site backup/restore evidence; contractual privacy/retention policies; usage limits and cost accounting; source rights; company capability and dossier-evidence workflows. This release is an invite-only pilot, not a declaration that every sale-readiness gate has passed.
