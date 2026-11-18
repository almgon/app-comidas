-- App Comidas · Permisos para el GitHub Action de precios (clave service_role).
-- En los proyectos nuevos de Supabase las tablas creadas por SQL no dan permisos a service_role automáticamente.
-- Ejecutar en Supabase > SQL Editor. Se puede ejecutar más de una vez.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.store_products, public.price_history to service_role;
