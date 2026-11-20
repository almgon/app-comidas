-- App Comidas · Varias recetas por desayuno, comida o cena, objetivo de kcal por persona
-- y peso final de las preparaciones base (para usarlas en gramos dentro de otras recetas).
-- Ejecutar entero en Supabase > SQL Editor. Se puede ejecutar más de una vez. No borra datos.

-- 1) Varias recetas en el mismo hueco: cada una lleva su número de orden (0 = la principal).
--    Las entradas que ya existen se quedan como la principal (orden 0).
alter table public.plan_entries add column if not exists orden int not null default 0;
alter table public.plan_entries drop constraint if exists plan_entries_plan_id_fecha_momento_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_entries_hueco_orden_key') then
    alter table public.plan_entries add constraint plan_entries_hueco_orden_key unique (plan_id, fecha, momento, orden);
  end if;
end $$;

-- 2) Objetivo de calorías por persona (opcional: si está vacío la app lo estima con el peso)
alter table public.profiles add column if not exists kcal_objetivo int;
alter table public.profiles drop constraint if exists profiles_kcal_objetivo_check;
alter table public.profiles add constraint profiles_kcal_objetivo_check check (kcal_objetivo is null or kcal_objetivo between 800 and 6000);

-- 3) Peso de la receta terminada (opcional). Sirve para usar una preparación base en gramos
--    ("200 g de boloñesa") y repartir sus kcal y macros de forma proporcional.
alter table public.recipes add column if not exists peso_total_g numeric(8,1);
