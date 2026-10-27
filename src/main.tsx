import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { api } from './api';
import type { Bootstrap } from './types';
import { Brand } from './components';
import { PageLoader } from './PageLoader';
import { WhatsAppHelp } from './PublicContact';
import { EventAnnouncement } from './EventAnnouncement';
import { Landing } from './Landing';
import { VotePage } from './PublicPages';
import { RegisterPage } from './RegisterPage';
import { Admin } from './Admin';
import { ParticipantPage, TicketVerificationPage } from './ParticipantPages';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/sora';
import './styles.css';
import './admin.css';
import './admin-mobile.css';

function App() {
  const location = useLocation();
  const [data, setData] = useState<Bootstrap>(); const [error, setError] = useState('');
  const refresh = useCallback(async () => { const next = await api<Bootstrap>('/bootstrap'); setData(next); setError(''); }, []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  useEffect(() => { if (data) document.title = `${data.settings.eventName} ${data.settings.year}`; }, [data?.settings.eventName, data?.settings.year]);
  useEffect(() => { if (!data) return; if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); else window.scrollTo(0, 0); }, [location.pathname, location.hash, !!data]);
  return <><PageLoader key={location.pathname} ready={!!data || !!error}/>{!data
    ? <div className="app-loading">{error && <><Brand/><p role="alert">{error}</p><button className="btn" onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Coba lagi</button></>}</div>
    : <Routes><Route path="/" element={<Landing data={data}/>}/><Route path="/vote" element={<VotePage data={data} refresh={refresh}/>}/><Route path="/register" element={<RegisterPage data={data}/>}/><Route path="/admin" element={<Admin data={data} refresh={refresh}/>}/><Route path="/peserta" element={<ParticipantPage data={data}/>}/><Route path="/tiket/verifikasi/:token" element={<TicketVerificationPage data={data} refresh={refresh}/>}/><Route path="*" element={<div className="app-loading"><Brand/><h1>Halaman tidak ditemukan.</h1><Link className="btn" to="/">Kembali ke beranda</Link></div>}/></Routes>}{data && <WhatsAppHelp/>}{data && location.pathname !== '/admin' && !location.pathname.startsWith('/admin/') && <EventAnnouncement key={location.pathname}/>}</>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
