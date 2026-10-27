import { z } from 'zod';

const shortText = z.string().trim().min(1).max(160);
const date = z.string().datetime().nullable();
export const announcementSchema = z.object({
  enabled: z.boolean(), dressCode: z.string().trim().max(1200),
  eventAt: date, startsAt: date, endsAt: date
}).strict().superRefine((value, ctx) => {
  if (value.enabled && (!value.dressCode || !value.eventAt || !value.startsAt || !value.endsAt)) ctx.addIssue({ code: 'custom', message: 'Lengkapi dress code, tanggal acara, serta awal dan akhir penayangan.' });
  if (value.startsAt && value.endsAt && Date.parse(value.startsAt) >= Date.parse(value.endsAt)) ctx.addIssue({ code: 'custom', message: 'Akhir penayangan harus setelah awal penayangan.' });
});
export function activeAnnouncement(announcement, now = Date.now()) {
  if (!announcement?.enabled || !announcement.dressCode || !announcement.eventAt || !announcement.startsAt || !announcement.endsAt || now < Date.parse(announcement.startsAt) || now >= Date.parse(announcement.endsAt)) return null;
  return { dressCode: announcement.dressCode, eventAt: announcement.eventAt };
}
export const settingsSchema = z.object({
  eventName: shortText, year: z.string().regex(/^\d{4}$/), location: shortText,
  registrationActive: z.boolean(), votingActive: z.boolean(),
  registrationStartsAt: date, registrationEndsAt: date, votingStartsAt: date, votingEndsAt: date,
  announcement: announcementSchema
}).partial().strict();
export const fieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/).refine(v => !['__proto__', 'prototype', 'constructor', 'name', 'email', 'phone', 'handle', 'categoryId', 'consent', 'bio', 'photoData'].includes(v)),
  label: z.string().trim().min(1).max(100), type: z.enum(['text', 'textarea', 'email', 'url', 'number', 'select', 'checkbox']),
  required: z.boolean(), options: z.array(z.string().trim().min(1).max(100)).max(30).default([])
}).strict().refine(f => f.type !== 'select' || (f.options.length > 0 && new Set(f.options).size === f.options.length));
export const socialAccountsSchema = z.object({
  facebook: z.string().trim().max(200).default(''), instagram: z.string().trim().max(200).default(''),
  tiktok: z.string().trim().max(200).default(''), youtube: z.string().trim().max(200).default('')
}).strict().refine(accounts => Object.values(accounts).some(value => value.length >= 2), 'Isi minimal satu akun media sosial.');
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100), email: z.email().max(254).transform(v => v.trim().toLowerCase()),
  phone: z.string().trim().regex(/^\+?[0-9\s-]{8,20}$/), handle: z.string().trim().min(2).max(100).optional(),
  gender: z.enum(['Laki-laki', 'Perempuan']), address: z.string().trim().min(8).max(1000), socialAccounts: socialAccountsSchema,
  categoryId: z.number().int().positive(), bio: z.string().trim().max(1200).default(''), consent: z.literal(true),
  answers: z.record(z.string(), z.union([z.string().max(2000), z.boolean()])).default({}),
  photoData: z.string().max(3000000).optional(), paymentProofData: z.string().min(1).max(3000000), website: z.string().max(0).optional()
}).strict();
export const creatorUpdateSchema = registrationSchema.pick({ name: true, email: true, phone: true, handle: true, categoryId: true, bio: true, photoData: true }).partial().extend({
  bio: z.string().trim().max(1200).optional(), handle: z.string().trim().min(2).max(200).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(), visible: z.boolean().optional(),
  reviewNote: z.string().trim().max(2000).optional(), removePhoto: z.boolean().optional(),
  paymentStatus: z.enum(['pending', 'verified', 'rejected']).optional()
}).strict().refine(v => Object.keys(v).length > 0, 'Tidak ada perubahan.').refine(v => !(v.photoData && v.removePhoto), 'Pilih ganti atau hapus foto.');
export function validateAnswers(answers, fields) {
  const allowed = new Set(fields.map(f => f.id));
  if (Object.keys(answers).some(key => !allowed.has(key))) throw new Error('Kolom form tidak dikenali. Muat ulang formulir.');
  const clean = Object.create(null);
  for (const field of fields) {
    let value = answers[field.id] ?? (field.type === 'checkbox' ? false : '');
    if (field.type === 'checkbox') {
      if (typeof value !== 'boolean' || (field.required && !value)) throw new Error(`${field.label} harus dicentang.`);
    } else {
      if (typeof value !== 'string') throw new Error(`${field.label} tidak valid.`);
      value = value.trim();
      if (field.required && !value) throw new Error(`${field.label} wajib diisi.`);
      if (value && field.type === 'email' && !z.email().safeParse(value).success) throw new Error(`${field.label} harus berupa email.`);
      if (value && field.type === 'url' && !isWebUrl(value)) throw new Error(`${field.label} harus berupa link HTTP/HTTPS.`);
      if (value && field.type === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`${field.label} harus berupa angka.`);
      if (value && field.type === 'select' && !field.options.includes(value)) throw new Error(`${field.label} tidak sesuai pilihan.`);
    }
    clean[field.id] = value;
  }
  return clean;
}
function isWebUrl(value) { try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; } }
export function campaignOpen(settings, kind, now = Date.now()) {
  return settings[`${kind}Active`] && (!settings[`${kind}StartsAt`] || now >= Date.parse(settings[`${kind}StartsAt`])) && (!settings[`${kind}EndsAt`] || now < Date.parse(settings[`${kind}EndsAt`]));
}
