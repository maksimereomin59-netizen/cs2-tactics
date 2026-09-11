-- ============================================================
-- CS2 TEAM PLAYBOOK — Supabase schema (Postgres + RLS + Realtime)
-- Как применять: Supabase Dashboard → SQL Editor → вставить целиком → Run.
-- Перед этим: Authentication → Sign In / Up → включить "Allow anonymous sign-ins".
-- ============================================================

create extension if not exists pgcrypto;

-- ---------------- teams ----------------
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  captain_pin_hash text not null,
  captain_name text not null default '',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teams_name_lower_uq on teams (lower(name));

-- ---------------- memberships (anon-auth users -> teams) ----------------
create table if not exists memberships (
  user_id uuid not null,
  team_id uuid not null references teams(id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'captain')),
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);
create index if not exists memberships_user_idx on memberships (user_id);

-- ---------------- content tables ----------------
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  role text not null default '',
  positions text[] not null default '{}',
  color text not null default '#e8a72f',
  notes text not null default '',
  pos int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists players_team_idx on players (team_id, pos);

create table if not exists maps (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  image text not null default '',
  pos int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists maps_team_idx on maps (team_id, pos);

create table if not exists tactics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  map_id uuid null references maps(id) on delete set null,
  name text not null,
  side text not null default 'T' check (side in ('T', 'CT', 'ANY')),
  category text not null default '',
  description text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  pos int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists tactics_team_idx on tactics (team_id, pos);
create index if not exists tactics_map_idx on tactics (map_id);

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  map_id uuid null references maps(id) on delete set null,
  type text not null default 'link' check (type in ('image', 'video', 'gif', 'link', 'note', 'pdf', 'demo')),
  title text not null,
  url text not null default '',
  description text not null default '',
  pos int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists materials_team_idx on materials (team_id, pos);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists templates_team_idx on templates (team_id);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  actor text not null default '',
  text text not null,
  ref_kind text not null default '',
  ref_id text not null default '',
  ts timestamptz not null default now()
);
create index if not exists activity_team_idx on activity (team_id, ts desc);

-- ---------------- helpers ----------------
create or replace function public.is_member(p_team uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from memberships m where m.team_id = p_team and m.user_id = auth.uid()) $$;

create or replace function public.is_captain(p_team uuid)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from memberships m where m.team_id = p_team and m.user_id = auth.uid() and m.role = 'captain') $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_teams_touch') then
    create trigger tr_teams_touch before update on teams for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'tr_players_touch') then
    create trigger tr_players_touch before update on players for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'tr_maps_touch') then
    create trigger tr_maps_touch before update on maps for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'tr_tactics_touch') then
    create trigger tr_tactics_touch before update on tactics for each row execute function touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'tr_materials_touch') then
    create trigger tr_materials_touch before update on materials for each row execute function touch_updated_at();
  end if;
end $$;

-- PIN hashes can only change through team_set_pin RPC (not via direct update).
create or replace function public.guard_pin_hash()
returns trigger language plpgsql as
$$ begin
  if (new.pin_hash is distinct from old.pin_hash or new.captain_pin_hash is distinct from old.captain_pin_hash)
     and coalesce(current_setting('app.allow_pin_change', true), '') <> '1' then
    raise exception 'PIN_CHANGE_DENIED';
  end if;
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_teams_guard_pin') then
    create trigger tr_teams_guard_pin before update on teams for each row execute function guard_pin_hash();
  end if;
end $$;

-- Keep activity feed capped (last 60 per team).
create or replace function public.trim_activity()
returns trigger language plpgsql as
$$ begin
  delete from activity a where a.team_id = new.team_id and a.id not in (
    select id from activity where team_id = new.team_id order by ts desc limit 60
  );
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_activity_trim') then
    create trigger tr_activity_trim after insert on activity for each row execute function trim_activity();
  end if;
end $$;

-- ---------------- RLS ----------------
alter table teams enable row level security;
alter table memberships enable row level security;
alter table players enable row level security;
alter table maps enable row level security;
alter table tactics enable row level security;
alter table materials enable row level security;
alter table templates enable row level security;
alter table activity enable row level security;

do $$ begin
  -- memberships: read own rows only; writes go through RPCs.
  if not exists (select 1 from pg_policies where policyname = 'm_sel_own') then
    create policy m_sel_own on memberships for select using (user_id = auth.uid());
  end if;
  -- teams: members can read their team; captains can update profile fields (hashes guarded by trigger).
  if not exists (select 1 from pg_policies where policyname = 't_sel_member') then
    create policy t_sel_member on teams for select using (is_member(id));
  end if;
  if not exists (select 1 from pg_policies where policyname = 't_upd_captain') then
    create policy t_upd_captain on teams for update using (is_captain(id)) with check (is_captain(id));
  end if;
end $$;

