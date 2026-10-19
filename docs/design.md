# LCC Awards — Consilio redesign, 15 October 2026

Intent: a three-section public landing for Lombok Content Creators Awards 2026, following https://consilio.framer.website/ with a black–gold and warm-white palette. Separate registration and photographic voting pages share its typography and components. A password-protected /admin controls registrations, nominees, voting, schedules and configurable fields. Localhost only; dummy nominees are clearly identified.

Stack: React with TypeScript and Vite, Express 5, Node 24 SQLite, Tailwind 4/daisyUI 5. This conventional local Node stack is selected because the requested persistent local database and later migration are more directly served by it than a hosted Worker starter. No deployment or external account required.

Data: versioned SQL migration; settings, categories, creators, votes, opaque sessions, admin and audit events. Core registration fields remain stable. Additional form fields support text, email, URL, number, textarea, select and checkbox. A submitted creator is pending until admin approves; rejected creators never appear publicly. Admin can hide nominees without deleting history.

Voting: one vote per browser identity per category, enforced by a database unique constraint. Vote eligibility and campaign dates are checked on the server. This is a local demonstration, not verified one-person voting. Production needs verified email/OTP or identity plus bot protection. Initial vote totals are zero, with no invented votes.

Security: scrypt password hashes; random opaque session tokens stored as hashes; session rotation on login; HttpOnly SameSite cookies; CSRF bound to server session and strict configured origin; server schema validation, prepared SQL, body limits, rate limits and persisted login lockouts; authenticated admin API; audit log; private registration data never exposed publicly. Image uploads accept raster formats, decode and re-encode with sharp, and use random filenames. Production refuses insecure origin and demo bootstrap.

Visual authority: Consilio's large, regular-weight Golos Text headings with tight tracking, narrow dark navigation, square arrow actions, fine borders, generous spacing, and dark/light section contrast. Golos Text Variable is bundled locally. The previous serif/forest-green styles and layered refinements were replaced by one public stylesheet and one admin stylesheet.

Palette: black #0b0b0a, gold #d2b06b, warm white #f6f5f1, ink #171714. Light surfaces use darker gold for readable text. Small secondary text uses a darker neutral for contrast. Status colors remain restrained and carry text labels.

Landing: (1) full-width dark hero with large two-line title, original SVG contour artwork, bottom-left description/arrow CTA and bottom-right trophy artwork; (2) warm-white about section with asymmetrical label/heading layout and three participation steps; (3) category tiles linked to filtered polling. Mobile category tiles become a horizontal scroll area. The shared footer adds a dark CTA, four columns, and a fine copyright rule.

Application: white registration/gallery surfaces with the same heading and border system; split black/white login with gold contour art; black admin navigation around a warm-white dashboard with white tables and panels. Review, photo uploads, private notes, category restrictions and polling logic remain functional. Shared content edges are capped at 1440 px; forms at 1280 px. Reduced-motion preferences are respected; the mobile navigation is an accessible disclosure.

Verification: 23 automated tests, TypeScript and production build passed. Browser checks cover public routes, filtered category navigation, navbar anchors, mobile menu, login, admin modal and schedule forms. Desktop 1226 px and iframe previews at 320/390/768 px show no page-level horizontal overflow. Responsive frames were hosted only by a discarded test server; production frame protections were not changed. Screenshots are saved in docs/consilio-*.png.

Acceptance: localhost running; all public and admin routes usable; registration persists; admin review changes public nominees; vote totals update once and duplicates fail; inactive and expired campaigns reject direct API calls; form edits affect registration; desktop/mobile checked; build and security integration tests pass.
