-- App Comidas · Desayunos como un hueco más del menú (recetas de tipo desayuno) y alimentos sueltos por hueco.
-- Ejecutar en Supabase > SQL Editor. Se puede ejecutar más de una vez.

alter table public.plan_entries drop constraint if exists plan_entries_momento_check;
alter table public.plan_entries add constraint plan_entries_momento_check check (momento in ('desayuno', 'comida', 'cena'));

-- Alimentos sueltos del hueco: [{ "ingredient_id": "...", "cantidad": 200 }] (cantidad total, en la unidad base del ingrediente)
alter table public.plan_entries add column if not exists extras jsonb not null default '[]'::jsonb;
