import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';

const dir = mkdtempSync(join(tmpdir(), 'lcc-tickets-'));
const origin = 'http://localhost:3029';
let db, server, base, proof, clock = Date.parse('2026-10-17T00:00:00Z');
function browser() {
  const cookies = new Map(); let csrf = '';
  return async (path, method = 'GET', body, headers = {}) => {
    const res = await fetch(base + path, { method, headers: { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json', 'x-csrf-token': csrf }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const cookie of res.headers.getSetCookie()) { const pair = cookie.split(';')[0]; const separator = pair.indexOf('='); cookies.set(pair.slice(0, separator), pair.slice(separator + 1)); }
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data, headers: res.headers };
  };
}
const admin = browser(), participant = browser(), anonymous = browser();
const registration = email => ({ name: 'Peserta Tiket', email, phone: '081234567890', gender: 'Perempuan', address: 'Jalan Langko 10 Mataram', socialAccounts: { instagram: '@peserta' }, categoryId: 1, consent: true, answers: {}, paymentProofData: proof });
async function outbox() { return (await admin('/api/admin/mail-outbox')).data.messages; }
async function codeFor(email) { const message = (await outbox()).filter(m => m.to === email && /OTP/.test(m.subject)).sort((a,b) => a.id - b.id).at(-1); return message.text.match(/Kode OTP Anda: (\d{6})/)[1]; }
before(async () => {
  const result = createApp({ databasePath: join(dir, 'db.sqlite'), uploadDir: join(dir, 'uploads'), origin, secret: 'tickets-secret-'.repeat(8), adminEmail: 'admin@example.com', adminPassword: 'AdminTestPassword2026!', now: () => clock });
  db = result.db; const settings = JSON.parse(db.prepare('SELECT payload FROM settings').get().payload); settings.fields = []; db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(settings));
  server = result.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  proof = `data:image/png;base64,${(await sharp({ create: { width: 400, height: 1200, channels: 3, background: '#cba35f' } }).png().toBuffer()).toString('base64')}`;
  await admin('/api/bootstrap'); await admin('/api/admin/login', 'POST', { email: 'admin@example.com', password: 'AdminTestPassword2026!' }); await participant('/api/bootstrap'); await anonymous('/api/bootstrap');
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); db?.close(); rmSync(dir, { recursive: true, force: true }); });

let id, registrationNumber, token;
test('registration persists a permanent number and privately emails an initial single-use OTP', async () => {
  const result = await participant('/api/register', 'POST', registration('ticket@example.com'));
  assert.equal(result.status, 202); const record = db.prepare('SELECT id,registration_number FROM creators WHERE email=?').get('ticket@example.com'); id = record.id; registrationNumber = record.registration_number;
  assert.match(registrationNumber, /^LCC-\d{6,}$/); assert.equal(result.data.statusUrl, '/peserta'); for (const key of ['id', 'registrationNumber', 'otpRequested']) assert.ok(!(key in result.data)); assert.equal(result.data.deliveryMode, 'local');
  const code = await codeFor('ticket@example.com'); assert.ok(!JSON.stringify(result.data).includes(code));
  const stored = db.prepare('SELECT * FROM participant_otps WHERE email=?').get('ticket@example.com'); assert.match(stored.code_hash, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(stored).includes(code));
  assert.equal((await participant('/api/participant/me')).status, 401);
  assert.equal((await participant('/api/participant/otp/verify', 'POST', { email: 'ticket@example.com', code }, { 'x-csrf-token': '' })).status, 403);
  const verified = await participant('/api/participant/otp/verify', 'POST', { email: 'ticket@example.com', code }); assert.equal(verified.status, 200);
  const participantCookie = verified.headers.getSetCookie().find(value => value.startsWith('lcc_participant=')); assert.match(participantCookie, /HttpOnly/i); assert.match(participantCookie, /SameSite=Strict/i);
  assert.ok(!db.prepare('SELECT code_hash FROM participant_otps WHERE email=?').get('ticket@example.com'));
  assert.equal((await participant('/api/participant/otp/verify', 'POST', { email: 'ticket@example.com', code })).status, 401);
  const me = await participant('/api/participant/me'); assert.equal(me.data.participant.registrationNumber, registrationNumber); assert.equal(me.data.ticket, null);
  assert.equal((await participant('/api/participant/ticket.png')).status, 403);
  assert.equal((await participant('/api/admin/dashboard')).status, 401); assert.equal((await participant('/api/admin/mail-outbox')).status, 401);
  assert.equal((await participant(`/api/admin/creators/${id}/payment-proof`)).status, 401);
});

