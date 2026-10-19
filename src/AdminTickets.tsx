import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, dateText } from './api';
import { Camera, CheckCircle2, RefreshCw, Search, ShieldCheck, ArrowUpRight, ChevronRight } from './icons';
import { Modal, Portrait } from './components';
import { extractTicketToken } from './ticket-utils';
import './admin-tickets.css';

interface Verification {
  valid: boolean; status: 'valid' | 'used' | 'unavailable'; canCheckIn: boolean; checkedInAt?: string | null; ticketNumber?: string;
  attendee?: { name: string; photo: string | null; category: string; registrationNumber: string };
}
interface TicketRow { token: string; number: string; registrationNumber: string; name: string; category: string; status: 'valid' | 'used' | 'unavailable'; issuedAt: string; checkedInAt: string | null; verificationUrl: string }

export function AdminCheckin({ refreshKey }: { refreshKey: string }) {
  const [input, setInput] = useState(''); const [result, setResult] = useState<Verification | null>(null);
  const [token, setToken] = useState(''); const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<TicketRow[]>([]); const [listError, setListError] = useState('');
  const [stats, setStats] = useState({ issued: 0, checkedIn: 0 }); const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [page, setPage] = useState(1);
  const request = useRef(0);
  const loadList = useCallback(async () => {
    try { const next = await api<{tickets:TicketRow[];stats:{issued:number;checkedIn:number}}>('/admin/tickets'); setTickets(next.tickets); setStats(next.stats); setListError(''); }
    catch (e) { setListError((e as Error).message); }
  }, []);
  useEffect(() => { void loadList(); }, [loadList, refreshKey]);
  useEffect(() => () => { request.current++; }, []);
  const lookup = useCallback(async (value: string) => {
    const next = extractTicketToken(value, window.location.origin); setError(''); setNotice(''); setResult(null);
    if (!next) { setError('Gunakan QR tiket LCC, link verifikasi dari website ini, atau token tiket yang valid.'); return; }
    const version = ++request.current; setBusy(true); setToken(next);
    try { const found = await api<Verification>('/tickets/verify/' + next); if (version === request.current) setResult(found); }
    catch (e) { if (version === request.current) setError((e as Error).message); }
    finally { if (version === request.current) setBusy(false); }
  }, []);
  const decoded = useCallback((value: string) => { setScanning(false); setInput(value); void lookup(value); }, [lookup]);
  async function checkIn() {
    if (!result?.canCheckIn || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api<{message:string;checkedInAt:string}>('/admin/tickets/check-in', 'POST', { token });
      setResult({ ...result, status: 'used', checkedInAt: response.checkedInAt, canCheckIn: false }); setNotice(response.message); await loadList();
    } catch (e) {
      setError((e as Error).message);
      try { setResult(await api<Verification>('/tickets/verify/' + token)); } catch { setResult(null); }
      await loadList();
    } finally { setBusy(false); }
  }
  const rows = tickets.filter(t => (t.name + ' ' + t.registrationNumber + ' ' + t.number).toLowerCase().includes(query.trim().toLowerCase()) && (statusFilter === 'all' || (statusFilter === 'used' ? !!t.checkedInAt : !t.checkedInAt))).sort((a,b) => Number(!!b.checkedInAt) - Number(!!a.checkedInAt));
  const pageCount = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pageCount); const start = (currentPage - 1) * 10;
  return <div className="ticket-admin">
    <div className="ticket-admin-stats"><div><span>Tiket diterbitkan</span><strong>{stats.issued}</strong></div><div><span>Sudah check-in</span><strong>{stats.checkedIn}</strong></div></div>
    <section className="ticket-admin-panel"><div className="ticket-admin-heading"><div><h2>Scan, periksa, lalu check-in.</h2></div><button className="btn btn-primary" type="button" disabled={busy} aria-haspopup="dialog" onClick={() => setScanning(true)}><Camera size={18}/>Scan QR tiket</button></div>
      <p className="ticket-admin-help">Cocokkan nama dan foto dengan peserta. Status baru berubah setelah kamu mengonfirmasi check-in.</p>
      {scanning && <Modal title="Scan QR tiket" open onClose={() => setScanning(false)} className="ticket-scanner-modal"><TicketScanner onDecoded={decoded} onClose={() => setScanning(false)}/></Modal>}
      <form className="ticket-lookup" onSubmit={(e: FormEvent) => { e.preventDefault(); void lookup(input); }}><label className="form-label">Link atau token tiket<input className="input" aria-label="Link atau token tiket" value={input} onChange={e => setInput(e.target.value)} placeholder="Tempel link hasil scan QR" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={500} required disabled={busy}/></label><button className="btn btn-outline" disabled={busy}>{busy ? 'Memeriksa…' : 'Periksa tiket'}</button></form>
      {error && <p className="ticket-admin-error" role="alert">{error}</p>}{notice && <p className="ticket-admin-notice" role="status"><CheckCircle2 size={18}/>{notice}</p>}
      {result && <div className={'ticket-verification-result ' + result.status}><div className="ticket-result-top"><span>{!result.valid || result.status === 'unavailable' ? 'Tiket tidak tersedia' : result.status === 'used' ? 'Sudah check-in' : 'Tiket valid · Belum check-in'}</span>{result.checkedInAt && <time>{dateText(result.checkedInAt, true)}</time>}</div>{result.attendee && <div className="ticket-attendee"><Portrait creator={result.attendee}/><div><h3>{result.attendee.name}</h3><p>{result.attendee.category}</p><small>{result.attendee.registrationNumber} · {result.ticketNumber}</small></div></div>}{result.canCheckIn && <button className="btn btn-primary ticket-confirm-checkin" disabled={busy} onClick={checkIn}><CheckCircle2 size={19}/>{busy ? 'Mencatat check-in…' : 'Konfirmasi check-in peserta ini'}</button>}</div>}
    </section>
    <section className="ticket-admin-panel ticket-participant-panel"><div className="ticket-admin-heading"><div><h2>Daftar tiket peserta</h2><p className="ticket-admin-help">Status tiket tetap tersimpan ketika halaman ditutup.</p></div><button className="btn btn-outline btn-sm" onClick={loadList}><RefreshCw size={16}/>Perbarui</button></div><div className="ticket-list-toolbar"><label className="input ticket-admin-search"><Search size={17}/><input aria-label="Cari tiket peserta" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Nama atau nomor pendaftaran"/></label><div className="ticket-status-filters" role="group" aria-label="Filter status check-in">{([{ id:'all', label:'Semua' },{ id:'used', label:'Sudah check-in' },{ id:'unused', label:'Belum check-in' }] as const).map(filter => <button key={filter.id} type="button" className={'btn btn-sm ' + (statusFilter === filter.id ? 'is-active' : '')} aria-pressed={statusFilter === filter.id} onClick={() => { setStatusFilter(filter.id); setPage(1); }}>{filter.label}</button>)}</div></div>{listError && <p className="ticket-admin-error" role="alert">{listError}</p>}
      <div className="ticket-list">{rows.slice(start,start+10).map(t => <div className="ticket-list-row" key={t.number}><div><strong>{t.name}</strong><span>{t.registrationNumber} · {t.category}</span></div><div className={`ticket-list-status ${t.status}`}><span>{t.status === 'used' ? 'Sudah check-in' : t.status === 'unavailable' ? 'Tidak tersedia' : 'Belum check-in'}</span>{t.checkedInAt && <small>{dateText(t.checkedInAt,true)}</small>}</div><Link className="btn btn-outline btn-sm" to={'/tiket/verifikasi/'+t.token}>Buka tiket <ArrowUpRight size={15}/></Link></div>)}{!rows.length && <p className="ticket-admin-empty">{tickets.length ? 'Tidak ada tiket yang sesuai pencarian atau filter ini.' : 'Tiket akan muncul setelah pembayaran dan pendaftaran peserta disetujui.'}</p>}</div>
      {rows.length > 10 && <div className="ticket-list-pagination"><span>{start+1}–{Math.min(start+10,rows.length)} dari {rows.length} tiket</span><nav className="join" aria-label="Navigasi halaman tiket"><button type="button" className="btn btn-sm join-item" aria-label="Halaman sebelumnya" disabled={currentPage === 1} onClick={() => setPage(currentPage-1)}><ChevronRight className="ticket-page-prev" size={20}/><span className="pagination-label">Sebelumnya</span></button><span className="join-item ticket-page-counter" aria-live="polite" aria-label={`Halaman ${currentPage} dari ${pageCount}`}>{currentPage} / {pageCount}</span><button type="button" className="btn btn-sm join-item" aria-label="Halaman berikutnya" disabled={currentPage === pageCount} onClick={() => setPage(currentPage+1)}><span className="pagination-label">Berikutnya</span><ChevronRight size={20}/></button></nav></div>}
    </section>
  </div>;
}

