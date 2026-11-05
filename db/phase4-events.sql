-- Phase 4: anonymous activity events + 24-month retention.
-- Applied Nov 5, 2026: tables + permissions (part 1). The retention job below (part 2) still
-- needs the owner to run it in the Supabase SQL Editor.
-- Never stored: name, email, phone, address, IP address, device identifiers.
-- session_id is a random per-visit token held in browser memory only.

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  city_id     text not null,
  session_id  text not null check (session_id ~ '^[a-z0-9]{12}$'),
  event       text not null check (event in (
                'page_view', 'step_completed', 'plan_built', 'box_built', 'recipe_opened',
                'meal_swapped', 'help_clicked', 'zip_added_later', 'plan_kept', 'language_changed',
                'cant_use', 'plan_reopened')),
  lang        text not null default 'en' check (lang ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 2000),
  created_at  timestamptz not null default now()
);
create index if not exists events_city_created_idx on public.events (city_id, created_at desc);

-- Monthly totals, kept indefinitely (counts only; no per-visit detail).
create table if not exists public.events_monthly (
  city_id  text not null,
  month    date not null,
  event    text not null,
  n        bigint not null,
  primary key (city_id, month, event)
);

alter table public.events enable row level security;
alter table public.events_monthly enable row level security;
revoke all on public.events, public.events_monthly from anon, authenticated;

-- Retention: roll raw events older than 24 months into monthly totals, then delete them.
-- Lives in a private schema; runs as the cron owner, never callable through the API.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create or replace function private.retain_events() returns void
language plpgsql set search_path = '' as $$
declare cutoff timestamptz := date_trunc('month', now()) - interval '24 months';
begin
  insert into public.events_monthly (city_id, month, event, n)
    select city_id, date_trunc('month', created_at)::date, event, count(*)
    from public.events where created_at < cutoff
    group by 1, 2, 3
  on conflict (city_id, month, event) do update set n = public.events_monthly.n + excluded.n;
  delete from public.events where created_at < cutoff;
end $$;
revoke all on function private.retain_events() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('retain-events-monthly', '17 3 1 * *', 'select private.retain_events()');
