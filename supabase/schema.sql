-- Retro Gaming Journey — Supabase schema
-- Run this in the Supabase SQL editor once per project.

-- Player profile (mirrors auth.users)
create table if not exists public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    device_id    text default 'rgb10x_hw01',
    created_at   timestamptz default now()
);

-- Cloud mirror of the handheld's offline achievement_queue (spec 3.1)
create table if not exists public.achievement_queue (
    id              bigint generated always as identity primary key,
    user_id         uuid not null references auth.users(id) on delete cascade,
    device_id       text not null,
    game_hash       text not null,
    achievement_id  text not null,
    timestamp       bigint not null,              -- unix epoch seconds, captured offline
    hardcore        boolean not null default true,
    inserted_at     timestamptz default now()
);

-- Aggregated per-game completion for fast dashboard reads
create table if not exists public.game_progress (
    user_id       uuid not null references auth.users(id) on delete cascade,
    game_hash     text not null,
    game_id       text not null,                  -- stable slug from js/data.js
    status        text not null default 'playing' check (status in ('playing','completed')),
    unlocks       integer not null default 0,
    hardcore      boolean not null default true,
    updated_at    timestamptz default now(),
    primary key (user_id, game_id)
);

create index if not exists achievement_queue_user_idx on public.achievement_queue (user_id, inserted_at desc);
create index if not exists achievement_queue_hash_idx on public.achievement_queue (game_hash);

-- Row level security: players only ever touch their own rows
alter table public.profiles         enable row level security;
alter table public.achievement_queue enable row level security;
alter table public.game_progress    enable row level security;

create policy "own profile"      on public.profiles         for all    using (auth.uid() = id) with check (auth.uid() = id);
create policy "own queue rows"   on public.achievement_queue for all   using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own progress"     on public.game_progress    for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
