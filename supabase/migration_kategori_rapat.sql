-- Migrasi: Kategori/Jenis Rapat
-- Jalankan file ini di SQL Editor Supabase.

alter table meetings add column if not exists category text not null default 'Rapat Rutin';
