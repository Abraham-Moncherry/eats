create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calorie_goal integer not null default 2200 check (calorie_goal > 0),
  protein_goal integer not null default 150 check (protein_goal > 0),
  updated_at timestamptz not null default now()
);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  calories integer not null check (calories >= 0),
  protein integer not null default 0 check (protein >= 0),
  meal text not null check (meal in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index food_entries_user_date_idx on public.food_entries (user_id, entry_date desc);

alter table public.profiles enable row level security;
alter table public.food_entries enable row level security;

create policy "Users can read their profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users can read their food entries" on public.food_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their food entries" on public.food_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their food entries" on public.food_entries
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their food entries" on public.food_entries
  for delete to authenticated using ((select auth.uid()) = user_id);