test('OTP request hides account existence, expires, bounds attempts and applies persistent resend limits', async () => {
  clock += 61000;
  const known = await anonymous('/api/participant/otp/request', 'POST', { email: 'ticket@example.com' });
  const unknown = await anonymous('/api/participant/otp/request', 'POST', { email: 'unknown@example.com' }); assert.deepEqual(known.data, unknown.data);
  assert.equal((await anonymous('/api/participant/otp/request', 'POST', { email: 'ticket@example.com' })).status, 429);
  const code = await codeFor('ticket@example.com');
  for (let i = 0; i < 5; i++) assert.equal((await anonymous('/api/participant/otp/verify', 'POST', { email: 'ticket@example.com', code: code === '000000' ? '000001' : '000000' })).status, 401);
  assert.equal((await anonymous('/api/participant/otp/verify', 'POST', { email: 'ticket@example.com', code })).status, 401);
  clock += 61000; await anonymous('/api/participant/otp/request', 'POST', { email: 'ticket@example.com' }); const next = await codeFor('ticket@example.com');
  clock += 10 * 60000;
  assert.equal((await anonymous('/api/participant/otp/verify', 'POST', { email: 'ticket@example.com', code: next })).status, 401);
});

test('dual approval issues one ticket and one email, and public verification excludes participant details', async () => {
  assert.equal((await admin(`/api/admin/creators/${id}`, 'PATCH', { status: 'approved' })).status, 409);
  assert.equal((await admin(`/api/admin/creators/${id}`, 'PATCH', { status: 'approved', paymentStatus: 'verified' })).status, 200);
  assert.equal((await admin(`/api/admin/creators/${id}`, 'PATCH', { status: 'approved', paymentStatus: 'verified' })).status, 200);
  const listing = (await admin('/api/admin/tickets')).data; assert.equal(listing.stats.issued, 1); token = listing.tickets[0].token;
  assert.equal((await outbox()).filter(m => m.to === 'ticket@example.com' && /Tiket/.test(m.subject)).length, 1);
  const publicResult = await anonymous(`/api/tickets/verify/${token}`); assert.equal(publicResult.data.status, 'valid'); assert.equal(publicResult.data.canCheckIn, false);
  assert.ok(!('attendee' in publicResult.data)); assert.ok(!('ticketNumber' in publicResult.data)); assert.ok(!JSON.stringify(publicResult.data).includes('ticket@example.com'));
  const owner = (await participant(`/api/tickets/verify/${token}`)).data; assert.equal(owner.attendee.registrationNumber, registrationNumber); assert.equal(owner.canCheckIn, false);
  const staff = (await admin(`/api/tickets/verify/${token}`)).data; assert.equal(staff.attendee.name, 'Peserta Tiket'); assert.equal(staff.canCheckIn, true);
  const dashboard = (await admin('/api/admin/dashboard')).data; assert.equal(dashboard.creators.find(c => c.id === id).ticket.number, listing.tickets[0].number);
  assert.ok(!(await anonymous('/api/bootstrap')).data.creators.some(c => 'registrationNumber' in c || 'ticket' in c));
});

test('authenticated ticket exports include a real QR that decodes to the opaque verification URL', async () => {
  const qr = await participant('/api/participant/qr.png'); assert.equal(qr.status, 200); assert.equal(qr.headers.get('content-type'), 'image/png');
  const image = await sharp(qr.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.info.width, image.info.height); assert.equal(decoded.data, `${origin}/tiket/verifikasi/${token}`);
  const png = await participant('/api/participant/ticket.png'); assert.equal(png.status, 200); const metadata = await sharp(png.data).metadata(); assert.ok(metadata.width >= 1000); assert.ok(metadata.height >= 1200);
  const fullImage = await sharp(png.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); assert.equal(jsQR(new Uint8ClampedArray(fullImage.data), fullImage.info.width, fullImage.info.height).data, decoded.data);
  const pdf = await participant('/api/participant/ticket.pdf'); assert.equal(pdf.status, 200); assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.headers.get('content-disposition').includes('attachment'));
  assert.equal((await anonymous('/api/participant/ticket.pdf')).status, 401);
});

