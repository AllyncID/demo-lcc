import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, dateText, numberText } from './api';
import { ErrorMessage, Footer, Header, Portrait } from './components';
import { ArrowUpRight, Award, CheckCircle2, Download01, ImagePlus, LogOut, RefreshCw, ShieldCheck, X } from './icons';
import type { Bootstrap, RegistrationPayment } from './types';
import './tickets.css';

type DeliveryMode = 'local' | 'smtp';
type ParticipantTicket = { id: number; number: string; issuedAt: string; checkedInAt: string | null; verificationUrl: string; qrImageUrl: string; pngUrl: string; pdfUrl: string };
type ParticipantDetails = {
  participant: { id: number; registrationNumber: string; name: string; email: string; category: string; status: 'pending' | 'approved' | 'rejected'; paymentStatus: 'not_required' | 'pending' | 'verified' | 'rejected'; reviewNote: string | null; createdAt: string; photo: string | null };
  ticket: ParticipantTicket | null;
  payment: RegistrationPayment;
  deliveryMode: DeliveryMode;
};
type Verification = { valid: boolean; status: 'valid' | 'used' | 'unavailable'; event: { name: string; year: string; location: string }; checkedInAt?: string | null; canCheckIn: boolean; attendee?: { name: string; photo: string | null; category: string; registrationNumber: string }; ticketNumber?: string };
type RegistrationState = { email?: string; registrationSubmitted?: boolean; otpSent?: boolean; deliveryMode?: DeliveryMode };
const registrationLabels = { pending: 'Menunggu review', approved: 'Disetujui', rejected: 'Perlu perbaikan' };
const paymentLabels = { not_required: 'Tidak diperlukan', pending: 'Menunggu verifikasi', verified: 'Terverifikasi', rejected: 'Bukti perlu diganti' };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kendala. Silakan coba lagi.';
const countdownText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function ParticipantPage({ data }: { data: Bootstrap }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [initial] = useState<RegistrationState>(() => (location.state || {}) as RegistrationState);
  const [email, setEmail] = useState(initial.email || '');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(!!initial.otpSent && !!initial.email);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode | undefined>(initial.deliveryMode);
  const [resendAt, setResendAt] = useState(initial.otpSent ? Date.now() + 60_000 : 0);
  const [now, setNow] = useState(Date.now());
  const [details, setDetails] = useState<ParticipantDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [proof, setProof] = useState<{ data: string; name: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [proofError, setProofError] = useState('');
  const selection = useRef(0);
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (initial.otpSent && initial.email) {
      setLoading(false);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    let active = true;
    api<ParticipantDetails>('/participant/me').then(result => {
      if (active) { setDetails(result); setDeliveryMode(result.deliveryMode); }
    }).catch(err => {
      if (active && !(err instanceof ApiError && err.status === 401)) setError(errorText(err));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!resendAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [resendAt]);

  async function loadDetails() {
    try {
      const result = await api<ParticipantDetails>('/participant/me');
      setDetails(result); setDeliveryMode(result.deliveryMode);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setDetails(null); setOtpSent(false); setCode(''); }
      throw err;
    }
  }

  async function requestOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || resendSeconds > 0) return;
    setBusy('request'); setError(''); setNotice('');
    try {
      const result = await api<{ message: string; deliveryMode: DeliveryMode; resendAfter: number }>('/participant/otp/request', 'POST', { email: email.trim() });
      setEmail(email.trim()); setOtpSent(true); setCode(''); setDeliveryMode(result.deliveryMode);
      setNow(Date.now()); setResendAt(Date.now() + (result.resendAfter || 60) * 1000);
      setNotice(result.message);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('verify'); setError(''); setNotice('');
    try {
      await api('/participant/otp/verify', 'POST', { email: email.trim(), code });
      await loadDetails(); setCode('');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function refreshStatus() {
    setBusy('refresh'); setError(''); setNotice('');
    try { await loadDetails(); setNotice('Status pendaftaran sudah diperbarui.'); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function logout() {
    setBusy('logout'); setError(''); setNotice('');
    try {
      await api('/participant/logout', 'POST', {});
      selection.current++; setReading(false); setProofError('');
      setDetails(null); setOtpSent(false); setCode(''); setProof(null); setNotice('Kamu sudah keluar dari halaman peserta.');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  function readProof(file?: File) {
    if (!file) return;
    const version = ++selection.current;
    setProof(null); setProofError(''); setReading(false);
    if (file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProofError('Pilih gambar JPG, PNG, atau WebP maksimal 2 MB.'); return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => { if (selection.current === version) { setProof({ data: String(reader.result), name: file.name }); setReading(false); } };
    reader.onerror = () => { if (selection.current === version) { setProofError('Gambar gagal dibaca. Pilih file lagi.'); setReading(false); } };
    reader.readAsDataURL(file);
  }

  async function replaceProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof || reading) { setProofError('Pilih bukti pembayaran pengganti terlebih dahulu.'); return; }
    setBusy('proof'); setError(''); setNotice('');
    try {
      await api('/participant/payment-proof', 'POST', { paymentProofData: proof.data });
      await loadDetails(); setProof(null); setNotice('Bukti pembayaran pengganti terkirim. Pendaftaranmu kembali menunggu review panitia.');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  const person = details?.participant;
  return <div className="public-page ticket-page"><Header data={data}/><main id="main-content" className="participant-shell">
    <header className="ticket-intro"><span className="ticket-event"><Award size={16}/>{data.settings.eventName} {data.settings.year}</span><h1 id="participant-page-title" className="participant-title">{person ? <>Pendaftaran &amp; <em>tiketmu.</em></> : otpSent ? <>Verifikasi <em>emailmu.</em></> : <>Masuk ke <em>halaman peserta.</em></>}</h1>{!person && <p>{otpSent ? 'Masukkan kode OTP untuk membuka status pendaftaran dan tiketmu.' : 'Gunakan email pendaftaranmu. Kami akan mengirim kode OTP untuk masuk, tanpa password.'}</p>}</header>
    {loading ? <div className="ticket-loading" role="status"><span className="loading loading-spinner loading-sm"/>Memuat halaman peserta…</div> : <>
      <ErrorMessage message={error}/>
      {notice && <p className="ticket-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
      {details && person ? <>
        <section className="participant-identity" aria-labelledby="participant-name"><div className="participant-profile"><h2 id="participant-name">{person.name}</h2><p className="participant-profile-meta"><span>{person.category}</span><span className="participant-meta-dot" aria-hidden="true">·</span><span className="participant-email">{person.email}</span></p></div><div className="participant-registration-id"><span>Nomor pendaftaran</span><strong>{person.registrationNumber}</strong></div></section>
        <section className="ticket-section" aria-labelledby="participant-status"><div className="ticket-section-heading"><h2 id="participant-status">Status pendaftaran</h2><button className="btn btn-ghost btn-sm" onClick={refreshStatus} disabled={!!busy}><RefreshCw size={16}/>{busy === 'refresh' ? 'Memperbarui…' : 'Perbarui status'}</button></div>
          <dl className="ticket-facts"><div><dt>Pendaftaran</dt><dd><span className={`badge badge-outline ticket-badge is-${person.status}`}>{registrationLabels[person.status]}</span></dd></div><div><dt>Pembayaran</dt><dd><span className={`badge badge-outline ticket-badge is-${person.paymentStatus}`}>{paymentLabels[person.paymentStatus]}</span></dd></div><div><dt>Tanggal daftar</dt><dd>{dateText(person.createdAt)}</dd></div></dl>
          {person.reviewNote && <div className="participant-review"><h3>Catatan panitia</h3><p>{person.reviewNote}</p></div>}
          {!details.ticket && <p className="ticket-help">{person.status === 'rejected' ? 'Baca catatan panitia sebelum memperbaiki bukti pembayaran. Pendaftaran akan diperiksa kembali setelah bukti pengganti terkirim.' : 'Tiket akan muncul di sini setelah pendaftaran disetujui dan pembayaran diverifikasi panitia. Gunakan tombol Perbarui status untuk mengecek hasil review.'}</p>}
        </section>
        {(person.status === 'rejected' || person.paymentStatus === 'rejected') && <section className="ticket-section" aria-labelledby="replacement-title"><h2 id="replacement-title">Perbaiki bukti pembayaran</h2><p className="ticket-help">Unggah gambar yang memperlihatkan nominal, tanggal, dan tujuan pembayaran dengan jelas. Bukti ini hanya dapat dilihat panitia.</p><PaymentDetails payment={details.payment}/>
          <form className="participant-proof-form" onSubmit={replaceProof} aria-busy={!!busy || reading}><fieldset className="fieldset ticket-fieldset" disabled={!!busy}><legend className="sr-only">Bukti pembayaran pengganti</legend><label className="ticket-label" htmlFor="replacement-proof"><ImagePlus size={18}/>Bukti pembayaran pengganti <span>*</span></label><input id="replacement-proof" className="file-input" type="file" accept="image/jpeg,image/png,image/webp" required={!proof} aria-describedby="replacement-help replacement-error" onChange={event => { readProof(event.target.files?.[0]); event.target.value = ''; }}/><p id="replacement-help" className="ticket-help">JPG, PNG, atau WebP · Maksimal 2 MB</p>
            {reading && <p className="ticket-help" role="status">Membaca gambar…</p>}
            {proof && <div className="participant-proof-preview"><img src={proof.data} alt="Pratinjau bukti pembayaran pengganti"/><p>{proof.name}</p><button className="btn btn-ghost btn-sm" type="button" onClick={() => { selection.current++; setProof(null); setReading(false); }}><X size={14}/>Hapus gambar</button></div>}
            <div id="replacement-error"><ErrorMessage message={proofError}/></div><button className="btn btn-primary" disabled={!!busy || reading || !proof}>{busy === 'proof' ? 'Mengirim bukti…' : 'Kirim bukti pengganti'}<ArrowUpRight size={18}/></button></fieldset></form>
        </section>}
        {details.ticket && <section className="ticket-section participant-ticket" aria-labelledby="your-ticket"><span className="ticket-kicker">{details.ticket.number}</span><h2 id="your-ticket">Tiket untuk panggungmu.</h2><p className="ticket-help">Simpan tiket ini dan tunjukkan QR kepada panitia saat datang. Satu tiket berlaku untuk satu kali check-in.</p><div className="participant-qr"><img src={details.ticket.qrImageUrl} alt={`Kode QR tiket ${details.ticket.number}`} width={280} height={280}/></div>
          {details.ticket.checkedInAt ? <p className="ticket-check-in"><CheckCircle2 size={19}/>Sudah check-in · {dateText(details.ticket.checkedInAt, true)}</p> : <p className="ticket-check-in"><ShieldCheck size={18}/>Tiket aktif · Belum check-in</p>}
          <div className="ticket-downloads"><a href={details.ticket.pngUrl} className="btn btn-primary" download><Download01 size={18}/>Simpan PNG</a><a href={details.ticket.pdfUrl} className="btn btn-outline" download><Download01 size={18}/>Simpan PDF</a></div><p className="ticket-help">Diterbitkan {dateText(details.ticket.issuedAt)}. Jaga QR dan tiketmu agar tidak digunakan orang lain.</p>
        </section>}
        <section className="ticket-section participant-event-info" aria-labelledby="event-information"><h2 id="event-information">Informasi acara</h2><dl className="ticket-facts"><div><dt>Acara</dt><dd>{data.settings.eventName} {data.settings.year}</dd></div><div><dt>Lokasi</dt><dd>{data.settings.location}</dd></div></dl>{person.paymentStatus === 'pending' && <><h3>Pembayaran pendaftaran</h3><PaymentDetails payment={details.payment}/><p className="ticket-help">Bukti yang sudah dikirim sedang diperiksa. Tidak perlu membayar ulang selama menunggu review.</p></>}</section>
        <div className="participant-session"><span><ShieldCheck size={15}/>Sesi peserta tersimpan di browser ini.</span><button className="btn btn-ghost btn-sm" onClick={logout} disabled={!!busy}><LogOut size={16}/>{busy === 'logout' ? 'Keluar…' : 'Keluar'}</button></div>
      </> : <section className="participant-auth" aria-labelledby="participant-page-title">
        {initial.registrationSubmitted && <div className="participant-registration-summary" role="status"><CheckCircle2 size={21}/><div><span>Permintaan diterima</span><p>Periksa OTP di emailmu untuk membuka status pendaftaran dan tiket.</p></div></div>}
        {otpSent ? <><p className="participant-otp-recipient">Email pendaftaran <strong>{email}</strong></p><DeliveryNote mode={deliveryMode} isAdmin={data.isAdmin}/><form onSubmit={verifyOtp} aria-busy={busy === 'verify'}><fieldset className="fieldset ticket-fieldset" disabled={!!busy}><legend className="sr-only">Verifikasi email peserta</legend><label className="ticket-label" htmlFor="participant-otp">Kode OTP</label><input id="participant-otp" className="input participant-otp" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="000000" required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-describedby="otp-help"/><p id="otp-help" className="ticket-help">Masukkan 6 angka. Kode berlaku 10 menit dan hanya dapat digunakan sekali.</p><button className="btn btn-primary" disabled={!!busy}>{busy === 'verify' ? 'Memverifikasi…' : 'Verifikasi & masuk'}<ArrowUpRight size={18}/></button></fieldset></form><div className="participant-otp-options"><button className="btn btn-ghost btn-sm" type="button" onClick={() => requestOtp()} disabled={!!busy || resendSeconds > 0}>{busy === 'request' ? 'Mengirim kode…' : resendSeconds > 0 ? `Kirim ulang dalam ${countdownText(resendSeconds)}` : 'Kirim ulang kode'}</button><button className="btn btn-ghost btn-sm" type="button" onClick={() => { setOtpSent(false); setCode(''); setError(''); setNotice(''); }} disabled={!!busy}>Ganti email</button></div></> : <><form onSubmit={requestOtp} aria-busy={busy === 'request'}><fieldset className="fieldset ticket-fieldset" disabled={!!busy}><legend className="sr-only">Email peserta</legend><label className="ticket-label" htmlFor="participant-email">Email pendaftaran</label><input id="participant-email" className="input" name="email" type="email" autoComplete="email" placeholder="nama@email.com" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)}/><button className="btn btn-primary" disabled={!!busy || resendSeconds > 0}>{busy === 'request' ? 'Mengirim kode…' : resendSeconds > 0 ? `Kirim kode dalam ${countdownText(resendSeconds)}` : 'Kirim kode verifikasi'}<ArrowUpRight size={18}/></button></fieldset></form><p className="participant-register-link">Belum terdaftar? <Link to="/register">Daftar sebagai creator <ArrowUpRight size={15}/></Link></p></>}
        <p className="participant-private"><ShieldCheck size={15}/>Status dan tiket hanya tersedia setelah emailmu diverifikasi.</p>
      </section>}
    </>}
  </main><Footer data={data} showCta={false}/></div>;
}

function DeliveryNote({ mode, isAdmin }: { mode?: DeliveryMode; isAdmin: boolean }) {
  if (mode !== 'local') return null;
  return <div className="participant-delivery"><span className="ticket-kicker">Mode email lokal</span><p>Email disimpan di kotak email privat panitia, belum dikirim ke inbox pribadimu. Minta panitia memeriksa menu Email lokal untuk mendapatkan kode OTP.</p>{isAdmin && <Link to="/admin?tab=mail">Buka email lokal panitia <ArrowUpRight size={15}/></Link>}</div>;
}

function PaymentDetails({ payment }: { payment: RegistrationPayment }) {
  return <div className="participant-payment">{payment.demo && <p className="ticket-demo"><ShieldCheck size={16}/>Simulasi: tidak perlu transfer sungguhan. Gunakan gambar contoh.</p>}<dl className="ticket-facts"><div><dt>{payment.demo ? 'Contoh biaya' : 'Biaya pendaftaran'}</dt><dd>Rp{numberText(payment.amount)}</dd></div><div><dt>{payment.provider}</dt><dd>{payment.accountNumber}</dd></div><div><dt>Atas nama</dt><dd>{payment.accountName}</dd></div></dl></div>;
}

export function TicketVerificationPage({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const { token = '' } = useParams<{ token: string }>();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setVerification(null); setError(''); setNotice(''); setMissing(false); setConfirming(false);
    api<Verification>(`/tickets/verify/${encodeURIComponent(token)}`).then(result => { if (active) setVerification(result); }).catch(err => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(errorText(err));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function reloadVerification() {
    setBusy(true); setError(''); setConfirming(false);
    try { setVerification(await api<Verification>(`/tickets/verify/${encodeURIComponent(token)}`)); setMissing(false); }
    catch (err) { if (err instanceof ApiError && err.status === 404) { setMissing(true); setVerification(null); } else setError(errorText(err)); }
    finally { setBusy(false); }
  }

  async function checkIn() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ message: string; checkedInAt: string }>('/admin/tickets/check-in', 'POST', { token });
      setVerification(current => current ? { ...current, status: 'used', canCheckIn: false, checkedInAt: result.checkedInAt } : current);
      setConfirming(false); setNotice(result.message || 'Check-in berhasil dicatat.');
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirming(false); setNotice('Tiket ini sudah digunakan untuk check-in.');
        try { setVerification(await api<Verification>(`/tickets/verify/${encodeURIComponent(token)}`)); }
        catch { setVerification(current => current ? { ...current, status: 'used', canCheckIn: false } : current); }
      } else setError(errorText(err));
    } finally { setBusy(false); }
  }

  const usable = !!verification?.valid && verification.status === 'valid';
  const used = verification?.status === 'used';
  const next = `/tiket/verifikasi/${encodeURIComponent(token)}`;
  return <div className="public-page ticket-page"><Header data={data}/><main id="main-content" className="participant-shell verification-shell"><header className="ticket-intro"><span className="ticket-event"><ShieldCheck size={16}/>VERIFIKASI TIKET</span><h1>Tiketmu,<br/><em>siap diperiksa.</em></h1><p>Periksa status tiket {data.settings.eventName} {data.settings.year}.</p></header>
    {loading ? <div className="ticket-loading" role="status"><span className="loading loading-spinner loading-sm"/>Memeriksa tiket…</div> : <>
      <ErrorMessage message={error}/>{notice && <p className="ticket-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
      {verification || missing ? <section className="verification-result" aria-labelledby="verification-status"><div className={`verification-icon ${usable ? 'is-valid' : used ? 'is-used' : 'is-unavailable'}`}>{usable || used ? <CheckCircle2 size={38}/> : <X size={38}/>}</div><span className="ticket-kicker">{verification?.ticketNumber || 'Status tiket'}</span><h2 id="verification-status">{missing ? 'Tiket tidak ditemukan.' : used ? 'Tiket sudah digunakan.' : usable ? 'Tiket valid.' : 'Tiket belum tersedia.'}</h2><p className="ticket-help">{missing ? 'QR atau tautan tiket tidak dikenali. Periksa kembali tiket dari halaman peserta.' : used ? 'Tiket ini sudah tercatat check-in dan tidak dapat digunakan kembali.' : usable ? 'Tiket aktif. Panitia perlu mengonfirmasi kehadiran untuk mencatat check-in.' : 'Tiket ini belum dapat digunakan. Pemilik dapat memeriksa status pendaftaran di halaman peserta.'}</p>
        {verification?.checkedInAt && <p className="verification-used-time">Check-in · {dateText(verification.checkedInAt, true)}</p>}
        {verification?.attendee && <div className="verification-attendee"><Portrait creator={verification.attendee}/><div><span className="ticket-kicker">{verification.attendee.registrationNumber}</span><h3>{verification.attendee.name}</h3><p>{verification.attendee.category}</p></div></div>}
        {verification?.event && <dl className="ticket-facts verification-event"><div><dt>Acara</dt><dd>{verification.event.name} {verification.event.year}</dd></div><div><dt>Lokasi</dt><dd>{verification.event.location}</dd></div></dl>}
        {usable && verification?.canCheckIn && (confirming ? <div className="verification-confirm"><h3>Konfirmasi kehadiran peserta</h3><p className="ticket-help">Pastikan identitas peserta sesuai dengan data di atas. Check-in akan menggunakan tiket ini satu kali.</p><button className="btn btn-primary" onClick={checkIn} disabled={busy}>{busy ? 'Mencatat kehadiran…' : 'Ya, konfirmasi check-in'}<CheckCircle2 size={19}/></button><button className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Batal</button></div> : <button className="btn btn-primary verification-primary" onClick={() => setConfirming(true)} disabled={busy}>Catat check-in<ArrowUpRight size={18}/></button>)}
        {usable && !verification?.canCheckIn && !data.isAdmin && <Link className="btn btn-primary verification-primary" to={`/admin?next=${encodeURIComponent(next)}`}>Masuk sebagai panitia<ArrowUpRight size={18}/></Link>}
      </section> : <p className="ticket-help">Status tiket belum dapat dimuat. Periksa koneksi lalu coba lagi.</p>}
      <div className="verification-actions"><button className="btn btn-ghost" onClick={reloadVerification} disabled={busy}><RefreshCw size={17}/>{busy ? 'Memperbarui…' : 'Periksa ulang'}</button><Link className="text-link" to="/peserta">Halaman peserta<ArrowUpRight size={17}/></Link></div>
    </>}
  </main><Footer data={data} showCta={false}/></div>;
}
