# NOTEA — Notulen Elektronik Terpadu (PA Purwokerto)

Aplikasi notulen rapat digital NOTEA dengan tracking action item, arsip pencarian, dasbor pimpinan, dan ekspor ke Word berkop surat resmi. Tanpa notifikasi WhatsApp (sesuai permintaan, untuk menghindari biaya Fonnte).

## 1. Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → **New Project** (pilih region **Singapore** agar konsisten dengan aplikasi lain, mis. KUAT).
2. Setelah project jadi, buka **SQL Editor** → tempel seluruh isi file `supabase/schema.sql` → **Run**.
   Ini akan membuat tabel `meetings`, `action_items`, index, trigger `updated_at`, dan policy akses.
3. Buka **Project Settings → API** → salin:
   - **Project URL**
   - **anon public key**

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

## 5. Struktur Data

- **meetings** — data utama rapat (judul, tanggal, pemimpin, peserta, agenda, pembahasan, keputusan)
- **action_items** — tindak lanjut per rapat (tugas, PIC, deadline, status), terhubung ke `meetings` lewat `meeting_id` dengan `ON DELETE CASCADE`

## 6. Catatan Keamanan

Policy Supabase saat ini mengizinkan akses penuh lewat kunci `anon` (pola yang sama seperti
aplikasi internal lain di kantor ini, tanpa sistem login terpisah). Kalau ke depan aplikasi ini
perlu dibatasi hanya untuk pegawai yang login, tambahkan Supabase Auth dan ubah policy di
`schema.sql` agar memeriksa `auth.uid()`.
