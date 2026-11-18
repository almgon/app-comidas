-- App Comidas · Fase 2b: precios de Mercadona y Dia y comparador.
-- Ejecutar entero en Supabase > SQL Editor. Se puede ejecutar más de una vez sin problema.

-- Productos de los supermercados.
--   household_id NULL  = catálogo que actualiza el GitHub Action (Mercadona)
--   household_id = hogar = producto dado de alta a mano (sobre todo Dia, modo semimanual)
create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  tienda text not null check (tienda in ('mercadona', 'dia')),
  id_externo text not null,                          -- id de la tienda, o 'm-…' si es manual
  nombre text not null,
  categoria text,
  envase_cantidad numeric(10,2),                     -- tamaño del envase en la unidad de abajo
  envase_unidad text not null default 'g' check (envase_unidad in ('g', 'ml', 'ud')),
  envase_texto text,                                 -- "Bandeja 4 ud. (500 g aprox.)"
  precio numeric(8,2),                               -- precio de un envase
  precio_referencia numeric(8,2),                    -- €/kg, €/l o €/ud
  formato_referencia text,
  url text,
  foto_url text,
  origen text not null default 'manual' check (origen in ('auto', 'manual')),
  actualizado_en timestamptz not null default now(),
  unique (tienda, id_externo)
);
create index if not exists store_products_busqueda on public.store_products (tienda, public.nombre_normalizado(nombre));

create table if not exists public.ingredient_products (
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  tienda text not null check (tienda in ('mercadona', 'dia')),
  store_product_id uuid not null references public.store_products(id) on delete cascade,
  primary key (household_id, ingredient_id, tienda)
);

create table if not exists public.price_history (
  store_product_id uuid not null references public.store_products(id) on delete cascade,
  fecha date not null default current_date,
  precio numeric(8,2) not null,
  primary key (store_product_id, fecha)
);

-- Guardar el historial cada vez que cambia un precio
create or replace function public.guardar_historial_precio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.precio is not null and (tg_op = 'INSERT' or new.precio is distinct from old.precio) then
    insert into public.price_history (store_product_id, fecha, precio) values (new.id, current_date, new.precio)
    on conflict (store_product_id, fecha) do update set precio = excluded.precio;
  end if;
  return new;
end $$;
drop trigger if exists store_products_historial on public.store_products;
create trigger store_products_historial after insert or update of precio on public.store_products
  for each row execute function public.guardar_historial_precio();

-- Umbral para dividir la compra entre las dos tiendas
alter table public.households add column if not exists umbral_ahorro numeric(5,2) not null default 3;

-- Seguridad
alter table public.store_products enable row level security;
alter table public.ingredient_products enable row level security;
alter table public.price_history enable row level security;

drop policy if exists "ver productos" on public.store_products;
create policy "ver productos" on public.store_products for select
  using (household_id is null or household_id = public.mi_hogar());
drop policy if exists "crear producto propio" on public.store_products;
create policy "crear producto propio" on public.store_products for insert
  with check (household_id = public.mi_hogar());
drop policy if exists "editar producto propio" on public.store_products;
create policy "editar producto propio" on public.store_products for update
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
drop policy if exists "borrar producto propio" on public.store_products;
create policy "borrar producto propio" on public.store_products for delete
  using (household_id = public.mi_hogar());

drop policy if exists "enlaces del hogar" on public.ingredient_products;
create policy "enlaces del hogar" on public.ingredient_products for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());

drop policy if exists "ver historial" on public.price_history;
create policy "ver historial" on public.price_history for select
  using (exists (select 1 from public.store_products p where p.id = store_product_id and (p.household_id is null or p.household_id = public.mi_hogar())));

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on public.store_products, public.price_history to service_role;

-- Tiempo real de los enlaces (el catálogo de Mercadona es grande y cambia una vez por semana: no hace falta)
do $$
declare t text;
begin
  foreach t in array array['ingredient_products'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Búsqueda de productos sin importar acentos ni mayúsculas (todas las palabras deben aparecer)
create or replace function public.buscar_productos(p_tienda text, p_q text)
returns setof public.store_products language sql stable security invoker set search_path = public as $$
  select p.* from public.store_products p
  where p.tienda = p_tienda
    and (p.household_id is null or p.household_id = public.mi_hogar())
    and not exists (
      select 1 from unnest(string_to_array(public.nombre_normalizado(p_q), ' ')) w
      where length(w) > 1 and public.nombre_normalizado(p.nombre) not like '%' || w || '%'
    )
  order by p.household_id nulls last, length(p.nombre)
  limit 40
$$;
grant execute on function public.buscar_productos(text, text) to authenticated;
