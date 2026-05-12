create extension if not exists pgcrypto;

alter table public.products
add column if not exists category text;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists product_categories_name_unique_idx
on public.product_categories (lower(btrim(name)));

insert into public.product_categories (name)
values
  ('Молочные продукты'),
  ('Хлеб и выпечка'),
  ('Напитки'),
  ('Сладости'),
  ('Бакалея'),
  ('Овощи и фрукты'),
  ('Мясо и рыба'),
  ('Заморозка'),
  ('Чай и кофе'),
  ('Хозтовары')
on conflict do nothing;

alter table public.sale_items
alter column product_id drop not null;

alter table public.sale_items
drop constraint if exists sale_items_product_id_fkey;

alter table public.sale_items
add constraint sale_items_product_id_fkey
foreign key (product_id)
references public.products(id)
on delete set null;

create or replace function public.delete_product(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if p_product_id is null then
    raise exception 'product id is required';
  end if;

  update public.sale_items
  set product_id = null
  where product_id = p_product_id;

  delete from public.products
  where id = p_product_id;
  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

grant execute on function public.delete_product(uuid) to anon;

create or replace function public.clear_products()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  update public.sale_items
  set product_id = null
  where product_id is not null;

  delete from public.products
  where id is not null;
  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

grant execute on function public.clear_products() to anon;

notify pgrst, 'reload schema';
