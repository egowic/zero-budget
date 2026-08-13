-- Zero — Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Every table is scoped to auth.uid() through row-level security, so an
-- anonymous account sees only its own rows even though the anon API key is
-- public and shipped in the client bundle.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.categories (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  icon        text not null default '',
  color       text not null default '#8f93a8',
  sort_order  integer not null default 0,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.budgets (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  -- Minor units (kuruş). Integers only: floats do not reconcile.
  amount      bigint not null,
  start_date  date not null,
  end_date    date not null,
  period      jsonb not null default '{"kind":"month"}'::jsonb,
  repeats     boolean not null default false,
  archived    boolean not null default false,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.expenses (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount      bigint not null,
  -- No budget reference: an expense belongs to a date, and every budget whose
  -- period covers that date counts it.
  category_id uuid,
  note        text,
  date        date not null,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Pull is a cursor scan over updated_at, per user
create index if not exists categories_sync_idx on public.categories (user_id, updated_at);
create index if not exists budgets_sync_idx    on public.budgets    (user_id, updated_at);
create index if not exists expenses_sync_idx   on public.expenses   (user_id, updated_at);

-- ── Server-owned updated_at ─────────────────────────────────────────────────
-- The sync cursor and last-write-wins both order by this column, so it must
-- come from one clock. Device clocks disagree; the database's does not.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before insert or update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists budgets_touch on public.budgets;
create trigger budgets_touch before insert or update on public.budgets
  for each row execute function public.touch_updated_at();

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before insert or update on public.expenses
  for each row execute function public.touch_updated_at();

-- ── Row-level security ──────────────────────────────────────────────────────

alter table public.categories enable row level security;
alter table public.budgets    enable row level security;
alter table public.expenses   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'budgets', 'expenses'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I
         for all
         to authenticated
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)',
      t || '_owner', t
    );
  end loop;
end;
$$;
