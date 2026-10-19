import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import sharp from 'sharp';

let server, base, client, admin, db, createApp, receiptData;
const dir = mkdtempSync(join(tmpdir(), 'lcc-test-'));
const origin = 'http://localhost:3000';
function browser() {
  let cookie = '', csrf = '';
  return {
    async req(path, method = 'GET', body, options = {}) {
      if (path === '/api/register' && body) body = { gender: 'Perempuan', address: 'Jalan Uji 10, Mataram', socialAccounts: { instagram: '@creatoruji' }, paymentProofData: receiptData, ...body };
      const headers = { cookie, ...(method !== 'GET' ? { origin, 'content-type': 'application/json', 'x-csrf-token': csrf } : {}), ...options.headers };
      const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) cookie = cookies.map(v => v.split(';')[0]).join('; ');
      const data = await res.json();
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: res.status, data };
    }
  };
}
before(async () => {
  receiptData = `data:image/png;base64,${(await sharp({ create: { width: 20, height: 40, channels: 3, background: '#d2b06b' } }).png().toBuffer()).toString('base64')}`;
  ({ createApp } = await import('../server/app.js'));
  const result = createApp({ databasePath: join(dir, 'test.sqlite'), origin, secret: 'test-secret-'.repeat(8), adminEmail: 'admin@lccntb.id', adminPassword: 'StrongTestPassword!27', uploadDir: join(dir, 'uploads'), now: () => Date.parse('2026-10-06T00:00:00Z') });
  db = result.db;
  server = result.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  client = browser(); admin = browser();
  await client.req('/api/bootstrap'); await admin.req('/api/bootstrap');
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); db?.close(); rmSync(dir, { recursive: true, force: true }); });
test('private admin data requires login', async () => { assert.equal((await client.req('/api/admin/dashboard')).status, 401); });
test('public nominee payload never exposes contact data', async () => {
  const { data } = await client.req('/api/bootstrap');
  assert.ok(data.creators.length >= 6);
  assert.ok(data.creators.every(c => !('email' in c) && !('phone' in c) && !('answers' in c)));
});
test('mutations reject missing CSRF and foreign origin', async () => {
  assert.equal((await client.req('/api/votes', 'POST', { creatorId: 1 }, { headers: { 'x-csrf-token': '' } })).status, 403);
  assert.equal((await client.req('/api/votes', 'POST', { creatorId: 1 }, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await client.req('/api/votes', 'POST', { creatorId: 1 }, { headers: { 'x-csrf-token': 'é'.repeat(64) } })).status, 403);
});
test('private files and encoded Vite aliases cannot be downloaded', async () => {
  for (const path of ['/.local/admin-access.txt', '/data/lcc.sqlite', '/data/lcc.sqlite-wal', '/server/app.js', '/@fs/G:/workspace/.local/admin-access.txt', '/%2elocal/admin-access.txt', '/.env']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});
test('vote commits once per browser/category including concurrent submissions', async () => {
  const responses = await Promise.all([client.req('/api/votes', 'POST', { creatorId: 1 }), client.req('/api/votes', 'POST', { creatorId: 1 })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  const { data } = await client.req('/api/bootstrap');
  assert.ok(!("votes" in data.creators.find(c => c.id === 1)));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM votes WHERE creator_id=1").get().n, 1);
});
test('admin login rotates session and protects settings', async () => {
  assert.equal((await admin.req('/api/admin/login', 'POST', { email: 'admin@lccntb.id', password: 'wrong-password' })).status, 401);
  assert.equal((await admin.req('/api/admin/login', 'POST', { email: 'admin@lccntb.id', password: 'StrongTestPassword!27' })).status, 200);
  assert.equal((await admin.req('/api/admin/dashboard')).status, 200);
});
test('inactive registration rejects direct submission and restores', async () => {
  await admin.req('/api/admin/settings', 'PUT', { registrationActive: false });
  assert.equal((await client.req('/api/register', 'POST', {})).status, 403);
  const { data } = await client.req('/api/bootstrap'); assert.equal(data.registrationOpen, false);
  await admin.req('/api/admin/settings', 'PUT', { registrationActive: true });
});
test('registration validates configured fields and remains private until approved', async () => {
  const fields = [{ id: 'city', label: 'Domisili', type: 'select', required: true, options: ['Mataram', 'Lombok Tengah'] }];
  assert.equal((await admin.req('/api/admin/fields', 'PUT', { fields })).status, 200);
  const body = { name: 'Creator Uji', email: 'creator@example.com', phone: '081234567890', handle: '@creatoruji', categoryId: 1, bio: 'Cerita lokal dari Lombok', consent: true, answers: { city: 'Mataram' } };
  assert.equal((await client.req('/api/register', 'POST', { ...body, answers: { city: 'Bad option' } })).status, 400);
  assert.equal((await client.req('/api/register', 'POST', { ...body, answers: { __proto__: 'bad' }, consent: false })).status, 400);
  const result = await client.req('/api/register', 'POST', body); assert.equal(result.status, 202);
  const pendingId = db.prepare("SELECT id FROM creators WHERE email=?").get(body.email).id;
  assert.ok(!(await client.req('/api/bootstrap')).data.creators.some(c => c.id === pendingId));
  assert.equal((await admin.req(`/api/admin/creators/${pendingId}`, 'PATCH', { status: 'approved', paymentStatus: 'verified' })).status, 200);
  assert.ok((await client.req('/api/bootstrap')).data.creators.some(c => c.id === pendingId));
});
test('expired vote period blocks new votes on server', async () => {
  assert.equal((await admin.req('/api/admin/settings', 'PUT', { votingStartsAt: '2019-01-01T00:00:00.000Z', votingEndsAt: '2020-01-01T00:00:00.000Z' })).status, 200);
  assert.equal((await client.req('/api/votes', 'POST', { creatorId: 3 })).status, 403);
  await admin.req('/api/admin/settings', 'PUT', { votingEndsAt: '2026-12-20T15:59:00.000Z' });
});
test('hidden creator cannot receive votes', async () => {
  await admin.req('/api/admin/creators/3', 'PATCH', { visible: false });
  assert.equal((await client.req('/api/votes', 'POST', { creatorId: 3 })).status, 404);
});
test('HTML/SVG photo is rejected', async () => {
  const body = { name: 'Bad Photo', email: 'photo@example.com', phone: '081234567891', handle: '@badphoto', categoryId: 1, bio: '', consent: true, answers: { city: 'Mataram' }, photoData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' };
  assert.equal((await client.req('/api/register', 'POST', body)).status, 400);
});
test('valid raster photo is resized and rewritten to an opaque random WebP', async () => {
  const source = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: '#a47b3c' } }).jpeg().toBuffer();
  const body = { name: 'Photo Uji', email: 'raster@example.com', phone: '081234567892', handle: '@photouji', categoryId: 1, bio: '', consent: true, answers: { city: 'Mataram' }, photoData: `data:image/jpeg;base64,${source.toString('base64')}` };
  const result = await client.req('/api/register', 'POST', body);
  assert.equal(result.status, 202);
  const creator = db.prepare('SELECT photo,status FROM creators WHERE email=?').get(body.email);
  assert.match(creator.photo, /^\/uploads\/[a-f0-9]{48}\.webp$/);
  assert.equal(creator.status, 'pending');
  // Read bytes so libvips cannot retain a file handle during Windows cleanup.
  const metadata = await sharp(readFileSync(join(dir, 'uploads', basename(creator.photo)))).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 1000);
  assert.equal(metadata.exif, undefined);
});
test('creator editing is admin-only and preserves votes and private answers', async () => {
  const body = { name: 'Rizal Diperbarui', email: 'rizal@example.com', phone: '081234567899', handle: '@rizal.baru', bio: 'Bio baru', reviewNote: 'Nomor diverifikasi oleh panitia' };
  assert.equal((await client.req('/api/admin/creators/1', 'PATCH', body)).status, 401);
  assert.equal((await admin.req('/api/admin/creators/1', 'PATCH', body, { headers: { 'x-csrf-token': '' } })).status, 403);
  assert.equal((await admin.req('/api/admin/creators/1', 'PATCH', body)).status, 200);
  const creator = (await admin.req('/api/admin/dashboard')).data.creators.find(c => c.id === 1);
  assert.equal(creator.name, body.name); assert.equal(creator.review_note, body.reviewNote); assert.equal(creator.votes, 1);
  const publicCreator = (await client.req('/api/bootstrap')).data.creators.find(c => c.id === 1);
  assert.equal(publicCreator.bio, body.bio);
  for (const field of ['email', 'phone', 'answers', 'review_note', 'fieldSnapshot']) assert.ok(!(field in publicCreator));
});

test('category changes cannot move existing votes and fail atomically', async () => {
  const result = await admin.req('/api/admin/creators/1', 'PATCH', { categoryId: 2, name: 'Must not change' });
  assert.equal(result.status, 409);
  assert.equal(db.prepare('SELECT name,category_id FROM creators WHERE id=1').get().name, 'Rizal Diperbarui');
  assert.equal(db.prepare('SELECT category_id FROM votes WHERE creator_id=1').get().category_id, 1);
  assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { categoryId: 2 })).status, 200);
  assert.equal((await client.req('/api/bootstrap')).data.creators.find(c => c.id === 2).categoryId, 2);
});

