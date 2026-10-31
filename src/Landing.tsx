import { Vote, MapPin, Camera, ShieldCheck, ArrowUpRight } from './icons';
import { Header, Footer, ActionLink } from './components';
import type { Bootstrap } from './types';

const categoryDescriptions: Record<string, string> = {
  'Wisata Explorer': 'Perjalanan, destinasi, dan sudut Lombok yang layak ditemukan.',
  'Food Vlogger': 'Rasa lokal dan cerita di balik setiap hidangan.',
  Budaya: 'Tradisi, warisan, dan identitas yang terus hidup lewat karya.',
  Edukasi: 'Pengetahuan dan ide yang membuat belajar terasa lebih dekat.',
  Komedi: 'Sudut pandang segar yang mengubah keseharian jadi tawa.',
  Fashion: 'Gaya personal dan kreativitas dalam setiap penampilan.',
  Religi: 'Pesan kebaikan dan refleksi yang hadir lewat konten.',
  Musisi: 'Suara, nada, dan karya musik yang punya cerita.',
  Film: 'Cerita visual, sinematografi, dan karya di balik layar.',
  'Berita & Narasi': 'Informasi dan cerita yang memberi konteks pada sekitar kita.',
  'Konten Kreator Sosial': 'Kepedulian, aksi sosial, dan cerita yang membawa dampak bagi sesama.',
  Olahraga: 'Semangat bergerak, prestasi, dan cerita dari dunia olahraga.'
};

export function Landing({ data }: { data: Bootstrap }) {
  const steps = [
    { icon: Camera, title: 'Bagikan karyamu.', text: 'Daftarkan profil, pilih kategori yang mewakili karya, dan ceritakan apa yang menginspirasimu.' },
    { icon: ShieldCheck, title: 'Dapatkan panggungnya.', text: 'Panitia meninjau setiap pendaftaran. Profil yang disetujui akan hadir di galeri polling.' },
    { icon: Vote, title: 'Rayakan bersama.', text: 'Temukan creator pilihanmu dan berikan dukungan. Setiap browser dapat memilih sekali per kategori.' }
  ];
  return <div className="landing"><Header data={data}/><main id="main-content">
    <section className="home-hero" aria-labelledby="home-title"><img className="home-hero-wallpaper" src="/assets/register-awards-wallpaper-v2.webp" alt="" fetchPriority="high" decoding="async"/><div className="site-container home-hero-inner"><div className="hero-kicker"><span className="section-label">LCC AWARDS {data.settings.year}</span><span><MapPin size={14}/>{data.settings.location}</span></div><h1 id="home-title">Merayakan karya,<br/>mengangkat <em>cerita.</em></h1><div className="hero-bottom"><div className="hero-message"><p>Di balik setiap konten, ada cerita yang layak dirayakan. Saatnya karya dan creator Lombok mendapat panggungnya.</p><div className="hero-actions"><ActionLink to={data.registrationOpen ? '/register' : '/vote'}>{data.registrationOpen ? 'Daftar sebagai creator' : 'Lihat polling creator'}</ActionLink>{data.registrationOpen && <a className="hero-secondary" href="/vote">Lihat polling <ArrowUpRight size={18}/></a>}</div></div></div></div></section>
    <section id="tentang" className="home-about" aria-labelledby="about-title"><div className="site-container"><div className="section-intro"><span className="section-label">Tentang awards</span><div><h2 id="about-title">Cerita lokal.<br/>Dampak yang <span>melampaui layar.</span></h2><p>{data.settings.eventName} {data.settings.year} adalah ruang apresiasi untuk creator Lombok. Untuk ide yang menggerakkan, karya yang menginspirasi, dan cerita yang membawa nama daerah lebih jauh.</p><a href="#kategori" className="text-action">Temukan kategorimu <ArrowUpRight size={18}/></a></div></div><div className="participation-steps">{steps.map((step, index) => <article key={step.title}><div className="step-top"><step.icon size={24}/><span>0{index + 1}</span></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></div></section>
    <section id="kategori" className="home-categories" aria-labelledby="categories-title"><div className="site-container"><div className="category-section-head"><div><span className="section-label">Kategori karya</span><h2 id="categories-title">Banyak cara bercerita.<br/><span>Satu panggung apresiasi.</span></h2></div><ActionLink to="/vote">Lihat semua creator</ActionLink></div><div className="category-grid">{data.categories.map((c, i) => <a className="award-category" href={`/vote?category=${c.id}`} key={c.id} aria-label={`Lihat creator kategori ${c.name}`}><span className="category-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><div className="category-copy"><h3>{c.name}</h3><p>{categoryDescriptions[c.name] || 'Temukan cerita dan karya creator di kategori ini.'}</p></div><span className="category-arrow" aria-hidden="true"><ArrowUpRight size={20}/></span></a>)}</div><div className="category-section-foot"><p>Setiap karya punya cerita.<br/>Setiap dukungan punya arti.</p><span>{data.categories.length} kategori · LCC NTB {data.settings.year}</span></div></div></section>
  </main><Footer data={data} showCta={false}/></div>;
}
