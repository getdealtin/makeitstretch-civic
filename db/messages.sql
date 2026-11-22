-- "Stay connected" sign-ups and messages (owner decision, Nov 22 2026): the About page's form. The one place
-- the site keeps an email address, given by the person on purpose; the privacy policy says so. Only the
-- server reads and writes it (secret key); RLS on with no policies blocks public access. The owner sees
-- them in /admin (Messages) and can delete one when someone asks to be removed.
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  city_id     text not null,
  email       text not null check (char_length(email) between 6 and 254),
  role        text not null check (role in ('resident', 'partner', 'press', 'other')),
  message     text check (message is null or char_length(message) <= 1000),
  lang        text not null default 'en' check (lang in ('en', 'es', 'vi', 'zh-Hans')),
  created_at  timestamptz not null default now()
);
create index if not exists messages_created_at on public.messages (created_at desc);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
