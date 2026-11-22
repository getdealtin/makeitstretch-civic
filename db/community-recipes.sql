-- Community recipes (owner decisions, Nov 22 2026): meals neighbors share at /share-a-meal. Nothing reaches
-- plans until the owner approves it in /admin. `num` gives each recipe a stable recipe id (50000 + num) so
-- saved plans and links keep pointing at the same dish. A name is optional and shown with the recipe; no
-- email, phone or address is asked for. Only the server reads and writes it (secret key); RLS on with no
-- policies blocks public access.
create table if not exists public.community_recipes (
  id            uuid primary key default gen_random_uuid(),
  num           integer generated always as identity unique,
  city_id       text not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  title         text not null check (char_length(title) between 3 and 80),
  slot          text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  ingredients   jsonb not null check (jsonb_typeof(ingredients) = 'array' and pg_column_size(ingredients) < 4000),
  extras        jsonb not null default '[]' check (jsonb_typeof(extras) = 'array' and pg_column_size(extras) < 1000),
  steps         text not null check (char_length(steps) between 20 and 1500),
  serves        integer not null check (serves between 1 and 20),
  origin        text check (origin is null or char_length(origin) <= 80),
  shared_by     text check (shared_by is null or char_length(shared_by) <= 40),
  lang          text not null default 'en' check (lang in ('en', 'es', 'vi', 'zh-Hans')),
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);
create index if not exists community_recipes_status on public.community_recipes (status, submitted_at desc);
alter table public.community_recipes enable row level security;
revoke all on public.community_recipes from anon, authenticated;
