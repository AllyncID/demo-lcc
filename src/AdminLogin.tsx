import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Eye, EyeOff, ShieldCheck } from './icons';
import { api } from './api';
import { Brand, ErrorMessage, Footer } from './components';
import type { Bootstrap } from './types';
import { ticketReturnPath } from './ticket-utils';
import './admin-login.css';

export function AdminLogin({ data, onLogin }: { data: Bootstrap; onLogin: () => Promise<void> }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      await api('/admin/login', 'POST', { email: form.get('email'), password: form.get('password') });
      await onLogin();
      const next = ticketReturnPath(params.get('next'));
      if (next) navigate(next, { replace: true });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="admin-login-page">
    <header className="admin-login-header"><div className="admin-login-container"><Brand compact/><Link to="/" className="admin-login-back"><span>Kembali ke website</span><ArrowUpRight size={19}/></Link></div></header>
    <main id="main-content" className="admin-login-container admin-login-main">
      <div className="admin-login-form-side"><form className="admin-login-form" onSubmit={login} aria-busy={busy} aria-labelledby="admin-login-title">
        <div className="admin-login-intro"><h1 id="admin-login-title">Selamat datang,<br/><em>panitia LCC.</em></h1><p>Masuk untuk mengelola registrasi dan polling<br className="admin-login-desktop-break"/> LCC Awards {data.settings.year}.</p></div>
        <fieldset className="fieldset admin-login-fields" disabled={busy}>
          <legend className="sr-only">Akun admin</legend>
          <label className="admin-login-label" htmlFor="admin-email">Email admin</label>
          <input id="admin-email" className="input" name="email" type="email" autoComplete="username" placeholder="Email panitia" required aria-describedby={error ? 'admin-login-error' : undefined}/>
          <label className="admin-login-label" htmlFor="admin-password">Password</label>
          <div className="admin-login-password"><input id="admin-password" className="input" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Masukkan password" required maxLength={128} aria-describedby={error ? 'admin-login-error' : undefined}/><button className="btn btn-ghost btn-square" type="button" aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={show} aria-controls="admin-password" onClick={() => setShow(!show)}>{show ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div>
          {error && <div id="admin-login-error"><ErrorMessage message={error}/></div>}
          <button className="btn btn-primary admin-login-submit" type="submit" disabled={busy}><span>{busy ? 'Memverifikasi…' : 'Masuk ke dashboard'}</span>{busy ? <span className="loading loading-spinner loading-sm" aria-hidden="true"/> : <ArrowUpRight size={21}/>}</button>
        </fieldset>
        <p className="admin-login-restricted"><ShieldCheck size={16}/>Akses khusus panitia LCC NTB.</p>
      </form></div>
    </main>
    <Footer data={data} showCta={false}/>
  </div>;
}
