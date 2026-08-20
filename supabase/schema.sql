-- E-Notulen Rapat — skema database Supabase
-- Jalankan seluruh isi file ini di Supabase Dashboard > SQL Editor pada project baru

create extension if not exists "pgcrypto";

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  leader text,
  participants text,
  agenda text,
  discussion text,
  decisions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  task text not null,
  owner text,
  deadline date,
  status text not null default 'belum' check (status in ('belum', 'proses', 'selesai')),
  created_at timestamptz not null default now()
);

create index if not exists idx_action_items_meeting_id on action_items(meeting_id);
create index if not exists idx_meetings_date on meetings(date desc);

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
-- Aplikasi ini dipakai internal kantor (tanpa sistem login terpisah),
-- jadi akses dibuka untuk kunci anon (setara pola aplikasi internal lain).
-- Kalau nanti mau dibatasi per pengguna, ganti policy ini dengan pengecekan auth.uid().
alter table meetings enable row level security;
alter table action_items enable row level security;

create policy "allow all on meetings" on meetings
  for all using (true) with check (true);

create policy "allow all on action_items" on action_items
  for all using (true) with check (true);
