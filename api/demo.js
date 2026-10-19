import { get, put } from '@vercel/blob';
import { createDemoHandler } from '../server/vercel-demo.js';

let handler;
export default async function demo(req, res) {
  if (!handler) {
    try {
      handler = createDemoHandler({
        secret: process.env.SESSION_SECRET,
        adminEmail: process.env.DEMO_ADMIN_EMAIL || 'admin@demo.lcc.invalid',
        adminPassword: process.env.DEMO_ADMIN_PASSWORD,
        storage: {
          async read(key) {
            const result = await get(key, { access: 'private', useCache: false });
            return result ? { etag: result.blob.etag, body: Buffer.from(await new Response(result.stream).arrayBuffer()) } : null;
          },
          async write(key, body, etag) {
            await put(key, body, { access: 'private', addRandomSuffix: false, allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}), contentType: 'application/gzip' });
          }
        }
      });
    } catch {
      return res.status(503).json({ error: 'Konfigurasi demo belum lengkap.' });
    }
  }
  return handler(req, res);
}
