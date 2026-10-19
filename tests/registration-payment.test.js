import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { createApp } from '../server/app.js';

const dir = mkdtempSync(join(tmpdir(), 'lcc-payment-'));
const origin = 'http://localhost:3017';
let db, server, base, proof, creatorId;
function browser() {
  let cookie = '', csrf = '';
  return async (path, method = 'GET', body) => {
    const res = await fetch(base + path, { method, headers: { cookie, ...(method === 'GET' ? {} : { origin, 'content-type': 'application/json', 'x-csrf-token': csrf }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.headers.getSetCookie().length) cookie = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data, type: res.headers.get('content-type'), cache: res.headers.get('cache-control') };
  };
}
const publicRequest = browser(), admin = browser();
const registration = (patch = {}) => ({ name: 'Creator Registrasi', email: 'registration@example.com', gender: 'Perempuan', address: 'Jalan Langko 10, Mataram, NTB', phone: '081234567890', socialAccounts: { facebook: '', instagram: '@ceritalombok', tiktok: '', youtube: '' }, categoryId: 1, bio: 'Juara lomba video daerah', consent: true, answers: {}, paymentProofData: proof, ...patch });
before(async () => {
  const app = createApp({ databasePath: join(dir, 'db.sqlite'), uploadDir: join(dir, 'uploads'), origin, secret: 'test-secret-'.repeat(8), adminEmail: 'admin@example.com', adminPassword: 'AdminTestPassword2026!', now: () => Date.parse('2026-10-17T00:00:00Z') }); db = app.db;
  const settings = JSON.parse(db.prepare('SELECT payload FROM settings').get().payload); settings.fields = [];
  db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(settings));
  server = app.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const source = await sharp({ create: { width: 400, height: 1300, channels: 3, background: '#d2b06b' } }).png().toBuffer(); proof = `data:image/png;base64,${source.toString('base64')}`;
  await publicRequest('/api/bootstrap'); await admin('/api/bootstrap'); await admin('/api/admin/login', 'POST', { email: 'admin@example.com', password: 'AdminTestPassword2026!' });
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); db?.close(); rmSync(dir, { recursive: true, force: true }); });

test('new registration rejects missing payment proof and incomplete identity', async () => {
  assert.equal((await publicRequest('/api/register', 'POST', { name: 'Legacy Uji', email: 'legacy@example.com', phone: '081234567891', handle: '@legacy', categoryId: 1, consent: true, answers: {} })).status, 400);
  for (const patch of [{ paymentProofData: undefined }, { socialAccounts: {} }, { gender: '' }, { address: '' }, { paymentStatus: 'verified' }]) {
    const result = await publicRequest('/api/register', 'POST', registration(patch)); assert.equal(result.status, 400, JSON.stringify(patch));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM creators WHERE email=?').get('registration@example.com').n, 0);
});

test('registration stores all social accounts and a private uncropped receipt for admin review', async () => {
  const result = await publicRequest('/api/register', 'POST', registration()); assert.equal(result.status, 202, JSON.stringify(result.data)); creatorId = db.prepare('SELECT id FROM creators WHERE email=?').get('registration@example.com').id;
  const c = db.prepare('SELECT * FROM creators WHERE id=?').get(creatorId);
  assert.equal(c.gender, 'Perempuan'); assert.equal(c.address, 'Jalan Langko 10, Mataram, NTB'); assert.equal(c.handle, '@ceritalombok');
  assert.equal(JSON.parse(c.social_accounts).instagram, '@ceritalombok'); assert.equal(c.payment_status, 'pending');
  const dashboard = (await admin('/api/admin/dashboard')).data;
  const record = dashboard.creators.find(c => c.id === creatorId);
  assert.equal(record.socialAccounts.instagram, '@ceritalombok'); assert.ok(record.paymentProofUrl);
  assert.equal((await publicRequest(record.paymentProofUrl)).status, 401);
  const receipt = await admin(record.paymentProofUrl); assert.equal(receipt.status, 200); assert.equal(receipt.type, 'image/webp'); assert.ok(receipt.cache.includes('no-store'));
  const metadata = await sharp(receipt.data).metadata(); assert.equal(metadata.width, 400); assert.equal(metadata.height, 1300);
  assert.ok(!existsSync(join(dir, 'uploads', basename(c.payment_proof))));
  const before = db.prepare('SELECT COUNT(*) AS n FROM votes').get().n;
  assert.equal((await admin(`/api/admin/creators/${creatorId}`, 'PATCH', { status: 'approved', visible: true })).status, 409);
  assert.equal((await admin(`/api/admin/creators/${creatorId}`, 'PATCH', { paymentStatus: 'verified', status: 'approved', visible: true })).status, 200);
  const publicCreator = (await publicRequest('/api/bootstrap')).data.creators.find(c => c.id === creatorId);
  assert.ok(publicCreator);
  for (const key of ['address', 'gender', 'payment_proof', 'payment_status', 'paymentProofUrl', 'socialAccounts', 'paymentSnapshot']) assert.ok(!(key in publicCreator), key);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM votes').get().n, before);
});

test('invalid or duplicate submissions leave no public or private orphan images', async () => {
  const before = readdirSync(join(dir, 'receipts'));
  const bad = await publicRequest('/api/register', 'POST', registration({ email: 'invalid@example.com', paymentProofData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', photoData: proof }));
  assert.equal(bad.status, 400); assert.deepEqual(readdirSync(join(dir, 'receipts')), before); assert.deepEqual(readdirSync(join(dir, 'uploads')), []);
  assert.equal((await publicRequest('/api/register', 'POST', registration())).status, 202);
  assert.deepEqual(readdirSync(join(dir, 'receipts')), before);
  assert.equal((await admin('/api/admin/creators/1', 'PATCH', { paymentStatus: 'verified' })).status, 400);
});

test('event payment details are persisted from server, not supplied by registrant', async () => {
  const bootstrap = (await publicRequest('/api/bootstrap')).data;
  assert.deepEqual(bootstrap.registrationPayment, { provider: 'DANA', amount: 49500, accountNumber: '089669454622', accountName: 'Herlan Adiwijaya', demo: false });
  const snapshot = JSON.parse(db.prepare('SELECT payment_snapshot FROM creators WHERE id=?').get(creatorId).payment_snapshot);
  assert.deepEqual(snapshot, bootstrap.registrationPayment);
  assert.ok(!readFileSync(join(dir, 'db.sqlite')).includes(Buffer.from(proof)));
});