test('duplicate emails and malformed profile updates preserve the original record', async () => {
  const before = db.prepare('SELECT * FROM creators WHERE id=2').get();
  assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { email: 'rizal@example.com', bio: 'Must not save' })).status, 409);
  for (const body of [{ name: '' }, { photo: 'https://evil.example/image.svg' }, { reviewNote: 'x'.repeat(2001) }, {}, { categoryId: 9999 }]) assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', body)).status, 400);
  assert.deepEqual(db.prepare('SELECT * FROM creators WHERE id=2').get(), before);
});

test('admin photo replacement, failed replacement and removal safely manage files', async () => {
  const png = await sharp({ create: { width: 50, height: 60, channels: 3, background: '#dcc28a' } }).png().toBuffer();
  const photoData = `data:image/png;base64,${png.toString('base64')}`;
  assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { photoData })).status, 200);
  const first = db.prepare('SELECT photo FROM creators WHERE id=2').get().photo;
  assert.match(first, /^\/uploads\/[a-f0-9]{48}\.webp$/);
  assert.ok(existsSync(join(dir, first)));
  const count = readdirSync(join(dir, 'uploads')).length;
  assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { photoData, email: 'rizal@example.com' })).status, 409);
  assert.equal(readdirSync(join(dir, 'uploads')).length, count);
  for (const data of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/jpeg;base64,bm90YW5pbWFnZQ==']) assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { photoData: data })).status, 400);
  assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { photoData, removePhoto: true })).status, 400);
  assert.equal(db.prepare('SELECT photo FROM creators WHERE id=2').get().photo, first);
  assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { photoData })).status, 200);
  const second = db.prepare('SELECT photo FROM creators WHERE id=2').get().photo;
  assert.notEqual(first, second); assert.ok(!existsSync(join(dir, first)));
  assert.equal((await client.req('/api/bootstrap')).data.creators.find(c => c.id === 2).photo, second);
  assert.equal((await admin.req('/api/admin/creators/2', 'PATCH', { removePhoto: true })).status, 200);
  assert.equal(db.prepare('SELECT photo FROM creators WHERE id=2').get().photo, null);
  assert.ok(!existsSync(join(dir, second)));
});

