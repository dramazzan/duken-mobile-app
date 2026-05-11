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
    payment_method,
    status,
    customer_name,
    customer_phone,
    comment
  )
  values (
    'D-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.sales_sale_number_seq')::text, 6, '0'),
    total_amount,
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

notify pgrst, 'reload schema';
