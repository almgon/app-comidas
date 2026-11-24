-- App Comidas · Veces por semana que queréis comer cada tipo de alimento (legumbre, pescado, carne, huevo…).
-- Se editan en Ajustes y las usa «Proponer semana». Si la columna está vacía, la app usa sus valores por defecto.
-- El «grupo proteico principal» de las recetas deja de usarse (se deduce de los ingredientes): la columna se queda, sin borrar nada.
-- Ejecutar entero en Supabase > SQL Editor. Se puede ejecutar más de una vez. No borra datos.

alter table public.households add column if not exists frecuencias jsonb;

-- Tiempo real (para que el cambio en Ajustes se vea en el móvil de los dos)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households') then
    alter publication supabase_realtime add table public.households;
  end if;
end $$;
