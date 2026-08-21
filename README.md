# RAPID — Rapat Digital Terintegrasi (PA Purwokerto)

Aplikasi rapat digital RAPID dengan tiga modul dalam satu rapat — **notulen**, **daftar hadir**, dan **dokumentasi foto** — dilengkapi tracking action item, arsip pencarian, dasbor pimpinan, dan ekspor ke Word berkop surat resmi. Tanpa notifikasi WhatsApp (sesuai permintaan, untuk menghindari biaya Fonnte).

## 1. Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → **New Project** (pilih region **Singapore** agar konsisten dengan aplikasi lain, mis. KUAT).
2. Setelah project jadi, buka **SQL Editor** → tempel seluruh isi file `supabase/schema.sql` → **Run**.
   Ini akan membuat tabel `meetings`, `action_items`, `attendees`, `meeting_documents`, bucket storage untuk foto, index, trigger `updated_at`, dan policy akses (publik hanya baca, admin yang login bisa tulis).
3. Buka **Project Settings → API** → salin:
   - **Project URL**
   - **anon public key**
4. **Buat akun admin**: buka **Authentication → Users → Add user** → isi email & password admin → centang **"Auto Confirm User"** → Create. Akun ini yang dipakai untuk login sebagai admin di aplikasi.

> **Sudah pernah setup Supabase sebelumnya (sebelum fitur login admin ada)?**
> Jalankan `supabase/migration_daftar_hadir_dokumentasi.sql` (kalau belum) lalu `supabase/migration_login_admin.sql` di SQL Editor — keduanya aman dijalankan di atas database yang sudah ada. Jangan lupa langkah 4 di atas untuk membuat akun admin.

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

Untuk masuk sebagai admin, klik **"Masuk sebagai Admin"** di pojok kanan bawah header, lalu
login dengan email & password akun admin yang Anda buat di langkah 4 pada bagian 1 di atas.
Setelah login, muncul tombol **Rapat Baru**, **Edit**, **Hapus**, tab **Dasbor**, dan kontrol
untuk mengubah status action item.

Untuk menambah admin lain, ulangi langkah **Authentication → Users → Add user** di Supabase
Dashboard — semua akun yang terdaftar di sana punya akses admin yang sama (tidak ada tingkatan
peran terpisah di versi ini).

## 6. Daftar Hadir (Roster Hakim & Pegawai)

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

## 7. Struktur Data

- **meetings** — data utama rapat (judul, tanggal, pemimpin, agenda, pembahasan, keputusan)
- **action_items** — tindak lanjut per rapat (tugas, PIC, deadline, status)
- **attendees** — daftar hadir per rapat, diisi manual oleh notulis (nama, jabatan/unit)
- **meeting_documents** — foto dokumentasi rapat, file tersimpan di Supabase Storage bucket `notea-dokumentasi`

Semua tabel terhubung ke `meetings` lewat `meeting_id` dengan `ON DELETE CASCADE` — hapus satu rapat otomatis menghapus action item, daftar hadir, dan referensi dokumentasinya (file di storage juga ikut dibersihkan oleh aplikasi saat rapat dihapus).

## 8. Catatan Keamanan

Policy Supabase sekarang membatasi tulis (insert/update/delete) hanya untuk pengguna yang
sudah login lewat Supabase Auth (`auth.role() = 'authenticated'`); baca (select) tetap terbuka
untuk publik. Ini berbeda dari aplikasi internal lain di kantor ini (mis. KUAT, CABLAKA) yang
masih pakai akses penuh lewat kunci `anon` tanpa login terpisah — RAPID sengaja dibuat lebih
ketat karena arsipnya juga dibuka untuk publik.

Kalau ke depan ingin ada beberapa tingkat admin (misalnya admin biasa vs super-admin), perlu
tabel peran tambahan dan policy yang memeriksa peran tersebut, bukan hanya `auth.role() =
'authenticated'` yang menyamaratakan semua pengguna yang login.
