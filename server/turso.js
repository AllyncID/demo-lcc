import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { asyncDatabase } from './async-db.js';
import { hashPassword } from './db.js';

export const productionSettings = {
  eventName: 'Lombok Content Creators Awards', year: '2026', location: 'Mataram, Lombok, NTB',
  registrationActive: true, votingActive: true,
  registrationStartsAt: '2026-11-01T04:00:00.000Z', registrationEndsAt: '2026-11-09T13:00:00.000Z',
  votingStartsAt: '2026-11-13T04:00:00.000Z', votingEndsAt: '2026-11-23T13:00:00.000Z',
  fields: [
    { id: 'domisili', label: 'Domisili', type: 'select', required: true, options: ['Mataram', 'Lombok Barat', 'Lombok Tengah', 'Lombok Timur', 'Lombok Utara', 'Luar Lombok'] },
    { id: 'portfolio', label: 'Link karya terbaik', type: 'url', required: false, options: [] }
  ]
};

export async function openTurso({ url, authToken, adminEmail, adminPassword }) {
  if (!url || !authToken) throw new Error('TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN wajib diisi.');
  const client = createClient({ url, authToken });
  const db = asyncDatabase(client, { remote: true });
  try {
    await initializeTurso(db, adminEmail, adminPassword);
    return db;
  } catch (error) { client.close(); throw error; }
}

export async function initializeTurso(db, email, password) {
  // A cold start checks the version without taking a write lock once initialized.
  const schema = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (schema && await db.prepare('SELECT version FROM schema_migrations WHERE version=6').get()) return;
  await db.exec(readFileSync(new URL('./migrations/001-initial.sql', import.meta.url), 'utf8'));
  await db.transaction(async () => {
    const timestamp = new Date().toISOString();
    await db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(1,?)').run(timestamp);
    for (const [version, file] of [[2,'002-review-notes.sql'],[3,'003-registration-payment.sql'],[4,'004-participant-tickets.sql'],[5,'005-social-creator-category.sql'],[6,'006-production.sql']]) {
      if (!await db.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version)) {
        await db.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
        await db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(version,timestamp);
      }
    }
    if (!await db.prepare('SELECT id FROM settings WHERE id=1').get()) {
      await db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify(productionSettings));
      for (const name of ['Wisata Explorer','Food Vlogger','Budaya','Edukasi','Komedi','Fashion','Religi','Musisi','Film','Berita & Narasi','Konten Kreator Sosial','Olahraga']) {
        await db.prepare('INSERT OR IGNORE INTO categories(name) VALUES(?)').run(name);
      }
    }
    if (!await db.prepare('SELECT id FROM admins LIMIT 1').get()) {
      if (!email || !password || password.length < 16) throw new Error('Akun admin produksi harus memakai password minimal 16 karakter.');
      await db.prepare('INSERT INTO admins VALUES(1,?,?)').run(email.toLowerCase(), hashPassword(password));
    }
  });
}
