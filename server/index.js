import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { createApp } from './app.js';

const servingBuild = process.argv.includes('--production');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
if (production && (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD)) throw new Error('Production memerlukan konfigurasi .env eksplisit.');
if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD) {
  if (!existsSync('.env')) {
    mkdirSync('.local', { recursive: true });
    const password = `Lcc-${randomBytes(12).toString('base64url')}!`;
    const secret = randomBytes(48).toString('hex');
    writeFileSync('.env', `PORT=${port}\nHOST=127.0.0.1\nAPP_ORIGIN=${origin}\nADMIN_EMAIL=admin@lccntb.id\nADMIN_PASSWORD=${password}\nSESSION_SECRET=${secret}\nDATABASE_PATH=./data/lcc.sqlite\n`, { mode: 0o600 });
    writeFileSync('.local/admin-access.txt', `Admin lokal LCC Awards\nURL: ${origin}/admin\nEmail: admin@lccntb.id\nPassword: ${password}\n\nKredensial khusus localhost. Ganti password melalui menu Pengaturan admin.\n`, { mode: 0o600 });
    process.env.ADMIN_PASSWORD = password; process.env.SESSION_SECRET = secret;
  } else throw new Error('Lengkapi ADMIN_PASSWORD dan SESSION_SECRET di .env.');
}
const uploadDir = resolve('public/uploads');
const { app, db } = createApp({ databasePath: resolve(process.env.DATABASE_PATH || 'data/lcc.sqlite'), origin, secret: process.env.SESSION_SECRET, adminEmail: process.env.ADMIN_EMAIL || 'admin@lccntb.id', adminPassword: process.env.ADMIN_PASSWORD, uploadDir, production });
app.use('/uploads', express.static(uploadDir, { dotfiles: 'deny', immutable: true, maxAge: '1d', setHeaders: res => res.set('Content-Security-Policy', "default-src 'none'") }));
if (servingBuild) {
  if (!existsSync('dist/index.html')) throw new Error('Jalankan npm run build terlebih dahulu.');
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(port, host, () => {
  console.log(`LCC Awards ready: ${origin}\nAdmin: ${origin}/admin\nAkses admin lokal: .local/admin-access.txt`);
});
server.on('error', error => { console.error(error.message); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
