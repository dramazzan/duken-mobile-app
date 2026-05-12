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
