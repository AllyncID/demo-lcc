import { useLocation } from 'react-router-dom';
import { ArrowUpRight, Facebook, Instagram, WhatsApp } from './icons';
import './public-contact.css';

export const whatsappUrl = 'https://wa.me/6289504687277';
export const socialLinks = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/1CoM9YjVqW/?mibextid=wwXIfr', icon: Facebook },
  { name: 'Instagram', href: 'https://www.instagram.com/indrasasak/', icon: Instagram }
];

export function EventUpdates() {
  return <section className="event-updates site-container" aria-labelledby="event-updates-title"><div><span className="section-label">KABAR TERBARU</span><h2 id="event-updates-title">Tetap terhubung, sampai hari perayaan.</h2><p>Ikuti informasi dan update LCC Awards melalui Facebook dan Instagram.</p></div><div className="event-updates-links">{socialLinks.map(link => <a key={link.name} className="btn btn-outline" href={link.href} target="_blank" rel="noopener noreferrer"><link.icon size={21}/>{link.name}<ArrowUpRight size={17}/></a>)}</div></section>;
}

export function WhatsAppHelp() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;
  return <a className="btn whatsapp-help" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Butuh bantuan? Hubungi admin melalui WhatsApp" title="WhatsApp admin: +62 895-0468-7277"><WhatsApp size={25}/><span>Butuh bantuan?</span></a>;
}