-- Content tables share one policy shape: members read, captains write.
do $$
declare t text;
begin
  foreach t in array array['players', 'maps', 'tactics', 'materials', 'templates'] loop
    if not exists (select 1 from pg_policies where policyname = t || '_sel_member') then
      execute format('create policy %I on %I for select using (is_member(team_id))', t || '_sel_member', t);
    end if;
    if not exists (select 1 from pg_policies where policyname = t || '_ins_captain') then
      execute format('create policy %I on %I for insert with check (is_captain(team_id))', t || '_ins_captain', t);
    end if;
    if not exists (select 1 from pg_policies where policyname = t || '_upd_captain') then
      execute format('create policy %I on %I for update using (is_captain(team_id)) with check (is_captain(team_id))', t || '_upd_captain', t);
    end if;
    if not exists (select 1 from pg_policies where policyname = t || '_del_captain') then
      execute format('create policy %I on %I for delete using (is_captain(team_id))', t || '_del_captain', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where policyname = 'activity_sel_member') then
    create policy activity_sel_member on activity for select using (is_member(team_id));
  end if;
  if not exists (select 1 from pg_policies where policyname = 'activity_ins_captain') then
    create policy activity_ins_captain on activity for insert with check (is_captain(team_id));
  end if;
end $$;

-- ---------------- RPC: server-side PIN verification ----------------
create or replace function public.team_login(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare t teams%rowtype; r text;
begin
  select * into t from teams where lower(name) = lower(trim(p_name));
  if t.id is null then raise exception 'NO_TEAM'; end if;
  if t.pin_hash is distinct from crypt(p_pin, t.pin_hash) then raise exception 'BAD_PIN'; end if;
  insert into memberships(user_id, team_id, role) values (auth.uid(), t.id, 'player')
    on conflict (user_id, team_id) do nothing;
  select role into r from memberships where user_id = auth.uid() and team_id = t.id;
  return jsonb_build_object('id', t.id, 'name', t.name, 'captain_name', t.captain_name,
                            'settings', t.settings, 'role', coalesce(r, 'player'));
end $$;

create or replace function public.team_create(p_name text, p_pin text, p_captain text, p_captain_pin text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare t teams%rowtype;
begin
  if trim(p_name) = '' or length(p_pin) < 4 or length(p_captain_pin) < 4 then raise exception 'BAD_INPUT'; end if;
  if exists (select 1 from teams where lower(name) = lower(trim(p_name))) then raise exception 'NAME_TAKEN'; end if;
  insert into teams(name, pin_hash, captain_pin_hash, captain_name)
    values (trim(p_name), crypt(p_pin, gen_salt('bf')), crypt(p_captain_pin, gen_salt('bf')), trim(p_captain))
    returning * into t;
  insert into memberships(user_id, team_id, role) values (auth.uid(), t.id, 'captain')
    on conflict (user_id, team_id) do update set role = 'captain';
  return jsonb_build_object('id', t.id, 'name', t.name, 'captain_name', t.captain_name,
                            'settings', t.settings, 'role', 'captain');
end $$;

create or replace function public.claim_captain(p_team_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as
$$
declare t teams%rowtype;
begin
  select * into t from teams where id = p_team_id;
  if t.id is null then raise exception 'NO_TEAM'; end if;
  if not is_member(p_team_id) then raise exception 'NOT_MEMBER'; end if;
  if t.captain_pin_hash is distinct from crypt(p_pin, t.captain_pin_hash) then raise exception 'BAD_PIN'; end if;
  update memberships set role = 'captain' where user_id = auth.uid() and team_id = p_team_id;
  return jsonb_build_object('role', 'captain');
end $$;

create or replace function public.team_set_pin(p_team_id uuid, p_kind text, p_new text)
returns void language plpgsql security definer set search_path = public as
$$
begin
  if not is_captain(p_team_id) then raise exception 'DENIED'; end if;
  if length(p_new) < 4 then raise exception 'BAD_INPUT'; end if;
  perform set_config('app.allow_pin_change', '1', true);
  if p_kind = 'team' then
    update teams set pin_hash = crypt(p_new, gen_salt('bf')) where id = p_team_id;
  elsif p_kind = 'captain' then
    update teams set captain_pin_hash = crypt(p_new, gen_salt('bf')) where id = p_team_id;
  else
    raise exception 'BAD_INPUT';
  end if;
end $$;

-- ---------------- Realtime ----------------
do $$
declare t text;
begin
  foreach t in array array['players', 'maps', 'tactics', 'materials', 'templates', 'activity'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then
      -- already added
    end;
  end loop;
end $$;

-- ---------------- Storage (bucket for team files) ----------------
insert into storage.buckets (id, name, public) values ('team-files', 'team-files', false)
  on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'tf_sel_member') then
    create policy tf_sel_member on storage.objects for select using (
      bucket_id = 'team-files' and is_member((storage.foldername(name))[1]::uuid)
    );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'tf_ins_captain') then
    create policy tf_ins_captain on storage.objects for insert with check (
      bucket_id = 'team-files' and is_captain((storage.foldername(name))[1]::uuid)
    );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'tf_del_captain') then
    create policy tf_del_captain on storage.objects for delete using (
      bucket_id = 'team-files' and is_captain((storage.foldername(name))[1]::uuid)
    );
  end if;
end $$;
