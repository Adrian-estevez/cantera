-- =====================================================================
--  CANTERA · futbolconadrix
--  Ejecuta este archivo entero en Supabase → SQL Editor → New query → Run
--  Puedes volver a ejecutarlo sin perder datos (sirve también para actualizar).
--
--  Roles:
--    usuario      → solo puede mirar
--    colaborador  → puede añadir y editar jugadores, partidos y notas (no borrar ni gestionar usuarios)
--    admin        → todo, incluida la gestión de usuarios y los ajustes
--  El PRIMER usuario que se registre se convierte automáticamente en admin.
-- =====================================================================

-- ---------- Perfiles de usuario ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'usuario' check (role in ('usuario','colaborador','admin')),
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Rol del usuario actual (null si no ha entrado o está bloqueado)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and not blocked;
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false);
$$;
create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','colaborador'), false);
$$;

-- Crear el perfil al registrarse (el primero será admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles where role = 'admin') then 'usuario' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para usuarios que ya existieran antes de este script
insert into public.profiles (id, email, display_name)
select u.id, u.email, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;

-- Migración desde la versión anterior (tabla admins)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admins') then
    update public.profiles set role = 'admin' where id in (select user_id from public.admins);
    drop table public.admins;
  end if;
end $$;

-- Siempre debe quedar al menos un admin activo
create or replace function public.keep_one_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and not old.blocked and (new.role <> 'admin' or new.blocked) then
    if not exists (select 1 from public.profiles where role = 'admin' and not blocked and id <> old.id) then
      raise exception 'Debe quedar al menos un administrador';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_keep_admin on public.profiles;
create trigger profiles_keep_admin before update on public.profiles
  for each row execute function public.keep_one_admin();

-- Funciones para el panel de administración
create or replace function public.admin_list_users()
returns table (id uuid, email text, display_name text, role text, blocked boolean,
               created_at timestamptz, last_sign_in_at timestamptz, confirmed boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para administradores'; end if;
  return query
    select p.id, p.email, p.display_name, p.role, p.blocked, p.created_at,
           u.last_sign_in_at, (u.email_confirmed_at is not null)
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

create or replace function public.admin_delete_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para administradores'; end if;
  if target = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta'; end if;
  delete from auth.users where id = target;
end $$;

create or replace function public.update_my_name(new_name text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set display_name = left(trim(new_name), 60) where id = auth.uid();
$$;

revoke execute on function public.admin_list_users() from anon;
revoke execute on function public.admin_delete_user(uuid) from anon;
revoke execute on function public.update_my_name(text) from anon;

-- ---------- Ajustes del sitio (una sola fila) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  club_name text not null default 'Mi Club',
  site_title text not null default 'La Cantera',
  season text not null default '2026/27',
  primary_color text not null default '#0a3a8c',
  accent_color text not null default '#ffd400',
  categories text[] not null default array['Juvenil A','Juvenil B','Cadete A','Cadete B','Infantil A','Alevín A'],
  instagram text default 'futbolconadrix',
  updated_at timestamptz not null default now()
);
alter table public.settings add column if not exists private_mode boolean not null default false;
alter table public.settings add column if not exists allow_signup boolean not null default true;
alter table public.settings add column if not exists logo_url text;
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ¿Puede ver el contenido? (web pública, o usuario registrado no bloqueado)
create or replace function public.can_view()
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select private_mode from public.settings where id = 1), false)
         or public.my_role() is not null;
$$;

-- ---------- Jugadores ----------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  dorsal int check (dorsal between 0 and 99),
  position text,
  detail_position text,
  foot text,
  birth_date date,
  birth_place text,
  nationality text,
  height_cm int,
  previous_clubs text[] not null default '{}',
  category text,
  status text not null default 'Activo',
  photo_url text,
  bio text,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Partidos ----------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  category text,
  competition text,
  rival text not null,
  venue text not null default 'Local' check (venue in ('Local','Visitante','Neutral')),
  goals_for int,
  goals_against int,
  notes text,
  mvp_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  starter boolean not null default true,
  minutes int default 0,
  goals int default 0,
  assists int default 0,
  yellow int default 0,
  red int default 0,
  rating numeric(3,1) check (rating between 0 and 10),
  note text,
  primary key (match_id, player_id)
);

create table if not exists public.scout_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  note_date date not null default current_date,
  tag text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_matches_date on public.matches(match_date desc);
create index if not exists idx_mp_player on public.match_players(player_id);
create index if not exists idx_notes_player on public.scout_notes(player_id);

-- ---------- Seguridad (RLS) ----------
alter table public.profiles      enable row level security;
alter table public.settings      enable row level security;
alter table public.players       enable row level security;
alter table public.matches       enable row level security;
alter table public.match_players enable row level security;
alter table public.scout_notes   enable row level security;

do $$
declare t text; p record;
begin
  -- limpiar políticas anteriores
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('profiles','settings','players','matches','match_players','scout_notes') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  foreach t in array array['players','matches','match_players','scout_notes'] loop
    execute format('create policy "ver" on public.%I for select using (public.can_view())', t);
    execute format('create policy "crear" on public.%I for insert with check (public.can_edit())', t);
    execute format('create policy "editar" on public.%I for update using (public.can_edit()) with check (public.can_edit())', t);
  end loop;
  -- borrar: jugadores y partidos solo admin; alineaciones y notas también colaboradores
  create policy "borrar" on public.players for delete using (public.is_admin());
  create policy "borrar" on public.matches for delete using (public.is_admin());
  create policy "borrar" on public.match_players for delete using (public.can_edit());
  create policy "borrar" on public.scout_notes for delete using (public.can_edit());

  create policy "ver" on public.settings for select using (true);
  create policy "editar" on public.settings for update using (public.is_admin()) with check (public.is_admin());
  create policy "crear" on public.settings for insert with check (public.is_admin());

  create policy "ver" on public.profiles for select using (id = auth.uid() or public.is_admin());
  create policy "editar" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
end $$;

-- ---------- Permisos de acceso para la web ----------
-- Permisos para que la web pueda leer y (según el rol) escribir.
-- Las reglas de seguridad (RLS) siguen decidiendo quién puede hacer qué.
grant usage on schema public to anon, authenticated;

grant select on public.settings, public.players, public.matches, public.match_players, public.scout_notes to anon, authenticated;
grant insert, update, delete on public.players, public.matches, public.match_players, public.scout_notes to authenticated;
grant insert, update on public.settings to authenticated;
grant select, update on public.profiles to authenticated;

grant execute on function public.my_role(), public.is_admin(), public.can_edit(), public.can_view() to anon, authenticated;
grant execute on function public.admin_list_users(), public.admin_delete_user(uuid), public.update_my_name(text) to authenticated;

-- ---------- Fotos (Storage) ----------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "fotos lectura" on storage.objects;
drop policy if exists "fotos admin insert" on storage.objects;
drop policy if exists "fotos admin update" on storage.objects;
drop policy if exists "fotos admin delete" on storage.objects;
create policy "fotos lectura" on storage.objects for select using (bucket_id = 'photos');
create policy "fotos admin insert" on storage.objects for insert with check (bucket_id = 'photos' and public.can_edit());
create policy "fotos admin update" on storage.objects for update using (bucket_id = 'photos' and public.can_edit());
create policy "fotos admin delete" on storage.objects for delete using (bucket_id = 'photos' and public.is_admin());

-- =====================================================================
--  Si necesitas hacer admin a alguien a mano:
--  update public.profiles set role = 'admin' where email = 'TU_EMAIL@ejemplo.com';
-- =====================================================================
