-- Migrasi tambahan: Daftar Hadir & Dokumentasi Rapat
-- Jalankan file ini di SQL Editor Supabase KALAU project Anda sudah pernah
-- menjalankan schema.sql sebelumnya (supaya tidak bentrok dengan tabel/policy lama).
-- Kalau ini instalasi baru dari awal, cukup jalankan schema.sql saja (sudah termasuk ini).

create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  name text not null,
  position text,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendees_meeting_id on attendees(meeting_id);

create table if not exists meeting_documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_documents_meeting_id on meeting_documents(meeting_id);

insert into storage.buckets (id, name, public)
values ('notea-dokumentasi', 'notea-dokumentasi', true)
on conflict (id) do nothing;

drop policy if exists "allow all read on notea-dokumentasi" on storage.objects;
create policy "allow all read on notea-dokumentasi" on storage.objects
  for select using (bucket_id = 'notea-dokumentasi');

drop policy if exists "allow all insert on notea-dokumentasi" on storage.objects;
create policy "allow all insert on notea-dokumentasi" on storage.objects
  for insert with check (bucket_id = 'notea-dokumentasi');

drop policy if exists "allow all delete on notea-dokumentasi" on storage.objects;
create policy "allow all delete on notea-dokumentasi" on storage.objects
  for delete using (bucket_id = 'notea-dokumentasi');

alter table attendees enable row level security;
alter table meeting_documents enable row level security;

drop policy if exists "allow all on attendees" on attendees;
create policy "allow all on attendees" on attendees
  for all using (true) with check (true);

drop policy if exists "allow all on meeting_documents" on meeting_documents;
create policy "allow all on meeting_documents" on meeting_documents
  for all using (true) with check (true);
