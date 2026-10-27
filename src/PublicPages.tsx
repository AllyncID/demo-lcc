import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Check, CheckCircle2, Vote, ShieldCheck, CalendarDays, ArrowUpRight, SlidersHorizontal } from './icons';
import { api, dateText } from './api';
import { Header, Footer, ErrorMessage, Portrait, Modal } from './components';
import { getPollingCreators, getVotingUnavailable } from './polling-utils';
import type { Bootstrap, Creator } from './types';
import './polling.css';

export function VotePage({ data, refresh }: { data: Bootstrap; refresh: () => Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const category = data.categories.some(c => c.id === Number(params.get('category'))) ? Number(params.get('category')) : 0;
  const setCategory = (id: number) => setParams(id ? { category: String(id) } : {});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Creator | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const creators = getPollingCreators(data.creators, category, query);
  const categoryName = data.categories.find(c => c.id === category)?.name || 'Semua creator';

  async function vote() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await api('/votes', 'POST', { creatorId: selected.id });
      await refresh();
      setSuccess('Dukunganmu untuk ' + selected.name + ' sudah tercatat.');
      setSelected(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const unavailable = getVotingUnavailable(data);
  if (unavailable) return <div className="polling-page"><Header data={data}/><main id="main-content" className="hero polling-unavailable" aria-labelledby="polling-unavailable-title">
    <div className="hero-content polling-unavailable-content">
      <span className="polling-unavailable-icon" aria-hidden="true"><CalendarDays size={34}/></span>
      <span className="section-label">POLLING LCC AWARDS {data.settings.year}</span>
      <h1 id="polling-unavailable-title">{unavailable.title}</h1>
      <p>{unavailable.description}</p>
      {unavailable.opensAt && <div className="polling-opens-at"><span>Voting dibuka pada</span><time dateTime={unavailable.opensAt}>{dateText(unavailable.opensAt, true)}</time></div>}
      <Link className="btn btn-primary" to="/">Kembali ke beranda<ArrowUpRight size={18}/></Link>
    </div>
  </main><Footer data={data} showCta={false}/></div>;

  return <div className="polling-page"><Header data={data}/><main id="main-content">
    <section className="polling-hero site-container" aria-labelledby="polling-title">
      <div className="polling-hero-copy">
        <span className="section-label">LCC AWARDS {data.settings.year} · PEOPLE’S CHOICE</span>
        <h1 id="polling-title">Karya mereka.<br/><em>Suara darimu.</em></h1>
        <p>Kenali ceritanya, temukan creator pilihanmu.<br className="polling-desktop-break"/> Satu dukungan untuk karya yang berarti.</p>
      </div>
      <div className="polling-guide">
        <span className={'polling-status' + (data.votingOpen ? ' is-open' : '')}><span/>{data.votingOpen ? 'Polling sedang dibuka' : 'Polling belum dibuka / berakhir'}</span>
        <div className="polling-date"><CalendarDays size={20}/><div><span>Batas polling</span><strong>{dateText(data.settings.votingEndsAt)}</strong></div></div>
        <div className="polling-rule"><ShieldCheck size={19}/><p>Satu pilihan per kategori.<br/><span>Pilihan yang dikirim tidak dapat diganti.</span></p></div>
      </div>
    </section>

    <section className="polling-gallery site-container" aria-labelledby="polling-gallery-title">
      <div className="polling-toolbar">
        <div><h2 id="polling-gallery-title">Temukan creator pilihanmu.</h2></div>
        <label className="input polling-search"><Search size={19}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama atau username" aria-label="Cari creator"/></label>
      </div>
      <div className="polling-filters" role="group" aria-label="Filter kategori">
        <button className={'btn btn-sm' + (!category ? ' is-active' : '')} aria-pressed={!category} onClick={() => setCategory(0)}>Semua creator</button>
        {data.categories.map(c => <button key={c.id} className={'btn btn-sm' + (category === c.id ? ' is-active' : '')} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</button>)}
      </div>
      <label className="polling-mobile-filter"><span>Kategori karya</span><select className="select" aria-label="Kategori karya" value={category} onChange={e => setCategory(Number(e.target.value))}><option value={0}>Semua creator</option>{data.categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      {success && <div className="polling-notice is-success" role="status"><CheckCircle2 size={19}/><p>{success}</p></div>}
      <div className="polling-results-head"><p aria-live="polite"><strong>{categoryName}</strong><span>{creators.length} creator</span></p><span><SlidersHorizontal size={15}/>Dukungan terbanyak lebih dulu</span></div>
      <div className="polling-grid">{creators.map(c => {
        const voted = data.votedCategories.find(v => v.category_id === c.categoryId);
        const isChoice = voted?.creator_id === c.id;
        return <article className={'card polling-card' + (isChoice ? ' is-choice' : '')} key={c.id}>
          <figure className="polling-photo"><Portrait creator={c}/><span className="polling-photo-shade"/><span className="badge polling-category">{c.category}</span>{!!c.dummy && <span className="badge polling-demo">Demo</span>}{isChoice && <span className="polling-choice"><Check size={15}/>Pilihanmu</span>}</figure>
          <div className="card-body polling-card-body"><div><h3 className="card-title">{c.name}</h3><span className="polling-handle">{c.handle}</span></div><p className="polling-bio">{c.bio || 'Cerita dan karya lokal, dari Lombok untuk dunia.'}</p>
            <div className="card-actions"><button className={'btn btn-primary polling-vote' + (isChoice ? ' is-selected' : '')} disabled={!data.votingOpen || !!voted} aria-label={(isChoice ? 'Pilihanmu: ' : voted ? 'Sudah memilih di kategori ' + c.category + ': ' : !data.votingOpen ? 'Polling ditutup: ' : 'Dukung ') + c.name} onClick={() => { setSelected(c); setError(''); }}><span>{isChoice ? 'Pilihanmu' : voted ? 'Sudah memilih' : !data.votingOpen ? 'Polling ditutup' : 'Dukung creator'}</span>{voted ? <Check size={18}/> : <ArrowUpRight size={19}/>}</button></div>
          </div>
        </article>;
      })}</div>
      {creators.length === 0 && <div className="polling-empty"><Search size={32}/><h3>Belum menemukan creatornya?</h3><p>Coba nama lain atau jelajahi semua kategori.</p><button className="btn btn-outline" onClick={() => { setQuery(''); setCategory(0); }}>Tampilkan semua creator</button></div>}
      <div className="polling-gallery-foot"><span>Setiap karya punya cerita.<br/>Setiap dukungan punya arti.</span>{data.creators.some(c => c.dummy) && <p>Profil berlabel <span>Demo</span> adalah contoh untuk pratinjau.</p>}</div>
    </section>
  </main><Footer data={data} showCta={false}/>
    <Modal className="polling-confirm" title="Satu suara, banyak arti." open={!!selected} dismissible={!busy} onClose={() => { if (!busy) setSelected(null); }}>{selected && <>
      <div className="polling-vote-preview"><Portrait creator={selected}/><div><span className="section-label">PILIHANMU</span><h3>{selected.name}</h3><p>{selected.handle}</p><span className="badge">{selected.category}</span></div></div>
      <p>Kamu akan mendukung <strong>{selected.name}</strong> di kategori <strong>{selected.category}</strong>. Pilihan ini tidak dapat diganti.</p>
      <ErrorMessage message={error}/><div className="modal-action"><button className="btn btn-outline" onClick={() => setSelected(null)} disabled={busy}>Kembali</button><button className="btn btn-primary" onClick={vote} disabled={busy}><Vote size={18}/>{busy ? 'Mencatat dukungan…' : 'Ya, kirim dukungan'}</button></div>
    </>}</Modal>
  </div>;
}
