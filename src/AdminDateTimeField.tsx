import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronRight } from './icons';
import { Modal } from './components';
import { calendarDays, shiftMonth } from './admin-calendar';
import { dateInput } from './admin-utils';

const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function AdminDateTimeField({ label, context, value, onChange }: { label: string; context: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [month, setMonth] = useState('');
  const today = dateInput(new Date().toISOString()).slice(0, 10);
  const selectedDate = draft.slice(0, 10);
  const hours = draft.slice(11, 13);
  const minutes = draft.slice(14, 16);
  function show() {
    const initial = value || `${today}T08:00`;
    setDraft(initial); setMonth(initial.slice(0, 7)); setOpen(true);
  }
  function selectDay(day: string) { setDraft(`${day}T${hours}:${minutes}`); setMonth(day.slice(0, 7)); }
  return <div className="form-label"><span>{label}</span><button type="button" className="input admin-datetime-trigger" aria-label={`${label} — ${context}`} aria-haspopup="dialog" onClick={show}><span>{value ? `${dateLabel(value.slice(0, 10))} · ${value.slice(11, 16)}` : 'Tanpa batas waktu'}</span><CalendarDays size={18}/></button>
    {open && createPortal(<Modal open title={`Atur ${label.replace(" (WITA)", "").toLowerCase()}`} onClose={() => setOpen(false)} className="admin-datetime-modal"><p className="datetime-context">{context} · WITA (UTC+8)</p><div className="datetime-month"><button type="button" className="btn btn-outline btn-square btn-sm" aria-label="Bulan sebelumnya" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronRight size={18} style={{ transform: 'rotate(180deg)' }}/></button><h3 aria-live="polite">{new Date(`${month}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button type="button" className="btn btn-outline btn-square btn-sm" aria-label="Bulan berikutnya" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18}/></button></div><div className="datetime-weekdays" aria-hidden="true">{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => <span key={day}>{day}</span>)}</div><div className="datetime-days" role="group" aria-label="Pilih tanggal">{calendarDays(month).map(day => <button type="button" key={day} className={`btn btn-ghost datetime-day${day.slice(0, 7) !== month ? ' other-month' : ''}${day === today ? ' today' : ''}`} aria-label={dateLabel(day)} aria-pressed={selectedDate === day} aria-current={day === today ? 'date' : undefined} onClick={() => selectDay(day)}>{Number(day.slice(8))}</button>)}</div><div className="datetime-time"><label className="form-label">Jam<select className="select" value={hours} onChange={e => setDraft(`${selectedDate}T${e.target.value}:${minutes}`)}>{Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(hour => <option key={hour}>{hour}</option>)}</select></label><span>:</span><label className="form-label">Menit<select className="select" value={minutes} onChange={e => setDraft(`${selectedDate}T${hours}:${e.target.value}`)}>{Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(minute => <option key={minute}>{minute}</option>)}</select></label><small>Format 24 jam</small></div><div className="datetime-selection" aria-live="polite">{dateLabel(selectedDate)} · {hours}:{minutes} WITA</div><div className="datetime-actions"><button type="button" className="btn btn-outline" onClick={() => { onChange(''); setOpen(false); }}>Tanpa batas</button><button type="button" className="btn btn-primary" onClick={() => { onChange(draft); setOpen(false); }}>Gunakan jadwal</button></div></Modal>, document.body)}
  </div>;
}
