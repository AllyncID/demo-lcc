import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export async function seedClientDemo(db, receiptDir) {
  const now = Date.now(), timestamp = new Date(now).toISOString();
  const settings = JSON.parse(db.prepare('SELECT payload FROM settings WHERE id=1').get().payload);
  Object.assign(settings, { registrationStartsAt: new Date(now - 86400000).toISOString(), registrationEndsAt: new Date(now + 90 * 86400000).toISOString(), votingStartsAt: new Date(now - 86400000).toISOString(), votingEndsAt: new Date(now + 90 * 86400000).toISOString() });
  db.prepare('UPDATE settings SET payload=? WHERE id=1').run(JSON.stringify(settings));
  const filename = `${randomBytes(24).toString('hex')}.webp`;
  writeFileSync(join(receiptDir, filename), await sharp(Buffer.from('<svg width="650" height="900"><rect width="650" height="900" fill="#141412"/><text x="325" y="420" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#d2b06b">BUKTI PEMBAYARAN DEMO</text><text x="325" y="470" text-anchor="middle" font-family="sans-serif" font-size="20" fill="white">Bukan transaksi sungguhan</text></svg>')).webp().toBuffer());
  const payment = JSON.stringify({ provider: 'DANA', amount: 49500, accountNumber: '000000000000', accountName: 'SIMULASI — JANGAN TRANSFER', demo: true });
  for (const [name, email, status, paymentStatus] of [
    ['Peserta Demo', 'peserta@demo.lcc.invalid', 'approved', 'verified'],
    ['Creator Demo — Menunggu review', 'review@demo.lcc.invalid', 'pending', 'pending'],
    ['Creator Demo — Perlu revisi', 'revisi@demo.lcc.invalid', 'rejected', 'rejected']
  ]) {
    const id = Number(db.prepare('INSERT INTO creators(name,email,phone,handle,category_id,bio,photo,status,dummy,visible,created_at,payment_proof,payment_snapshot,payment_status) VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?,?)').run(name, email, '', '@peserta.demo', 4, 'Profil contoh untuk pratinjau client, bukan peserta sungguhan.', '/assets/creators/creator-5.jpg', status, status === 'approved' ? 1 : 0, timestamp, `/receipts/${filename}`, payment, paymentStatus).lastInsertRowid);
    const number = `LCC-${String(id).padStart(6, '0')}`;
    db.prepare('UPDATE creators SET registration_number=? WHERE id=?').run(number, id);
    if (status === 'approved') db.prepare('INSERT INTO tickets(creator_id,token,number,issued_at) VALUES(?,?,?,?)').run(id, randomBytes(32).toString('base64url'), `TKT-${number}`, timestamp);
  }
  for (let day = 0; day < 14; day++) {
    for (let i = 0; i < (day % 5) + 1; i++) db.prepare('INSERT INTO votes(creator_id,category_id,voter_hash,ip_hash,created_at) VALUES(?,?,?,?,?)').run(1, 1, `synthetic-${day}-${i}`, 'synthetic', new Date(now - day * 86400000).toISOString());
  }
  db.prepare('INSERT INTO audit_events(action,detail,created_at) VALUES(?,?,?)').run('Demo disiapkan', 'Semua data adalah contoh; perubahan terpisah per browser.', timestamp);
}
