import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { checkServerIdentity } from 'node:tls';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import { createApp } from '../server/app.js';

const origin = 'http://localhost:3039';
async function fixture(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lcc-security-'));
  const { app, db } = createApp({ databasePath: join(dir, 'db.sqlite'), uploadDir: join(dir, 'uploads'), origin, secret: 'security-test-'.repeat(8), adminEmail: 'admin@example.com', adminPassword: 'AdminTestPassword2026!', now: () => Date.parse('2026-10-17T00:00:00Z'), mailMode: 'local', ...options });
  const settings = JSON.parse(db.prepare('SELECT payload FROM settings').get().payload); settings.fields = []; db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(settings));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  function browser() {
    const cookies = new Map(); let csrf = '';
    return async (path, body) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), origin, 'content-type': 'application/json', 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
      for (const value of res.headers.getSetCookie()) { const pair = value.split(';')[0], i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
      const data = await res.json(); if (data.csrfToken) csrf = data.csrfToken; return { status: res.status, data };
    };
  }
  const request = browser(); await request('/api/bootstrap');
  return { dir, db, browser, request, async close() { await new Promise(resolve => server.close(resolve)); db.close(); assert.ok(dir.startsWith(join(tmpdir(), 'lcc-security-'))); rmSync(dir, { recursive: true, force: true }); } };
}
const registration = (proof, patch = {}) => ({ name: 'Peserta Privat', email: 'private@example.com', phone: '081234567890', gender: 'Perempuan', address: 'Jalan Langko 10 Mataram', socialAccounts: { instagram: '@privat' }, categoryId: 1, consent: true, answers: {}, paymentProofData: proof, photoData: proof, ...patch });

test('public payloads omit totals while admin retains counts and public popularity order', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 4; i++) f.db.prepare('INSERT INTO votes(creator_id,category_id,voter_hash,ip_hash,created_at) VALUES(?,?,?,?,?)').run(i < 3 ? 3 : 4, i < 3 ? 3 : 4, `voter-${i}`, 'ip', '2026-10-17T00:00:00Z');
    const publicData = (await f.request('/api/bootstrap')).data;
    assert.ok(publicData.creators.every(c => !('votes' in c)), 'anonymous bootstrap exposes counts');
    assert.equal(publicData.creators[0].id, 3);
    assert.equal((await f.request('/api/admin/dashboard')).status, 401);
    await f.request('/api/admin/login', { email: 'admin@example.com', password: 'AdminTestPassword2026!' });
    assert.ok((await f.request('/api/bootstrap')).data.creators.every(c => !('votes' in c)));
    const dashboard = (await f.request('/api/admin/dashboard')).data;
    assert.equal(dashboard.stats.totalVotes, 4); assert.equal(dashboard.creators.find(c => c.id === 3).votes, 3);
  } finally { await f.close(); }
});

test('new, duplicate, case-variant and concurrent registrations have one generic response', async () => {
  const f = await fixture();
  const proof = `data:image/png;base64,${(await sharp({ create: { width: 20, height: 30, channels: 3, background: '#d2b06b' } }).png().toBuffer()).toString('base64')}`;
  try {
    const first = await f.request('/api/register', registration(proof)); assert.equal(first.status, 202);
    for (const key of ['id', 'registrationNumber', 'otpRequested', 'code']) assert.ok(!(key in first.data), key);
    const stored = f.db.prepare('SELECT * FROM creators WHERE email=?').get('private@example.com');
    const files = [readdirSync(join(f.dir, 'uploads')), readdirSync(join(f.dir, 'receipts'))];
    const otp = f.db.prepare('SELECT * FROM participant_otps WHERE email=?').get(stored.email);
    const duplicate = await f.request('/api/register', registration(proof, { email: 'PRIVATE@example.com', name: 'Overwrite Attempt' }));
    assert.deepEqual(duplicate, first);
    assert.deepEqual(f.db.prepare('SELECT * FROM creators WHERE id=?').get(stored.id), stored);
    assert.deepEqual([readdirSync(join(f.dir, 'uploads')), readdirSync(join(f.dir, 'receipts'))], files);
    assert.deepEqual(f.db.prepare('SELECT * FROM participant_otps WHERE email=?').get(stored.email), otp);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM mail_outbox').get().n, 1);
    for (const email of ['private@example.com', 'absent@example.com']) {
      assert.equal((await f.request('/api/register', registration(proof, { email, paymentProofData: 'data:image/png;base64,AAA=' }))).status, 400);
    }
    const concurrent = await Promise.all([f.request('/api/register', registration(proof, { email: 'race@example.com' })), f.request('/api/register', registration(proof, { email: 'race@example.com' }))]);
    concurrent.forEach(result => assert.deepEqual(result, first));
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM creators WHERE email=?').get('race@example.com').n, 1);
    assert.equal(readdirSync(join(f.dir, 'receipts')).length, 2);
    const code = f.db.prepare('SELECT text FROM mail_outbox WHERE recipient=?').get(stored.email).text.match(/Kode OTP Anda: (\d{6})/)[1];
    assert.equal((await f.request('/api/participant/otp/verify', { email: stored.email, code })).status, 200);
    assert.equal((await f.request('/api/participant/me')).data.participant.registrationNumber, stored.registration_number);
  } finally { await f.close(); }
});

