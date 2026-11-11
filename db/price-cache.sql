-- Last good BLS prices per Census region (server/live-prices.js), so a restart or deploy keeps them
-- and a BLS outage doesn't drop plans to the built-in averages. Prices only: no visitor data.
-- Only the server reads and writes it (secret key); RLS on with no policies blocks public access.
create table if not exists public.price_cache (
  region      text primary key check (region in ('national', 'northeast', 'midwest', 'south', 'west')),
  prices      jsonb not null check (pg_column_size(prices) < 20000),
  fetched_at  timestamptz not null
);
alter table public.price_cache enable row level security;
revoke all on public.price_cache from anon, authenticated;
