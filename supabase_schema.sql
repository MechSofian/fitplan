-- ================================================
-- FitPlan — Schéma Supabase
-- Coller dans SQL Editor > New query > Run
-- ================================================

-- Profils utilisateurs (étend auth.users)
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

-- Séances d'entraînement
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade not null,
  date        date default current_date,
  objectif    text,
  jours       int,
  label       text,
  created_at  timestamptz default now()
);

-- Exercices loggés dans chaque séance
create table if not exists exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions on delete cascade not null,
  user_id       uuid references auth.users on delete cascade not null,
  exercise_name text not null,
  sets          jsonb default '[]',  -- [{reps: 10, weight: 80}, ...]
  created_at    timestamptz default now()
);

-- ── Row Level Security ──────────────────────────────
alter table profiles      enable row level security;
alter table sessions      enable row level security;
alter table exercise_logs enable row level security;

-- Profiles : chaque user accède uniquement à son profil
create policy "profiles_self" on profiles
  for all using (auth.uid() = id);

-- Sessions : chaque user accède uniquement à ses sessions
create policy "sessions_self" on sessions
  for all using (auth.uid() = user_id);

-- Exercise logs : idem
create policy "exercise_logs_self" on exercise_logs
  for all using (auth.uid() = user_id);

-- ── Auto-créer le profil à l'inscription ───────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
