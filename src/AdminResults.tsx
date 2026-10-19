import { useState } from 'react';
import { Download, ShieldCheck } from './icons';
import { numberText } from './api';
import { Empty, Portrait } from './components';
import { CreatorStatus } from './AdminCreators';
import { exportCreators } from './admin-utils';
import type { Dashboard } from './types';

export function Results({ dashboard: d }: { dashboard: Dashboard }) {
  const [category, setCategory] = useState(0); const [onlyLive, setOnlyLive] = useState(false);
  const [view, setView] = useState<'overall' | 'category'>('overall');
  const creators = d.creators.filter(c => (!category || c.categoryId === category) && (!onlyLive || c.status === 'approved' && c.visible && d.categories.some(cat => cat.id === c.categoryId && cat.active)));
  const ordered = [...creators].sort((a,b)=>b.votes-a.votes);
  const groups = d.categories.filter(cat => (!category || cat.id === category) && ordered.some(c => c.categoryId === cat.id)).map(cat => ({ id:String(cat.id), title:cat.name + (!cat.active ? ' · Nonaktif' : ''), creators:ordered.filter(c => c.categoryId === cat.id) }));
  const total = creators.reduce((sum,c)=>sum+c.votes,0);
  const overall = view === 'overall';
  const panels = overall ? (ordered.length ? [{ id:'overall',title:'Peringkat keseluruhan',creators:ordered }] : []) : groups;
  return <>
    <div className="results-summary"><div className="results-total"><div><span>Total dukungan</span><strong>{numberText(total)} <small>vote</small></strong></div></div><label className="form-label">Kategori<select className="select" value={category} onChange={e=>setCategory(Number(e.target.value))}><option value={0}>Semua kategori</option>{d.categories.map(c=><option key={c.id} value={c.id}>{c.name}{!c.active && ' (nonaktif)'}</option>)}</select></label></div>
    <div className="results-controls"><div className="admin-filter" role="group" aria-label="Tampilan hasil polling"><button className={overall ? 'active' : ''} aria-pressed={overall} onClick={()=>setView('overall')}>Keseluruhan</button><button className={!overall ? 'active' : ''} aria-pressed={!overall} onClick={()=>setView('category')}>Per kategori</button></div><label className="field-required"><input className="toggle toggle-sm" type="checkbox" checked={onlyLive} onChange={e=>setOnlyLive(e.target.checked)}/>Hanya nominee yang tampil di polling</label><button className="btn btn-outline btn-sm" disabled={!ordered.length} onClick={()=>exportCreators(overall ? ordered : groups.flatMap(g=>g.creators),'votes')}><Download size={15}/>Ekspor hasil filter</button></div>
    {panels.map(panel=>{
      const subtotal = panel.creators.reduce((sum,c)=>sum+c.votes,0);
      return <div className="admin-panel results-ranking-panel" key={panel.id}><div className="panel-heading"><h2>{panel.title}</h2><span>{numberText(subtotal)} vote · {panel.creators.length} profil</span></div><div className="overflow-x-auto"><table className="table admin-table results-table"><thead><tr><th>Peringkat</th><th>Creator</th>{overall && <th>Kategori</th>}<th>Status</th><th>Dukungan</th><th>{overall ? '% dari total' : '% dalam kategori'}</th></tr></thead><tbody>{panel.creators.map(c=>{
        const rank = panel.creators.filter(other=>other.votes>c.votes).length+1;
        const percentage = subtotal ? c.votes/subtotal*100 : 0;
        return <tr key={c.id}><td data-label="Peringkat"><span className="rank-number">{c.votes ? String(rank).padStart(2,'0') : '—'}</span></td><td><div className="table-person"><Portrait creator={c}/><span>{c.name}<small>{c.handle}{!!c.dummy && ' · Demo'}{!c.visible && ' · Disembunyikan'}</small></span></div></td>{overall && <td data-label="Kategori">{c.category}</td>}<td data-label="Status"><CreatorStatus status={c.status}/></td><td data-label="Dukungan"><strong className="gold-text">{numberText(c.votes)}</strong></td><td data-label={overall ? "Persentase dari total" : "Persentase dalam kategori"}><div className="vote-percentage"><span>{percentage.toFixed(1)}%</span><div><i style={{ width:percentage+'%' }}/></div></div></td></tr>;
      })}</tbody></table></div></div>;
    })}
    {!panels.length && <Empty>Belum ada creator yang sesuai filter.</Empty>}
    <p className="admin-hint"><ShieldCheck size={15}/>{overall ? 'Peringkat dihitung dari seluruh creator dalam filter aktif.' : 'Peringkat dan persentase dihitung per kategori.'} Vote sama memiliki peringkat sama. Riwayat vote tetap tersimpan untuk profil yang disembunyikan atau ditolak.</p>
  </>;
}
