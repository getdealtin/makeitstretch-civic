-- Make It Stretch (civic edition): database schema.
-- One database for every city: each row carries city_id.
-- Access model: the browser never talks to the database. Only server.js does,
-- with the project's secret key. RLS is on with no policies and the public
-- roles are revoked, so the publishable key can read or write nothing here.

-- ── Invite links: one personal link per organization you email ────────
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  city_id     text not null,
  org_name    text not null check (char_length(org_name) between 1 and 200),
  token       text not null unique,                 -- the secret part of the link
  created_at  timestamptz not null default now(),
  used_at     timestamptz                           -- first time the form was submitted with it
);
create index if not exists invites_city_created_idx on public.invites (city_id, created_at desc);

-- ── Food providers: pantries, fridges, meal sites, mutual aid ─────────
create table if not exists public.providers (
  id            uuid primary key default gen_random_uuid(),
  city_id       text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'hidden')),
  source        text not null check (source in ('invite', 'public', 'admin')),
  invite_id     uuid references public.invites (id) on delete set null,

  -- Public listing
  name          text not null check (char_length(name) between 1 and 200),
  kind          text not null check (kind in ('pantry', 'fridge', 'meals', 'mutual_aid', 'other')),
  address       text check (char_length(address) <= 300),
  zip           text check (zip ~ '^\d{5}$'),
  phone         text check (char_length(phone) <= 40),
  website       text check (char_length(website) <= 300),
  hours         text check (char_length(hours) <= 500),
  access        text check (access in ('walkup', 'appointment', 'both')),
  id_required   boolean,
  languages     text[] not null default '{}',
  offers        text[] not null default '{}',
  description   text check (char_length(description) <= 1000),

  -- Private: for the admin only, never shown on the site
  contact_name  text check (char_length(contact_name) <= 200),
  contact_email text check (char_length(contact_email) <= 200),
  contact_phone text check (char_length(contact_phone) <= 40),
  admin_note    text check (char_length(admin_note) <= 1000),

  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  confirmed_at  timestamptz,      -- last time the listing was confirmed current (set on approval)
  updated_at    timestamptz not null default now()
);
create index if not exists providers_city_status_idx on public.providers (city_id, status);
create index if not exists providers_city_confirmed_idx on public.providers (city_id, confirmed_at) where status = 'approved';
create index if not exists providers_invite_idx on public.providers (invite_id);

-- ── Translation review status (one row per language) ─────────────────
create table if not exists public.translation_reviews (
  lang          text primary key check (lang ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'),
  status        text not null default 'pending' check (status in ('pending', 'approved')),
  reviewer      text check (char_length(reviewer) <= 200),
  reviewed_at   timestamptz,
  note          text check (char_length(note) <= 1000)
);
insert into public.translation_reviews (lang) values ('es'), ('vi'), ('zh-Hans')
  on conflict (lang) do nothing;

-- ── Lock it down: server-only access ─────────────────────────────────
alter table public.invites enable row level security;
alter table public.providers enable row level security;
alter table public.translation_reviews enable row level security;
revoke all on public.invites, public.providers, public.translation_reviews from anon, authenticated;