test('only admin may check in and concurrent submissions record one check-in', async () => {
  assert.equal((await participant('/api/admin/tickets/check-in', 'POST', { token })).status, 401);
  assert.equal((await admin('/api/admin/tickets/check-in', 'POST', { token }, { 'x-csrf-token': '' })).status, 403);
  const results = await Promise.all([admin('/api/admin/tickets/check-in', 'POST', { token }), admin('/api/admin/tickets/check-in', 'POST', { token })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal((await anonymous(`/api/tickets/verify/${token}`)).data.status, 'used');
  assert.equal((await admin('/api/admin/tickets')).data.stats.checkedIn, 1);
});

test('rejection revokes downloads and scan availability, receipt replacement is private and preserves check-in history', async () => {
  const oldProof = db.prepare('SELECT payment_proof FROM creators WHERE id=?').get(id).payment_proof;
  const checked = (await admin(`/api/tickets/verify/${token}`)).data.checkedInAt;
  assert.equal((await admin(`/api/admin/creators/${id}`, 'PATCH', { status: 'rejected', paymentStatus: 'rejected', reviewNote: 'Bukti kurang jelas' })).status, 200);
  assert.equal((await participant('/api/participant/ticket.pdf')).status, 403); assert.equal((await anonymous(`/api/tickets/verify/${token}`)).data.status, 'unavailable');
  assert.equal((await admin('/api/admin/tickets/check-in', 'POST', { token })).status, 403);
  assert.equal((await participant('/api/participant/payment-proof', 'POST', { paymentProofData: 'data:image/svg+xml;base64,PHN2Zy8+' })).status, 400);
  assert.equal(db.prepare('SELECT payment_proof FROM creators WHERE id=?').get(id).payment_proof, oldProof);
  assert.equal((await participant('/api/participant/payment-proof', 'POST', { paymentProofData: proof })).status, 200);
  const updated = db.prepare('SELECT * FROM creators WHERE id=?').get(id); assert.notEqual(updated.payment_proof, oldProof); assert.equal(updated.status, 'pending'); assert.equal(updated.payment_status, 'pending'); assert.equal(updated.registration_number, registrationNumber);
  assert.equal(readdirSync(join(dir, 'receipts')).length, 1);
  assert.equal((await participant('/api/participant/payment-proof', 'POST', { paymentProofData: proof })).status, 409);
  assert.equal((await admin(`/api/admin/creators/${id}`, 'PATCH', { status: 'approved', paymentStatus: 'verified' })).status, 200);
  const verified = (await admin(`/api/tickets/verify/${token}`)).data; assert.equal(verified.status, 'used'); assert.equal(verified.checkedInAt, checked); assert.equal((await admin('/api/admin/tickets')).data.stats.issued, 1);
  assert.equal((await participant('/api/participant/logout', 'POST', {})).status, 200); assert.equal((await participant('/api/participant/me')).status, 401);
});

test('migration reruns preserve registration numbers, tickets, check-ins and private OTP state', () => {
  const path = join(dir, 'migration.sqlite');
  let migrated = openDatabase(path, 'migration@example.com', 'MigrationPassword2026!');
  const before = migrated.prepare('SELECT id,registration_number FROM creators ORDER BY id').all();
  assert.ok(before.every(c => /^LCC-\d{6,}$/.test(c.registration_number)));
  migrated.prepare("INSERT INTO creators(name,email,phone,handle,category_id,created_at,registration_number) VALUES('Saved','saved@example.com','','@saved',1,'2026-10-17','LCC-KEEP-123')").run();
  migrated.prepare("INSERT INTO tickets(creator_id,token,number,issued_at,checked_in_at,checked_in_by) VALUES(9,?,?,?, ?,1)").run('opaque-saved-token', 'TKT-SAVED', '2026-10-17T00:00:00Z', '2026-10-17T01:00:00Z');
  migrated.close(); migrated = openDatabase(path, 'unused@example.com', 'UnusedPassword2026!');
  try {
    assert.deepEqual(migrated.prepare('SELECT id,registration_number FROM creators WHERE id<9 ORDER BY id').all(), before);
    assert.equal(migrated.prepare('SELECT registration_number FROM creators WHERE id=9').get().registration_number, 'LCC-KEEP-123');
    assert.equal(migrated.prepare('SELECT checked_in_at FROM tickets WHERE creator_id=9').get().checked_in_at, '2026-10-17T01:00:00Z');
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version=4').get().n, 1);
  } finally { migrated.close(); }
});

test('SMTP mode never exposes an outbox or accepts a public development delivery shortcut', async () => {
  const smtpConfig = { databasePath: join(dir, 'smtp.sqlite'), uploadDir: join(dir, 'smtp-uploads'), origin, secret: 'smtp-secret-'.repeat(8), adminEmail: 'smtp@example.com', adminPassword: 'SmtpPassword2026!', mailMode: 'smtp', smtp: { host: '127.0.0.1', port: 1 }, mailFrom: 'event@example.com' };
  const smtpApp = createApp(smtpConfig); const smtpServer = smtpApp.app.listen(0, '127.0.0.1'); await new Promise(resolve => smtpServer.once('listening', resolve));
  let cookies = new Map(), csrf;
  async function request(path, body) {
    const res = await fetch(`http://127.0.0.1:${smtpServer.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), origin, 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, body: body ? JSON.stringify(body) : undefined });
    for (const cookie of res.headers.getSetCookie()) { const pair = cookie.split(';')[0], split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
    const data = await res.json(); if (data.csrfToken) csrf = data.csrfToken; return { status: res.status, data };
  }
  try {
    assert.equal((await request('/api/bootstrap')).data.mailDeliveryMode, 'smtp');
    await request('/api/admin/login', { email: 'smtp@example.com', password: 'SmtpPassword2026!' });
    assert.equal((await request('/api/admin/mail-outbox')).status, 404);
    const unknown = await request('/api/participant/otp/request', { email: 'missing@example.com' }); assert.equal(unknown.status, 200); assert.ok(!('code' in unknown.data));
  } finally { await new Promise(resolve => smtpServer.close(resolve)); smtpApp.db.close(); }
  assert.throws(() => createApp({ ...smtpConfig, databasePath: join(dir, 'bad-smtp.sqlite'), mailFrom: '', smtp: {} }), /SMTP/);
  assert.throws(() => createApp({ ...smtpConfig, databasePath: join(dir, 'bad-local.sqlite'), origin: 'https://lcc.example.com', production: true, mailMode: 'local' }), /production/);
});
