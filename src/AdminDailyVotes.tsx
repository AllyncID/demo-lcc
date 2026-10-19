import { numberText } from './api';
import type { Dashboard } from './types';

export function DailyVotesMobile({ days }: { days: Dashboard['dailyVotes'] }) {
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const maximum = Math.max(1, ...days.map(day => day.count));
  const points = days.map((day, i) => ({ ...day, x: 16 + i / Math.max(1, days.length - 1) * 268, y: 130 - day.count / maximum * 106 }));
  const axis = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].map(i => days[i]).filter(Boolean);
  const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return <div className="daily-votes-mobile"><div className="daily-votes-total"><strong>{numberText(total)}</strong><span>vote</span></div>{total ? <>
    <svg viewBox="0 0 300 150" role="img" aria-label={days.map(day => `${shortDate(day.date)}: ${day.count} vote`).join(', ')}>
      {[24, 77, 130].map(y => <line key={y} x1="16" x2="284" y1={y} y2={y} stroke="#d2b06b26"/>) }
      <polygon points={`16,130 ${points.map(p => `${p.x},${p.y}`).join(' ')} 284,130`} fill="#d2b06b16"/>
      <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} stroke="#d2b06b" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
      {points.filter(p => p.count > 0).map(p => <circle key={p.date} cx={p.x} cy={p.y} r="3" fill="#d2b06b"/>)}
    </svg><div className="daily-votes-axis">{axis.map(day => <span key={day.date}>{shortDate(day.date)}</span>)}</div>
  </> : <p className="daily-votes-empty">Belum ada dukungan pada periode ini.</p>}</div>;
}
