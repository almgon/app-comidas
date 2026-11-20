-- App Comidas · Método del plato (verdura y fruta / proteína / hidratos / grasa saludable).
-- La app deduce el grupo de cada ingrediente por su sección y su nombre. Esta tabla guarda solo
-- los cambios que hace el hogar a mano (también para los ingredientes del catálogo común).
-- Ejecutar entero en Supabase > SQL Editor. Se puede ejecutar más de una vez. No borra datos.

create table if not exists public.ingredient_grupos (
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  grupo text not null check (grupo in ('verdura', 'proteina', 'hidratos', 'grasa', 'otro')),
  primary key (household_id, ingredient_id)
);

alter table public.ingredient_grupos enable row level security;
drop policy if exists "grupos del hogar" on public.ingredient_grupos;
create policy "grupos del hogar" on public.ingredient_grupos for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());

grant select, insert, update, delete on public.ingredient_grupos to authenticated;

-- Tiempo real (para que el cambio se vea en el móvil de los dos)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ingredient_grupos') then
    alter publication supabase_realtime add table public.ingredient_grupos;
  end if;
end $$;
