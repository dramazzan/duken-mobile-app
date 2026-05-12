create extension if not exists pgcrypto;

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists sellers_single_default_idx
on public.sellers (is_default)
where is_default = true;

create index if not exists sellers_name_idx on public.sellers using btree (name);
create index if not exists sellers_active_idx on public.sellers using btree (is_active);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sellers_updated_at on public.sellers;
create trigger set_sellers_updated_at
before update on public.sellers
for each row
execute function public.set_updated_at();

insert into public.sellers (name, is_active, is_default)
select 'Продавец', true, true
where not exists (select 1 from public.sellers);

create or replace function public.get_default_seller_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid;
begin
  select id
  into v_seller_id
  from public.sellers
  where is_default = true
    and is_active = true
  order by created_at asc
  limit 1;

  if v_seller_id is null then
    select id
    into v_seller_id
    from public.sellers
    where is_active = true
    order by created_at asc
    limit 1;
  end if;

  if v_seller_id is null then
    insert into public.sellers (name, is_active, is_default)
    values ('Продавец', true, true)
    returning id into v_seller_id;
  end if;

  return v_seller_id;
end;
$$;

grant execute on function public.get_default_seller_id() to anon;

alter table public.sales
add column if not exists seller_id uuid references public.sellers(id) on delete restrict;

alter table public.sales
add column if not exists seller_name text;

update public.sales
set seller_id = public.get_default_seller_id()
where seller_id is null;

update public.sales
set seller_name = public.sellers.name
from public.sellers
where public.sales.seller_id = public.sellers.id
  and public.sales.seller_name is null;

alter table public.sales
alter column seller_id set not null;

alter table public.sales
alter column seller_name set not null;

create index if not exists sales_seller_id_idx on public.sales using btree (seller_id);
create index if not exists sales_seller_name_idx on public.sales using btree (seller_name);

create or replace function public.set_default_seller(seller_id uuid)
returns public.sellers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller public.sellers;
begin
  select *
  into v_seller
  from public.sellers
  where id = seller_id
    and is_active = true
  for update;

  if v_seller.id is null then
    raise exception 'seller not found';
  end if;

  update public.sellers
  set is_default = false
  where is_default = true
    and id <> seller_id;

  update public.sellers
  set is_default = true
  where id = seller_id
  returning * into v_seller;

  return v_seller;
end;
$$;

grant execute on function public.set_default_seller(uuid) to anon;