function TicketScanner({ onDecoded, onClose }: { onDecoded: (value:string)=>void; onClose:()=>void }) {
  const video = useRef<HTMLVideoElement>(null); const [error, setError] = useState('');
  useEffect(() => {
    let active = true, frame = 0, lastScan = 0; let stream: MediaStream | undefined;
    const canvas = document.createElement('canvas'); const context = canvas.getContext('2d', { willReadFrequently: true });
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !context) throw new Error('Kamera tidak tersedia. Gunakan kamera HP untuk membuka link QR, atau tempel link tiket di bawah.');
        const { default: jsQR } = await import('jsqr');
        if (!active) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        video.current!.srcObject = stream; await video.current!.play();
        function scan(time:number) {
          if (!active) return;
          const element = video.current;
          if (element && element.readyState >= 2 && time-lastScan > 160) {
            lastScan=time; const scale=Math.min(1,640/element.videoWidth); canvas.width=Math.round(element.videoWidth*scale); canvas.height=Math.round(element.videoHeight*scale);
            context!.drawImage(element,0,0,canvas.width,canvas.height); const image=context!.getImageData(0,0,canvas.width,canvas.height); const code=jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'});
            if (code) { active=false; stream?.getTracks().forEach(t=>t.stop()); onDecoded(code.data); return; }
          }
          frame=requestAnimationFrame(scan);
        }
        frame=requestAnimationFrame(scan);
      } catch (e) { stream?.getTracks().forEach(t=>t.stop()); if(active) setError(e instanceof Error && e.name==='NotAllowedError' ? 'Izin kamera belum diberikan. Izinkan kamera di browser atau gunakan link tiket.' : (e as Error).message); }
    }
    void start();
    return () => { active=false;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop()); };
  }, [onDecoded]);
  return <div className="ticket-camera"><video ref={video} muted playsInline aria-label="Pemindai QR tiket"/>{error ? <p className="ticket-admin-error" role="alert">{error}</p> : <p>Arahkan kamera ke QR tiket. Pemeriksaan dilakukan sebelum check-in.</p>}<button className="btn btn-outline btn-sm" onClick={onClose}>Tutup pemindai</button></div>;
}

