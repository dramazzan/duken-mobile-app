create extension if not exists pgcrypto;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists product_categories_name_unique_idx
on public.product_categories (lower(btrim(name)));

create index if not exists product_categories_name_idx
on public.product_categories using btree (name);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$д
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_product_categories_updated_at on public.product_categories;
create trigger set_product_categories_updated_at
before update on public.product_categories
for each row
execute function public.set_updated_at();

insert into public.product_categories (name)
select category_name
from (
  select distinct btrim(category) as category_name
  from public.products
  where nullif(btrim(category), '') is not null
) seeded_categories
on conflict do nothing;

alter table public.product_categories enable row level security;

drop policy if exists "Allow public product category reads" on public.product_categories;
create policy "Allow public product category reads"
on public.product_categories for select
to anon
using (true);

drop policy if exists "Allow public product category inserts" on public.product_categories;
create policy "Allow public product category inserts"
on public.product_categories for insert
to anon
with check (true);

drop policy if exists "Allow public product category updates" on public.product_categories;
create policy "Allow public product category updates"
on public.product_categories for update
to anon
using (true)
with check (true);

drop policy if exists "Allow public product category deletes" on public.product_categories;
create policy "Allow public product category deletes"
on public.product_categories for delete
to anon
using (true);

alter table public.product_categories replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_categories'
  ) then
    alter publication supabase_realtime add table public.product_categories;
  end if;
end;
$$;

notify pgrst, 'reload schema';
