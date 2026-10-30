import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve as resolvePath, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createApp } from './app.js';
import { seedClientDemo } from './demo-fixtures.js';

// shortcut: per-browser snapshots support client review only; use a persistent database for live events.
export function createDemoHandler({ storage, secret, adminEmail, adminPassword, secure = true }) {
  if (!secret || secret.length < 32 || !adminPassword || adminPassword.length < 12) throw new Error('Demo secrets are missing.');
  const gateway = express(), pending = new Map();
  gateway.disable('x-powered-by');
  gateway.set('trust proxy', 1);
  // Vercel pre-parses unsigned cookies; verify our cookies from the original header.
  gateway.use((req, res, next) => { delete req.cookies; delete req.signedCookies; next(); });
  gateway.use(cookieParser(secret));
  gateway.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Terlalu banyak permintaan demo. Coba lagi satu menit.' } }));
  gateway.use(async (req, res) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    let id = req.signedCookies.lcc_demo;
    if (!id || !/^[a-f0-9]{48}$/.test(id)) {
      if (req.path !== '/api/bootstrap' || req.method !== 'GET') return res.status(401).json({ error: 'Muat ulang halaman untuk memulai demo.' });
      id = randomBytes(24).toString('hex');
      res.cookie('lcc_demo', id, { signed: true, httpOnly: true, sameSite: 'strict', secure, maxAge: 86400000 });
    }
    const previous = pending.get(id) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    pending.set(id, current);
    await previous;
    const directory = mkdtempSync(join(tmpdir(), 'lcc-client-demo-'));
    let db;
    try {
      const stored = await storage.read(`client-demo/v1/${id}.json.gz`);
      const databasePath = join(directory, 'demo.sqlite'), uploadDir = join(directory, 'uploads'), receiptDir = join(directory, 'receipts');
      for (const folder of [uploadDir, receiptDir]) mkdirSync(folder, { recursive: true });
      if (stored) {
        const snapshot = JSON.parse(gunzipSync(stored.body, { maxOutputLength: 20 * 1024 * 1024 }));
        writeFileSync(databasePath, Buffer.from(snapshot.database, 'base64'));
        for (const [name, contents] of Object.entries(snapshot.files)) {
          if (!/^(uploads|receipts)\/[a-f0-9]{48}\.webp$/.test(name)) throw new Error('Invalid demo snapshot file.');
          writeFileSync(join(directory, name), Buffer.from(contents, 'base64'));
        }
      }
      const origin = `${secure ? 'https' : 'http'}://${req.get('host')}`;
      const instance = createApp({ databasePath, uploadDir, receiptDir, origin, secret, adminEmail, adminPassword, production: secure, mailMode: 'local', demoMode: true });
      db = instance.db;
      if (!stored) await seedClientDemo(db, receiptDir);
      instance.app.set('trust proxy', 1);
      instance.app.use('/uploads', express.static(uploadDir, { dotfiles: 'deny' }));
      const end = res.end.bind(res), write = res.write.bind(res), chunks = [];
      let ending = false;
      res.write = (chunk, encoding, callback) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined)); (typeof encoding === 'function' ? encoding : callback)?.(); return true; };
      await new Promise((resolve, reject) => {
        res.end = (chunk, encoding, callback) => {
          if (ending) return res;
          ending = true;
          if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
          void (async () => {
            // Include startup migrations when persisting an existing demo snapshot.
            const changed = !stored || db.prepare('SELECT total_changes() AS count').get().count > 0;
            db.close(); db = undefined;
            if (changed) {
              const files = {};
              for (const folder of ['uploads', 'receipts']) for (const name of readdirSync(join(directory, folder))) files[`${folder}/${name}`] = readFileSync(join(directory, folder, name)).toString('base64');
              const body = gzipSync(JSON.stringify({ database: readFileSync(databasePath).toString('base64'), files }));
              await storage.write(`client-demo/v1/${id}.json.gz`, body, stored?.etag);
            }
            res.write = write; res.end = end;
            end(Buffer.concat(chunks), typeof encoding === 'function' ? encoding : callback);
            resolve();
          })().catch(reject);
          return res;
        };
        instance.app(req, res, () => res.status(404).json({ error: 'Halaman tidak ditemukan.' }));
      }).catch(error => {
        res.write = write; res.end = end;
        for (const name of ['Content-Length', 'Content-Disposition', 'ETag', 'Set-Cookie']) res.removeHeader(name);
        const conflict = error.status === 409 || error.name === 'BlobPreconditionFailedError';
        res.status(conflict ? 409 : 503).type('json').json({ error: conflict ? 'Demo diperbarui di tab lain. Muat ulang lalu coba lagi.' : 'Penyimpanan demo sedang tidak tersedia. Coba lagi sebentar.' });
      });
    } catch (error) {
      console.error('Demo request failed:', error.message);
      res.removeHeader('Set-Cookie');
      if (!res.headersSent) res.status(503).json({ error: 'Demo belum siap. Coba lagi sebentar.' });
    } finally {
      db?.close();
      if (dirname(resolvePath(directory)) !== resolvePath(tmpdir()) || !basename(directory).startsWith('lcc-client-demo-')) throw new Error('Unsafe temporary directory.');
      rmSync(directory, { recursive: true, force: true });
      release();
      if (pending.get(id) === current) pending.delete(id);
    }
  });
  return gateway;
}
