-- RAPID (Rapat Digital Terintegrasi) — skema database Supabase
-- Jalankan seluruh isi file ini di Supabase Dashboard > SQL Editor pada project BARU.
-- Kalau project Anda sudah pernah dijalankan sebelumnya, JANGAN jalankan file ini lagi —
-- pakai file migration_*.sql yang sesuai supaya tidak bentrok dengan data/policy yang ada.

create extension if not exists "pgcrypto";

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  leader text,
  category text not null default 'Rapat Rutin',
  agenda text,
  discussion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meetings_date on meetings(date desc);

-- Daftar hadir (dicentang dari roster Hakim/Pegawai, atau input manual untuk tamu)
create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  name text not null,
  position text,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendees_meeting_id on attendees(meeting_id);

-- Dokumentasi rapat (foto)
create table if not exists meeting_documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_documents_meeting_id on meeting_documents(meeting_id);

-- Lampiran rapat (undangan, surat, dokumen pendukung lain — bisa PDF/Word/format lain)
create table if not exists meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_attachments_meeting_id on meeting_attachments(meeting_id);

-- Storage bucket untuk foto dokumentasi rapat
insert into storage.buckets (id, name, public)
values ('notea-dokumentasi', 'notea-dokumentasi', true)
on conflict (id) do nothing;

-- Foto boleh dilihat siapa saja (arsip publik), tapi upload/hapus hanya admin yang login.
create policy "public read notea-dokumentasi" on storage.objects
  for select using (bucket_id = 'notea-dokumentasi');

create policy "admin insert notea-dokumentasi" on storage.objects
  for insert with check (bucket_id = 'notea-dokumentasi' and auth.role() = 'authenticated');

create policy "admin delete notea-dokumentasi" on storage.objects
  for delete using (bucket_id = 'notea-dokumentasi' and auth.role() = 'authenticated');

-- Bucket storage khusus lampiran (undangan, surat, dokumen pendukung — bisa non-gambar)
insert into storage.buckets (id, name, public)
values ('rapid-lampiran', 'rapid-lampiran', true)
on conflict (id) do nothing;

create policy "public read rapid-lampiran" on storage.objects
  for select using (bucket_id = 'rapid-lampiran');

create policy "admin insert rapid-lampiran" on storage.objects
  for insert with check (bucket_id = 'rapid-lampiran' and auth.role() = 'authenticated');

create policy "admin delete rapid-lampiran" on storage.objects
  for delete using (bucket_id = 'rapid-lampiran' and auth.role() = 'authenticated');

-- Trigger sederhana untuk update updated_at otomatis
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_meetings_updated_at on meetings;
create trigger trg_meetings_updated_at
  before update on meetings
  for each row execute function set_updated_at();

-- Row Level Security
-- Publik (tanpa login) hanya bisa MELIHAT (SELECT) semua tabel di bawah ini.
-- Menambah/mengubah/menghapus data (INSERT/UPDATE/DELETE) hanya untuk pengguna yang
-- sudah login (admin) — dicek lewat auth.role() = 'authenticated'.
--
-- Setelah menjalankan file ini, WAJIB buat akun admin lewat:
-- Supabase Dashboard -> Authentication -> Users -> Add user
-- (isi email & password admin, centang "Auto Confirm User")

alter table meetings enable row level security;
alter table attendees enable row level security;
alter table meeting_documents enable row level security;
alter table meeting_attachments enable row level security;

create policy "public read meetings" on meetings for select using (true);
create policy "admin write meetings" on meetings for insert with check (auth.role() = 'authenticated');
create policy "admin update meetings" on meetings for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete meetings" on meetings for delete using (auth.role() = 'authenticated');

create policy "public read attendees" on attendees for select using (true);
create policy "admin write attendees" on attendees for insert with check (auth.role() = 'authenticated');
create policy "admin update attendees" on attendees for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete attendees" on attendees for delete using (auth.role() = 'authenticated');

create policy "public read meeting_documents" on meeting_documents for select using (true);
create policy "admin write meeting_documents" on meeting_documents for insert with check (auth.role() = 'authenticated');
create policy "admin update meeting_documents" on meeting_documents for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete meeting_documents" on meeting_documents for delete using (auth.role() = 'authenticated');

create policy "public read meeting_attachments" on meeting_attachments for select using (true);
create policy "admin write meeting_attachments" on meeting_attachments for insert with check (auth.role() = 'authenticated');
create policy "admin update meeting_attachments" on meeting_attachments for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete meeting_attachments" on meeting_attachments for delete using (auth.role() = 'authenticated');
