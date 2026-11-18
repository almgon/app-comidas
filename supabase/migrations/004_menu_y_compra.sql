-- App Comidas · Fase 2: menú semanal, desayunos, batch cooking, congelador y lista de la compra.
-- Ejecutar entero en Supabase > SQL Editor. Se puede ejecutar más de una vez sin problema.

-- =========================================================
-- Envases (para convertir la cantidad en paquetes del súper)
-- =========================================================
alter table public.ingredients add column if not exists envase_cantidad numeric(8,1);  -- en la unidad base (g, ml o ud)
alter table public.ingredients add column if not exists envase_nombre text;            -- bandeja, bote, paquete...

-- Envase que usa el hogar para un ingrediente (manda sobre el del catálogo común)
create table if not exists public.envases_hogar (
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  cantidad numeric(8,1) not null check (cantidad > 0),
  nombre text not null default 'envase',
  primary key (household_id, ingredient_id)
);

-- =========================================================
-- Desayunos fijos (plantillas): L-V y fin de semana
-- cantidades = { "<id del perfil>": cantidad, ... } en la unidad indicada
-- =========================================================
create table if not exists public.desayunos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  dias text not null check (dias in ('lv', 'fd')),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  unidad text not null default 'g',
  cantidades jsonb not null default '{}'::jsonb,
  orden int not null default 0,
  unique (household_id, dias, ingredient_id)
);

-- =========================================================
-- Menú semanal
-- =========================================================
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  semana_inicio date not null,                       -- lunes
  batch jsonb not null default '{}'::jsonb,          -- estado de la sesión del domingo: { "<recipe_id>": { "extra": n, "hecho": bool } }
  batch_cerrado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (household_id, semana_inicio)
);

-- Congelador (va antes de plan_entries porque una comida puede salir de aquí)
create table if not exists public.freezer_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  recipe_id uuid references public.recipes(id) on delete set null,
  nombre text not null default '',                   -- por si la receta se borra
  raciones numeric(6,2) not null default 0,          -- raciones que quedan (ya descontadas las reservadas en el menú)
  congelado_en date not null default current_date,
  nota text,
  creado_en timestamptz not null default now()
);
create index if not exists freezer_items_hogar on public.freezer_items (household_id);

create table if not exists public.plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  fecha date not null,
  momento text not null check (momento in ('comida', 'cena')),
  recipe_id uuid references public.recipes(id) on delete set null,
  raciones numeric(6,2) not null default 2,          -- total para el hogar (p. ej. 1 + 1,25)
  origen text not null default 'fresco' check (origen in ('fresco', 'batch', 'congelador', 'libre')),
  freezer_item_id uuid references public.freezer_items(id) on delete set null,
  fijado boolean not null default false,
  nota text,
  actualizado_en timestamptz not null default now(),
  unique (plan_id, fecha, momento)
);
create index if not exists plan_entries_plan on public.plan_entries (plan_id);

-- Reservar / devolver raciones del congelador al usarlas en el menú
create or replace function public.reservar_congelado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.freezer_item_id is not null then
    update public.freezer_items set raciones = raciones + old.raciones where id = old.freezer_item_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.freezer_item_id is not null then
    update public.freezer_items set raciones = greatest(0, raciones - new.raciones) where id = new.freezer_item_id;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists plan_entries_congelador on public.plan_entries;
create trigger plan_entries_congelador after insert or update of freezer_item_id, raciones or delete on public.plan_entries
  for each row execute function public.reservar_congelado();

drop trigger if exists plan_entries_touch on public.plan_entries;
create trigger plan_entries_touch before update on public.plan_entries
  for each row execute function public.touch_updated();
drop trigger if exists meal_plans_touch on public.meal_plans;
create trigger meal_plans_touch before update on public.meal_plans
  for each row execute function public.touch_updated();

-- =========================================================
-- Lista de la compra
-- =========================================================
create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  plan_id uuid not null unique references public.meal_plans(id) on delete cascade,
  generada_en timestamptz not null default now(),
  umbral_ahorro numeric(5,2) not null default 3
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade default public.mi_hogar(),
  ingredient_id uuid references public.ingredients(id) on delete set null,
  texto text not null,
  categoria text not null default 'Otros',
  cantidad numeric(10,2),
  unidad text,
  detalle text,                                      -- envases y sobrante, p. ej. "2 bandejas de 400 g · sobran 200 g"
  origen text,                                       -- de qué platos sale
  es_despensa boolean not null default false,
  manual boolean not null default false,             -- añadido a mano (no se borra al regenerar)
  store_id text,                                     -- mercadona | dia (fase de precios)
  envases numeric(6,1),
  precio_estimado numeric(8,2),
  comprado boolean not null default false,
  comprado_por uuid references auth.users(id) on delete set null,
  comprado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index if not exists shopping_items_lista on public.shopping_items (list_id);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.envases_hogar enable row level security;
alter table public.desayunos enable row level security;
alter table public.meal_plans enable row level security;
alter table public.freezer_items enable row level security;
alter table public.plan_entries enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

drop policy if exists "envases del hogar" on public.envases_hogar;
create policy "envases del hogar" on public.envases_hogar for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
drop policy if exists "desayunos del hogar" on public.desayunos;
create policy "desayunos del hogar" on public.desayunos for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
drop policy if exists "menús del hogar" on public.meal_plans;
create policy "menús del hogar" on public.meal_plans for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
drop policy if exists "congelador del hogar" on public.freezer_items;
create policy "congelador del hogar" on public.freezer_items for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
drop policy if exists "platos del menú del hogar" on public.plan_entries;
create policy "platos del menú del hogar" on public.plan_entries for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
drop policy if exists "listas del hogar" on public.shopping_lists;
create policy "listas del hogar" on public.shopping_lists for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());
drop policy if exists "artículos del hogar" on public.shopping_items;
create policy "artículos del hogar" on public.shopping_items for all
  using (household_id = public.mi_hogar()) with check (household_id = public.mi_hogar());