drop function if exists public.create_sale(jsonb, text, text, text, text);
create or replace function public.create_sale(
  cart_items jsonb,
  payment_method text,
  customer_name text default null,
  customer_phone text default null,
  sale_comment text default null,
  seller_id uuid default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product public.products;
  v_sale public.sales;
  v_seller public.sellers;
  v_seller_id uuid := seller_id;
  v_status text;
  v_total numeric := 0;
  v_line_total numeric;
  v_customer_name text := nullif(btrim(customer_name), '');
  v_customer_phone text := nullif(btrim(customer_phone), '');
  v_comment text := nullif(btrim(sale_comment), '');
begin
  if payment_method not in ('cash', 'transfer', 'debt', 'home_payment') then
    raise exception 'invalid payment method';
  end if;

  if jsonb_typeof(cart_items) <> 'array' or jsonb_array_length(cart_items) = 0 then
    raise exception 'cart_items must be a non-empty array';
  end if;

  if v_seller_id is null then
    v_seller_id = public.get_default_seller_id();
  end if;

  select *
  into v_seller
  from public.sellers
  where id = v_seller_id
    and is_active = true;

  if v_seller.id is null then
    raise exception 'seller is required';
  end if;

  v_status = case
    when payment_method in ('cash', 'transfer') then 'paid'
    when payment_method = 'debt' then 'unpaid'
    else 'pending'
  end;

  if payment_method in ('debt', 'home_payment') and v_customer_name is null then
    raise exception 'customer name is required';
  end if;

  insert into public.sales (
    sale_number,
    total_amount,
    paid_amount,
    payment_method,
    status,
    customer_name,
    customer_phone,
    comment,
    seller_id,
    seller_name
  )
  values (
    'S-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_sale_number_seq')::text, 6, '0'),
    0,
    0,
    payment_method,
    v_status,
    v_customer_name,
    v_customer_phone,
    v_comment,
    v_seller.id,
    v_seller.name
  )
  returning * into v_sale;

  for item in select * from jsonb_array_elements(cart_items)
  loop
    v_product_id = nullif(item ->> 'product_id', '')::uuid;
    v_quantity = nullif(item ->> 'quantity', '')::integer;

    if v_product_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'each cart item must include product_id and positive quantity';
    end if;

    select *
    into v_product
    from public.products
    where id = v_product_id
    for update;

    if v_product.id is null then
      raise exception 'product not found: %', v_product_id;
    end if;

    update public.products
    set quantity = quantity - v_quantity
    where id = v_product_id
    returning * into v_product;

    if v_product.id is null then
      raise exception 'product not found: %', v_product_id;
    end if;

    v_line_total = v_product.price * v_quantity;
    v_total = v_total + v_line_total;

    insert into public.sale_items (
      sale_id,
      product_id,
      product_name,
      product_barcode,
      product_image_url,
      unit_price,
      quantity,
      line_total
    )
    values (
      v_sale.id,
      v_product.id,
      v_product.name,
      v_product.barcode,
      v_product.image_url,
      v_product.price,
      v_quantity,
      v_line_total
    );
  end loop;

  update public.sales
  set total_amount = v_total,
      paid_amount = case when v_status = 'paid' then v_total else 0 end
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(jsonb, text, text, text, text, uuid) to anon;

drop function if exists public.create_manual_debt(text, text, numeric, text);
create or replace function public.create_manual_debt(
  customer_name text,
  customer_phone text default null,
  total_amount numeric default 0,
  sale_comment text default null,
  seller_id uuid default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_seller public.sellers;
  v_seller_id uuid := seller_id;
  v_customer_name text := nullif(btrim(customer_name), '');
  v_customer_phone text := nullif(btrim(customer_phone), '');
  v_comment text := nullif(btrim(sale_comment), '');
begin
  if v_customer_name is null then
    raise exception 'customer name is required';
  end if;

  if total_amount is null or total_amount <= 0 then
    raise exception 'total amount must be greater than zero';
  end if;

  if v_seller_id is null then
    v_seller_id = public.get_default_seller_id();
  end if;

  select *
  into v_seller
  from public.sellers
  where id = v_seller_id
    and is_active = true;

  if v_seller.id is null then
    raise exception 'seller is required';
  end if;

  insert into public.sales (
    sale_number,
    total_amount,
    paid_amount,
    payment_method,
    status,
    customer_name,
    customer_phone,
    comment,
    seller_id,
    seller_name
  )
  values (
    'D-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_sale_number_seq')::text, 6, '0'),
    total_amount,
    0,
    'debt',
    'unpaid',
    v_customer_name,
    v_customer_phone,
    v_comment,
    v_seller.id,
    v_seller.name
  )
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.create_manual_debt(text, text, numeric, text, uuid) to anon;

alter table public.sellers enable row level security;

drop policy if exists "Allow public seller reads" on public.sellers;
create policy "Allow public seller reads"
on public.sellers for select
to anon
using (true);

drop policy if exists "Allow public seller inserts" on public.sellers;
create policy "Allow public seller inserts"
on public.sellers for insert
to anon
with check (true);

drop policy if exists "Allow public seller updates" on public.sellers;
create policy "Allow public seller updates"
on public.sellers for update
to anon
using (true)
with check (true);

alter table public.sellers replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sellers'
  ) then
    alter publication supabase_realtime add table public.sellers;
  end if;
end;
$$;

notify pgrst, 'reload schema';
