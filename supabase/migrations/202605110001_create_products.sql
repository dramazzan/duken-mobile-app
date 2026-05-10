create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  barcode text unique,
  price numeric not null check (price >= 0),
  quantity integer not null default 0,
  image_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.products alter column barcode drop not null;

create index if not exists products_name_idx on public.products using btree (name);
create index if not exists products_barcode_idx on public.products using btree (barcode);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

create or replace function public.decrease_product_quantity(product_id uuid, amount integer)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_product public.products;
begin
  if amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  update public.products
  set quantity = quantity - amount
  where id = product_id
  returning * into updated_product;

  if updated_product.id is null then
    raise exception 'product not found';
  end if;

  return updated_product;
end;
$$;

grant execute on function public.decrease_product_quantity(uuid, integer) to anon;

create or replace function public.decrease_product_quantities(items jsonb)
returns setof public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  product_id uuid;
  amount integer;
  updated_product public.products;
begin
  if jsonb_typeof(items) <> 'array' then
    raise exception 'items must be an array';
  end if;

  for item in select * from jsonb_array_elements(items)
  loop
    product_id = (item ->> 'product_id')::uuid;
    amount = (item ->> 'amount')::integer;

    if product_id is null or amount is null or amount <= 0 then
      raise exception 'each item must include product_id and positive amount';
    end if;

    update public.products
    set quantity = quantity - amount
    where id = product_id
    returning * into updated_product;

    if updated_product.id is null then
      raise exception 'product not found: %', product_id;
    end if;

    return next updated_product;
  end loop;
end;
$$;

grant execute on function public.decrease_product_quantities(jsonb) to anon;

alter table public.products enable row level security;

drop policy if exists "Allow public product reads" on public.products;
create policy "Allow public product reads"
on public.products for select
to anon
using (true);

drop policy if exists "Allow public product inserts" on public.products;
create policy "Allow public product inserts"
on public.products for insert
to anon
with check (true);

drop policy if exists "Allow public product updates" on public.products;
create policy "Allow public product updates"
on public.products for update
to anon
using (true)
with check (true);

drop policy if exists "Allow public product deletes" on public.products;
create policy "Allow public product deletes"
on public.products for delete
to anon
using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Allow public product image reads" on storage.objects;
create policy "Allow public product image reads"
on storage.objects for select
to anon
using (bucket_id = 'product-images');

drop policy if exists "Allow public product image uploads" on storage.objects;
create policy "Allow public product image uploads"
on storage.objects for insert
to anon
with check (bucket_id = 'product-images');

drop policy if exists "Allow public product image updates" on storage.objects;
create policy "Allow public product image updates"
on storage.objects for update
to anon
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

drop policy if exists "Allow public product image deletes" on storage.objects;
create policy "Allow public product image deletes"
on storage.objects for delete
to anon
using (bucket_id = 'product-images');

alter table public.products replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end;
$$;

notify pgrst, 'reload schema';
