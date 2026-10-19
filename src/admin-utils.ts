import type { AdminCreator, Settings } from './types';

export const statusText = { pending: 'Menunggu review', approved: 'Disetujui', rejected: 'Ditolak' };
const paymentText = { not_required: 'Pendaftaran lama', pending: 'Menunggu pemeriksaan', verified: 'Bukti sesuai', rejected: 'Bukti ditolak' };
export function campaignState(s: Settings, kind: 'voting' | 'registration', now = Date.now()) {
  if (!s[`${kind}Active`]) return { label: 'Dinonaktifkan', tone: 'rejected', open: false };
  if (s[`${kind}StartsAt`] && now < Date.parse(s[`${kind}StartsAt`]!)) return { label: 'Terjadwal', tone: 'pending', open: false };
  if (s[`${kind}EndsAt`] && now >= Date.parse(s[`${kind}EndsAt`]!)) return { label: 'Selesai', tone: 'rejected', open: false };
  return { label: 'Dibuka', tone: 'approved', open: true };
}
export function dateInput(value: string | null) { return value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : ''; }
export function dateOutput(value: string) { return value ? new Date(`${value}:00+08:00`).toISOString() : null; }
export function exportCreators(creators: AdminCreator[], kind: 'creators' | 'votes') {
  const fields = new Map(creators.flatMap(c => c.fieldSnapshot.map(f => [`${f.id}:${f.label}`, f] as const)));
  const rows = kind === 'votes'
    ? [['Creator', 'Username', 'Kategori', 'Vote', 'Status', 'Visibilitas'], ...creators.map(c => [c.name, c.handle, c.category, String(c.votes), statusText[c.status], c.visible ? 'Tampil' : 'Disembunyikan'])]
    : [['ID', 'Nama', 'Gender', 'Alamat', 'Email', 'WhatsApp', 'Akun utama', 'Facebook', 'Instagram', 'TikTok', 'YouTube', 'Kategori', 'Status', 'Pemeriksaan bukti', 'Nominal', 'Simulasi pembayaran', 'Visibilitas', 'Foto', 'Catatan internal', 'Terdaftar', ...[...fields.values()].map(f => f.label)], ...creators.map(c => [String(c.id), c.name, c.gender || '', c.address || '', c.email, c.phone, c.handle, c.socialAccounts?.facebook || '', c.socialAccounts?.instagram || '', c.socialAccounts?.tiktok || '', c.socialAccounts?.youtube || '', c.category, statusText[c.status], paymentText[c.payment_status] || '', c.paymentSnapshot?.amount ? String(c.paymentSnapshot.amount) : '', c.paymentSnapshot?.demo ? 'Ya' : '', c.visible ? 'Tampil' : 'Disembunyikan', c.photo || '', c.review_note, c.created_at, ...[...fields.values()].map(f => c.fieldSnapshot.some(s => s.id === f.id && s.label === f.label) ? String(c.answers[f.id] ?? '') : '')])];
  const csv = '\uFEFF' + rows.map(row => row.map(value => `"${(/^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `lcc-${kind}-${new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
