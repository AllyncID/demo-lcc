# Lombok Content Creators Awards 2026

Fondasi website lokal untuk LCC NTB. React + TypeScript + Vite, Express 5, Tailwind CSS 4/daisyUI 5, Node 24 dengan SQLite lokal.

## Demo client di Vercel

Preview: https://demo-lcc.vercel.app/ — akses admin dan peserta diberikan terpisah kepada pemilik project.

`vercel.json` menjalankan frontend Vite dan `api/demo.js` untuk demo terpisah. Siapkan private Vercel Blob store yang terhubung ke project serta environment variables `SESSION_SECRET` (minimal 32 karakter), `DEMO_ADMIN_EMAIL`, dan `DEMO_ADMIN_PASSWORD` (minimal 12 karakter). Gunakan Node 24. Kredensial dan token penyimpanan tidak disimpan di Git atau bundle frontend.

Demo membuat dataset sintetis baru untuk setiap browser. Cookie demo signed/HttpOnly/Secure berlaku 24 jam; snapshot database dan file disimpan di private Blob. Pembacaan terbaru dan conditional writes mencegah sesi hilang saat cold start serta mencegah perubahan serentak saling menimpa. Respons sukses baru dikirim setelah penyimpanan berhasil; konflik meminta pengguna memuat ulang. Jangan gunakan snapshot ini sebagai database acara produksi. Snapshot lama perlu dibersihkan operator setelah review selesai.

Admin masuk lewat `/admin` memakai kredensial environment demo. Peserta contoh memakai `peserta@demo.lcc.invalid`: minta OTP melalui `/peserta`, lalu gunakan kode demo `202626`. OTP tetap berumur 10 menit, sekali pakai, dan berlaku hanya untuk profil demo tersebut setelah permintaan kode. Data pendaftar asli, email SMTP dan nomor pembayaran asli tidak dipakai pada demo Vercel. Form registrasi tetap dapat dilihat, tetapi pengiriman pendaftaran/bukti pembayaran diblokir. Admin dapat meninjau profil contoh, mengubah pengaturan, mencoba vote, mengunduh tiket, dan mencoba check-in di lingkungan browsernya sendiri.

Deploy acara resmi memerlukan database dan file storage persisten, identitas pemilih, SMTP sungguhan serta konfigurasi acara. `server/index.js` tetap memakai jalur server normal dan tidak mengaktifkan mode demo.

## Menjalankan

Gunakan Node.js 24 atau lebih baru.

```powershell
npm install
npm run dev
```

Konfigurasi berada di `.env`. Instalasi pertama menghasilkan password acak khusus lokal dan secret sesi. Akses admin tersimpan di `.local/admin-access.txt`; file tersebut dan database diblokir dari akses web. Situs saat ini memakai http://localhost:3001. `/admin` hanya diakses langsung, tanpa link di halaman publik.

Untuk mencoba hasil build secara lokal:

```powershell
npm run build
npm start
```

Hentikan server dev sebelum menjalankan server build pada port yang sama. `npm start` memakai hasil build dan tetap melayani API/database.

## Alur

