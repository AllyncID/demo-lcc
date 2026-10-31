# LCC Awards 2026 — production

The existing Vercel project `allync/demo-lcc` now runs the shared production application. The former browser-isolated demo snapshots remain untouched in private Blob storage, but the production API does not load them.

- Canonical site: `https://lcc-ntb.com` (www and the Vercel alias may also serve the same application).
- Database: Turso/libSQL; empty participant, vote and ticket tables at publication. Twelve categories, including Olahraga. One fresh administrator; no demo login or fixed demo OTP.
- Files: WebP images in private Vercel Blob under `production/`. Receipts are served only by the authenticated admin API. Approved visible profile photos are delivered through `/uploads/`.
- Registration defaults: November 1, 2026 12:00–November 9, 2026 21:00 WITA.
- Voting defaults: November 13, 2026 12:00–November 23, 2026 21:00 WITA. Start inclusive, end exclusive. Existing saved settings are never overwritten on redeploy.

## Environment

Production-only secrets: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `PRODUCTION_SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. `APP_ORIGIN=https://lcc-ntb.com`. The connected private Blob store supplies OIDC credentials automatically. Never expose credentials through `VITE_` variables or commit `.local/` or `.env`.

Email needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, and optionally `SMTP_SECURE`. TLS and certificate validation are mandatory. Without a configured sender, public pages and admin work, but registration/payment submission and OTP requests are unavailable. Connect and test email before opening registration; the schedule alone does not enable email.

## Verification and limits

`npm test`, `npm run check`, `npm run build`, `npm audit --omit=dev`, and `git diff --check` are the release gates. Metadata and social covers are generated into static per-route HTML, readable by crawlers without JavaScript. Admin, participant and ticket pages use noindex; public pages use the canonical domain.

Persistent atomic limits: API 120 requests/minute/IP; registration and votes share 12 submissions/15 minutes/IP; OTP request/verification limits are stored in Turso; five failed admin logins trigger a 15-minute block. IPv6 subnet normalization is used for public request counters. Limits also have a per-instance layer before JSON parsing. Expired state is periodically pruned. Session cookies are signed, Secure, HttpOnly and SameSite Strict. Mutations require the session CSRF token and an allowlisted Origin.

Votes have a database uniqueness constraint per browser identity/category. Category and eligibility triggers prevent stale concurrent writes; OTP consumption and check-in use conditional single-use writes. **Browser identity still does not prove a unique person:** clearing cookies, another browser or device can create a fresh voter identity. Verified voter accounts or a bot challenge would be a separate change before a strict one-human policy can be claimed. Rate limiting alone does not provide that guarantee.

Free-tier quotas include file transfer, operations and database reads/writes as well as storage. Monitor Vercel and Turso usage during the event. The existing Vercel Hobby plan is restricted to personal/non-commercial use; select a suitable plan for the paid client event. No paid subscription was purchased by this deployment.

## Migration and rollback

Migration 006 is additive and idempotent. Startup never deletes or seeds dummy participants. Existing migration versions and saved configuration are retained. Database migrations run in a write transaction, and request transactions are scoped to their async call chain.

Before any future production migration, export/back up Turso and the private file store. Roll back to a production-compatible commit and keep the same Turso/Blob environment. Rolling back to the former demo commit would display the isolated demo instead of production records; it is not a production data rollback. Do not delete schema, categories or files to roll back application code.
