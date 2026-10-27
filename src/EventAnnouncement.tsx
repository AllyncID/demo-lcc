import { useEffect, useState } from 'react';
import { Modal } from './components';
import { api } from './api';
import { CalendarDays, Megaphone, Shirt } from './icons';
import type { Bootstrap } from './types';
import './event-announcement.css';

export function AnnouncementDetails({ announcement }: { announcement: NonNullable<Bootstrap['announcement']> }) {
  const eventDate = new Date(announcement.eventAt);
  const datePart = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('id-ID', { ...options, timeZone: 'Asia/Makassar' }).format(eventDate);
  return <><span className="announcement-kicker"><Megaphone size={16}/>PENGUMUMAN ACARA</span><p className="announcement-intro">Catat harinya, siapkan penampilanmu.<br/>Mari rayakan karya dan cerita kita bersama.</p><dl className="announcement-details"><div className="announcement-event"><dt><CalendarDays size={16}/>HARI PERAYAAN</dt><dd><time dateTime={announcement.eventAt}><span className="announcement-day">{datePart({ day: '2-digit' })}</span><span className="announcement-date-copy"><strong>{datePart({ month: 'long', year: 'numeric' })}</strong><span>{datePart({ weekday: 'long' })} · {datePart({ hour: '2-digit', minute: '2-digit' })} WITA</span></span></time></dd></div><div className="announcement-outfit"><dt><Shirt size={19}/>DRESS CODE</dt><dd className="announcement-dresscode">{announcement.dressCode}</dd></div></dl></>;
}

export function EventAnnouncement() {
  const [announcement, setAnnouncement] = useState<Bootstrap['announcement']>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    let cancelled = false;
    api<Bootstrap>('/bootstrap').then(data => { if (!cancelled) setAnnouncement(data.announcement); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!announcement) return null;
  return <Modal title={<>Sampai jumpa di<br/><em>hari perayaan.</em></>} className="event-announcement-modal" open={open} onClose={() => setOpen(false)}><AnnouncementDetails announcement={announcement}/><button type="button" className="btn btn-primary btn-block" onClick={() => setOpen(false)}>Siap, sampai jumpa!</button></Modal>;
}