test('SMTP cannot downgrade to plaintext even when supplied unsafe options', async t => {
  const commands = []; let closed;
  const finished = new Promise(resolve => { closed = resolve; });
  const smtpServer = net.createServer(socket => {
    socket.setEncoding('utf8'); socket.write('220 loopback ESMTP\r\n'); let buffer = '', data = false;
    socket.on('close', closed); socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        const i = buffer.indexOf('\r\n'), line = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        if (data) { if (line === '.') { data = false; socket.write('250 accepted\r\n'); } continue; }
        const command = line.split(' ')[0]; commands.push(command);
        if (command === 'EHLO') socket.write('250-loopback\r\n250 AUTH PLAIN\r\n');
        else if (command === 'STARTTLS') socket.write('454 TLS unavailable\r\n');
        else if (command === 'AUTH') socket.write('235 authenticated\r\n');
        else if (command === 'DATA') { data = true; socket.write('354 send message\r\n'); }
        else if (command === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  smtpServer.listen(0, '127.0.0.1'); await new Promise(resolve => smtpServer.once('listening', resolve));
  t.mock.method(console, 'error', () => {});
  const f = await fixture({ mailMode: 'smtp', mailFrom: 'event@example.com', smtp: { host: '127.0.0.1', port: smtpServer.address().port, secure: false, auth: { user: 'synthetic-user', pass: 'synthetic-password' }, requireTLS: false, ignoreTLS: true, opportunisticTLS: true, tls: { rejectUnauthorized: false } } });
  try {
    f.db.prepare("UPDATE creators SET email='known@example.com',dummy=0 WHERE id=1").run();
    const known = await f.request('/api/participant/otp/request', { email: 'known@example.com' });
    const unknown = await f.request('/api/participant/otp/request', { email: 'unknown@example.com' });
    assert.deepEqual(known, unknown); assert.equal(known.status, 200);
    await Promise.race([finished, new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP did not close')), 2000).unref())]);
    assert.ok(commands.includes('STARTTLS')); assert.ok(!commands.includes('AUTH')); assert.ok(!commands.includes('MAIL')); assert.ok(!commands.includes('DATA'));
    assert.equal(f.db.prepare('SELECT sent_at FROM mail_outbox').get().sent_at, null);
  } finally { await f.close(); await new Promise(resolve => smtpServer.close(resolve)); }
});

test('OTP responds before delayed delivery and SMTP settings enforce certificate checks', async t => {
  let release, smtpOptions;
  const delivery = new Promise((_, reject) => { release = () => reject(new Error('test delivery failure')); });
  const original = nodemailer.createTransport;
  nodemailer.createTransport = options => { smtpOptions = options; return { sendMail: () => delivery }; };
  let f;
  try { f = await fixture({ mailMode: 'smtp', mailFrom: 'event@example.com', smtp: { host: 'loopback.invalid', port: 465, tls: { rejectUnauthorized: false, checkServerIdentity: () => undefined } } }); }
  finally { nodemailer.createTransport = original; }
  t.mock.method(console, 'error', () => {});
  let pending;
  try {
    f.db.prepare("UPDATE creators SET email='slow@example.com',dummy=0 WHERE id=1").run();
    pending = f.request('/api/participant/otp/request', { email: 'slow@example.com' });
    const response = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 750).unref())]);
    assert.ok(response, 'public response waited for SMTP delivery');
    assert.deepEqual(response, await f.request('/api/participant/otp/request', { email: 'absent@example.com' }));
    assert.equal(smtpOptions.secure, true); assert.equal(smtpOptions.requireTLS, true); assert.equal(smtpOptions.ignoreTLS, false); assert.equal(smtpOptions.opportunisticTLS, false); assert.equal(smtpOptions.tls.rejectUnauthorized, true);
    assert.equal(smtpOptions.tls.checkServerIdentity, checkServerIdentity);
    assert.equal(smtpOptions.tls.checkServerIdentity('loopback.invalid', { subjectaltname: 'DNS:other.invalid' }).code, 'ERR_TLS_CERT_ALTNAME_INVALID');
  } finally { release(); await pending; await new Promise(resolve => setImmediate(resolve)); await f.close(); }
});

test('SMTP URLs cannot override mandatory TLS through connection query options', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lcc-security-url-'));
  try {
    for (const pool of [false, true]) assert.throws(() => createApp({ databasePath: join(dir, 'db.sqlite'), uploadDir: join(dir, 'uploads'), origin, secret: 'security-test-'.repeat(8), adminEmail: 'admin@example.com', adminPassword: 'AdminTestPassword2026!', mailMode: 'smtp', mailFrom: 'event@example.com', smtp: { host: '127.0.0.1', pool, url: 'smtp://127.0.0.1:2525?requireTLS=false&ignoreTLS=true&tls.rejectUnauthorized=false' } }), /URL SMTP/);
  } finally { assert.ok(dir.startsWith(join(tmpdir(), 'lcc-security-url-'))); rmSync(dir, { recursive: true, force: true }); }
});
