import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, hashPassword } from '../server/db.js';

test('existing v1 database migrates once without losing registration, votes or admin access', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lcc-migrate-')); const path = join(dir, 'old.sqlite'); let db;
  try {
    db = new DatabaseSync(path);
    db.exec(readFileSync(new URL('../server/migrations/001-initial.sql', import.meta.url), 'utf8'));
    const hash = hashPassword('ExistingPassword123!');
    db.prepare('INSERT INTO admins VALUES(1,?,?)').run('existing@example.com', hash);
    db.prepare('INSERT INTO settings VALUES(1,?)').run('{"eventName":"Existing event"}');
    db.prepare('INSERT INTO categories(name) VALUES(?)').run('Existing category');
    db.prepare('INSERT INTO creators(name,email,phone,handle,category_id,created_at) VALUES(?,?,?,?,1,?)').run('Existing creator', 'creator@example.com', '081234567890', '@existing', '2026-01-01');
    db.prepare('INSERT INTO votes(creator_id,category_id,voter_hash,ip_hash,created_at) VALUES(1,1,?,?,?)').run('voter', 'ip', '2026-01-01');
    db.close(); db = openDatabase(path, 'unused@example.com', 'UnusedPassword123!');
    assert.equal(db.prepare('SELECT review_note FROM creators WHERE id=1').get().review_note, '');
    db.prepare('UPDATE creators SET review_note=? WHERE id=1').run('Saved note');
    db.close(); db = openDatabase(path, 'unused@example.com', 'UnusedPassword123!');
    assert.equal(db.prepare('SELECT review_note FROM creators WHERE id=1').get().review_note, 'Saved note');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM votes').get().n, 1);
    assert.equal(db.prepare('SELECT password_hash FROM admins WHERE id=1').get().password_hash, hash);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version=2').get().n, 1);
    assert.equal(db.prepare('SELECT payment_status FROM creators WHERE id=1').get().payment_status, 'not_required');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version=3').get().n, 1);
  } finally { db?.close(); rmSync(dir, { recursive: true, force: true }); }
});
