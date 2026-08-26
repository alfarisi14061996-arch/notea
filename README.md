# RAPID — Rapat Digital Terintegrasi (PA Purwokerto)

Aplikasi rapat digital RAPID dengan tiga modul dalam satu rapat — **notulen**, **daftar hadir**, dan **dokumentasi foto** — dilengkapi tracking action item, arsip pencarian, dasbor pimpinan, dan ekspor ke Word berkop surat resmi. Tanpa notifikasi WhatsApp (sesuai permintaan, untuk menghindari biaya Fonnte).

## 1. Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → **New Project** (pilih region **Singapore** agar konsisten dengan aplikasi lain, mis. KUAT).
2. Setelah project jadi, buka **SQL Editor** → tempel seluruh isi file `supabase/schema.sql` → **Run**.
   Ini akan membuat tabel `meetings`, `action_items`, `attendees`, `meeting_documents`, bucket storage untuk foto, index, trigger `updated_at`, dan policy akses (publik hanya baca, admin yang login bisa tulis).
3. Buka **Project Settings → API** → salin:
   - **Project URL**
   - **anon public key**
4. **Wajib untuk login admin tanpa email**: buka **Authentication → Providers → Email** → matikan **"Confirm email"** → Save. (Detail & alasannya ada di bagian 5 di bawah — admin nanti daftar akun sendiri langsung dari aplikasi, tidak perlu dibuatkan manual di sini.)

> **Sudah pernah setup Supabase sebelumnya (sebelum fitur login admin ada)?**
> Jalankan `supabase/migration_daftar_hadir_dokumentasi.sql` (kalau belum), lalu `supabase/migration_login_admin.sql`, lalu `supabase/migration_hapus_keputusan_action_item.sql` (kalau sempat pernah pakai fitur Keputusan/Action Item), lalu `supabase/migration_lampiran_rapat.sql`, lalu `supabase/migration_kategori_rapat.sql` di SQL Editor — semuanya aman dijalankan di atas database yang sudah ada. Jangan lupa langkah 4 di atas.

## 2. Konfigurasi Lokal

```bash
npm install
cp .env.example .env
```

Isi `.env`:
```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=isi-dengan-anon-key-anda
```

Jalankan lokal:
```bash
npm run dev
```

## 3. Deploy ke Vercel

