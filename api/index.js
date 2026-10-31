import { waitUntil } from '@vercel/functions';
import { createApp } from '../server/app.js';
import { openTurso } from '../server/turso.js';
import { blobFiles } from '../server/blob-files.js';
import { createHmac } from 'node:crypto';

let application;
async function initialize() {
  const database = await openTurso({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN, adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD });
  const files = blobFiles();
  const origin = process.env.APP_ORIGIN || 'https://lcc-ntb.com';
  const { app } = createApp({ database, files, origin, allowedOrigins: ['https://lcc-ntb.com','https://www.lcc-ntb.com','https://demo-lcc.vercel.app'], secret: process.env.PRODUCTION_SESSION_SECRET, production: true, trustProxy: 1, mailMode: process.env.SMTP_HOST && process.env.MAIL_FROM ? 'smtp' : 'unconfigured', waitUntil });
  app.get('/uploads/:filename', async (req, res) => {
    const path = `/uploads/${req.params.filename}`;
    if (!/^\/uploads\/[a-f0-9]{48}\.webp$/.test(path)) return res.sendStatus(404);
    const creator = await database.prepare('SELECT id,status,visible FROM creators WHERE photo=?').get(path);
    if (!creator) return res.sendStatus(404);
    const publicPhoto = creator.status === 'approved' && creator.visible;
    if (!publicPhoto) {
      const token = req.signedCookies.lcc_session;
      const hash = token && createHmac('sha256', process.env.PRODUCTION_SESSION_SECRET).update(token).digest('hex');
      const admin = hash && await database.prepare('SELECT admin_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash,Date.now());
      if (!admin?.admin_id) return res.sendStatus(404);
    }
    const body = await files.read(path);
    if (!body) return res.sendStatus(404);
    res.set({ 'Cache-Control': publicPhoto ? 'public, max-age=3600' : 'private, no-store', 'Content-Type':'image/webp' }).send(body);
  });
  return app;
}
export default async function handler(req, res) {
  try {
    application ||= initialize().catch(error => { application = undefined; throw error; });
    const app = await application;
    return app(req,res);
  } catch (error) {
    console.error('Production initialization failed:', error.name);
    res.status(503).json({ error: 'Layanan sedang disiapkan. Silakan coba kembali.' });
  }
}
