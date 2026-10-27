import { useEffect, useState, type FormEvent } from 'react';
import { AdminDateTimeField } from './AdminDateTimeField';
import { AnnouncementDetails } from './EventAnnouncement';
import { ErrorMessage, Modal } from './components';
import { dateInput, dateOutput } from './admin-utils';
import type { Announcement, Dashboard, Mutation } from './types';

const blank: Announcement = { enabled: false, dressCode: '', eventAt: null, startsAt: null, endsAt: null };
export function AdminAnnouncement({ dashboard, mutation, busy }: { dashboard: Dashboard; mutation: Mutation; busy: boolean }) {
  const [draft, setDraft] = useState(dashboard.settings.announcement || blank);
  const [dirty, setDirty] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(false);
  useEffect(() => { if (!dirty) setDraft(dashboard.settings.announcement || blank); }, [dashboard.settings.announcement, dirty]);
  function update(patch: Partial<Announcement>) { setDraft(current => ({ ...current, ...patch })); setDirty(true); setError(''); }
  async function save(event: FormEvent) {
    event.preventDefault(); setError('');
    if (draft.enabled && (!draft.dressCode.trim() || !draft.eventAt || !draft.startsAt || !draft.endsAt)) { setError('Lengkapi dress code, tanggal acara, serta awal dan akhir penayangan.'); return; }
    if (draft.startsAt && draft.endsAt && draft.startsAt >= draft.endsAt) { setError('Akhir penayangan harus setelah awal penayangan.'); return; }
    if (await mutation('/admin/settings', 'PUT', { announcement: draft })) setDirty(false);
  }
  return <><form onSubmit={save}><fieldset className="admin-edit-lock" disabled={busy}><div className="admin-panel"><div className="announcement-editor-head"><div><h2>Dress code & tanggal hari H</h2><p>Popup muncul setiap membuka halaman publik selama periode tayang. Halaman admin dikecualikan.</p></div><label className="toggle-label"><input type="checkbox" className="toggle" aria-label="Aktifkan pengumuman" checked={draft.enabled} onChange={event => update({ enabled: event.target.checked })}/>{draft.enabled ? 'Aktif' : 'Nonaktif'}</label></div><div className="settings-grid admin-announcement-content"><label className="form-label span-two">Dress code<textarea className="textarea" rows={4} maxLength={1200} placeholder="Contoh: Hitam & gold. Batik atau tenun Sasak diperbolehkan." value={draft.dressCode} onChange={event => update({ dressCode: event.target.value })} required={draft.enabled}/></label><div className="span-two"><AdminDateTimeField label="Tanggal & jam acara (WITA)" context="Hari H acara" value={dateInput(draft.eventAt)} onChange={value => update({ eventAt: dateOutput(value) })}/></div><AdminDateTimeField label="Mulai tayang (WITA)" context="Pengumuman" value={dateInput(draft.startsAt)} onChange={value => update({ startsAt: dateOutput(value) })}/><AdminDateTimeField label="Selesai tayang (WITA)" context="Pengumuman" value={dateInput(draft.endsAt)} onChange={value => update({ endsAt: dateOutput(value) })}/></div><p className="panel-note">Tanggal acara adalah isi pengumuman. Periode tayang menentukan kapan popup mulai dan berhenti muncul. Seluruh waktu menggunakan WITA.</p><button type="button" className="btn btn-outline" disabled={!draft.dressCode.trim() || !draft.eventAt} onClick={() => setPreview(true)}>Pratinjau popup</button><ErrorMessage message={error}/></div><div className="admin-save-bar"><span>{dirty ? 'Ada perubahan pengumuman yang belum disimpan.' : 'Pengumuman sesuai pengaturan tersimpan.'}</span><button className="btn btn-primary" disabled={busy || !dirty}>{busy ? 'Menyimpan…' : 'Simpan pengumuman'}</button></div></fieldset></form><Modal title={<>Sampai jumpa di<br/><em>hari perayaan.</em></>} className="event-announcement-modal" open={preview} onClose={() => setPreview(false)}>{draft.eventAt && <AnnouncementDetails announcement={{ dressCode: draft.dressCode, eventAt: draft.eventAt }}/>}<button type="button" className="btn btn-primary btn-block" onClick={() => setPreview(false)}>Tutup pratinjau</button></Modal></>;
}
