-- Migrasi: Hapus kolom Keputusan & fitur Action Item
-- Jalankan file ini di SQL Editor Supabase.
-- PERHATIAN: ini menghapus PERMANEN semua data action item yang pernah diinput
-- (kolom "decisions" di tabel meetings, dan seluruh tabel action_items).
-- Data notulen (judul, agenda, pembahasan), daftar hadir, dan dokumentasi TIDAK terpengaruh.

drop table if exists action_items;

alter table meetings drop column if exists decisions;