1. Push folder ini ke repository GitHub baru.
2. Di [vercel.com](https://vercel.com) → **Add New Project** → import repo tersebut.
3. Vercel otomatis mendeteksi Vite. Sebelum deploy, buka **Environment Variables** dan tambahkan:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (nilai sama seperti file `.env` lokal)
4. Klik **Deploy**. Setelah selesai, aplikasi bisa diakses via domain `*.vercel.app` yang diberikan Vercel (atau domain kantor jika dikonfigurasi).

## 4. Tentang Ekspor Word

Tombol **"Ekspor ke Word"** di halaman detail notulen menghasilkan file `.docx` dengan kop surat:

```
MAHKAMAH AGUNG REPUBLIK INDONESIA
PENGADILAN AGAMA PURWOKERTO
Jl. [alamat kantor]...
```

Alamat dan nomor telepon di kop surat masih berupa placeholder — sesuaikan di
`src/lib/exportDocx.js` (fungsi `buildLetterhead`) dengan alamat resmi kantor.

Jika ingin menambahkan **logo/lambang resmi** (Garuda atau logo Mahkamah Agung) di kop surat,
tambahkan file gambar ke folder `public/`, lalu sisipkan `ImageRun` dari library `docx` di
`buildLetterhead()` — dokumentasi ada di https://docx.js.org.

## 5. Login Admin

Publik yang membuka aplikasi (tanpa login) hanya bisa **melihat arsip notulen** — tidak ada
tombol tambah/edit/hapus yang muncul, dan aksi tersebut juga ditolak di level database (Row
Level Security) sekalipun seseorang mencoba lewat cara lain di luar tampilan aplikasi.

Login admin pakai **username + password biasa (tanpa email)**, seperti di CABLAKA. Di baliknya
tetap memakai Supabase Auth (supaya keamanan RLS-nya tetap jalan) — username otomatis diubah
jadi email samaran `username@rapid.internal` yang tidak pernah benar-benar mengirim email apa
pun, jadi wajib satu langkah setup berikut:

1. Buka **Supabase Dashboard → Authentication → Providers → Email**.
2. Matikan (nonaktifkan) opsi **"Confirm email"**.
3. Save.

Tanpa langkah ini, akun yang baru daftar tidak akan bisa langsung login (Supabase menunggu
klik link konfirmasi dari email yang tidak pernah terkirim).

Setelah itu, admin pertama tinggal buka aplikasi → klik **"Masuk sebagai Admin"** → pilih
**"Belum punya akun admin? Buat akun baru"** → isi username & password sendiri. Admin
berikutnya bisa daftar dengan cara yang sama. Semua akun yang terdaftar punya akses admin yang
setara (tidak ada tingkatan peran terpisah di versi ini) — pertimbangkan untuk tidak
menyebarluaskan link "Buat akun baru" ke luar kalangan yang berwenang.

## 6. Fitur Tambahan

- **Kategori Rapat** — setiap rapat diberi label (Rapat Pimpinan, Rapat Rutin, Rapat Evaluasi, Rapat Koordinasi, Lainnya), bisa difilter di Arsip Notulen. Untuk mengubah daftar kategorinya, edit array `MEETING_CATEGORIES` di `src/App.jsx`.
- **Kalender** — tab baru yang menampilkan kalender bulanan (klik tanggal yang ada titik hijau untuk lihat rapat di hari itu) dan daftar rapat mendatang. Rapat otomatis muncul di sini kalau tanggalnya hari ini atau setelahnya — cukup buat entri notulen baru dengan tanggal ke depan (agenda boleh diisi lebih dulu, detail lain menyusul setelah rapat berlangsung).
- **Unduh Semua (ZIP)** — tombol di halaman detail rapat untuk mengunduh seluruh foto dokumentasi dan lampiran dalam satu file ZIP (terpisah per folder), supaya tidak perlu unduh satu-satu.

## 7. Daftar Hadir (Roster Hakim & Pegawai)

Nama hakim dan pegawai untuk daftar hadir tercentang sudah ditanam langsung di kode, di
`src/staffRoster.js` (bukan di database) — sesuai daftar yang Anda berikan (42 orang: 8 Hakim,
34 Pegawai). Notulis tinggal centang siapa yang hadir saat isi notulen; ada juga bagian
"Tamu / Peserta Luar" untuk pihak di luar roster (misalnya narasumber undangan).

**Kalau ada pegawai baru, pindah tugas, atau pensiun**, edit langsung file
`src/staffRoster.js` — tambah/hapus baris pada `HAKIM_ROSTER` atau `PEGAWAI_ROSTER`, lalu commit
dan push ke GitHub (Vercel otomatis redeploy). Formatnya:
```js
{ name: "NAMA LENGKAP, GELAR", position: "Jabatan" },
```

## 8. Struktur Data

- **meetings** — data utama rapat (judul, tanggal, pemimpin, agenda, pembahasan, keputusan)
- **action_items** — tindak lanjut per rapat (tugas, PIC, deadline, status)
- **attendees** — daftar hadir per rapat, diisi manual oleh notulis (nama, jabatan/unit)
- **meeting_documents** — foto dokumentasi rapat, file tersimpan di Supabase Storage bucket `notea-dokumentasi`
- **meeting_attachments** — lampiran rapat (undangan, surat, dokumen pendukung — PDF/Word/format lain), file tersimpan di Supabase Storage bucket `rapid-lampiran`

Semua tabel terhubung ke `meetings` lewat `meeting_id` dengan `ON DELETE CASCADE` — hapus satu rapat otomatis menghapus action item, daftar hadir, dan referensi dokumentasinya (file di storage juga ikut dibersihkan oleh aplikasi saat rapat dihapus).

## 9. Catatan Keamanan

Policy Supabase sekarang membatasi tulis (insert/update/delete) hanya untuk pengguna yang
sudah login lewat Supabase Auth (`auth.role() = 'authenticated'`); baca (select) tetap terbuka
untuk publik. Ini berbeda dari aplikasi internal lain di kantor ini (mis. KUAT, CABLAKA) yang
masih pakai akses penuh lewat kunci `anon` tanpa login terpisah — RAPID sengaja dibuat lebih
ketat karena arsipnya juga dibuka untuk publik.

Kalau ke depan ingin ada beberapa tingkat admin (misalnya admin biasa vs super-admin), perlu
tabel peran tambahan dan policy yang memeriksa peran tersebut, bukan hanya `auth.role() =
'authenticated'` yang menyamaratakan semua pengguna yang login.
