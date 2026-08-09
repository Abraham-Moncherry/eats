alter table public.food_entries
  add column if not exists carbohydrates numeric(8,2) not null default 0 check (carbohydrates >= 0),
  add column if not exists fat numeric(8,2) not null default 0 check (fat >= 0),
  add column if not exists routine_name text,
  add column if not exists meal_name text,
  add column if not exists snapshot jsonb;

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  brand text,
  barcode text,
  serving_amount numeric(10,2) not null default 100 check (serving_amount > 0),
  serving_unit text not null default 'g' check (serving_unit in ('g', 'ml', 'item', 'scoop', 'tsp', 'tbsp', 'serving')),
  calories numeric(10,2) not null default 0 check (calories >= 0),
  protein numeric(10,2) not null default 0 check (protein >= 0),
  carbohydrates numeric(10,2) not null default 0 check (carbohydrates >= 0),
  fat numeric(10,2) not null default 0 check (fat >= 0),
  source text not null default 'manual' check (source in ('manual', 'barcode', 'label', 'database')),
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ingredients_user_barcode_idx on public.ingredients (user_id, barcode) where barcode is not null;
create index ingredients_user_name_idx on public.ingredients (user_id, lower(name));

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  unit text not null check (unit in ('g', 'ml', 'item', 'scoop', 'tsp', 'tbsp', 'serving')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index meal_ingredients_meal_idx on public.meal_ingredients (meal_id, position);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  suggested_period text check (suggested_period in ('morning', 'midday', 'evening', 'anytime')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routine_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete restrict,
  quantity numeric(8,2) not null default 1 check (quantity > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (routine_id, meal_id)
);

create index routine_meals_routine_idx on public.routine_meals (routine_id, position);

alter table public.ingredients enable row level security;
alter table public.meals enable row level security;
alter table public.meal_ingredients enable row level security;
alter table public.routines enable row level security;
alter table public.routine_meals enable row level security;

create policy "Users manage their ingredients" on public.ingredients for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their meals" on public.meals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their meal ingredients" on public.meal_ingredients for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their routines" on public.routines for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their routine meals" on public.routine_meals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
