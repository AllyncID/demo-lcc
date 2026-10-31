export const siteOrigin = 'https://lcc-ntb.com';
export function pageMetadata(path: string) {
  const pages: Record<string, [string, string]> = {
    '/': ['Rayakan Karya Creator Lombok', 'LCC Awards 2026, panggung apresiasi karya content creator Nusa Tenggara Barat. Kenali kategori, daftar sebagai creator, dan dukung karya pilihanmu.'],
    '/vote': ['Dukung Creator Pilihan Komunitas', 'Dukung creator pilihanmu di LCC Awards 2026. Voting dibuka 13 November pukul 12.00 sampai 23 November pukul 21.00 WITA.'],
    '/register': ['Daftar Sebagai Content Creator', 'Daftarkan karya dan cerita terbaikmu di LCC Awards 2026. Pendaftaran 1 November pukul 12.00 sampai 9 November pukul 21.00 WITA.'],
    '/peserta': ['Masuk Ke Halaman Peserta', 'Akses status pendaftaran, pembayaran, dan tiket peserta LCC Awards 2026 dengan verifikasi email.'],
    '/admin': ['Dashboard Pengelolaan Panitia Awards', 'Ruang panitia LCC Awards 2026 untuk mengelola pendaftaran, polling, pengumuman, dan check-in peserta.']
  };
  const ticket = path.startsWith('/tiket/');
  const [title, description] = pages[path] || (ticket ? ['Verifikasi Tiket Peserta Awards', 'Verifikasi tiket peserta LCC Awards 2026.'] : ['Halaman Ini Tidak Ditemukan', 'Kembali ke beranda LCC Awards 2026.']);
  return { title: `${title} - LCC Awards 2026`, description, canonical: `${siteOrigin}${pages[path] ? (path === '/' ? '/' : path) : '/'}`, robots: ['/','/vote','/register'].includes(path) ? 'index, follow' : 'noindex, nofollow', image: `${siteOrigin}/og-cover.jpg` };
}
