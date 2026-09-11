-- Заглушки Supabase-платформы, чтобы прогнать supabase-schema.sql на чистом Postgres (PGlite).
-- В реальном Supabase всё это уже существует.

create schema if not exists auth;
create schema if not exists storage;

-- Роли, как в Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- auth.uid() в Supabase берёт sub из claim'ов запроса.
create or replace function auth.uid()
returns uuid language sql stable as
$$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;

create or replace function auth.role()
returns text language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon') $$;

create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now()
);

-- storage.foldername('team/abc.png') -> {team}
create or replace function storage.foldername(name text)
returns text[] language sql immutable as
$$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;

-- В Supabase публикация для realtime создаётся платформой заранее.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
