-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  handicap_index numeric(4,1) default 54.0,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view all profiles" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Courses
create table public.courses (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  location text,
  holes_count int not null default 18,
  par_total int not null default 72,
  external_id text,
  source text, -- 'golfcourseapi' | 'manual'
  created_at timestamptz default now()
);
create index on public.courses (external_id);
alter table public.courses enable row level security;
create policy "Anyone can view courses" on public.courses for select using (true);
create policy "Authenticated users can insert courses" on public.courses for insert with check (auth.role() = 'authenticated');

-- Holes
create table public.holes (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses on delete cascade not null,
  hole_number int not null,
  par int not null default 4,
  stroke_index int,
  distance_m int,
  unique (course_id, hole_number)
);
alter table public.holes enable row level security;
create policy "Anyone can view holes" on public.holes for select using (true);
create policy "Authenticated users can insert holes" on public.holes for insert with check (auth.role() = 'authenticated');

-- Tournaments
create table public.tournaments (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  format text not null, -- 'stroke' | 'scramble' | 'matchplay'
  start_date date,
  created_by uuid references public.profiles not null,
  created_at timestamptz default now()
);
alter table public.tournaments enable row level security;
create policy "Anyone can view tournaments" on public.tournaments for select using (true);
create policy "Authenticated users can create tournaments" on public.tournaments for insert with check (auth.uid() = created_by);

-- Rounds
create table public.rounds (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references public.courses not null,
  tournament_id uuid references public.tournaments,
  format text not null default 'stroke', -- 'stroke' | 'scramble' | 'matchplay'
  date date not null default current_date,
  created_by uuid references public.profiles not null,
  created_at timestamptz default now()
);
alter table public.rounds enable row level security;
create policy "Anyone can view rounds" on public.rounds for select using (true);
create policy "Authenticated users can create rounds" on public.rounds for insert with check (auth.uid() = created_by);

-- Round players
create table public.round_players (
  round_id uuid references public.rounds on delete cascade not null,
  user_id uuid references public.profiles not null,
  team text, -- null | 'red' | 'blue'
  primary key (round_id, user_id)
);
alter table public.round_players enable row level security;
create policy "Anyone can view round players" on public.round_players for select using (true);
create policy "Authenticated users can join rounds" on public.round_players for insert with check (auth.role() = 'authenticated');

-- Scores
create table public.scores (
  id uuid default uuid_generate_v4() primary key,
  round_id uuid references public.rounds on delete cascade not null,
  user_id uuid references public.profiles not null,
  hole_id uuid references public.holes not null,
  strokes int not null,
  unique (round_id, user_id, hole_id)
);
alter table public.scores enable row level security;
create policy "Anyone can view scores" on public.scores for select using (true);
create policy "Authenticated users can insert scores" on public.scores for insert with check (auth.uid() = user_id);
create policy "Users can update own scores" on public.scores for update using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
