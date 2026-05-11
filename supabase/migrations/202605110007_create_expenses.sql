create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric not null check (amount > 0),
  category text not null check (category in ('purchase', 'rent', 'salary', 'delivery', 'utility', 'other')),
  comment text,
  expense_date date not null default current_date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists expenses_expense_date_idx on public.expenses using btree (expense_date desc);
create index if not exists expenses_category_idx on public.expenses using btree (category);
create index if not exists expenses_created_at_idx on public.expenses using btree (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();

alter table public.expenses enable row level security;

drop policy if exists "Allow public expense reads" on public.expenses;
create policy "Allow public expense reads"
on public.expenses for select
to anon
using (true);

drop policy if exists "Allow public expense inserts" on public.expenses;
create policy "Allow public expense inserts"
on public.expenses for insert
to anon
with check (true);

drop policy if exists "Allow public expense updates" on public.expenses;
create policy "Allow public expense updates"
on public.expenses for update
to anon
using (true)
with check (true);

drop policy if exists "Allow public expense deletes" on public.expenses;
create policy "Allow public expense deletes"
on public.expenses for delete
to anon
using (true);

alter table public.expenses replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end;
$$;

notify pgrst, 'reload schema';
