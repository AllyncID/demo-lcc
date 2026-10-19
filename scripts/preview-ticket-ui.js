import express from 'express';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../server/app.js';

// Disposable UI preview: separate database, uploads and local mail only.
const directory = mkdtempSync(join(tmpdir(), 'lcc-ticket-ui-'));
const uploadDir = join(directory, 'uploads');
const origin = 'http://localhost:3012';
const { app, db } = createApp({ databasePath: join(directory, 'preview.sqlite'), uploadDir, origin, secret: randomBytes(48).toString('hex'), adminEmail: 'qa-admin@example.invalid', adminPassword: 'QaTicketsOnly!2026', mailMode: 'local' });
const settings = JSON.parse(db.prepare('SELECT payload FROM settings').get().payload);
settings.fields = [];
db.prepare('UPDATE settings SET payload=?').run(JSON.stringify(settings));
const proofPath = join(directory, 'contoh-bukti.png');
await sharp({ create: { width: 650, height: 900, channels: 3, background: '#10100f' } }).composite([{ input: Buffer.from('<svg width="650" height="900"><text x="325" y="380" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#d2af62">SIMULASI PEMBAYARAN</text><text x="325" y="440" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#fff">Bukan transaksi sungguhan</text></svg>') }]).png().toFile(proofPath);
writeFileSync(resolve('.local/ticket-ui-preview.json'), JSON.stringify({ directory, proofPath }, null, 2));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(resolve('dist')));
app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
const server = app.listen(3012, '127.0.0.1', () => console.log(`Preview peserta: ${origin}/register\nBukti simulasi: ${proofPath}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
