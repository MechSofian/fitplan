-- ================================================
-- FitPlan — Schéma Supabase (v2)
-- Coller dans SQL Editor > New query > Run
-- Si les tables existent déjà, lancer d'abord le bloc DROP ci-dessous
-- ================================================

-- (Optionnel) Supprimer les anciennes policies si déjà créées
drop policy if exists "profiles_self"      on profiles;
drop policy if exists "sessions_self"      on sessions;
drop policy if exists "exercise_logs_self" on exercise_logs;

-- ── Tables ──────────────────────────────────────

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  genre       text,
  age         int,
  taille      int,
  poids       numeric(5,1),
  activite    numeric(4,3),
  objectif    text,
  jours       int,
  updated_at  timestamptz default now()
);

create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  date        date default current_date,
  objectif    text,
  jours       int,
  label       text,
  created_at  timestamptz default now()
);

create table if not exists exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions on delete cascade not null,
  user_id       uuid references auth.users on delete cascade not null,
  exercise_name text not null,
  sets          jsonb default '[]',
  created_at    timestamptz default now()
);

-- ── Row Level Security ───────────────────────────

alter table profiles      enable row level security;
alter table sessions      enable row level security;
alter table exercise_logs enable row level security;

-- profiles
create policy "profiles_select" on profiles for select using      (auth.uid() = id);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using      (auth.uid() = id) with check (auth.uid() = id);

-- sessions
create policy "sessions_select" on sessions for select using      (auth.uid() = user_id);
create policy "sessions_insert" on sessions for insert with check (auth.uid() = user_id);
create policy "sessions_delete" on sessions for delete using      (auth.uid() = user_id);

-- exercise_logs
create policy "logs_select" on exercise_logs for select using      (auth.uid() = user_id);
create policy "logs_insert" on exercise_logs for insert with check (auth.uid() = user_id);
create policy "logs_delete" on exercise_logs for delete using      (auth.uid() = user_id);

-- ── Auto-créer le profil à l'inscription ────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