- `/`: tiga section utama (hero, tentang awards/alur partisipasi, kategori), ditutup CTA dan footer. Desain mengikuti [Consilio](https://consilio.framer.website/) dengan hitam, gold, dan putih hangat; container publik maksimal 1440 px, navbar sticky, serta menu HP. Saat registrasi ditutup, CTA beralih ke polling.
- `/register`: informasi creator, kategori, foto raster maksimal 2 MB, persetujuan penggunaan data, dan kolom tambahan dari admin. Pendaftaran masuk sebagai pending.
- `/peserta`: sesudah registrasi, peserta langsung diarahkan ke sini dan diminta memeriksa OTP di email yang didaftarkan. Sesudah verifikasi OTP, peserta dapat melihat status review, mengganti bukti pembayaran yang ditolak, serta mengunduh QR dan tiket PNG/PDF setelah pembayaran diverifikasi dan pendaftaran disetujui.
- `/tiket/verifikasi/:token`: validasi QR dengan informasi publik minimal. Identitas peserta hanya terlihat oleh pemilik tiket dan admin. Admin mengonfirmasi check-in satu kali; pemindaian ulang menunjukkan tiket sudah digunakan.
- `/vote`: foto dan profil creator yang disetujui; filter kategori, pencarian, dan konfirmasi vote. Urutan popularitas tetap tersedia, tetapi jumlah vote tidak dikirim API publik; angka hasil hanya tersedia di dashboard admin. Creator demo jelas ditandai.
- `/admin`: login, ringkasan operasional, review/edit creator dan foto, catatan internal, visibilitas nominee, hasil per kategori, ekspor CSV sesuai filter, builder form, periode, kategori, ganti password dan riwayat aktivitas. Tab dapat dibuka langsung, misalnya `/admin?tab=creators` atau `/admin?tab=polling`.

Dashboard menampilkan antrean review, foto yang belum tersedia, kategori tanpa nominee, jumlah vote hari ini, browser pemilih unik, dan grafik 14 hari kalender dalam WITA (termasuk hari tanpa vote). Pembaruan otomatis 30 detik dapat diaktifkan; form yang sedang diedit mempertahankan perubahan lokal.

Menu Creator mendukung pencarian nama/username/email/WhatsApp, filter status/kategori/kelengkapan, dan paginasi 12 profil. Review & edit menyimpan profil, mengganti atau menghapus foto, serta catatan panitia yang tetap privat. Persetujuan menampilkan nominee; penolakan/review ulang menyembunyikannya. Kategori creator dikunci setelah menerima vote agar riwayat dukungan tetap konsisten. Foto diproses menjadi WebP seperti pada registrasi publik.

Menu Polling & periode mengatur registrasi dan polling, tanggal WITA, serta menambah/mengganti nama/mengaktifkan kategori. Hasil polling menghitung peringkat dan persentase per kategori, dengan peringkat sama untuk jumlah vote yang sama. CSV memuat seluruh hasil filter, termasuk halaman lain; ekspor creator juga menyertakan catatan dan jawaban form historis, sehingga harus disimpan sebagai data privat panitia.

Tanggal admin ditampilkan dalam WITA (UTC+8) dan disimpan sebagai UTC. Periode berakhir tepat pada batas waktu selesai (tidak inklusif). Form hanya terbuka jika aktif, tanggal mulai sudah lewat, dan tanggal berakhir belum lewat.

Kolom dasar stabil; builder mengatur maksimal 20 kolom tambahan: teks, paragraf, email, URL, angka, dropdown dan checkbox. Jawaban lama mempertahankan snapshot label saat pendaftaran. Creator yang disembunyikan atau ditolak tidak tampil publik; riwayat vote tetap disimpan.

Halaman publik menyediakan tombol bantuan WhatsApp ke +62 895-0468-7277. Bagian Kabar terbaru di akhir pendaftaran, polling dan halaman peserta mengarah ke Facebook dan Instagram yang diberikan panitia; link yang sama tersedia di footer.

Di luar periode voting aktif, `/vote` menampilkan halaman status khusus untuk voting yang belum dibuka, dinonaktifkan, atau telah berakhir. Jadwal pembukaan ditampilkan dalam WITA jika tersedia.

Menu admin **Pengumuman** menyimpan dress code, tanggal/jam acara dan periode tayang popup. Pengumuman aktif harus memiliki seluruh isi dan batas periode yang valid. Server hanya mengirim isi publik mulai awal periode sampai sebelum waktu akhir; draft di luar periode tetap di admin. Popup tampil setiap membuka atau berpindah halaman publik, termasuk refresh, dan tidak tampil otomatis di admin. Menutup popup berlaku hanya untuk halaman yang sedang dibuka. Pratinjau admin tersedia sebelum menyimpan; perubahan draft dipertahankan selama pembaruan dashboard otomatis. Buka/tutup memakai transisi halus dan menghormati pengaturan reduced motion.

Seluruh halaman memakai Golos Text Variable lokal, judul besar dengan tracking rapat, tombol persegi dengan panah, garis tipis, dan ruang kosong seperti referensi Consilio. Hero memakai pola garis SVG orisinal serta aset trofi LCC. Galeri, registrasi, login, dan dashboard mengikuti sistem warna dan tipografi yang sama. Ikon memakai Hugeicons Stroke Rounded. Desktop (viewport browser 1226 px) dan preview responsif 320, 390, 768 px sudah diperiksa tanpa overflow horizontal; menu HP, anchor navbar, filter kategori dari landing, dan modal admin juga diperiksa.

## Data & migrasi

Database: `data/lcc.sqlite`, skema awal: `server/migrations/001-initial.sql`. Migrasi `002-review-notes.sql` menambahkan catatan internal secara otomatis pada startup, tanpa menghapus profil, vote, atau akun admin. SQLite WAL dipakai; backup dengan SQLite backup API atau hentikan proses dan salin database beserta file WAL yang masih ada. Jangan hanya menyalin file `.sqlite` ketika server aktif.

Migrasi `004-participant-tickets.sql` menambahkan nomor registrasi permanen untuk semua data lama, OTP, sesi peserta, pembatasan permintaan, tiket dan email privat. Migrasi tidak menerbitkan tiket untuk nominee demo. Tiket diterbitkan saat admin menyetujui pendaftaran dengan pembayaran terverifikasi; penerbitan ulang tidak menggandakan tiket atau email. Menolak atau mengembalikan review menonaktifkan tiket tanpa menghapus riwayat check-in. Approval kembali mengaktifkan tiket yang sama.

## Email peserta dan check-in

Tanpa konfigurasi SMTP, mode lokal pengembangan memakai `MAIL_MODE=local`. Email konfirmasi pendaftaran dan OTP disimpan **di tabel privat SQLite**, tidak dikirim ke internet. Admin yang login dapat membukanya di tab **Email lokal** (`/admin?tab=mail`). Akses API `/api/admin/mail-outbox` memerlukan sesi admin; endpoint mengembalikan 404 pada mode SMTP dan production. OTP tidak pernah dikirim lewat respons registrasi, bootstrap, atau API publik. Database beserta backup-nya memuat email lokal dan harus tetap privat.

Kode OTP berlaku 10 menit, satu kali penggunaan, maksimal lima percobaan. Permintaan ulang memiliki jeda 60 detik, batas lima permintaan per email per jam dan 20 per IP per jam; verifikasi juga dibatasi per IP. Sesi peserta menggunakan cookie signed HttpOnly terpisah, berlaku delapan jam, dan tidak memberi akses admin. Semua mutation memakai origin dan CSRF yang sama dengan API lain. Sesi dan hash OTP disimpan pada database; email OTP dalam outbox lokal hanya dapat dibaca admin.

Untuk email nyata, atur konfigurasi berikut di `.env` dan restart server:

```dotenv
MAIL_MODE=smtp
SMTP_HOST=smtp.provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=akun-smtp
SMTP_PASSWORD=password-smtp
MAIL_FROM=LCC Awards <event@domain-anda.id>
APP_ORIGIN=https://domain-anda.id
```

SMTP mewajibkan TLS serta verifikasi sertifikat dan hostname: port 587 harus mendukung STARTTLS, tanpa fallback plaintext. Gunakan port 465 dengan `SMTP_SECURE=true` jika provider mewajibkan TLS langsung. Konfigurasi memakai opsi host/port terpisah; URL koneksi SMTP ditolak agar query URL tidak dapat menimpa aturan TLS. `NODE_ENV=production` default ke SMTP, menolak mode lokal, dan membutuhkan `SMTP_HOST`, `MAIL_FROM`, origin HTTPS serta kredensial aplikasi eksplisit. Konfigurasi TLS, kredensial, domain pengirim dan pengiriman nyata harus diverifikasi dengan provider sebelum publikasi. Mengubah mode email tidak membuka akses web ke email lama.

Registrasi baru disimpan sebelum pengiriman email. API selalu mengembalikan respons generik 202 untuk pengajuan valid, termasuk email yang sudah terdaftar, tanpa menimpa data lama. Nomor pendaftaran hanya tersedia melalui email privat dan halaman peserta setelah OTP terverifikasi. Permintaan OTP tidak menunggu hasil pengiriman SMTP agar alamat terdaftar tidak dapat ditebak dari respons atau waktu tunggu jaringan. Jika SMTP gagal, pendaftaran tetap tersimpan; peserta dapat meminta OTP kembali setelah jeda. Persetujuan dan tiket tetap tersimpan saat notifikasi SMTP gagal; kegagalan dicatat pada log server dan email belum terkirim tetap ada dalam tabel privat `mail_outbox` dengan `sent_at=NULL` untuk tindak lanjut operator. Tidak ada retry SMTP otomatis. Mode lokal sudah dapat diuji menyeluruh tanpa akun SMTP.

Admin membuka tab **Check-in** untuk memindai QR lewat kamera, menempel URL/token tiket, memeriksa identitas, lalu mengonfirmasi kehadiran. Dua konfirmasi bersamaan hanya mencatat satu check-in. QR berisi token acak, dan setiap validasi, unduhan, serta check-in memeriksa kembali persetujuan dan pembayaran. Bukti pembayaran tetap privat; penggantian hanya tersedia setelah penolakan dan otomatis mengembalikan status ke pending.

```powershell
npm run db:export
```

Ekspor JSON privat di `.local/` mencakup setting, kategori, creator, vote dan audit; tidak menyertakan kredensial, sesi, atau login attempts. Ekspor ini menjadi sumber pemetaan saat migrasi ke database hosting. Simpan foto `public/uploads/` secara terpisah. Admin perlu dibuat ulang pada database tujuan.

## Batas fondasi keamanan

Password di-hash dengan scrypt. Token sesi acak hanya disimpan sebagai hash; cookie HttpOnly/SameSite, rotasi sesi saat login, CSRF dan validasi origin pada mutation, rate limit, lockout login persisten, prepared SQL dan validasi server. Upload hanya menerima raster nonanimasi, dibaca ulang dan disimpan ulang sebagai WebP dengan nama acak. API publik tidak mengirim data kontak/jawaban privat. File database, `.env`, dan folder privat tidak dapat diunduh lewat server dev maupun alias `/@fs/`. Setiap tindakan admin dicatat.

Voting lokal membatasi satu vote per **identitas browser per kategori**, bukan satu orang terverifikasi. Menghapus cookie atau memakai browser lain dapat membuat identitas baru. Sebelum voting publik, tambahkan verifikasi pemilih (email/OTP atau akun), bot protection, pemantauan abuse, HTTPS, dan konfigurasi hosting. NODE_ENV=production mewajibkan APP_ORIGIN HTTPS dan konfigurasi kredensial eksplisit, serta mengaktifkan cookie Secure. Secret dan database jangan dimasukkan ke Git.

Foto dummy: [Random User](https://randomuser.me/). Trofi: aset orisinal yang dibuat dengan imagegen. Referensi desain terbaru: [Consilio](https://consilio.framer.website/), disesuaikan untuk LCC NTB dengan warna hitam–gold. Font lokal: Golos Text Variable melalui Fontsource.

## Pemeriksaan

```powershell
npm test
npm run check
npm run build
npm audit --omit=dev
```

Tes memakai database sementara terpisah; data lokal pengguna tidak dihapus. Node 24 menampilkan warning bahwa API SQLite masih eksperimental.
