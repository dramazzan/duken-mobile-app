alter table public.products
add column if not exists category text;

create index if not exists products_category_idx on public.products using btree (category);

notify pgrst, 'reload schema';
