import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';
import { z } from 'zod';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import nodemailer from 'nodemailer';
import { savePhoto, removePhoto, PhotoError } from './photos.js';

const emailSchema = z.email().max(254).transform(value => value.toLowerCase());
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const eligible = creator => creator.status === 'approved' && creator.payment_status === 'verified' && !creator.dummy;
const xml = value => String(value ?? '').replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]));

export function createTicketService({ app, db, config, digest, cookieOptions, requireAdmin, readSettings, audit, receiptDir, registrationPayment }) {
  const { now = Date.now, origin, production = false } = config;
  const deliveryMode = config.mailMode || process.env.MAIL_MODE || (production ? 'smtp' : 'local');
  // The isolated synthetic client demo has no real email delivery.
  if (!['local', 'smtp', 'unconfigured'].includes(deliveryMode) || (deliveryMode === 'unconfigured' && !config.database) || (production && deliveryMode === 'local' && !config.demoMode)) throw new Error('MAIL_MODE lokal hanya tersedia di luar production. Gunakan SMTP untuk production.');
  const smtp = config.smtp || { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : undefined, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined };
  const from = config.mailFrom || process.env.MAIL_FROM;
  if (deliveryMode === 'smtp' && (!smtp.host || !from)) throw new Error('SMTP membutuhkan SMTP_HOST dan MAIL_FROM.');
  // Nodemailer URL query options override explicit transport security flags.
  if (deliveryMode === 'smtp' && smtp.url !== undefined) throw new Error('Konfigurasi URL SMTP tidak didukung. Gunakan host, port, dan opsi SMTP terpisah.');
  const transport = deliveryMode === 'smtp' ? nodemailer.createTransport({ ...smtp, secure: smtp.secure ?? Number(smtp.port) === 465, requireTLS: true, ignoreTLS: false, opportunisticTLS: false, tls: { ...smtp.tls, rejectUnauthorized: true, checkServerIdentity }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 }) : null;
  const iso = () => new Date(now()).toISOString();
  const urlFor = ticket => `${origin}/tiket/verifikasi/${ticket.token}`;
  const ticketFor = async creatorId => (await db.prepare('SELECT * FROM tickets WHERE creator_id=?').get(creatorId));
  const ticketDTOFromRow = (creator, ticket) => {
    return ticket && eligible(creator) ? { id: ticket.id, number: ticket.number, issuedAt: ticket.issued_at, checkedInAt: ticket.checked_in_at, verificationUrl: urlFor(ticket), qrImageUrl: '/api/participant/qr.png', pngUrl: '/api/participant/ticket.png', pdfUrl: '/api/participant/ticket.pdf' } : null;
  };
  const ticketDTO = async creator => ticketDTOFromRow(creator, await ticketFor(creator.id));
  async function sendMail(key, to, subject, text) {
    (await db.prepare('INSERT OR IGNORE INTO mail_outbox(dedupe_key,recipient,subject,text,created_at) VALUES(?,?,?,?,?)').run(key, to, subject, text, iso()));
    const mail = (await db.prepare('SELECT * FROM mail_outbox WHERE dedupe_key=?').get(key));
    if (!mail.sent_at) {
      if (transport) await transport.sendMail({ from, to, subject, text });
      (await db.prepare('UPDATE mail_outbox SET sent_at=? WHERE id=?').run(iso(), mail.id));
    }
  }
  async function limit(key, maximum, window, cooldown = 0) {
    const time = now();
    const row = await db.prepare(`INSERT INTO participant_limits VALUES(?,1,?,?) ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN started_at<=? THEN 1 ELSE count+1 END,
      started_at=CASE WHEN started_at<=? THEN excluded.started_at ELSE started_at END,last_at=excluded.last_at
      WHERE started_at<=? OR (count<? AND last_at<=?) RETURNING count`)
      .get(key, time, time, time-window, time-window, time-window, maximum, time-cooldown);
    return !!row;
  }
  const requestLimits = async (email, ip) => {
    const ipAllowed = (await limit(digest(`otp-request-ip:${ip}`), 20, 3600000));
    const accountAllowed = (await limit(digest(`otp-request-email:${email}`), 5, 3600000, 60000));
    return ipAllowed && accountAllowed;
  };
  async function requestOTP(email, ip, initial = false) {
    const allowed = (await requestLimits(email, ip));
    if (!allowed && !initial) return false;
    const creator = (await db.prepare('SELECT * FROM creators WHERE email=? AND dummy=0').get(email));
    if (!creator) return true;
    const code = config.demoMode && email === 'peserta@demo.lcc.invalid' ? '202626' : String(randomInt(1000000)).padStart(6, '0');
    (await db.prepare('INSERT OR REPLACE INTO participant_otps VALUES(?,?,?,0)').run(email, digest(`otp:${email}:${code}`), now() + 10 * 60000));
    // Public responses must not depend on whether SMTP delivers to a registered address.
    const key = `otp:${randomBytes(24).toString('hex')}`;
    const text = `${initial ? `Pendaftaran ${creator.registration_number} sudah diterima dan menunggu peninjauan.\n\n` : ''}Kode OTP Anda: ${code}\nBerlaku 10 menit, maksimal 5 percobaan, dan hanya dapat digunakan sekali.\nBuka ${origin}/peserta\nJangan bagikan kode ini kepada siapa pun.`;
    await db.prepare('INSERT INTO mail_outbox(dedupe_key,recipient,subject,text,created_at) VALUES(?,?,?,?,?)').run(key,email,'OTP halaman peserta LCC Awards',text,iso());
    const delivery = sendMail(key, email, 'OTP halaman peserta LCC Awards', text).catch(error => console.error('OTP delivery failed:', error.message));
    if (config.waitUntil) config.waitUntil(delivery);
    else if (deliveryMode === 'local') await delivery;
    return true;
  }
  async function issueTicket(creator) {
    if (!eligible(creator)) return;
    const result = (await db.prepare('INSERT OR IGNORE INTO tickets(creator_id,token,number,issued_at) VALUES(?,?,?,?)').run(creator.id, randomBytes(32).toString('base64url'), `TKT-${creator.registration_number}`, iso()));
    return result.changes ? (await ticketFor(creator.id)) : undefined;
  }
  async function notifyTicket(creator, ticket) {
    await sendMail(`ticket:${ticket.id}`, creator.email, `Tiket LCC Awards — ${creator.registration_number}`, `Pendaftaran dan pembayaran Anda sudah disetujui.\nNomor peserta: ${creator.registration_number}\nNomor tiket: ${ticket.number}\nMasuk dengan OTP di ${origin}/peserta untuk mengunduh tiket PNG/PDF dan QR.\nTunjukkan tiket saat check-in. Satu tiket berlaku untuk satu kali check-in.`);
  }
  app.use('/api', async (req, res, next) => {
    const raw = req.signedCookies.lcc_participant;
    req.participant = raw ? (await db.prepare('SELECT c.* FROM participant_sessions s JOIN creators c ON c.id=s.creator_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(`participant:${raw}`), now())) : undefined;
    next();
  });
  const requireParticipant = (req, res, next) => req.participant ? next() : res.status(401).json({ error: 'Masuk dengan OTP email peserta terlebih dahulu.' });
  app.post('/api/participant/otp/request', async (req, res) => {
    if (deliveryMode === 'unconfigured') return res.status(503).json({ error: 'Layanan email peserta sedang disiapkan. Hubungi panitia melalui WhatsApp.' });
    const { email } = z.object({ email: emailSchema }).strict().parse(req.body);
    if (!await requestOTP(email, req.ip)) return res.status(429).json({ error: 'Permintaan kode dibatasi. Tunggu sebelum mencoba lagi.', resendAfter: 60 });
    res.json({ message: 'Jika email terdaftar, kode OTP telah dikirim. Periksa kotak masuk dan spam.', deliveryMode, resendAfter: 60 });
  });
  app.post('/api/participant/otp/verify', async (req, res) => {
    const { email, code } = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
    if (!(await limit(digest(`otp-verify-ip:${req.ip}`), 30, 15 * 60000))) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi 15 menit.' });
    const otp = (await db.prepare('SELECT * FROM participant_otps WHERE email=?').get(email));
    const expected = otp?.code_hash || digest('invalid-otp');
    const matches = timingSafeEqual(Buffer.from(digest(`otp:${email}:${code}`)), Buffer.from(expected));
    if (!otp || otp.expires_at <= now() || otp.attempts >= 5 || !matches) {
      if (otp) (await db.prepare('UPDATE participant_otps SET attempts=attempts+1 WHERE email=?').run(email));
      return res.status(401).json({ error: 'Kode OTP tidak valid atau sudah kedaluwarsa. Minta kode baru.' });
    }
    const creator = (await db.prepare('SELECT id FROM creators WHERE email=? AND dummy=0').get(email));
    if (!creator) return res.status(401).json({ error: 'Kode OTP tidak valid atau sudah kedaluwarsa. Minta kode baru.' });
    const token = randomBytes(32).toString('hex');
    const consumed = await db.transaction(async () => {
      const result = await db.prepare('DELETE FROM participant_otps WHERE email=? AND code_hash=? AND expires_at>? AND attempts<5 RETURNING email').get(email, expected, now());
      if (!result) return false;
      if (req.signedCookies.lcc_participant) (await db.prepare('DELETE FROM participant_sessions WHERE token_hash=?').run(digest(`participant:${req.signedCookies.lcc_participant}`)));
      (await db.prepare('DELETE FROM participant_sessions WHERE expires_at<=?').run(now()));
      (await db.prepare('INSERT INTO participant_sessions VALUES(?,?,?)').run(digest(`participant:${token}`), creator.id, now() + 8 * 3600000));
      return true;
    });
    if (!consumed) return res.status(401).json({ error: 'Kode OTP tidak valid atau sudah digunakan. Minta kode baru.' });
    res.cookie('lcc_participant', token, { ...cookieOptions, maxAge: 8 * 3600000 });
    res.json({ message: 'Verifikasi berhasil. Selamat datang di halaman peserta.' });
  });
  app.get('/api/participant/me', requireParticipant, async (req, res) => {
    const creator = req.participant;
    const category = (await db.prepare('SELECT name FROM categories WHERE id=?').get(creator.category_id)).name;
    res.json({ participant: { id: creator.id, registrationNumber: creator.registration_number, name: creator.name, email: creator.email, category, status: creator.status, paymentStatus: creator.payment_status, reviewNote: creator.review_note, createdAt: creator.created_at, photo: creator.photo }, ticket: (await ticketDTO(creator)), payment: Object.keys(JSON.parse(creator.payment_snapshot)).length ? JSON.parse(creator.payment_snapshot) : registrationPayment, deliveryMode });
  });
  app.post('/api/participant/logout', async (req, res) => {
    if (req.signedCookies.lcc_participant) (await db.prepare('DELETE FROM participant_sessions WHERE token_hash=?').run(digest(`participant:${req.signedCookies.lcc_participant}`)));
    res.clearCookie('lcc_participant', cookieOptions); res.json({ message: 'Anda telah keluar.' });
  });
  app.post('/api/participant/payment-proof', requireParticipant, async (req, res, next) => {
    if (config.demoMode) return res.status(403).json({ error: 'Ini demo client. Pengiriman bukti pembayaran asli dinonaktifkan.' });
    const { paymentProofData } = z.object({ paymentProofData: z.string().min(1).max(3000000) }).strict().parse(req.body);
    let receipt;
    try {
      if (req.participant.status !== 'rejected' && req.participant.payment_status !== 'rejected') return res.status(409).json({ error: 'Bukti pembayaran hanya dapat diganti setelah penolakan.' });
      receipt = await savePhoto(paymentProofData, receiptDir, { receipt: true });
      let creator;
      const accepted = await db.transaction(async () => {
        creator = (await db.prepare('SELECT * FROM creators WHERE id=?').get(req.participant.id));
        const changed = (await db.prepare("UPDATE creators SET payment_proof=?,payment_status='pending',status='pending',visible=0 WHERE id=? AND (status='rejected' OR payment_status='rejected')").run(receipt, creator.id));
        if (!changed.changes) return false;
        (await audit('Bukti pembayaran diganti peserta', `${creator.registration_number} (#${creator.id})`));
        return true;
      });
      if (!accepted) { await removePhoto(receipt, receiptDir); return res.status(409).json({ error: 'Status sudah berubah. Muat ulang halaman peserta.' }); }
      receipt = undefined;
      (await removePhoto(creator.payment_proof, receiptDir));
      res.json({ message: 'Bukti pembayaran baru diterima dan menunggu peninjauan.' });
    } catch (error) { (await removePhoto(receipt, receiptDir)); if (error instanceof PhotoError) return res.status(400).json({ error: error.message }); next(error); }
  });
  const downloadTicket = async (req, res, next) => {
    req.ticket = (await ticketFor(req.participant.id));
    if (!req.ticket || !eligible(req.participant)) return res.status(403).json({ error: 'Tiket tersedia setelah pendaftaran dan pembayaran disetujui.' });
    next();
  };
  app.get('/api/participant/qr.png', requireParticipant, downloadTicket, async (req, res) => {
    res.type('png').send(await QRCode.toBuffer(urlFor(req.ticket), { width: 600, margin: 4, errorCorrectionLevel: 'M' }));
  });
  app.get('/api/participant/ticket.png', requireParticipant, downloadTicket, async (req, res) => {
    const creator = req.participant, ticket = req.ticket, settings = (await readSettings());
    const category = (await db.prepare('SELECT name FROM categories WHERE id=?').get(creator.category_id)).name;
    const qr = await QRCode.toBuffer(urlFor(ticket), { width: 600, margin: 4, errorCorrectionLevel: 'M' });
    const title = settings.eventName.length > 30 ? [settings.eventName.slice(0, settings.eventName.lastIndexOf(' ', 30)), settings.eventName.slice(settings.eventName.lastIndexOf(' ', 30) + 1)] : [settings.eventName];
    const svg = `<svg width="1200" height="1700" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="1700" fill="#111111"/><rect x="50" y="50" width="1100" height="1600" fill="none" stroke="#d9b66f" stroke-width="3"/><g font-family="sans-serif" text-anchor="middle" fill="#f7f3eb"><text x="600" y="130" font-size="28" fill="#d9b66f">TIKET PESERTA · ${xml(settings.year)}</text>${title.map((line,i) => `<text x="600" y="${210 + i * 62}" font-size="52" font-weight="bold">${xml(line)}</text>`).join('')}<text x="600" y="360" font-size="27">${xml(settings.location)}</text><text x="600" y="465" font-size="44" font-weight="bold">${xml(creator.name.length > 40 ? creator.name.slice(0, 37) + '…' : creator.name)}</text><text x="600" y="525" font-size="28" fill="#d9b66f">${xml(category)}</text><text x="600" y="585" font-size="28">${xml(creator.registration_number)}</text><text x="600" y="1325" font-size="28">${xml(ticket.number)}</text><text x="600" y="1400" font-size="27">Tunjukkan QR ini kepada petugas saat check-in.</text><text x="600" y="1450" font-size="24" fill="#d9b66f">Satu tiket untuk satu kali check-in.</text><text x="600" y="1550" font-size="22">Simpan tiket ini secara pribadi.</text></g></svg>`;
    const png = await sharp(Buffer.from(svg)).composite([{ input: qr, top: 650, left: 300 }]).png().toBuffer();
    res.attachment(`${creator.registration_number}.png`).type('png').send(png);
  });
  app.get('/api/participant/ticket.pdf', requireParticipant, downloadTicket, async (req, res) => {
    const creator = req.participant, ticket = req.ticket, settings = (await readSettings());
    const qr = await QRCode.toBuffer(urlFor(ticket), { width: 600, margin: 4, errorCorrectionLevel: 'M' });
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = []; const completed = new Promise((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
    doc.rect(0, 0, 595.28, 841.89).fill('#111111'); doc.fillColor('#d9b66f').fontSize(15).text(`TIKET PESERTA | ${settings.year}`, { align: 'center' });
    doc.moveDown().fillColor('#f7f3eb').fontSize(30).text(settings.eventName, { align: 'center' });
    doc.moveDown(0.5).fontSize(12).text(settings.location, { align: 'center' });
    doc.moveDown(2).fontSize(22).text(creator.name, { align: 'center' });
    doc.moveDown(0.5).fillColor('#d9b66f').fontSize(14).text((await db.prepare('SELECT name FROM categories WHERE id=?').get(creator.category_id)).name, { align: 'center' });
    doc.moveDown().fillColor('#f7f3eb').text(creator.registration_number, { align: 'center' });
    const top = Math.max(340, doc.y + 20); doc.image(qr, (595.28 - 265) / 2, top, { width: 265 });
    doc.fontSize(12).text(ticket.number, 48, top + 280, { align: 'center' }).moveDown().text('Tunjukkan QR ini kepada petugas saat check-in.\nSatu tiket untuk satu kali check-in.\nSimpan tiket ini secara pribadi.', { align: 'center', lineGap: 6 });
    doc.end(); res.attachment(`${creator.registration_number}.pdf`).type('pdf').send(await completed);
  });
  app.get('/api/tickets/verify/:token', async (req, res) => {
    const parsed = tokenSchema.safeParse(req.params.token);
    const ticket = parsed.success ? (await db.prepare('SELECT * FROM tickets WHERE token=?').get(parsed.data)) : undefined;
    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    const creator = (await db.prepare('SELECT c.*,cat.name AS category FROM creators c JOIN categories cat ON cat.id=c.category_id WHERE c.id=?').get(ticket.creator_id));
    const valid = eligible(creator), settings = (await readSettings());
    const privileged = !!req.session?.admin_id || req.participant?.id === creator.id;
    res.json({ valid, status: !valid ? 'unavailable' : ticket.checked_in_at ? 'used' : 'valid', event: { name: settings.eventName, year: settings.year, location: settings.location }, ...(ticket.checked_in_at ? { checkedInAt: ticket.checked_in_at } : {}), canCheckIn: !!req.session?.admin_id && valid && !ticket.checked_in_at, ...(privileged ? { attendee: { name: creator.name, photo: creator.photo, category: creator.category, registrationNumber: creator.registration_number }, ticketNumber: ticket.number } : {}) });
  });
  app.get('/api/admin/tickets', requireAdmin, async (req, res) => {
    const rows = (await db.prepare('SELECT t.*,c.name,c.registration_number,c.status,c.payment_status,c.dummy,cat.name AS category FROM tickets t JOIN creators c ON c.id=t.creator_id JOIN categories cat ON cat.id=c.category_id ORDER BY t.id DESC').all());
    res.json({ tickets: rows.map(ticket => ({ token: ticket.token, number: ticket.number, registrationNumber: ticket.registration_number, name: ticket.name, category: ticket.category, status: !eligible(ticket) ? 'unavailable' : ticket.checked_in_at ? 'used' : 'valid', issuedAt: ticket.issued_at, checkedInAt: ticket.checked_in_at, verificationUrl: urlFor(ticket) })), stats: { issued: rows.length, checkedIn: rows.filter(ticket => ticket.checked_in_at).length } });
  });
  app.post('/api/admin/tickets/check-in', requireAdmin, async (req, res) => {
    const { token } = z.object({ token: tokenSchema }).strict().parse(req.body);
    const ticket = (await db.prepare('SELECT t.*,c.status,c.payment_status,c.dummy FROM tickets t JOIN creators c ON c.id=t.creator_id WHERE t.token=?').get(token));
    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    if (!eligible(ticket)) return res.status(403).json({ error: 'Tiket tidak tersedia. Periksa status persetujuan dan pembayaran.' });
    const checkedInAt = iso();
    const result = (await db.prepare("UPDATE tickets SET checked_in_at=?,checked_in_by=? WHERE token=? AND checked_in_at IS NULL AND EXISTS(SELECT 1 FROM creators c WHERE c.id=tickets.creator_id AND c.status='approved' AND c.payment_status='verified' AND c.dummy=0)").run(checkedInAt, req.session.admin_id, token));
    if (!result.changes) return res.status(409).json({ error: 'Tiket ini sudah digunakan untuk check-in.' });
    (await audit('Check-in peserta', `${ticket.number} (#${ticket.creator_id})`));
    res.json({ message: 'Check-in berhasil dicatat.', checkedInAt });
  });
  app.get('/api/admin/mail-outbox', requireAdmin, async (req, res) => {
    if ((production && !config.demoMode) || deliveryMode !== 'local') return res.status(404).json({ error: 'Kotak email lokal tidak tersedia.' });
    res.json({ mode: 'local', messages: (await db.prepare('SELECT id,recipient AS "to",subject,text,created_at AS createdAt FROM mail_outbox ORDER BY id DESC LIMIT 100').all()) });
  });
  return { deliveryMode, ticketDTO, ticketDTOFromRow, requestOTP, issueTicket, notifyTicket };
}