test('rejection and re-review remove nominees publicly while preserving recorded votes', async () => {
  assert.equal((await admin.req('/api/admin/creators/1', 'PATCH', { status: 'rejected', visible: true, reviewNote: 'Perlu verifikasi ulang' })).status, 200);
  assert.equal(db.prepare('SELECT visible FROM creators WHERE id=1').get().visible, 0);
  assert.ok(!(await client.req('/api/bootstrap')).data.creators.some(c => c.id === 1));
  assert.equal((await admin.req('/api/admin/creators/1', 'PATCH', { status: 'pending' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM votes WHERE creator_id=1').get().n, 1);
  assert.equal((await admin.req('/api/admin/creators/1', 'PATCH', { status: 'approved', visible: true })).status, 200);
});

test('category renaming and deactivation reach registration and voting without removing history', async () => {
  assert.equal((await admin.req('/api/admin/categories/2', 'PATCH', { name: 'Kuliner Lombok' })).status, 200);
  assert.equal((await admin.req('/api/admin/categories/2', 'PATCH', { name: 'Budaya' })).status, 409);
  assert.equal((await admin.req('/api/admin/categories/2', 'PATCH', { active: false })).status, 200);
  const data = (await client.req('/api/bootstrap')).data;
  assert.ok(!data.categories.some(c => c.id === 2)); assert.ok(!data.creators.some(c => c.categoryId === 2));
  assert.equal((await admin.req('/api/admin/creators/4', 'PATCH', { categoryId: 2 })).status, 400);
  assert.equal((await admin.req('/api/admin/categories/2', 'PATCH', { active: true })).status, 200);
  assert.equal((await client.req('/api/bootstrap')).data.creators.find(c => c.id === 2).category, 'Kuliner Lombok');
});

test('dashboard uses a continuous 14-day WITA window and operational counts', async () => {
  const insert = db.prepare('INSERT INTO votes(creator_id,category_id,voter_hash,ip_hash,created_at) VALUES(1,1,?,?,?)');
  insert.run('older-voter', 'test', '2026-09-01T00:00:00.000Z');
  insert.run('last-day-voter', 'test', '2026-10-05T16:10:00.000Z');
  insert.run('previous-day-voter', 'test', '2026-10-05T15:59:00.000Z');
  const d = (await admin.req('/api/admin/dashboard')).data;
  assert.equal(d.dailyVotes.length, 14); assert.equal(d.dailyVotes[0].date, '2026-09-23');
  assert.deepEqual(d.dailyVotes.at(-1), { date: '2026-10-06', count: 2 });
  assert.deepEqual(d.dailyVotes.at(-2), { date: '2026-10-05', count: 1 });
  assert.equal(d.dailyVotes.reduce((sum, day) => sum + day.count, 0), 3);
  assert.equal(d.stats.totalVotes, 4); assert.equal(d.stats.todayVotes, 2); assert.equal(d.stats.voterBrowsers, 4);
  assert.equal(d.stats.liveCreators, d.creators.filter(c => c.status === 'approved' && c.visible && d.categories.some(cat => cat.id === c.categoryId && cat.active)).length);
  assert.equal(d.stats.missingPhotos, d.creators.filter(c => c.status !== 'rejected' && !c.photo).length);
  assert.equal(d.generatedAt, '2026-10-06T00:00:00.000Z');
  assert.ok(d.audit.some(a => a.action === 'Profil creator diperbarui'));
});

test('logout invalidates privileged session', async () => {
  assert.equal((await admin.req('/api/admin/logout', 'POST', {})).status, 200);
  assert.equal((await admin.req('/api/admin/dashboard')).status, 401);
});
