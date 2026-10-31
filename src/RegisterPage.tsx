import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, CalendarDays, Check, Copy, ImagePlus, ShieldCheck, X, ArrowUpRight, Wallet } from './icons';
import { api, dateText, numberText } from './api';
import { Empty, ErrorMessage, Footer, Header } from './components';
import type { Bootstrap, Field, SocialAccounts } from './types';
import './registration.css';
import { prepareUpload } from './upload-image';
import { whatsappUrl } from './PublicContact';

type Upload = { data: string; name: string };
const platforms = [{ id: 'facebook', name: 'Facebook', placeholder: 'Nama akun atau link profil Facebook' }, { id: 'instagram', name: 'Instagram', placeholder: '@username Instagram' }, { id: 'tiktok', name: 'TikTok', placeholder: '@username TikTok' }, { id: 'youtube', name: 'YouTube', placeholder: 'Nama channel atau link YouTube' }] as const;
const categoryOrder = ['Edukasi', 'Komedi', 'Religi', 'Budaya', 'Food Vlogger', 'Wisata Explorer', 'Film', 'Musisi', 'Fashion', 'Berita & Narasi'];

export function RegisterPage({ data }: { data: Bootstrap }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [accounts, setAccounts] = useState<SocialAccounts>({ facebook: '', instagram: '', tiktok: '', youtube: '' });
  const [photo, setPhoto] = useState<Upload | null>(null); const [proof, setProof] = useState<Upload | null>(null);
  const socialRef = useRef<HTMLInputElement>(null);
  const payment = data.registrationPayment;
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copyStatus !== 'copied') return;
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  async function copyDanaNumber() {
    setCopyStatus('idle');
    try { await navigator.clipboard.writeText(payment.accountNumber); setCopyStatus('copied'); }
    catch { setCopyStatus('failed'); }
  }
  const categories = [...data.categories].sort((a, b) => (categoryOrder.indexOf(a.name) < 0 ? 100 : categoryOrder.indexOf(a.name)) - (categoryOrder.indexOf(b.name) < 0 ? 100 : categoryOrder.indexOf(b.name)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    if (!Object.values(accounts).some(value => value.trim().length >= 2)) { setError('Isi minimal satu nama akun Facebook, Instagram, TikTok, atau YouTube.'); socialRef.current?.focus(); return; }
    if (!proof) { setError('Unggah bukti pembayaran terlebih dahulu.'); document.getElementById('payment-proof')?.focus(); return; }
    const form = new FormData(e.currentTarget); setBusy(true);
    try {
      const result = await api<{statusUrl:string;deliveryMode:'local'|'smtp'}>('/register', 'POST', { name: form.get('name'), gender: form.get('gender'), email: form.get('email'), phone: form.get('phone'), socialAccounts: accounts, address: form.get('address'), categoryId: Number(form.get('categoryId')), bio: form.get('bio'), consent: form.get('consent') === 'on', website: form.get('website') || '', answers, ...(photo ? { photoData: photo.data } : {}), paymentProofData: proof.data });
      navigate('/peserta', { replace: true, state: { email: String(form.get('email')).trim().toLowerCase(), registrationSubmitted: true, otpSent: true, deliveryMode: result.deliveryMode } });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="public-page registration-page"><Header data={data}/><main id="main-content" className="registration-shell">
    <section className="registration-banner" aria-labelledby="registration-title"><img src="/assets/register-awards-wallpaper-v2.webp" alt="" className="registration-wallpaper" fetchPriority="high" decoding="async"/><div className="registration-banner-copy"><span className="registration-event"><Award size={16}/> LCC AWARDS {data.settings.year}</span><h1 id="registration-title">Panggung berikutnya,<br/><em>dimulai dari ceritamu.</em></h1><p>Form pendaftaran Lombok Content Creators Awards.</p><span className="registration-date"><CalendarDays size={14}/>Batas pendaftaran: {dateText(data.settings.registrationEndsAt)}</span></div></section>
    <div className="registration-body"><nav className="registration-progress" aria-label="Tahapan pendaftaran"><ol className="steps steps-horizontal">{[['Isi data', '#registration-data'], ['Pembayaran', '#registration-payment'], ['Cek OTP', '#registration-title']].map(([label, href], index) => <li key={label} className={`step ${index < step ? 'step-primary' : ''}`} aria-current={step === index + 1 ? 'step' : undefined}><span className="step-icon" aria-hidden="true">{index < step - 1 ? <Check size={16}/> : index + 1}</span>{index < 2 ? <a href={href} onClick={() => setStep(index + 1)}>{label}</a> : <span>{label}</span>}</li>)}</ol></nav>
      {!data.registrationOpen ? <section className="registration-card"><Empty>Pendaftaran belum dibuka atau sudah berakhir. <Link to="/vote" className="text-link">Lihat halaman polling</Link></Empty></section> : data.mailDeliveryMode === 'unconfigured' ? <section className="registration-card"><Empty>Layanan pendaftaran sedang disiapkan. Silakan hubungi panitia sebelum melakukan pembayaran. <a className="text-link" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Hubungi panitia</a></Empty></section> : <>
      <div className="registration-info"><ShieldCheck size={18}/><p>Lengkapi data diri, lalu unggah bukti pembayaran di bawah. Kolom bertanda <span>*</span> wajib diisi.</p></div>
      <p className="registration-participant-link">Sudah pernah mendaftar? <Link to="/peserta">Buka halaman peserta <ArrowUpRight size={15}/></Link></p>
      <form onSubmit={submit}><fieldset className="registration-lock" disabled={busy}>
        <section id="registration-data" className="registration-card" onFocusCapture={() => setStep(1)}><div className="registration-card-heading"><h2><span>01</span>Form pendaftaran</h2><span>* Wajib diisi</span></div><div className="registration-fields">
          <label className="form-label">Nama asli <span className="required">*</span><span className="registration-help">Gunakan nama lengkap sesuai identitas.</span><input name="name" className="input" placeholder="Nama lengkap kamu" autoComplete="name" required minLength={2} maxLength={100}/></label>
          <label className="form-label">Gender <span className="required">*</span><select name="gender" className="select" required defaultValue=""><option value="" disabled>Pilih gender</option><option>Laki-laki</option><option>Perempuan</option></select></label>
          <fieldset className="registration-social"><legend>Nama akun media sosial <span className="required">*</span></legend><p className="registration-help">Isi minimal satu akun yang aktif. Boleh mengisi lebih dari satu platform.</p>{platforms.map((platform, index) => <label className="form-label" key={platform.id}>{platform.name}<input ref={index === 0 ? socialRef : undefined} className="input" name={platform.id} value={accounts[platform.id]} onChange={e => setAccounts(v => ({ ...v, [platform.id]: e.target.value }))} placeholder={platform.placeholder} maxLength={200} autoCapitalize="none" spellCheck={false}/></label>)}</fieldset>
          <label className="form-label">Alamat <span className="required">*</span><span className="registration-help">Tulis alamat, kecamatan, dan kabupaten/kota domisili.</span><textarea className="textarea" name="address" autoComplete="street-address" placeholder="Alamat lengkap kamu" rows={3} minLength={8} maxLength={1000} required/></label>
          <label className="form-label">Nomor WhatsApp <span className="required">*</span><span className="registration-help">Nomor aktif untuk dihubungi panitia.</span><input className="input" name="phone" type="tel" autoComplete="tel" placeholder="Contoh: 081234567890" pattern="[+0-9\s-]{8,20}" maxLength={20} required/></label>
          <label className="form-label">Email <span className="required">*</span><span className="registration-help">Gunakan email aktif. OTP untuk membuka status pendaftaran dan tiket dikirim ke email ini.</span><input className="input" name="email" type="email" autoComplete="email" placeholder="nama@email.com" maxLength={254} required/></label>
          <label className="form-label">Kategori konten kreator <span className="required">*</span><span className="registration-help">Pilih satu kategori yang paling mewakili karyamu.</span><select className="select" name="categoryId" required defaultValue=""><option value="" disabled>Pilih kategori konten</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="form-label">Keterangan dan/atau prestasi lain <span className="registration-optional">Opsional</span><span className="registration-help">Ceritakan karya, pengalaman, atau pencapaianmu. Dapat ditampilkan sebagai bio profil.</span><textarea className="textarea" name="bio" placeholder="Ceritakan sedikit tentang karya dan prestasimu…" rows={4} maxLength={1200}/></label>
          <UploadField id="creator-photo" label="Foto profil peserta" value={photo} onChange={setPhoto} hint="Opsional. Foto ini bisa tampil di galeri polling setelah disetujui."/>
          {data.settings.fields.length > 0 && <div className="registration-extra"><h3>Informasi tambahan panitia</h3>{data.settings.fields.map(field => <DynamicField key={field.id} field={field} value={answers[field.id] ?? (field.type === 'checkbox' ? false : '')} onChange={value => setAnswers(v => ({ ...v, [field.id]: value }))}/>)}</div>}
        </div></section>
        <section id="registration-payment" className="registration-card" onFocusCapture={() => setStep(2)}><div className="registration-card-heading"><h2><span>02</span>Pembayaran</h2><span>Bukti wajib</span></div><p className="registration-section-description">Pembayaran pendaftaran melalui akun DANA. Unggah bukti yang jelas agar dapat diperiksa panitia.</p>
          <div className="dana-payment"><div className="dana-payment-top"><span className="dana-provider"><Wallet size={23}/> DANA</span>{payment.demo && <span className="badge badge-outline">SIMULASI</span>}</div><div className="dana-total"><span className="dana-caption">{payment.demo ? 'Contoh biaya pendaftaran' : 'Biaya pendaftaran'}</span><strong className="dana-amount">Rp{numberText(payment.amount)}</strong></div><dl><div><dt>Nomor DANA</dt><dd><div className="dana-number"><span>{payment.accountNumber}</span><button type="button" className="btn btn-ghost btn-square btn-sm dana-copy" aria-label="Salin nomor DANA" title={copyStatus === 'copied' ? 'Tersalin' : 'Salin nomor DANA'} onClick={copyDanaNumber}>{copyStatus === 'copied' ? <Check size={16}/> : <Copy size={16}/>}</button></div><span className={`dana-copy-status${copyStatus === 'failed' ? ' is-error' : ''}`} role="status">{copyStatus === 'copied' ? 'Tersalin' : copyStatus === 'failed' ? 'Gagal menyalin. Salin nomor secara manual.' : ''}</span></dd></div><div><dt>Atas nama</dt><dd>{payment.accountName}</dd></div></dl></div>
          {payment.demo && <div className="registration-payment-note"><ShieldCheck size={18}/><p><strong>Belum perlu transfer sungguhan.</strong> Nominal dan akun di atas hanya contoh. Untuk mencoba form, unggah gambar contoh bukti pembayaran.</p></div>}
          <UploadField id="payment-proof" label="Upload bukti pembayaran" required value={proof} onChange={setProof} hint="Pastikan nominal, tanggal, dan tujuan transfer terlihat."/>
          <p className="registration-private"><ShieldCheck size={14}/>Bukti pembayaran hanya dapat dilihat panitia.</p>
        </section>
        <section className="registration-card registration-submit"><label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label><label className="check-label"><input className="checkbox checkbox-sm" type="checkbox" name="consent" required/><span>Saya menyatakan data ini benar dan menyetujui panitia LCC NTB memproses data serta bukti pembayaran untuk pendaftaran. Nama, akun utama, karya, dan foto dapat ditampilkan jika disetujui. Data kontak dan bukti pembayaran tetap privat.</span></label><ErrorMessage message={error}/><button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Mengirim pendaftaran…' : 'Kirim pendaftaran'} <ArrowUpRight size={18}/></button><p className="registration-private"><ShieldCheck size={14}/>Setelah terkirim, kamu diarahkan ke halaman peserta untuk masuk dengan OTP.</p></section>
      </fieldset></form></>}
    </div>
  </main><Footer data={data} showCta={false}/></div>;
}

function UploadField({ id, label, required = false, value, onChange, hint }: { id: string; label: string; required?: boolean; value: Upload | null; onChange: (value: Upload | null) => void; hint: string }) {
  const [error, setError] = useState(''); const [reading, setReading] = useState(false); const selection = useRef(0);
  async function read(file?: File) {
    if (!file) return; const version = ++selection.current; setError(''); onChange(null);
    if (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Pilih gambar JPG, PNG, atau WebP maksimal 2 MB.'); return; }
    setReading(true);
    try {
      const data = await prepareUpload(file, required);
      if (selection.current === version) onChange({ data, name: file.name });
    } catch (error) { if (selection.current === version) setError(error instanceof Error ? error.message : 'File gagal dibaca. Pilih gambar lagi.'); }
    finally { if (selection.current === version) setReading(false); }
  }
  return <div className={`registration-upload-field ${required ? 'receipt-upload' : ''}`}><label className="form-label" htmlFor={id}>{label} {required ? <span className="required">*</span> : <span className="registration-optional">Opsional</span>}</label><p className="registration-help" id={`${id}-help`}>{hint}</p>
    <div className="registration-upload"><ImagePlus size={27}/><strong>{reading ? 'Membaca gambar…' : value ? 'Ganti gambar' : 'Klik untuk unggah gambar'}</strong><span>JPG, PNG, atau WebP · Maksimal 2 MB</span><input id={id} className="file-input registration-file" type="file" accept="image/jpeg,image/png,image/webp" required={required && !value} aria-describedby={`${id}-help ${id}-error`} aria-invalid={!!error} onChange={e => { read(e.target.files?.[0]); e.target.value = ''; }}/></div>
    {value && <div className="registration-upload-preview"><img src={value.data} alt={`Pratinjau ${label.toLowerCase()}`}/><div><span><Check size={15}/>{value.name}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { selection.current++; onChange(null); setReading(false); }}>Hapus <X size={14}/></button></div></div>}<div id={`${id}-error`}><ErrorMessage message={error}/></div>
  </div>;
}

function DynamicField({ field, value, onChange }: { field: Field; value: string | boolean; onChange: (value: string | boolean) => void }) {
  if (field.type === 'checkbox') return <label className="check-label"><input className="checkbox checkbox-sm" type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} required={field.required}/>{field.label}{field.required && ' *'}</label>;
  return <label className="form-label">{field.label}{field.required && <span className="required"> *</span>}{field.type === 'select' ? <select className="select" value={String(value ?? '')} onChange={e => onChange(e.target.value)} required={field.required}><option value="">Pilih {field.label.toLowerCase()}</option>{field.options.map(v => <option key={v}>{v}</option>)}</select> : field.type === 'textarea' ? <textarea className="textarea" value={String(value ?? '')} onChange={e => onChange(e.target.value)} required={field.required} maxLength={2000}/> : <input className="input" type={field.type} value={String(value ?? '')} onChange={e => onChange(e.target.value)} required={field.required} maxLength={2000}/>}</label>;
}
