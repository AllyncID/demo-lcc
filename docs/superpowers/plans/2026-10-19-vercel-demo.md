# Client Demo Deployment Plan

Goal: push the complete source to AllyncID/demo-lcc and provide a working Vercel preview with one admin and one participant demo account.

The existing Express/SQLite application stays intact for normal hosting. The Vercel entry point restores an isolated browser's synthetic SQLite snapshot from private Blob storage, runs the existing routes, and saves changes before returning a successful response. Conditional writes reject concurrent overwrites. This is a review environment, not the live event database.

1. Add the Vercel adapter, synthetic fixtures, and a demo-only notice. Keep real registration/payment submissions disabled. Test login, OTP, ticket downloads, state across handler restarts, browser isolation, and storage conflicts/failures.
2. Run the complete tests, TypeScript check, and build. Inspect publishable files for credentials, local databases, receipts, and QA screenshots. Push source to the empty requested repository without overwriting remote work.
3. Import the repository in Vercel, configure secrets and a private demo Blob store, deploy, and verify the public site plus both authenticated demo flows. Give the user the URL and demo credentials, with the isolation/production limitation.

Constraints: no live data, real email delivery, financial transactions, or production-domain changes. Existing SMTP/TLS and authentication behavior outside the explicit demo entry point must continue passing their regression tests.

Progress: adapter and fixtures complete. Independent review found a demo submission guard bypass through Express case/trailing-slash aliases; guards moved into the actual handlers and regression verified RED then GREEN. All 48 tests, typecheck and build pass. Staged files contain no local secrets, databases, receipts, or QA screenshots. Repository is empty and writable; Vercel account Allync is signed in. Push/deployment and live verification remain.
