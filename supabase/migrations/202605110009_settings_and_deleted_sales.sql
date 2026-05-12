create extension if not exists pgcrypto;

alter table public.sales
add column if not exists deleted_at timestamp with time zone;

create index if not exists sales_deleted_at_idx on public.sales using btree (deleted_at);

create table if not exists public.cash_register_resets (
  id uuid primary key default gen_random_uuid(),
  reset_at timestamp with time zone not null default now(),
  total_amount numeric not null default 0 check (total_amount >= 0),
  cash_amount numeric not null default 0 check (cash_amount >= 0),
  transfer_amount numeric not null default 0 check (transfer_amount >= 0),
  sales_count integer not null default 0 check (sales_count >= 0),
  created_at timestamp with time zone not null default now()
);

create index if not exists cash_register_resets_reset_at_idx
on public.cash_register_resets using btree (reset_at desc);

alter table public.cash_register_resets enable row level security;

drop policy if exists "Allow public cash reset reads" on public.cash_register_resets;
create policy "Allow public cash reset reads"
on public.cash_register_resets for select
to anon
using (true);

drop policy if exists "Allow public cash reset inserts" on public.cash_register_resets;
create policy "Allow public cash reset inserts"
on public.cash_register_resets for insert
to anon
with check (true);

alter table public.cash_register_resets replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cash_register_resets'
  ) then
    alter publication supabase_realtime add table public.cash_register_resets;
  end if;
end;
$$;

notify pgrst, 'reload schema';