grant select, insert, update, delete on all tables in schema public to authenticated;

-- =========================================================
-- Tiempo real
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['desayunos', 'meal_plans', 'plan_entries', 'freezer_items', 'shopping_lists', 'shopping_items', 'envases_hogar'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =========================================================
-- Envases habituales del catálogo común (orientativos; se cambian desde la lista de la compra)
-- =========================================================
update public.ingredients i set envase_cantidad = v.cantidad, envase_nombre = v.envase
from (values
  ('Pechuga de pollo', 500, 'bandeja'),
  ('Muslo de pollo deshuesado', 500, 'bandeja'),
  ('Contramuslo de pollo', 600, 'bandeja'),
  ('Pavo (pechuga)', 400, 'bandeja'),
  ('Carne picada de ternera', 400, 'bandeja'),
  ('Carne picada mixta (cerdo y ternera)', 400, 'bandeja'),
  ('Ternera (filetes)', 400, 'bandeja'),
  ('Lomo de cerdo', 500, 'bandeja'),
  ('Solomillo de cerdo', 500, 'pieza'),
  ('Jamón serrano', 100, 'sobre'),
  ('Jamón cocido', 150, 'sobre'),
  ('Pechuga de pavo en lonchas', 150, 'sobre'),
  ('Bacon', 150, 'paquete'),
  ('Chorizo', 200, 'pieza'),
  ('Salmón', 400, 'bandeja'),
  ('Merluza', 400, 'bandeja'),
  ('Bacalao', 400, 'bandeja'),
  ('Gambas', 400, 'bolsa'),
  ('Langostinos', 400, 'bolsa'),
  ('Atún en lata al natural', 156, 'pack de 3 latas'),
  ('Atún en lata en aceite', 156, 'pack de 3 latas'),
  ('Huevo', 12, 'docena'),
  ('Clara de huevo', 500, 'brik'),
  ('Lentejas secas', 1000, 'paquete'),
  ('Garbanzos secos', 1000, 'paquete'),
  ('Alubias blancas secas', 1000, 'paquete'),
  ('Lentejas cocidas (bote)', 400, 'bote'),
  ('Garbanzos cocidos (bote)', 400, 'bote'),
  ('Alubias cocidas (bote)', 400, 'bote'),
  ('Tofu', 400, 'paquete'),
  ('Guisantes congelados', 1000, 'bolsa'),
  ('Arroz', 1000, 'paquete'),
  ('Arroz integral', 1000, 'paquete'),
  ('Pasta', 500, 'paquete'),
  ('Pasta integral', 500, 'paquete'),
  ('Fideos', 500, 'paquete'),
  ('Cuscús', 500, 'paquete'),
  ('Quinoa', 500, 'paquete'),
  ('Copos de avena', 500, 'paquete'),
  ('Pan', 400, 'barra'),
  ('Pan integral', 460, 'paquete'),
  ('Pan rallado', 750, 'paquete'),
  ('Patata', 3000, 'malla'),
  ('Cebolla', 7, 'malla de 1 kg'),
  ('Ajo', 10, 'cabeza'),
  ('Tomate triturado', 400, 'bote'),
  ('Tomate frito', 400, 'brik'),
  ('Pimiento rojo', 3, 'bandeja'),
  ('Zanahoria', 12, 'bolsa de 1 kg'),
  ('Brócoli', 500, 'pieza'),
  ('Espinacas', 300, 'bolsa'),
  ('Judías verdes', 500, 'bandeja'),
  ('Champiñones', 250, 'bandeja'),
  ('Leche semidesnatada', 6000, 'pack de 6 l'),
  ('Leche desnatada', 6000, 'pack de 6 l'),
  ('Leche entera', 6000, 'pack de 6 l'),
  ('Bebida de avena', 1000, 'brik'),
  ('Yogur natural', 4, 'pack de 4'),
  ('Yogur griego', 500, 'tarrina'),
  ('Yogur proteico / skyr', 500, 'tarrina'),
  ('Queso fresco batido 0%', 500, 'tarrina'),
  ('Queso mozzarella', 250, 'bolsa'),
  ('Queso rallado', 200, 'bolsa'),
  ('Nata para cocinar', 200, 'brik'),
  ('Mantequilla', 250, 'pastilla'),
  ('Proteína en polvo (whey)', 1000, 'bote'),
  ('Cacao puro en polvo', 250, 'bote'),
  ('Semillas de chía', 250, 'bolsa'),
  ('Nueces', 200, 'bolsa'),
  ('Almendras', 200, 'bolsa'),
  ('Caldo de pollo', 1000, 'brik'),
  ('Caldo de verduras', 1000, 'brik'),
  ('Tortillas de trigo', 8, 'paquete'),
  ('Maíz dulce en lata', 140, 'lata'),
  ('Café', 250, 'paquete'),
  ('Plátano', 6, 'manojo'),
  ('Manzana', 6, 'bolsa'),
  ('Naranja', 10, 'malla'),
  ('Limón', 6, 'malla')
) as v(nombre, cantidad, envase)
where i.household_id is null and public.nombre_normalizado(i.nombre) = public.nombre_normalizado(v.nombre)
  and i.envase_cantidad is null;

-- Los desayunos por defecto se crean una sola vez por hogar
alter table public.households add column if not exists desayunos_iniciados boolean not null default false;
