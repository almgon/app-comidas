-- App Comidas · Fase 1: hogar compartido + recetario
-- Ejecutar entero en Supabase > SQL Editor.

create extension if not exists pgcrypto;

-- =========================================================
-- Hogares y perfiles
-- =========================================================
create table public.households (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Casa',
  codigo_invitacion text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  creado_en timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  nombre text not null default '',
  peso_kg numeric(5,1),
  dias_ejercicio int,
  proteina_min_g int,
  proteina_max_g int,
  factor_racion numeric(4,2) not null default 1.0,
  creado_en timestamptz not null default now()
);

-- Perfil automático al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hogar del usuario actual (para las políticas RLS)
create or replace function public.mi_hogar()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.profiles where id = auth.uid()
$$;

-- Crear un hogar y entrar en él
create or replace function public.crear_hogar(p_nombre text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  insert into public.households (nombre) values (coalesce(nullif(trim(p_nombre), ''), 'Casa'))
  returning * into h;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end $$;

-- Unirse a un hogar con su código de invitación
create or replace function public.unirse_hogar(p_codigo text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into h from public.households where codigo_invitacion = upper(trim(p_codigo));
  if h.id is null then raise exception 'Código no válido'; end if;
  update public.profiles set household_id = h.id where id = auth.uid();
  return h;
end $$;

-- =========================================================
-- Catálogo de ingredientes
-- household_id NULL = catálogo común (solo lectura); si no, ingrediente propio del hogar
-- =========================================================
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  nombre text not null,
  categoria text not null default 'Otros',          -- pasillo/sección
  unidad_base text not null default 'g' check (unidad_base in ('g','ml','ud')),
  peso_unidad_g numeric(7,1),                        -- gramos de 1 unidad (huevo, cebolla...)
  kcal_100 numeric(6,1),
  proteina_100 numeric(5,1),
  hidratos_100 numeric(5,1),
  grasa_100 numeric(5,1),
  es_despensa boolean not null default false,
  creado_en timestamptz not null default now()
);
create index on public.ingredients (household_id);

-- =========================================================
-- Recetas
-- =========================================================
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  titulo text not null,
  foto_url text,
  raciones numeric(5,1) not null default 2 check (raciones > 0),
  t_prep_min int,
  t_coccion_min int,
  tipo_comida text not null default 'ambas'
    check (tipo_comida in ('comida','cena','ambas','desayuno')),
  grupo_proteico text
    check (grupo_proteico in ('legumbre','pescado_blanco','pescado_azul','carne_blanca','carne_roja','huevo','vegetal')),
  es_base boolean not null default false,
  congelable boolean not null default false,
  dias_nevera int,
  valoracion int check (valoracion between 1 and 5),
  favorita boolean not null default false,
  proteina_racion_manual numeric(5,1),               -- si se rellena, manda sobre el cálculo
  fuente_url text,
  fuente_tipo text not null default 'manual'
    check (fuente_tipo in ('web','instagram','tiktok','texto','manual')),
  notas text,
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on public.recipes (household_id);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  orden int not null default 0,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  sub_recipe_id uuid references public.recipes(id) on delete set null,  -- preparación base
  cantidad numeric(8,2),
  unidad text,
  texto_original text not null default '',
  check (not (ingredient_id is not null and sub_recipe_id is not null))
);
create index on public.recipe_ingredients (recipe_id);
create index on public.recipe_ingredients (sub_recipe_id);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  orden int not null default 0,
  texto text not null
);
create index on public.recipe_steps (recipe_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  nombre text not null,
  unique (household_id, nombre)
);

create table public.recipe_tags (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);

-- actualizado_en automático
create or replace function public.touch_updated()
returns trigger language plpgsql as $$
begin new.actualizado_en = now(); return new; end $$;
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated();

-- =========================================================
-- Row Level Security: cada hogar solo ve lo suyo
-- =========================================================
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.tags enable row level security;
alter table public.recipe_tags enable row level security;

create policy "ver mi hogar" on public.households for select using (id = public.mi_hogar());
create policy "editar mi hogar" on public.households for update using (id = public.mi_hogar());

create policy "ver perfiles del hogar" on public.profiles for select
  using (id = auth.uid() or household_id = public.mi_hogar());
create policy "editar mi perfil" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and household_id is not distinct from public.mi_hogar());

create policy "ver catálogo" on public.ingredients for select
  using (household_id is null or household_id = public.mi_hogar());
create policy "crear ingrediente propio" on public.ingredients for insert
  with check (household_id = public.mi_hogar());
create policy "editar ingrediente propio" on public.ingredients for update
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
create policy "borrar ingrediente propio" on public.ingredients for delete
  using (household_id = public.mi_hogar());

create policy "recetas del hogar" on public.recipes for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());

create policy "ingredientes de recetas del hogar" on public.recipe_ingredients for all
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.mi_hogar()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.mi_hogar()));

create policy "pasos de recetas del hogar" on public.recipe_steps for all
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.mi_hogar()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.mi_hogar()));

create policy "etiquetas del hogar" on public.tags for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());

create policy "etiquetas de recetas del hogar" on public.recipe_tags for all
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.mi_hogar()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = public.mi_hogar()));

-- =========================================================
-- Tiempo real
-- =========================================================
alter publication supabase_realtime add table
  public.recipes, public.recipe_ingredients, public.recipe_steps,
  public.tags, public.recipe_tags, public.ingredients;

-- =========================================================
-- Fotos (Storage): bucket público de lectura, escritura en la carpeta del hogar
-- =========================================================
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
  on conflict (id) do nothing;

create policy "subir fotos del hogar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mi_hogar()::text);
create policy "cambiar fotos del hogar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mi_hogar()::text);
create policy "borrar fotos del hogar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mi_hogar()::text);
