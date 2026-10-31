import express from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { openDatabase, hashPassword, verifyPassword } from './db.js';
import { settingsSchema, fieldSchema, registrationSchema, creatorUpdateSchema, validateAnswers, campaignOpen, activeAnnouncement } from './validation.js';
import { savePhoto, removePhoto, PhotoError } from './photos.js';
import { privateFileRequest } from './private-files.js';
import { createTicketService } from './tickets.js';
import { asyncDatabase } from './async-db.js';
import { databaseRateLimit } from './rate-limits.js';

export function createApp(config) {
  const { databasePath, origin, secret, adminEmail, adminPassword, production = false, now = Date.now } = config;
  const uploadDir = config.files || config.uploadDir;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET minimal 32 karakter.');
  if (production && !origin.startsWith('https://')) throw new Error('Production membutuhkan APP_ORIGIN HTTPS.');
  const nativeDb = config.database || openDatabase(databasePath, adminEmail, adminPassword);
  const db = config.database || asyncDatabase(nativeDb);
  const receiptDir = config.files || config.receiptDir || join(dirname(databasePath), 'receipts');
  if (!config.files) { mkdirSync(uploadDir, { recursive: true }); mkdirSync(receiptDir, { recursive: true }); }
  const registrationPayment = config.demoMode
    ? { provider: 'DANA', amount: 49500, accountNumber: '000000000000', accountName: 'SIMULASI — JANGAN TRANSFER', demo: true }
    : { provider: 'DANA', amount: 49500, accountNumber: '089669454622', accountName: 'Herlan Adiwijaya', demo: false };
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  // Vercel pre-parses cookies; signed cookies must still be checked by our parser.
  if (config.database) app.use((req, res, next) => { delete req.cookies; delete req.signedCookies; next(); });
  app.use((req, res, next) => privateFileRequest(req.originalUrl) ? res.status(404).type('text').send('Not found') : next());
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", ...(production ? [] : ["'unsafe-inline'"])],
    styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"], connectSrc: ["'self'", ...(production ? [] : ['ws://localhost:24678', 'ws://127.0.0.1:24678'])],
    objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: production ? [] : null
  } }, strictTransportSecurity: production ? undefined : false, crossOriginEmbedderPolicy: false }));
  app.use(cookieParser(secret));
  if (!config.demoMode) app.use('/api', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Terlalu banyak permintaan. Coba lagi satu menit.' } }));
  app.use(express.json({ limit: '6mb' }));
  const digest = value => createHmac('sha256', secret).update(value).digest('hex');
  const persistentLimit = (scope, maximum, window) => async (req, res, next) => {
    if (!await databaseRateLimit(db, digest(`${scope}:${ipKeyGenerator(req.ip)}`), maximum, window, now())) {
      res.set('Retry-After', String(Math.ceil(window / 1000)));
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Tunggu sebelum mencoba lagi.' });
    }
    next();
  };
  if (config.database) app.use('/api', persistentLimit('api', 120, 60000));
  const readSettings = async () => JSON.parse((await db.prepare('SELECT payload FROM settings WHERE id=1').get()).payload);
  const audit = async (action, detail) => (await db.prepare('INSERT INTO audit_events(action,detail,created_at) VALUES(?,?,?)').run(action, detail, new Date(now()).toISOString()));
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: production, signed: true, path: '/' };
  let nextCleanup = 0;
  async function issueSession(req, res, adminId = null, voterHash) {
    const token = randomBytes(32).toString('hex');
    const csrf = randomBytes(32).toString('hex');
    if (!voterHash) {
      const raw = req.signedCookies.lcc_voter || randomBytes(32).toString('hex');
      voterHash = digest(`voter:${raw}`);
      if (!req.signedCookies.lcc_voter) res.cookie('lcc_voter', raw, { ...cookieOptions, maxAge: 365 * 86400000 });
    }
    if (req.session) (await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash));
    (await db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(digest(token), voterHash, csrf, adminId, now() + 8 * 3600000));
    res.cookie('lcc_session', token, { ...cookieOptions, maxAge: 8 * 3600000 });
    req.session = { token_hash: digest(token), voter_hash: voterHash, csrf, admin_id: adminId };
    return csrf;
  }
  app.use('/api', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const raw = req.signedCookies.lcc_session;
    req.session = raw ? (await db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(raw), now())) : undefined;
    if (/^\/bootstrap\/?$/i.test(req.path) && ['GET','HEAD'].includes(req.method)) {
      if (now() >= nextCleanup) {
        nextCleanup = now() + 5 * 60000;
        await db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
        await db.prepare('DELETE FROM participant_sessions WHERE expires_at<=?').run(now());
        await db.prepare('DELETE FROM participant_otps WHERE expires_at<=?').run(now());
        await db.prepare('DELETE FROM request_limits WHERE expires_at<=?').run(now());
        await db.prepare('DELETE FROM participant_limits WHERE started_at<=?').run(now()-86400000);
        await db.prepare('DELETE FROM login_attempts WHERE last_at<=? AND blocked_until<=?').run(now()-86400000,now());
        await db.prepare('DELETE FROM mail_outbox WHERE created_at<? AND sent_at IS NOT NULL').run(new Date(now()-7*86400000).toISOString());
      }
      if (!req.session) (await issueSession(req, res));
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const token = req.get('x-csrf-token');
      if (![origin, ...(config.allowedOrigins || [])].includes(req.get('origin')) || !req.session || !token || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))) return res.status(403).json({ error: 'Sesi tidak valid. Muat ulang halaman dan coba lagi.' });
    }
    next();
  });
  const requireAdmin = (req, res, next) => req.session?.admin_id ? next() : res.status(401).json({ error: 'Silakan login sebagai admin.' });
  let tickets;
  try { tickets = createTicketService({ app, db, config, digest, cookieOptions, requireAdmin, readSettings, audit, receiptDir, registrationPayment }); }
  catch (error) { db.close(); throw error; }
  const submissionsLimit = config.demoMode ? (req, res, next) => next() : config.database ? persistentLimit('submission', 12, 15 * 60000) : rateLimit({ windowMs: 15 * 60000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Batas pengiriman tercapai. Coba lagi 15 menit.' } });
  app.get('/api/bootstrap', async (req, res) => {
    const [settings,categories,creators,votedCategories] = await Promise.all([
      readSettings(),
      db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY id').all(),
      db.prepare(`SELECT c.id,c.name,c.handle,c.category_id AS categoryId,c.bio,c.photo,c.dummy,cat.name AS category FROM creators c JOIN categories cat ON cat.id=c.category_id LEFT JOIN votes v ON v.creator_id=c.id WHERE c.status='approved' AND c.visible=1 AND cat.active=1 GROUP BY c.id ORDER BY COUNT(v.id) DESC,c.id`).all(),
      db.prepare('SELECT category_id,creator_id FROM votes WHERE voter_hash=?').all(req.session.voter_hash)
    ]);
    const { announcement, ...publicSettings } = settings;
    res.json({ settings: publicSettings, announcement: activeAnnouncement(announcement, now()), categories, creators, registrationPayment, mailDeliveryMode: tickets.deliveryMode, ...(config.demoMode ? { demoMode: true } : {}), votedCategories, registrationOpen: campaignOpen(settings, 'registration', now()), votingOpen: campaignOpen(settings, 'voting', now()), csrfToken: req.session.csrf, isAdmin: !!req.session.admin_id });
  });
  app.post('/api/register', submissionsLimit, async (req, res, next) => {
    if (config.demoMode) return res.status(403).json({ error: 'Ini demo client. Pendaftaran asli dinonaktifkan. Gunakan akun peserta demo.' });
    if (tickets.deliveryMode === 'unconfigured') return res.status(503).json({ error: 'Layanan pendaftaran sedang disiapkan. Hubungi panitia melalui WhatsApp sebelum melakukan pembayaran.' });
    let photo, receipt;
    try {
      const settings = (await readSettings());
      if (!campaignOpen(settings, 'registration', now())) return res.status(403).json({ error: 'Pendaftaran sedang ditutup.' });
      const data = registrationSchema.parse(req.body);
      if (!(await db.prepare('SELECT id FROM categories WHERE id=? AND active=1').get(data.categoryId))) return res.status(400).json({ error: 'Kategori tidak tersedia.' });
      const answers = validateAnswers(data.answers, settings.fields);
      photo = data.photoData ? await savePhoto(data.photoData, uploadDir) : null;
      receipt = await savePhoto(data.paymentProofData, receiptDir, { receipt: true });
      const handle = Object.values(data.socialAccounts).find(v => v.length >= 2);
      let inserted = false;
      await db.transaction(async () => {
        const result = (await db.prepare("INSERT INTO creators(name,email,phone,handle,category_id,bio,photo,answers,field_snapshot,created_at,gender,address,social_accounts,payment_proof,payment_snapshot,payment_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending') ON CONFLICT(email) DO NOTHING").run(data.name, data.email, data.phone, handle, data.categoryId, data.bio, photo, JSON.stringify(answers), JSON.stringify(settings.fields), new Date(now()).toISOString(), data.gender, data.address, JSON.stringify(data.socialAccounts), receipt, JSON.stringify(registrationPayment)));
        inserted = result.changes === 1;
        if (inserted) {
          const id = Number(result.lastInsertRowid);
          (await db.prepare('UPDATE creators SET registration_number=? WHERE id=?').run(`LCC-${String(id).padStart(6, '0')}`, id));
        }
      });
      if (!inserted) { (await removePhoto(photo, uploadDir)); (await removePhoto(receipt, receiptDir)); }
      // Committed files belong to the record; later delivery failures must not remove them.
      photo = receipt = undefined;
      try { await tickets.requestOTP(data.email, req.ip, inserted); }
      catch (error) { console.error('Registration OTP preparation failed:', error.message); }
      res.status(202).json({ statusUrl: '/peserta', deliveryMode: tickets.deliveryMode, message: 'Permintaan diterima. Periksa email pendaftaran untuk melanjutkan ke halaman peserta.' });
    } catch (error) {
      (await removePhoto(photo, uploadDir));
      (await removePhoto(receipt, receiptDir));
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Lengkapi data peserta, minimal satu akun sosial, persetujuan, dan bukti pembayaran.' });
      if (/Kolom|wajib|harus|tidak sesuai|tidak valid/.test(error.message)) return res.status(400).json({ error: error.message });
      if (error instanceof PhotoError) return res.status(400).json({ error: error.message });
      next(error);
    }
  });
  app.post('/api/votes', submissionsLimit, async (req, res) => {
    if (!campaignOpen((await readSettings()), 'voting', now())) return res.status(403).json({ error: 'Periode voting sedang ditutup.' });
    const parsed = z.object({ creatorId: z.number().int().positive() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Pilihan creator tidak valid.' });
    const creator = (await db.prepare(`SELECT c.id,c.category_id FROM creators c JOIN categories cat ON cat.id=c.category_id WHERE c.id=? AND c.status='approved' AND c.visible=1 AND cat.active=1`).get(parsed.data.creatorId));
    if (!creator) return res.status(404).json({ error: 'Creator tidak tersedia untuk voting.' });
    try {
      (await db.prepare('INSERT INTO votes(creator_id,category_id,voter_hash,ip_hash,created_at) VALUES(?,?,?,?,?)').run(creator.id, creator.category_id, req.session.voter_hash, digest(req.ip), new Date(now()).toISOString()));
      res.status(201).json({ message: 'Dukunganmu sudah tercatat. Terima kasih!' });
    } catch (error) {
      if (/UNIQUE constraint/i.test(error.message)) return res.status(409).json({ error: 'Kamu sudah memberikan vote di kategori ini.' });
      if (/creator_unavailable/.test(error.message)) return res.status(409).json({ error: 'Status creator berubah. Muat ulang daftar polling.' });
      throw error;
    }
  });
  app.post('/api/admin/login', async (req, res) => {
    const parsed = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    const ipHash = digest(req.ip);
    const attempts = (await db.prepare('SELECT * FROM login_attempts WHERE ip_hash=?').get(ipHash));
    if (attempts?.blocked_until > now()) return res.status(429).json({ error: 'Login dibatasi sementara. Coba lagi 15 menit.' });
    const admin = (await db.prepare('SELECT * FROM admins WHERE email=?').get(parsed.data.email.toLowerCase()));
    // Perform the same password work for unknown emails to avoid user enumeration.
    const fallback = (await db.prepare('SELECT password_hash FROM admins LIMIT 1').get()).password_hash;
    const valid = verifyPassword(parsed.data.password, admin?.password_hash ?? fallback);
    if (!admin || !valid) {
      await db.prepare(`INSERT INTO login_attempts VALUES(?,1,0,?) ON CONFLICT(ip_hash) DO UPDATE SET
        failures=CASE WHEN last_at>? THEN failures+1 ELSE 1 END,
        blocked_until=CASE WHEN last_at>? AND failures>=4 THEN ? ELSE 0 END,last_at=?`)
        .run(ipHash, now(), now()-15*60000, now()-15*60000, now()+15*60000, now());
      return res.status(401).json({ error: 'Email atau password tidak sesuai.' });
    }
    (await db.prepare('DELETE FROM login_attempts WHERE ip_hash=?').run(ipHash));
    const csrfToken = (await issueSession(req, res, admin.id, req.session.voter_hash));
    (await audit('Login admin', admin.email));
    res.json({ csrfToken, message: 'Login berhasil.' });
  });
  app.use('/api/admin', requireAdmin);
  app.get('/api/admin/creators/:id/payment-proof', async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const creator = (await db.prepare('SELECT payment_proof FROM creators WHERE id=?').get(id));
    if (!creator?.payment_proof || !/^\/receipts\/[a-f0-9]{48}\.webp$/.test(creator.payment_proof)) return res.status(404).json({ error: 'Bukti pembayaran belum tersedia.' });
    if (config.files) {
      const image = await config.files.read(creator.payment_proof);
      return image ? res.type('webp').send(image) : res.status(404).json({ error: 'Bukti pembayaran tidak ditemukan.' });
    }
    res.type('webp').sendFile(basename(creator.payment_proof), { root: receiptDir, cacheControl: false }, error => { if (error && !res.headersSent) res.status(404).json({ error: 'Bukti pembayaran tidak ditemukan.' }); });
  });
  app.get('/api/admin/dashboard', async (req, res) => {
    const [rows,ticketRows] = await Promise.all([
      db.prepare('SELECT c.*,cat.name AS category,COUNT(v.id) AS votes FROM creators c JOIN categories cat ON cat.id=c.category_id LEFT JOIN votes v ON v.creator_id=c.id GROUP BY c.id ORDER BY c.created_at DESC,c.id DESC').all(),
      db.prepare('SELECT * FROM tickets').all()
    ]);
    const ticketMap = new Map(ticketRows.map(ticket => [ticket.creator_id,ticket]));
    const creators = rows.map(c => ({ ...c, registrationNumber: c.registration_number, ticket: tickets.ticketDTOFromRow(c,ticketMap.get(c.id)), categoryId: c.category_id, answers: JSON.parse(c.answers), fieldSnapshot: JSON.parse(c.field_snapshot), socialAccounts: JSON.parse(c.social_accounts), paymentSnapshot: JSON.parse(c.payment_snapshot), paymentProofUrl: c.payment_proof ? `/api/admin/creators/${c.id}/payment-proof` : null }));
    const today = new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
    const days = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) - (13 - i) * 86400000).toISOString().slice(0, 10));
    const counts = new Map((await (await db.prepare("SELECT date(created_at,'+8 hours') AS date,COUNT(*) AS count FROM votes WHERE created_at>=? AND created_at<=? GROUP BY date").all(new Date(Date.parse(`${days[0]}T00:00:00+08:00`)).toISOString(), new Date(now()).toISOString())).map(d => [d.date, d.count])));
    const dailyVotes = days.map(date => ({ date, count: counts.get(date) || 0 }));
    const categories = (await db.prepare('SELECT * FROM categories ORDER BY id').all());
    const active = new Set(categories.filter(c => c.active).map(c => c.id));
    const stats = { totalVotes: (await db.prepare('SELECT COUNT(*) AS n FROM votes').get()).n, totalCreators: creators.length, pendingCreators: creators.filter(c => c.status === 'pending').length, approvedCreators: creators.filter(c => c.status === 'approved').length, liveCreators: creators.filter(c => c.status === 'approved' && c.visible && active.has(c.categoryId)).length, missingPhotos: creators.filter(c => c.status !== 'rejected' && !c.photo).length, todayVotes: counts.get(today) || 0, voterBrowsers: (await db.prepare('SELECT COUNT(DISTINCT voter_hash) AS n FROM votes').get()).n };
    res.json({ creators, settings: (await readSettings()), categories, stats, dailyVotes, generatedAt: new Date(now()).toISOString(), audit: (await db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 50').all()), adminEmail: (await db.prepare('SELECT email FROM admins WHERE id=?').get(req.session.admin_id)).email });
  });
  app.put('/api/admin/settings', async (req, res) => {
    const update = settingsSchema.parse(req.body);
    await db.transaction(async () => {
      const settings = { ...(await readSettings()), ...update };
      for (const kind of ['registration', 'voting']) if (settings[`${kind}StartsAt`] && settings[`${kind}EndsAt`] && settings[`${kind}StartsAt`] >= settings[`${kind}EndsAt`]) return res.status(400).json({ error: 'Waktu selesai harus setelah waktu mulai.' });
      await db.prepare('UPDATE settings SET payload=? WHERE id=1').run(JSON.stringify(settings));
      await audit('Pengaturan diperbarui', Object.keys(update).join(', '));
    });
    if (!res.headersSent) res.json({ message: 'Pengaturan berhasil disimpan.' });
  });
  app.put('/api/admin/fields', async (req, res) => {
    const { fields } = z.object({ fields: z.array(fieldSchema).max(20) }).strict().parse(req.body);
    if (new Set(fields.map(f => f.id)).size !== fields.length) return res.status(400).json({ error: 'ID kolom harus unik.' });
    await db.transaction(async () => {
      const settings = { ...(await readSettings()), fields };
      await db.prepare('UPDATE settings SET payload=? WHERE id=1').run(JSON.stringify(settings));
      await audit('Form diperbarui', `${fields.length} kolom tambahan`);
    });
    res.json({ message: 'Form berhasil disimpan.' });
  });
  app.patch('/api/admin/creators/:id', async (req, res, next) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const update = creatorUpdateSchema.parse(req.body);
    if (!(await db.prepare('SELECT id FROM creators WHERE id=?').get(id))) return res.status(404).json({ error: 'Creator tidak ditemukan.' });
    let photo, creator, issuedTicket;
    try {
      if (update.photoData) photo = await savePhoto(update.photoData, uploadDir);
      await db.transaction(async () => {
        // Re-read under the write transaction after image processing.
        creator = (await db.prepare('SELECT * FROM creators WHERE id=?').get(id));
        if (update.paymentStatus && !creator.payment_proof) { (await removePhoto(photo, uploadDir)); return res.status(400).json({ error: 'Pendaftar ini belum memiliki bukti pembayaran.' }); }
        const paymentStatus = update.paymentStatus ?? creator.payment_status;
        if ((update.status ?? creator.status) === 'approved' && creator.payment_proof && paymentStatus !== 'verified') { (await removePhoto(photo, uploadDir)); return res.status(409).json({ error: 'Periksa dan tandai bukti pembayaran sebelum menyetujui creator.' }); }
        if (update.categoryId !== undefined && update.categoryId !== creator.category_id) {
          if (!(await db.prepare('SELECT id FROM categories WHERE id=? AND active=1').get(update.categoryId))) { (await removePhoto(photo, uploadDir)); return res.status(400).json({ error: 'Pilih kategori yang aktif.' }); }
          if ((await db.prepare('SELECT id FROM votes WHERE creator_id=? LIMIT 1').get(id))) { (await removePhoto(photo, uploadDir)); return res.status(409).json({ error: 'Kategori tidak dapat diganti setelah creator menerima vote. Riwayat dukungan harus tetap sesuai kategori asal.' }); }
        }
        const status = update.status ?? creator.status;
        const visible = status === 'approved' ? (update.visible === undefined ? creator.visible : Number(update.visible)) : 0;

        (await db.prepare('UPDATE creators SET name=?,email=?,phone=?,handle=?,category_id=?,bio=?,photo=?,status=?,visible=?,review_note=? WHERE id=?').run(update.name ?? creator.name, update.email ?? creator.email, update.phone ?? creator.phone, update.handle ?? creator.handle, update.categoryId ?? creator.category_id, update.bio ?? creator.bio, update.removePhoto ? null : photo ?? creator.photo, status, visible, update.reviewNote ?? creator.review_note, id));
        (await db.prepare('UPDATE creators SET payment_status=? WHERE id=?').run(paymentStatus, id));
        issuedTicket = (await tickets.issueTicket({ ...creator, status, payment_status: paymentStatus }));
        if (update.email && update.email !== creator.email) {
          (await db.prepare('DELETE FROM participant_sessions WHERE creator_id=?').run(id));
          (await db.prepare('DELETE FROM participant_otps WHERE email=?').run(creator.email));
        }
        (await audit('Profil creator diperbarui', `${creator.name} (#${id}): ${Object.keys(update).join(', ')}; ${status}`));
      });
      if (res.headersSent) return;
      if (photo || update.removePhoto) (await removePhoto(creator.photo, uploadDir));
      if (issuedTicket) {
        try { await tickets.notifyTicket({ ...creator, email: update.email ?? creator.email }, issuedTicket); }
        catch (error) { console.error('Ticket notification delivery failed:', error.message); }
      }
      res.json({ message: 'Profil creator berhasil disimpan.' });
    } catch (error) {
      (await removePhoto(photo, uploadDir));
      if (/creator_category_has_votes/.test(error.message)) return res.status(409).json({ error: 'Kategori tidak dapat diganti setelah creator menerima vote.' });
      if (/UNIQUE constraint/.test(error.message)) return res.status(409).json({ error: 'Email sudah digunakan creator lain.' });
      if (error instanceof PhotoError) return res.status(400).json({ error: error.message });
      next(error);
    }
  });
  app.post('/api/admin/categories', async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(80) }).strict().parse(req.body);
    try { (await db.prepare('INSERT INTO categories(name) VALUES(?)').run(name)); } catch (error) { if (/UNIQUE/.test(error.message)) return res.status(409).json({ error: 'Nama kategori sudah digunakan.' }); throw error; }
    (await audit('Kategori ditambahkan', name)); res.status(201).json({ message: 'Kategori ditambahkan.' });
  });
  app.patch('/api/admin/categories/:id', async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const update = z.object({ active: z.boolean().optional(), name: z.string().trim().min(2).max(80).optional() }).strict().refine(v => Object.keys(v).length > 0).parse(req.body);
    const category = (await db.prepare('SELECT * FROM categories WHERE id=?').get(id));
    if (!category) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    try { (await db.prepare('UPDATE categories SET name=?,active=? WHERE id=?').run(update.name ?? category.name, update.active === undefined ? category.active : Number(update.active), id)); }
    catch (error) { if (/UNIQUE/.test(error.message)) return res.status(409).json({ error: 'Nama kategori sudah digunakan.' }); throw error; }
    (await audit('Kategori diperbarui', `${category.name}: ${update.name ?? category.name}, ${update.active ?? !!category.active ? 'aktif' : 'nonaktif'}`)); res.json({ message: 'Kategori diperbarui.' });
  });
  app.post('/api/admin/password', async (req, res) => {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).strict().parse(req.body);
    const admin = (await db.prepare('SELECT * FROM admins WHERE id=?').get(req.session.admin_id));
    if (!verifyPassword(currentPassword, admin.password_hash)) return res.status(400).json({ error: 'Password saat ini tidak sesuai.' });
    (await db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(newPassword), admin.id));
    (await db.prepare('DELETE FROM sessions WHERE admin_id=?').run(admin.id));
    const csrfToken = (await issueSession(req, res, admin.id, req.session.voter_hash));
    (await audit('Password admin diganti', admin.email)); res.json({ csrfToken, message: 'Password diganti. Sesi admin lain telah dicabut.' });
  });
  app.post('/api/admin/logout', async (req, res) => {
    (await audit('Logout admin', 'Sesi dicabut'));
    const csrfToken = (await issueSession(req, res, null, req.session.voter_hash)); res.json({ csrfToken });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Data tidak valid. Periksa isian yang dikirim.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Ukuran data terlalu besar.' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Format data tidak valid.' });
    console.error('Request failed:', error.message); res.status(500).json({ error: 'Terjadi kendala. Silakan coba lagi.' });
  });
  return { app, db: nativeDb };
}
