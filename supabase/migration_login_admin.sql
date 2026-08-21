-- Migrasi: Login Admin (hanya admin yang bisa input/edit, publik hanya bisa lihat arsip)
-- Jalankan file ini di SQL Editor Supabase SETELAH schema.sql / migration sebelumnya
-- sudah pernah dijalankan.
--
-- Ini mengganti policy "allow all" (bebas untuk siapa saja) menjadi:
--   - SELECT (lihat data)   -> tetap terbuka untuk semua orang (publik, tanpa login)
--   - INSERT/UPDATE/DELETE  -> hanya untuk pengguna yang sudah login (admin)
--
-- Setelah menjalankan file ini, WAJIB buat akun admin lewat:
-- Supabase Dashboard -> Authentication -> Users -> Add user
-- (isi email & password admin, centang "Auto Confirm User")

-- ============ meetings ============
drop policy if exists "allow all on meetings" on meetings;

create policy "public read meetings" on meetings
  for select using (true);

create policy "admin write meetings" on meetings
  for insert with check (auth.role() = 'authenticated');
create policy "admin update meetings" on meetings
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete meetings" on meetings
  for delete using (auth.role() = 'authenticated');

-- ============ action_items ============
drop policy if exists "allow all on action_items" on action_items;

create policy "public read action_items" on action_items
  for select using (true);

create policy "admin write action_items" on action_items
  for insert with check (auth.role() = 'authenticated');
create policy "admin update action_items" on action_items
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete action_items" on action_items
  for delete using (auth.role() = 'authenticated');

-- ============ attendees ============
drop policy if exists "allow all on attendees" on attendees;

create policy "public read attendees" on attendees
  for select using (true);

create policy "admin write attendees" on attendees
  for insert with check (auth.role() = 'authenticated');
create policy "admin update attendees" on attendees
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete attendees" on attendees
  for delete using (auth.role() = 'authenticated');

-- ============ meeting_documents ============
drop policy if exists "allow all on meeting_documents" on meeting_documents;

create policy "public read meeting_documents" on meeting_documents
  for select using (true);

create policy "admin write meeting_documents" on meeting_documents
  for insert with check (auth.role() = 'authenticated');
create policy "admin update meeting_documents" on meeting_documents
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete meeting_documents" on meeting_documents
  for delete using (auth.role() = 'authenticated');

-- ============ storage: notea-dokumentasi ============
-- Foto tetap bisa dilihat publik (supaya arsip yang dibuka publik masih menampilkan
-- foto dokumentasi), tapi upload/hapus foto hanya untuk admin yang login.
drop policy if exists "allow all insert on notea-dokumentasi" on storage.objects;
drop policy if exists "allow all delete on notea-dokumentasi" on storage.objects;

create policy "admin insert notea-dokumentasi" on storage.objects
  for insert with check (bucket_id = 'notea-dokumentasi' and auth.role() = 'authenticated');

create policy "admin delete notea-dokumentasi" on storage.objects
  for delete using (bucket_id = 'notea-dokumentasi' and auth.role() = 'authenticated');

-- Policy "allow all read on notea-dokumentasi" (SELECT) dibiarkan seperti sebelumnya, tetap publik.
