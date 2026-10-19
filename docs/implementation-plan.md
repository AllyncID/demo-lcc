# LCC Awards implementation plan

Goal: complete the local foundation defined in docs/design.md.
Execution: inline in the existing empty workspace, with asset-only delegation and one final review.

- [x] Persistence/API: write integration cases first, run the missing-behavior checks, then implement migration, seeded nominees, sessions, admin authorization, field validation, campaign scheduling and transactional vote uniqueness. Interfaces: /api/bootstrap, /api/register, /api/votes and /api/admin/*.
- [x] Public UI: landing, registration with photo and configured fields, nominee gallery with category/search and vote confirmation. Show clear closed, pending, success and error states.
- [x] Admin UI: login, overview/results, creator review/detail, nominee visibility, schedule toggles, form builder, category management, audit and password change. All writes use session CSRF.
- [x] Verify: integration tests for unauthorized requests, CSRF, duplicate/concurrent votes, hidden nominees, registration validation, expired/inactive periods and session invalidation. Type check, production build, dependency audit and browser desktop/mobile journeys. Keep local server alive.

Review focus: untrusted extra fields cannot alter core identity; campaign date boundaries; vote uniqueness under concurrent requests; uploads cannot become executable content; private registration/contact fields never reach public endpoints.

Process rulings: user already asked to build and run this local result, so no repeated design approval; no new worktree for an empty non-Git project. RTK binaries fail to execute under current OS restrictions, so shell checks use native commands.

Verified: 13 API integration tests pass, TypeScript check and production build pass, npm audit reports 0 vulnerabilities, and private files return 404 on the live dev server. Browser checks cover registration fields, admin login/logout, form builder, disabling/re-enabling registration CTA, responsive layout at 320/390/768/1440 px, shared edges, and footer reaching the viewport bottom. Local server stays on http://localhost:3001.