interface OutboxMessage { id: number; to: string; subject: string; text: string; createdAt: string }
export function AdminMailOutbox({ refreshKey }: { refreshKey: string }) {
  const [messages,setMessages]=useState<OutboxMessage[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setBusy(true);try{const data=await api<{mode:string;messages:OutboxMessage[]}>('/admin/mail-outbox');setMessages(data.messages);setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}},[]);
  useEffect(()=>{void load();},[load,refreshKey]);
  return <div className="ticket-admin"><section className="ticket-admin-panel"><div className="ticket-admin-heading"><div><span className="section-label">KHUSUS PENGUJIAN LOKAL</span><h2>Outbox email peserta</h2></div><button className="btn btn-outline btn-sm" disabled={busy} onClick={load}><RefreshCw size={16}/>{busy?'Memuat…':'Perbarui'}</button></div><p className="ticket-admin-help"><ShieldCheck size={17}/>Email di bawah tersimpan privat untuk mencoba OTP dan notifikasi di localhost. Belum dikirim ke inbox penerima. Menu ini dinonaktifkan pada production dan saat SMTP digunakan.</p>{error&&<p className="ticket-admin-error" role="alert">{error}</p>}<div className="ticket-mail-list">{messages.map(m=><details className="ticket-mail" key={m.id}><summary><strong>{m.subject}</strong><span>{m.to} · {dateText(m.createdAt,true)}</span></summary><pre>{m.text}</pre></details>)}{!messages.length&&!error&&<p className="ticket-admin-empty">Belum ada email. Daftar sebagai peserta atau minta kode OTP dari halaman peserta untuk mencoba.</p>}</div></section></div>;
}
