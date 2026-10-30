import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, hash) {
  const [algorithm, salt, expected] = hash.split(':');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const input = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return input.length === target.length && timingSafeEqual(input, target);
}
export function openDatabase(path, email, password) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('./migrations/001-initial.sql', import.meta.url), 'utf8'));
  const timestamp = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES(1,?)').run(timestamp);
  if (!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL('./migrations/002-review-notes.sql', import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES(2,?)').run(timestamp);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (!db.prepare('SELECT id FROM admins LIMIT 1').get()) {
    if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD minimal 12 karakter untuk database baru.');
    db.prepare('INSERT INTO admins(id,email,password_hash) VALUES(1,?,?)').run(email.toLowerCase(), hashPassword(password));
  }
  if (!db.prepare('SELECT id FROM settings').get()) {
    db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify({
      eventName: 'Lombok Content Creators Awards', year: '2026', location: 'Mataram, Lombok, NTB',
      registrationActive: true, votingActive: true,
      registrationStartsAt: '2026-10-01T00:00:00.000Z', registrationEndsAt: '2026-11-30T15:59:00.000Z',
      votingStartsAt: '2026-10-01T00:00:00.000Z', votingEndsAt: '2026-12-15T15:59:00.000Z',
      fields: [
        { id: 'domisili', label: 'Domisili', type: 'select', required: true, options: ['Mataram', 'Lombok Barat', 'Lombok Tengah', 'Lombok Timur', 'Lombok Utara', 'Luar Lombok'] },
        { id: 'portfolio', label: 'Link karya terbaik', type: 'url', required: false, options: [] }
      ]
    }));
    const names = ['Wisata & Explorer', 'Kuliner', 'Budaya', 'Edukasi', 'Komedi', 'Fashion & Lifestyle', 'Religi', 'Musik'];
    for (const name of names) db.prepare('INSERT INTO categories(name) VALUES(?)').run(name);
    const nominees = [
      ['Rizal Pratama', '@rizal.jalanjalan', 1, 'Merekam sudut Lombok, satu perjalanan dalam satu waktu.'],
      ['Aulia Zahra', '@aulia.explores', 1, 'Cerita perjalanan dan tempat-tempat kecil yang berarti.'],
      ['Nadia Putri', '@nadia.kuliner', 2, 'Menemukan rasa dan cerita di balik dapur Lombok.'],
      ['Fajar Ramadhan', '@fajar.sasak', 3, 'Membawa cerita dan tradisi Sasak ke layar generasi baru.'],
      ['Dinda Maharani', '@dinda.belajar', 4, 'Belajar hal baru lewat konten sederhana sehari-hari.'],
      ['Arif Hidayat', '@arif.bercerita', 5, 'Potongan keseharian yang bikin kita tersenyum.'],
      ['Salsabila', '@salsa.daily', 6, 'Gaya personal, karya lokal, dan cerita sehari-hari.'],
      ['Bagas Saputra', '@bagas.musik', 8, 'Nada, suara, dan karya yang lahir dari pulau ini.']
    ];
    nominees.forEach(([name, handle, categoryId, bio], i) => db.prepare('INSERT INTO creators(name,email,phone,handle,category_id,bio,photo,status,dummy,created_at) VALUES(?,?,?,?,?,?,?,\'approved\',1,?)').run(name, `dummy${i + 1}@example.invalid`, '', handle, categoryId, bio, `/assets/creators/creator-${i + 1}.jpg`, timestamp));
  }
  if (!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL('./migrations/003-registration-payment.sql', import.meta.url), 'utf8'));
      for (const [oldName, name] of [['Wisata & Explorer', 'Wisata Explorer'], ['Kuliner', 'Food Vlogger'], ['Musik', 'Musisi'], ['Fashion & Lifestyle', 'Fashion']]) {
        if (!db.prepare('SELECT id FROM categories WHERE name=?').get(name)) db.prepare('UPDATE categories SET name=? WHERE name=?').run(name, oldName);
      }
      for (const name of ['Edukasi', 'Komedi', 'Religi', 'Budaya', 'Food Vlogger', 'Wisata Explorer', 'Film', 'Musisi', 'Fashion', 'Berita & Narasi']) db.prepare('INSERT OR IGNORE INTO categories(name) VALUES(?)').run(name);
      db.prepare('INSERT INTO schema_migrations VALUES(3,?)').run(timestamp);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (!db.prepare('SELECT version FROM schema_migrations WHERE version=4').get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL('./migrations/004-participant-tickets.sql', import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES(4,?)').run(timestamp);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (!db.prepare('SELECT version FROM schema_migrations WHERE version=5').get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(new URL('./migrations/005-social-creator-category.sql', import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES(5,?)').run(timestamp);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return db;
}
