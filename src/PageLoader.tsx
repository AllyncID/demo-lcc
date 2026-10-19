import { Mark } from './components';

export function PageLoader({ ready }: { ready: boolean }) {
  return <div className={`page-loader${ready ? ' is-ready' : ''}`} role="status" aria-label="Memuat halaman">
    <div className="page-loader-brand"><Mark/><span>LCC NTB</span></div>
    <span className="sr-only">Menyiapkan panggung…</span>
  </div>;
}
