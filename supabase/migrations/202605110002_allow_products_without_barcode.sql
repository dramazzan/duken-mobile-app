alter table public.products alter column barcode drop not null;

notify pgrst, 'reload schema';
