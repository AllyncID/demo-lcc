import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ExternalLink, Plus, ShieldCheck } from './icons';
import { AdminDateTimeField } from "./AdminDateTimeField";
import { dateText } from './api';
import { campaignState, dateInput, dateOutput } from './admin-utils';
import type { Category, Dashboard, Mutation, Settings } from './types';

export function PollingManager({ dashboard: d, mutation, busy }: { dashboard: Dashboard; mutation: Mutation; busy: boolean }) {
  const [settings, setSettings] = useState(d.settings); const [dirty, setDirty] = useState(false); const [categoryName, setCategoryName] = useState('');
  useEffect(() => { if (!dirty) setSettings(d.settings); }, [d.settings, dirty]);
  function update(patch: Partial<Settings>) { setSettings(s => ({ ...s, ...patch })); setDirty(true); }
  async function save(e: FormEvent) {
    e.preventDefault();
    const { registrationActive, votingActive, registrationStartsAt, registrationEndsAt, votingStartsAt, votingEndsAt } = settings;
    if (await mutation('/admin/settings', 'PUT', { registrationActive, votingActive, registrationStartsAt, registrationEndsAt, votingStartsAt, votingEndsAt })) setDirty(false);
  }
  return <fieldset disabled={busy} className="admin-edit-lock"><div className="polling-links"><Link to="/vote" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm"><ExternalLink size={15}/>Pratinjau polling</Link><Link to="/register" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Lihat form registrasi</Link></div>
    <form onSubmit={save}><div className="admin-panel"><div className="panel-heading"><h2>Periode registrasi & polling</h2><span>WITA · UTC+8</span></div>{(['registration', 'voting'] as const).map(kind => {
      const state = campaignState(d.settings, kind, Date.parse(d.generatedAt));
      return <div className="period-editor" key={kind}><div className="period-editor-head"><div><h3>{kind === 'registration' ? 'Registrasi creator' : 'Polling publik'} <span className={`admin-status ${state.tone}`}>{state.label}</span></h3><p>{kind === 'registration' ? 'Pendaftaran baru masuk ke antrean review sebelum ditampilkan.' : 'Saat ditutup, vote baru dihentikan dan galeri tetap bisa dilihat.'}</p></div><label className="toggle-label"><input className="toggle" type="checkbox" aria-label={kind === 'registration' ? 'Aktifkan registrasi creator' : 'Aktifkan polling publik'} checked={settings[`${kind}Active`]} onChange={e => update({ [`${kind}Active`]: e.target.checked })}/>{settings[`${kind}Active`] ? 'Aktif' : 'Nonaktif'}</label></div><div className="settings-grid"><AdminDateTimeField label="Mulai (WITA)" context={kind === "registration" ? "Registrasi creator" : "Polling publik"} value={dateInput(settings[`${kind}StartsAt`])} onChange={value => update({ [`${kind}StartsAt`]: dateOutput(value) })}/><AdminDateTimeField label="Berakhir (WITA)" context={kind === "registration" ? "Registrasi creator" : "Polling publik"} value={dateInput(settings[`${kind}EndsAt`])} onChange={value => update({ [`${kind}EndsAt`]: dateOutput(value) })}/></div><small className="period-help">Kosongkan tanggal untuk tanpa batas. Status di atas mengikuti pengaturan yang sudah disimpan.</small><p className="admin-hint"><CalendarDays size={15}/>Jadwal tersimpan: {dateText(d.settings[`${kind}StartsAt`], true)} — {dateText(d.settings[`${kind}EndsAt`], true)}</p></div>;
    })}</div><div className="admin-save-bar"><span>{dirty ? 'Perubahan periode belum disimpan.' : 'Periode sesuai pengaturan tersimpan.'}</span><button className="btn btn-primary" disabled={busy || !dirty}>{busy ? 'Menyimpan…' : 'Simpan periode'}</button></div></form>
    <div className="admin-panel category-settings"><div className="panel-heading"><h2>Kategori awards</h2><span>{d.categories.length} kategori</span></div><div className="category-editor-list">{d.categories.map(c => <CategoryEditor key={c.id} category={c} creators={d.creators.filter(p => p.categoryId === c.id).length} mutation={mutation} busy={busy}/>)}</div><form className="add-category" onSubmit={async e => { e.preventDefault(); if (await mutation('/admin/categories', 'POST', { name: categoryName })) setCategoryName(''); }}><input className="input" placeholder="Nama kategori baru" aria-label="Nama kategori baru" value={categoryName} onChange={e => setCategoryName(e.target.value)} minLength={2} maxLength={80} required/><button className="btn btn-outline" disabled={busy}><Plus size={16}/>Tambah kategori</button></form><p className="panel-note">Kategori nonaktif disembunyikan dari form dan polling. Profil dan vote yang sudah tercatat tetap tersimpan.</p></div>
    <p className="admin-hint"><ShieldCheck size={15}/>Satu vote per kategori per identitas browser. Jumlah browser bukan jumlah orang terverifikasi.</p>
  </fieldset>;
}

function CategoryEditor({ category: c, creators, mutation, busy }: { category: Category; creators: number; mutation: Mutation; busy: boolean }) {
  const [name, setName] = useState(c.name);
  useEffect(() => setName(c.name), [c.name]);
  return <form className="category-editor" onSubmit={e => { e.preventDefault(); mutation(`/admin/categories/${c.id}`, 'PATCH', { name }); }}><label className="form-label">Nama kategori<input className="input" aria-label={`Nama kategori ${c.name}`} value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={80} required/></label><span className="category-count">{creators} creator</span><label className="toggle-label"><input className="toggle toggle-sm" type="checkbox" checked={!!c.active} aria-label={`Aktifkan kategori ${c.name}`} onChange={e => mutation(`/admin/categories/${c.id}`, 'PATCH', { active: e.target.checked })}/>{c.active ? 'Aktif' : 'Nonaktif'}</label><button className="btn btn-outline btn-sm" disabled={busy || name.trim() === c.name}>Simpan nama</button></form>;
}
