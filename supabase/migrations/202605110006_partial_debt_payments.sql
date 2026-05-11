alter table public.sales
add column if not exists paid_amount numeric not null default 0 check (paid_amount >= 0);

update public.sales
set paid_amount = total_amount
where status = 'paid'
  and paid_amount = 0;

update public.sales
set paid_amount = least(paid_amount, total_amount)
where paid_amount > total_amount;

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
    paid_amount,
    payment_method,
    status,
    customer_name,
    customer_phone,
    comment
  )
  values (
    'S-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_sale_number_seq')::text, 6, '0'),
    0,
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
  set total_amount = v_total,
      paid_amount = case when v_status = 'paid' then v_total else 0 end
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(jsonb, text, text, text, text) to anon;

create or replace function public.create_manual_debt(
  customer_name text,
  customer_phone text default null,
  total_amount numeric default 0,
  sale_comment text default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
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

  insert into public.sales (
    sale_number,
    total_amount,
    paid_amount,
    payment_method,
    status,
    customer_name,
    customer_phone,
    comment
  )
  values (
    'D-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_sale_number_seq')::text, 6, '0'),
    total_amount,
    0,
    'debt',
    'unpaid',
    v_customer_name,
    v_customer_phone,
    v_comment
  )
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.create_manual_debt(text, text, numeric, text) to anon;

create or replace function public.record_debt_payment(sale_id uuid, payment_amount numeric)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_paid_amount numeric;
begin
  if payment_amount is null or payment_amount <= 0 then
    raise exception 'payment amount must be greater than zero';
  end if;

  select *
  into v_sale
  from public.sales
  where id = sale_id
  for update;

  if v_sale.id is null then
    raise exception 'sale not found';
  end if;

  if v_sale.status = 'paid' then
    return v_sale;
  end if;

  v_paid_amount = least(v_sale.total_amount, coalesce(v_sale.paid_amount, 0) + payment_amount);

  update public.sales
  set paid_amount = v_paid_amount,
      status = case when v_paid_amount >= total_amount then 'paid' else status end
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

grant execute on function public.record_debt_payment(uuid, numeric) to anon;

create or replace function public.confirm_sale_payment(sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
begin
  update public.sales
  set paid_amount = total_amount,
      status = 'paid'
  where id = sale_id
  returning * into v_sale;

  if v_sale.id is null then
    raise exception 'sale not found';
  end if;

  return v_sale;
end;
$$;

grant execute on function public.confirm_sale_payment(uuid) to anon;

create or replace function public.confirm_sale_payments(sale_ids uuid[])
returns setof public.sales
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.sales
  set paid_amount = total_amount,
      status = 'paid'
  where id = any(sale_ids)
  returning *;
end;
$$;

grant execute on function public.confirm_sale_payments(uuid[]) to anon;

notify pgrst, 'reload schema';
