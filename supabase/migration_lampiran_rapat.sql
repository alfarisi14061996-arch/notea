-- Migrasi: Lampiran Rapat (undangan, surat, dokumen pendukung, dll)
-- Jalankan file ini di SQL Editor Supabase.

create table if not exists meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_meeting_attachments_meeting_id on meeting_attachments(meeting_id);

-- Bucket storage khusus lampiran (terpisah dari foto dokumentasi, karena bisa berupa
-- PDF/Word/format lain, bukan cuma gambar)
insert into storage.buckets (id, name, public)
values ('rapid-lampiran', 'rapid-lampiran', true)
on conflict (id) do nothing;

drop policy if exists "public read rapid-lampiran" on storage.objects;
create policy "public read rapid-lampiran" on storage.objects
  for select using (bucket_id = 'rapid-lampiran');

drop policy if exists "admin insert rapid-lampiran" on storage.objects;
create policy "admin insert rapid-lampiran" on storage.objects
  for insert with check (bucket_id = 'rapid-lampiran' and auth.role() = 'authenticated');

drop policy if exists "admin delete rapid-lampiran" on storage.objects;
create policy "admin delete rapid-lampiran" on storage.objects
  for delete using (bucket_id = 'rapid-lampiran' and auth.role() = 'authenticated');

alter table meeting_attachments enable row level security;

drop policy if exists "public read meeting_attachments" on meeting_attachments;
create policy "public read meeting_attachments" on meeting_attachments for select using (true);

drop policy if exists "admin write meeting_attachments" on meeting_attachments;
create policy "admin write meeting_attachments" on meeting_attachments for insert with check (auth.role() = 'authenticated');

drop policy if exists "admin update meeting_attachments" on meeting_attachments;
create policy "admin update meeting_attachments" on meeting_attachments for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin delete meeting_attachments" on meeting_attachments;
create policy "admin delete meeting_attachments" on meeting_attachments for delete using (auth.role() = 'authenticated');
