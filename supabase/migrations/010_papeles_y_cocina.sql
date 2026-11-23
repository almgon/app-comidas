-- App Comidas · Papel de cada receta (plato completo, principal o guarnición), cuándo se cocina
-- (sobras de la cena de ayer, raciones de más para congelar) y «ya lo tengo» en la lista de la compra.
-- Ejecutar entero en Supabase > SQL Editor. Se puede ejecutar más de una vez. No borra datos.

-- 1) Papel de la receta en el menú. Las que ya existen se quedan como «plato completo».
alter table public.recipes add column if not exists papel text not null default 'completo';
alter table public.recipes drop constraint if exists recipes_papel_check;
alter table public.recipes add constraint recipes_papel_check check (papel in ('completo', 'principal', 'guarnicion'));

-- 2) Nuevo origen «sobras»: se come lo que se cocinó de más en la cena del día anterior.
alter table public.plan_entries drop constraint if exists plan_entries_origen_check;
alter table public.plan_entries add constraint plan_entries_origen_check check (origen in ('fresco', 'batch', 'sobras', 'congelador', 'libre'));

-- 3) Raciones de más que se cocinan para congelar (y si ya están en el congelador).
alter table public.plan_entries add column if not exists cocinar_extra numeric(5,2) not null default 0;
alter table public.plan_entries add column if not exists extra_congelado boolean not null default false;
alter table public.plan_entries drop constraint if exists plan_entries_cocinar_extra_check;
alter table public.plan_entries add constraint plan_entries_cocinar_extra_check check (cocinar_extra >= 0 and cocinar_extra <= 50);

-- 4) Lista de la compra: «esto ya lo tengo» (se mantiene al recalcular la lista).
alter table public.shopping_items add column if not exists tengo boolean not null default false;
