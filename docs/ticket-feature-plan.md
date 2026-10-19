# Participant tickets and check-in

Approved flow: registration + receipt → participant portal with emailed OTP → pending review → admin approves payment and registration → persistent ticket + QR → authenticated staff check-in once. Rejected applicants can replace payment proof after participant login. Styling follows the existing black/gold site, centered mobile headings, flat layouts, Hugeicons.

Local delivery is explicitly approved by the user. Store email only in a private outbox, never return OTP from public APIs. Real SMTP can be configured later. Expose local outbox only through authenticated admin APIs and disable it in production.

## Contract

- POST `/api/register`: existing body. Extend 201 with `registrationNumber`, `statusUrl: '/peserta'`, `otpRequested: true`, `deliveryMode: 'local' | 'smtp'`. Persist registration before sending its initial OTP/confirmation email. Never return the code. Existing `{id,message}` stay.
- POST `/api/participant/otp/request` `{email}`: generic response `{message,deliveryMode,resendAfter:60}` for known/unknown email, throttled by account + IP.
- POST `/api/participant/otp/verify` `{email,code}`: set separate signed HttpOnly participant session cookie; response `{message}`. Existing bootstrap CSRF remains required for POST.
- GET `/api/participant/me`: 401 without participant session. `{participant:{id,registrationNumber,name,email,category,status,paymentStatus,reviewNote,createdAt,photo},ticket:{id,number,issuedAt,checkedInAt,verificationUrl,qrImageUrl,pngUrl,pdfUrl}|null,payment:RegistrationPayment,deliveryMode}`.
- POST `/api/participant/logout` `{}`.
- POST `/api/participant/payment-proof` `{paymentProofData}`: authenticated owner, rejected record only, validates private raster receipt, returns record to pending review, atomically preserves data on errors.
- GET `/api/participant/qr.png`, `/api/participant/ticket.png`, `/api/participant/ticket.pdf`: authenticated owner only; ticket requires approved registration AND verified payment, not dummy.
- GET `/api/tickets/verify/:token`: `{valid:boolean,status:'valid'|'used'|'unavailable',event:{name,year,location},checkedInAt?:string,canCheckIn:boolean,attendee?:{name,photo,category,registrationNumber},ticketNumber?:string}`. No participant PII to anonymous scanner. Admin/owner can see attendee. Invalid token may return 404; UI must handle it.
- POST `/api/admin/tickets/check-in` `{token}`: admin + CSRF, atomic single-use check-in, repeat returns 409, response `{message,checkedInAt}`.
- GET `/api/admin/tickets`: `{tickets:[{token,number,registrationNumber,name,category,status:'valid'|'used'|'unavailable',issuedAt,checkedInAt,verificationUrl}],stats:{issued,checkedIn}}` admin only.
- GET `/api/admin/mail-outbox`: `{mode:'local',messages:[{id,to,subject,text,createdAt}]}` admin-only non-production. SMTP mode returns 404.
- Extend admin creator DTO with `registrationNumber` and `ticket` (same ticket shape or null). Do not expose these fields in public nominee bootstrap.

## Pages and ownership

- `/peserta`: OTP request/verify → persistent status → correction upload or QR/ticket download. Register success navigates here with router state `{email,registrationNumber,otpSent:true,deliveryMode}` so it opens OTP step without sending twice.
- `/tiket/verifikasi/:token`: minimal public validation; admin identity/photo + confirmation check-in. Login link `/admin?next=<encoded verification path>`; safe whitelisted redirect after login.
- Admin tabs: Check-in (camera QR + paste URL/token + ticket list), Email lokal (private outbox with clear local-only label).
- Registration success redirects; add “Halaman peserta” navigation links so tickets are discoverable later.

Backend agent owns `server/**`, new backend tests and `.env.example`/README email documentation. Participant UI agent owns new `src/ParticipantPages.tsx` and `src/tickets.css`. Main agent owns registration redirect, route registration, common navigation, admin check-in/outbox UI and DTO types, dependency installation, and end-to-end QA.

## Acceptance

1. Migration preserves prior creators/votes/admin and reruns safely; additive schema only.
2. OTP is expiring, hashed, single-use, max attempts, throttled; participant sessions cannot access admin APIs or other creators' receipts.
3. No QR before dual approval; approval idempotently issues one ticket and notifies participant. Rejection invalidates ticket without deleting check-in history.
4. Registration → OTP → pending → correction → approval → download → scan → check-in works with local outbox; generated QR decodes to its verification URL.
5. Public scan never discloses contact/payment data; admin confirms check-in, two concurrent scans cannot both succeed.
6. PDF/PNG include a scannable high-contrast QR; auth protects downloads; SMTP missing cannot silently enable a public development OTP shortcut.
7. Meaningful server tests, TS check/build, desktop/mobile UI and disposable database browser QA pass. Keep main data unchanged during tests. No destructive migration.
