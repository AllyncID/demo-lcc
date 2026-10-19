import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createDemoHandler } from '../server/vercel-demo.js';

function memoryStorage() {
  const records = new Map();
  let revision = 0;
  return {
    failWrites: false,
    conflict: false,
    async read(key) { return records.get(key) || null; },
    async write(key, body, etag) {
      if (this.failWrites) throw new Error('Storage unavailable');
      if (this.conflict || (records.get(key)?.etag !== etag)) {
        const error = new Error('Conflict'); error.status = 409; throw error;
      }
      records.set(key, { body, etag: String(++revision) });
    }
  };
}
async function launch(t, storage) {
  const app = express();
  app.use(createDemoHandler({ storage, secret: 'test-demo-secret-'.repeat(4), adminEmail: 'admin@demo.lcc.invalid', adminPassword: 'Demo-Admin-2026!', secure: false }));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
function client() {
  const cookies = new Map();
  let csrf = '';
  return async (base, path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), origin: base, 'x-csrf-token': csrf, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    for (const cookie of response.headers.getSetCookie()) { const [pair] = cookie.split(';'); const i = pair.indexOf('='); cookies.set(pair.slice(0,i), pair.slice(i+1)); }
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: response.status, data, headers: response.headers };
  };
}

test('Vercel demo keeps authenticated admin, participant and votes across cold starts while isolating browsers', async t => {
  const storage = memoryStorage();
  const base = await launch(t, storage), otherInstance = await launch(t, storage);
  const call = client(), stranger = client();
  const bootstrap = await call(base, '/api/bootstrap');
  assert.equal(bootstrap.status, 200);
  assert.equal(bootstrap.data.demoMode, true);
  assert.equal(bootstrap.data.registrationPayment.demo, true);
  assert.equal(bootstrap.data.registrationPayment.accountNumber, '000000000000');
  assert.ok(bootstrap.data.creators.every(c => !Object.hasOwn(c, 'votes')));
  assert.equal((await call(base, '/api/admin/login', 'POST', { email: 'admin@demo.lcc.invalid', password: 'Demo-Admin-2026!' })).status, 200);
  assert.equal((await call(otherInstance, '/api/admin/dashboard')).status, 200);
  assert.equal((await stranger(otherInstance, '/api/bootstrap')).status, 200);
  assert.equal((await stranger(base, '/api/admin/dashboard')).status, 401);
  const choice = bootstrap.data.creators[0];
  assert.equal((await call(base, '/api/votes', 'POST', { creatorId: choice.id })).status, 201);
  assert.equal((await call(otherInstance, '/api/votes', 'POST', { creatorId: choice.id })).status, 409);
  assert.equal((await stranger(otherInstance, '/api/bootstrap')).data.votedCategories.length, 0);
  assert.equal((await call(otherInstance, '/api/participant/otp/request', 'POST', { email: 'peserta@demo.lcc.invalid' })).status, 200);
  assert.equal((await call(base, '/api/participant/otp/verify', 'POST', { email: 'peserta@demo.lcc.invalid', code: '202626' })).status, 200);
  const participant = await call(otherInstance, '/api/participant/me');
  assert.equal(participant.status, 200);
  assert.equal(participant.data.participant.name, 'Peserta Demo');
  assert.ok(participant.data.ticket.number);
  const png = await call(base, '/api/participant/qr.png');
  assert.equal(png.status, 200);
  assert.equal(png.data.subarray(1,4).toString(), 'PNG');
  assert.equal((await stranger(base, '/api/participant/me')).status, 401);
  assert.equal((await call(base, '/api/register', 'POST', { email: 'real@example.com' })).status, 403);
  for (const path of ['/api/register/', '/API/REGISTER', '/api/participant/payment-proof/', '/API/PARTICIPANT/PAYMENT-PROOF']) assert.equal((await call(base, path, 'POST', { email: 'real@example.com' })).status, 403, path);
});

test('demo never acknowledges an unpersisted write or overwrites a concurrent snapshot', async t => {
  const storage = memoryStorage(), base = await launch(t, storage), call = client();
  await call(base, '/api/bootstrap');
  storage.failWrites = true;
  assert.equal((await call(base, '/api/admin/login', 'POST', { email: 'admin@demo.lcc.invalid', password: 'Demo-Admin-2026!' })).status, 503);
  storage.failWrites = false;
  assert.equal((await call(base, '/api/admin/dashboard')).status, 401);
  storage.conflict = true;
  assert.equal((await call(base, '/api/votes', 'POST', { creatorId: 1 })).status, 409);
  storage.conflict = false;
  assert.equal((await call(base, '/api/bootstrap')).data.votedCategories.length, 0);
});
