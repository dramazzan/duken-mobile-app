create extension if not exists pgcrypto;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,
  total_amount numeric not null default 0 check (total_amount >= 0),
  payment_method text not null check (payment_method in ('cash', 'transfer', 'debt', 'home_payment')),
  status text not null check (status in ('paid', 'unpaid', 'pending')),
  customer_name text,
  customer_phone text,
  comment text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  product_barcode text,
  product_image_url text,
  unit_price numeric not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric not null check (line_total >= 0),
  created_at timestamp with time zone not null default now()
);

create sequence if not exists public.sales_sale_number_seq;

create index if not exists sales_sale_number_idx on public.sales using btree (sale_number);
create index if not exists sales_created_at_idx on public.sales using btree (created_at desc);
create index if not exists sales_payment_method_idx on public.sales using btree (payment_method);
create index if not exists sales_status_idx on public.sales using btree (status);
create index if not exists sales_customer_name_idx on public.sales using btree (customer_name);
create index if not exists sales_customer_phone_idx on public.sales using btree (customer_phone);
create index if not exists sale_items_sale_id_idx on public.sale_items using btree (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items using btree (product_id);
create index if not exists sale_items_product_name_idx on public.sale_items using btree (product_name);
create index if not exists sale_items_product_barcode_idx on public.sale_items using btree (product_barcode);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sales_updated_at on public.sales;
create trigger set_sales_updated_at
before update on public.sales
for each row
execute function public.set_updated_at();

create or replace function public.create_sale(
  cart_items jsonb,
  payment_method text,
  customer_name text default null,
  customer_phone text default null,
  sale_comment text default null
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
    payment_method,
    status,
    customer_name,
    customer_phone,
    comment
  )
  values (
    'S-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_sale_number_seq')::text, 6, '0'),
    0,
    payment_method,
    v_status,
    v_customer_name,
    v_customer_phone,
    v_comment
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
  set total_amount = v_total
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(jsonb, text, text, text, text) to anon;

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

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "Allow public sale reads" on public.sales;
create policy "Allow public sale reads"
on public.sales for select
to anon
using (true);

drop policy if exists "Allow public sale inserts" on public.sales;
create policy "Allow public sale inserts"
on public.sales for insert
to anon
with check (true);

drop policy if exists "Allow public sale updates" on public.sales;
create policy "Allow public sale updates"
on public.sales for update
to anon
using (true)
with check (true);

drop policy if exists "Allow public sale item reads" on public.sale_items;
create policy "Allow public sale item reads"
on public.sale_items for select
to anon
using (true);

drop policy if exists "Allow public sale item inserts" on public.sale_items;
create policy "Allow public sale item inserts"
on public.sale_items for insert
to anon
with check (true);

alter table public.sales replica identity full;
alter table public.sale_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sale_items'
  ) then
    alter publication supabase_realtime add table public.sale_items;
  end if;
end;
$$;

notify pgrst, 'reload schema';
