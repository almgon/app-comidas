-- Fase 1.1: más alimentos en el catálogo común, sin duplicados, y enlace con Open Food Facts.
-- Ejecutar entero en Supabase > SQL Editor. Se puede ejecutar más de una vez sin problema.

-- Código de barras del producto de Open Food Facts (si viene de ahí)
alter table public.ingredients add column if not exists codigo_off text;

-- Nombre en minúsculas y sin acentos, para detectar duplicados
create or replace function public.nombre_normalizado(t text)
returns text language sql immutable as $$
  select trim(regexp_replace(translate(lower(t), 'áéíóúàèìòùäëïöüâêîôûç', 'aeiouaeiouaeiouaeiouc'), '[^a-z0-9ñ]+', ' ', 'g'))
$$;

-- Si ya hubiera duplicados dentro de un mismo hogar, deja solo el más antiguo y re-vincula las recetas
with dups as (
  select id, first_value(id) over (partition by coalesce(household_id::text, 'comun'), public.nombre_normalizado(nombre) order by creado_en, id) as queda
  from public.ingredients
)
update public.recipe_ingredients ri set ingredient_id = d.queda
from dups d where ri.ingredient_id = d.id and d.id <> d.queda;
with dups as (
  select id, first_value(id) over (partition by coalesce(household_id::text, 'comun'), public.nombre_normalizado(nombre) order by creado_en, id) as queda
  from public.ingredients
)
delete from public.ingredients i using dups d where i.id = d.id and d.id <> d.queda;

-- Ni el mismo nombre ni el mismo producto dos veces en el mismo catálogo
create unique index if not exists ingredients_nombre_unico
  on public.ingredients (coalesce(household_id::text, 'comun'), public.nombre_normalizado(nombre));
create unique index if not exists ingredients_off_unico
  on public.ingredients (coalesce(household_id::text, 'comun'), codigo_off) where codigo_off is not null;

-- Un ingrediente propio no puede llamarse igual que uno del catálogo común
create or replace function public.evitar_duplicado_comun()
returns trigger language plpgsql as $$
begin
  if new.household_id is not null and exists (
    select 1 from public.ingredients c
    where c.household_id is null and public.nombre_normalizado(c.nombre) = public.nombre_normalizado(new.nombre)
  ) then
    raise exception 'Ya existe «%» en el catálogo', new.nombre using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists ingredients_sin_duplicados on public.ingredients;
create trigger ingredients_sin_duplicados before insert or update of nombre on public.ingredients
  for each row execute function public.evitar_duplicado_comun();

-- Más alimentos genéricos (valores aproximados por 100 g/ml)
insert into public.ingredients (household_id, nombre, categoria, unidad_base, peso_unidad_g, kcal_100, proteina_100, hidratos_100, grasa_100, es_despensa)
select null, v.* from (values
  ('Contramuslo de pollo', 'Carne', 'g', null, 180, 18, 0, 12, false),
  ('Alitas de pollo', 'Carne', 'g', null, 210, 18, 0, 15, false),
  ('Pechuga de pavo en lonchas', 'Charcutería', 'g', null, 100, 19, 2, 1.5, false),
  ('Hamburguesa de ternera', 'Carne', 'g', null, 220, 17, 2, 16, false),
  ('Hamburguesa de pollo', 'Carne', 'g', null, 160, 16, 4, 9, false),
  ('Cordero (pierna)', 'Carne', 'g', null, 200, 18, 0, 14, false),
  ('Chuletas de cordero', 'Carne', 'g', null, 250, 17, 0, 20, false),
  ('Secreto ibérico', 'Carne', 'g', null, 300, 16, 0, 26, false),
  ('Panceta de cerdo', 'Carne', 'g', null, 390, 14, 0, 37, false),
  ('Chuleta de cerdo', 'Carne', 'g', null, 210, 19, 0, 15, false),
  ('Cinta de lomo adobada', 'Carne', 'g', null, 170, 21, 1, 9, false),
  ('Entrecot de ternera', 'Carne', 'g', null, 180, 21, 0, 11, false),
  ('Carrillera de cerdo', 'Carne', 'g', null, 170, 19, 0, 10, false),
  ('Morcillo de ternera', 'Carne', 'g', null, 140, 21, 0, 6, false),
  ('Salchichas frescas de pollo', 'Carne', 'g', null, 170, 14, 2, 12, false),
  ('Salchichas tipo Frankfurt', 'Charcutería', 'g', null, 270, 12, 2, 24, false),
  ('Chistorra', 'Charcutería', 'g', null, 400, 16, 1, 37, false),
  ('Morcilla', 'Charcutería', 'g', null, 330, 13, 11, 27, false),
  ('Lacón', 'Charcutería', 'g', null, 180, 18, 0, 12, false),
  ('Fuet', 'Charcutería', 'g', null, 450, 26, 2, 38, false),
  ('Lomo embuchado', 'Charcutería', 'g', null, 240, 39, 1, 9, false),
  ('Pavo picado', 'Carne', 'g', null, 150, 20, 0, 8, false),
  ('Hígado de ternera', 'Carne', 'g', null, 135, 20, 4, 4, false),
  ('Codorniz', 'Carne', 'ud', 100, 170, 25, 0, 7, false),
  ('Pato (magret)', 'Carne', 'g', null, 200, 19, 0, 14, false),
  ('Atún en lata en aceite de oliva escurrido', 'Conservas', 'g', null, 190, 26, 0, 9.5, false),
  ('Bonito del norte en aceite', 'Conservas', 'g', null, 220, 26, 0, 13, false),
  ('Sardinas en lata en aceite', 'Conservas', 'g', null, 210, 24, 0, 12, false),
  ('Caballa en lata', 'Conservas', 'g', null, 200, 21, 0, 13, false),
  ('Mejillones en escabeche', 'Conservas', 'g', null, 170, 15, 6, 9, false),
  ('Berberechos al natural', 'Conservas', 'g', null, 75, 15, 2, 1, false),
  ('Anchoas en aceite', 'Conservas', 'g', null, 200, 28, 0, 10, false),
  ('Salmón ahumado', 'Pescado', 'g', null, 180, 23, 0, 10, false),
  ('Boquerones', 'Pescado', 'g', null, 125, 19, 0, 5, false),
  ('Trucha', 'Pescado', 'g', null, 120, 20, 0, 4, false),
  ('Bonito fresco', 'Pescado', 'g', null, 140, 21, 0, 6, false),
  ('Emperador / pez espada', 'Pescado', 'g', null, 110, 20, 0, 3.5, false),
  ('Rape', 'Pescado', 'g', null, 75, 16, 0, 1, false),
  ('Lenguado', 'Pescado', 'g', null, 80, 17, 0, 1.2, false),
  ('Gallo', 'Pescado', 'g', null, 75, 16, 0, 1, false),
  ('Abadejo', 'Pescado', 'g', null, 80, 18, 0, 0.7, false),
  ('Panga', 'Pescado', 'g', null, 80, 15, 0, 2.5, false),
  ('Salmonete', 'Pescado', 'g', null, 100, 18, 0, 3.5, false),
  ('Sepia', 'Pescado', 'g', null, 75, 16, 0.7, 1, false),
  ('Pulpo', 'Pescado', 'g', null, 70, 15, 1, 1, false),
  ('Almejas', 'Pescado', 'g', null, 70, 12, 3, 1, false),
  ('Surimi (palitos de cangrejo)', 'Refrigerados', 'g', null, 100, 8, 15, 1, false),
  ('Gulas', 'Refrigerados', 'g', null, 120, 9, 10, 5, false),
  ('Pescado blanco congelado (filetes)', 'Congelados', 'g', null, 80, 17, 0, 1, false),
  ('Varitas de merluza empanadas', 'Congelados', 'g', null, 200, 12, 20, 8, false),
  ('Langostinos cocidos', 'Pescado', 'g', null, 95, 21, 0, 1, false),
  ('Huevos de codorniz', 'Huevos', 'ud', 10, 160, 13, 0.4, 11, false),
  ('Tortilla de patatas (refrigerada)', 'Refrigerados', 'g', null, 180, 6.5, 14, 11, false),
  ('Garbanzos cocidos', 'Legumbres', 'g', null, 130, 7, 17, 2.5, false),
  ('Lentejas rojas secas', 'Legumbres', 'g', null, 340, 25, 50, 1.5, false),
  ('Alubias rojas secas', 'Legumbres', 'g', null, 300, 22, 45, 1.5, false),
  ('Alubias pintas secas', 'Legumbres', 'g', null, 310, 21, 45, 1.2, false),
  ('Judiones secos', 'Legumbres', 'g', null, 300, 21, 45, 1.5, false),
  ('Habas congeladas', 'Congelados', 'g', null, 70, 6, 8, 0.5, false),
  ('Edamame', 'Congelados', 'g', null, 120, 11, 9, 5, false),
  ('Hummus', 'Refrigerados', 'g', null, 300, 7, 14, 24, false),
  ('Soja (bebida)', 'Lácteos', 'ml', null, 40, 3.3, 2, 1.8, false),
  ('Tempeh', 'Legumbres', 'g', null, 190, 19, 9, 11, false),
  ('Heura / proteína vegetal', 'Refrigerados', 'g', null, 160, 20, 3, 7, false),
  ('Seitán', 'Refrigerados', 'g', null, 120, 24, 4, 2, false),
  ('Arroz basmati', 'Pasta y arroz', 'g', null, 350, 8, 78, 0.6, false),
  ('Arroz bomba', 'Pasta y arroz', 'g', null, 350, 7, 78, 0.5, false),
  ('Arroz cocido (vasito)', 'Pasta y arroz', 'g', null, 140, 2.6, 30, 1, false),
  ('Espaguetis', 'Pasta y arroz', 'g', null, 355, 12.5, 72, 1.5, false),
  ('Macarrones', 'Pasta y arroz', 'g', null, 355, 12.5, 72, 1.5, false),
  ('Tallarines al huevo', 'Pasta y arroz', 'g', null, 370, 14, 70, 3.5, false),
  ('Pasta fresca rellena', 'Refrigerados', 'g', null, 270, 11, 40, 7, false),
  ('Gnocchi', 'Refrigerados', 'g', null, 150, 4, 33, 0.3, false),
  ('Lasaña (placas)', 'Pasta y arroz', 'g', null, 355, 12.5, 72, 1.5, false),
  ('Fideos de arroz', 'Pasta y arroz', 'g', null, 360, 6, 80, 0.6, false),
  ('Noodles (fideos orientales)', 'Pasta y arroz', 'g', null, 450, 9, 60, 20, false),
  ('Bulgur', 'Pasta y arroz', 'g', null, 340, 12, 69, 1.3, false),
  ('Mijo', 'Pasta y arroz', 'g', null, 370, 11, 73, 4, false),
  ('Trigo sarraceno', 'Pasta y arroz', 'g', null, 340, 13, 71, 3.4, false),
  ('Harina de maíz', 'Despensa', 'g', null, 360, 7, 79, 1.5, true),
  ('Maicena', 'Despensa', 'g', null, 380, 0.3, 91, 0.1, true),
  ('Harina integral', 'Despensa', 'g', null, 330, 13, 61, 2, true),
  ('Levadura química', 'Despensa', 'g', null, 50, 0, 25, 0, true),
  ('Pan de molde', 'Panadería', 'g', null, 260, 8, 48, 3.5, false),
  ('Pan de molde integral', 'Panadería', 'g', null, 250, 10, 42, 4, false),
  ('Pan de pita', 'Panadería', 'ud', 60, 275, 9, 55, 1.2, false),
  ('Pan de hamburguesa', 'Panadería', 'ud', 60, 270, 9, 48, 5, false),
  ('Biscotes', 'Panadería', 'g', null, 400, 11, 75, 6, false),
  ('Tortitas de arroz', 'Panadería', 'g', null, 390, 8, 81, 3, false),
  ('Tortillas de maíz', 'Panadería', 'ud', 30, 220, 6, 45, 3, false),
  ('Masa de pizza', 'Refrigerados', 'g', null, 270, 8, 48, 5, false),
  ('Masa quebrada', 'Refrigerados', 'g', null, 450, 6, 50, 25, false),
  ('Obleas para empanadillas', 'Refrigerados', 'ud', 15, 300, 8, 58, 4, false),
  ('Copos de maíz (cereales)', 'Desayuno', 'g', null, 380, 7, 84, 1, false),
  ('Muesli', 'Desayuno', 'g', null, 370, 10, 62, 7, false),
  ('Granola', 'Desayuno', 'g', null, 450, 10, 60, 18, false),
  ('Salvado de avena', 'Desayuno', 'g', null, 250, 17, 50, 7, false),
  ('Bebida de almendra', 'Lácteos', 'ml', null, 25, 0.5, 3, 1.1, false),
  ('Leche sin lactosa semidesnatada', 'Lácteos', 'ml', null, 46, 3.2, 4.7, 1.6, false),
  ('Kéfir', 'Lácteos', 'ml', null, 60, 3.4, 4, 3.3, false),
  ('Yogur natural desnatado', 'Lácteos', 'ud', 125, 40, 4.5, 5.5, 0.1, false),
  ('Yogur de proteínas (bebible)', 'Lácteos', 'ml', null, 60, 8, 5, 0.5, false),
  ('Queso cottage', 'Lácteos', 'g', null, 100, 11, 3.5, 4.5, false),
  ('Requesón', 'Lácteos', 'g', null, 110, 12, 3, 5, false),
  ('Queso de Burgos 0%', 'Lácteos', 'g', null, 70, 12, 4, 0.5, false),
  ('Queso feta', 'Lácteos', 'g', null, 260, 14, 1, 21, false),
  ('Queso de cabra (rulo)', 'Lácteos', 'g', null, 300, 18, 1, 25, false),
  ('Queso parmesano', 'Lácteos', 'g', null, 400, 33, 0, 29, false),
  ('Queso en lonchas', 'Lácteos', 'g', null, 330, 23, 1, 26, false),
  ('Queso crema', 'Lácteos', 'g', null, 250, 6, 4, 24, false),
  ('Queso de untar light', 'Lácteos', 'g', null, 140, 8, 5, 10, false),
  ('Mascarpone', 'Lácteos', 'g', null, 430, 5, 4, 44, false),
  ('Ricotta', 'Lácteos', 'g', null, 150, 11, 3, 10, false),
  ('Nata para montar', 'Lácteos', 'ml', null, 340, 2, 3, 35, false),
  ('Leche evaporada', 'Lácteos', 'ml', null, 135, 7, 10, 7.5, false),
  ('Leche de coco', 'Conservas', 'ml', null, 190, 1.8, 3, 19, false),
  ('Mantequilla de cacahuete', 'Frutos secos', 'g', null, 600, 25, 12, 50, false),
  ('Avellanas', 'Frutos secos', 'g', null, 650, 15, 7, 61, false),
  ('Anacardos', 'Frutos secos', 'g', null, 580, 18, 27, 44, false),
  ('Pistachos', 'Frutos secos', 'g', null, 570, 20, 18, 46, false),
  ('Piñones', 'Frutos secos', 'g', null, 670, 14, 13, 68, false),
  ('Pipas de girasol peladas', 'Frutos secos', 'g', null, 590, 21, 20, 51, false),
  ('Pipas de calabaza', 'Frutos secos', 'g', null, 560, 30, 11, 46, false),
  ('Semillas de lino', 'Desayuno', 'g', null, 530, 18, 2, 42, false),
  ('Semillas de sésamo', 'Despensa', 'g', null, 570, 18, 12, 50, true),
  ('Dátiles', 'Fruta', 'g', null, 280, 2.5, 65, 0.4, false),
  ('Pasas', 'Fruta', 'g', null, 300, 3, 69, 0.5, false),
  ('Orejones de albaricoque', 'Fruta', 'g', null, 240, 3.4, 55, 0.5, false),
  ('Chocolate negro 85%', 'Despensa', 'g', null, 600, 11, 15, 51, false),
  ('Chocolate con leche', 'Despensa', 'g', null, 540, 7, 57, 31, false),
  ('Mermelada', 'Despensa', 'g', null, 250, 0.4, 60, 0, false),
  ('Crema de cacao', 'Despensa', 'g', null, 540, 6, 57, 31, false),
  ('Pera', 'Fruta', 'ud', 180, 50, 0.4, 12, 0.1, false),
  ('Melocotón', 'Fruta', 'ud', 150, 40, 0.9, 9, 0.1, false),
  ('Nectarina', 'Fruta', 'ud', 150, 45, 1, 10, 0.3, false),
  ('Uvas', 'Fruta', 'g', null, 70, 0.6, 16, 0.2, false),
  ('Kiwi', 'Fruta', 'ud', 80, 55, 1, 11, 0.5, false),
  ('Mandarina', 'Fruta', 'ud', 80, 45, 0.8, 10, 0.3, false),
  ('Piña', 'Fruta', 'g', null, 50, 0.5, 12, 0.1, false),
  ('Mango', 'Fruta', 'g', null, 60, 0.8, 14, 0.4, false),
  ('Melón', 'Fruta', 'g', null, 35, 0.8, 8, 0.2, false),
  ('Sandía', 'Fruta', 'g', null, 30, 0.6, 7, 0.2, false),
  ('Arándanos', 'Fruta', 'g', null, 55, 0.7, 12, 0.3, false),
  ('Frambuesas', 'Fruta', 'g', null, 50, 1.2, 6, 0.7, false),
  ('Cerezas', 'Fruta', 'g', null, 60, 1, 14, 0.2, false),
  ('Ciruela', 'Fruta', 'ud', 60, 45, 0.7, 10, 0.3, false),
  ('Higos', 'Fruta', 'ud', 50, 70, 0.8, 16, 0.3, false),
  ('Granada', 'Fruta', 'ud', 250, 80, 1.7, 17, 1, false),
  ('Caqui', 'Fruta', 'ud', 200, 70, 0.6, 17, 0.2, false),
  ('Lima', 'Fruta', 'ud', 60, 30, 0.7, 8, 0.2, false),
  ('Frutos rojos congelados', 'Congelados', 'g', null, 45, 1, 8, 0.4, false),
  ('Coco rallado', 'Despensa', 'g', null, 650, 6.5, 7, 64, false),
  ('Cebolla morada', 'Verdura', 'ud', 150, 40, 1.2, 8, 0.1, false),
  ('Cebolleta', 'Verdura', 'ud', 80, 30, 1.8, 5, 0.2, false),
  ('Chalota', 'Verdura', 'ud', 30, 70, 2.5, 15, 0.1, false),
  ('Pimiento amarillo', 'Verdura', 'ud', 200, 27, 1, 6, 0.2, false),
  ('Pimiento italiano', 'Verdura', 'ud', 120, 20, 0.9, 3.5, 0.2, false),
  ('Pimientos del piquillo', 'Conservas', 'g', null, 25, 1, 4, 0.3, false),
  ('Tomate cherry', 'Verdura', 'g', null, 20, 0.9, 3, 0.2, false),
  ('Tomate pera', 'Verdura', 'ud', 100, 20, 0.9, 3.5, 0.2, false),
  ('Tomate concentrado', 'Conservas', 'g', null, 80, 4, 15, 0.5, false),
  ('Tomate seco', 'Conservas', 'g', null, 260, 14, 44, 3, false),
  ('Pepinillos', 'Conservas', 'g', null, 15, 0.5, 2, 0.2, false),
  ('Alcaparras', 'Conservas', 'g', null, 25, 2, 1.7, 0.9, false),
  ('Rúcula', 'Verdura', 'g', null, 25, 2.6, 2, 0.7, false),
  ('Canónigos', 'Verdura', 'g', null, 20, 2, 1.5, 0.4, false),
  ('Mezcla de ensalada', 'Verdura', 'g', null, 17, 1.3, 2, 0.2, false),
  ('Col / repollo', 'Verdura', 'g', null, 25, 1.3, 4, 0.1, false),
  ('Lombarda', 'Verdura', 'g', null, 30, 1.4, 5, 0.2, false),
  ('Col de Bruselas', 'Verdura', 'g', null, 40, 3.4, 5, 0.3, false),
  ('Kale', 'Verdura', 'g', null, 45, 4.3, 5, 0.9, false),
  ('Acelgas', 'Verdura', 'g', null, 20, 1.8, 2, 0.2, false),
  ('Apio', 'Verdura', 'g', null, 15, 0.7, 2, 0.2, false),
  ('Hinojo', 'Verdura', 'g', null, 30, 1.2, 4, 0.2, false),
  ('Remolacha cocida', 'Verdura', 'g', null, 45, 1.7, 8, 0.2, false),
  ('Nabo', 'Verdura', 'g', null, 25, 0.9, 5, 0.1, false),
  ('Rábanos', 'Verdura', 'g', null, 16, 0.7, 2, 0.1, false),
  ('Setas variadas', 'Verdura', 'g', null, 25, 2.5, 3, 0.3, false),
  ('Champiñones laminados en lata', 'Conservas', 'g', null, 25, 2, 2, 0.3, false),
  ('Pimiento rojo asado', 'Conservas', 'g', null, 30, 1, 5, 0.3, false),
  ('Maíz en mazorca', 'Verdura', 'ud', 200, 90, 3.3, 18, 1.4, false),
  ('Guisantes en lata', 'Conservas', 'g', null, 70, 5, 9, 0.4, false),
  ('Judías verdes congeladas', 'Congelados', 'g', null, 30, 2, 4.5, 0.2, false),
  ('Espinacas congeladas', 'Congelados', 'g', null, 25, 3, 1.5, 0.4, false),
  ('Brócoli congelado', 'Congelados', 'g', null, 30, 3, 4, 0.4, false),
  ('Menestra de verduras congelada', 'Congelados', 'g', null, 40, 2.5, 6, 0.3, false),
  ('Salteado de verduras congelado', 'Congelados', 'g', null, 45, 2, 7, 0.5, false),
  ('Patatas fritas congeladas', 'Congelados', 'g', null, 150, 2.5, 22, 5, false),
  ('Patatas fritas de bolsa', 'Despensa', 'g', null, 540, 6, 50, 35, false),
  ('Puré de patata (copos)', 'Despensa', 'g', null, 350, 8, 76, 0.5, false),
  ('Gazpacho', 'Refrigerados', 'ml', null, 45, 0.8, 4, 3, false),
  ('Caldo de pescado', 'Conservas', 'ml', null, 5, 0.6, 0.3, 0.2, false),
  ('Caldo de carne', 'Conservas', 'ml', null, 5, 0.6, 0.3, 0.2, false),
  ('Pastilla de caldo', 'Despensa', 'ud', 10, 250, 10, 20, 15, true),
  ('Ajo en polvo', 'Despensa', 'g', null, 330, 17, 73, 0.7, true),
  ('Cebolla en polvo', 'Despensa', 'g', null, 340, 10, 79, 1, true),
  ('Curry en polvo', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Cúrcuma', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Canela', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Nuez moscada', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Tomillo', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Romero', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Albahaca', 'Verdura', 'g', null, 25, 3, 3, 0.6, false),
  ('Cilantro', 'Verdura', 'g', null, 25, 2, 4, 0.5, false),
  ('Jengibre', 'Verdura', 'g', null, 80, 1.8, 18, 0.8, false),
  ('Guindilla', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Pimentón picante', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Comino molido', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Hierbas provenzales', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Azafrán', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Colorante alimentario', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Ketchup', 'Despensa', 'g', null, 110, 1.2, 25, 0.2, false),
  ('Salsa barbacoa', 'Despensa', 'g', null, 170, 1, 40, 0.5, false),
  ('Salsa de tomate casera', 'Conservas', 'g', null, 60, 1.5, 7, 3, false),
  ('Pesto', 'Refrigerados', 'g', null, 450, 5, 5, 45, false),
  ('Salsa carbonara', 'Refrigerados', 'g', null, 200, 5, 5, 18, false),
  ('Salsa teriyaki', 'Despensa', 'ml', null, 90, 6, 16, 0, false),
  ('Salsa Perrins', 'Despensa', 'ml', null, 80, 0, 19, 0, true),
  ('Tabasco', 'Despensa', 'ml', null, 0, 0, 0, 0, true),
  ('Vinagre de Módena', 'Despensa', 'ml', null, 90, 0.5, 17, 0, true),
  ('Aceite de coco', 'Despensa', 'g', null, 900, 0, 0, 100, true),
  ('Aceite de sésamo', 'Despensa', 'ml', null, 900, 0, 0, 100, true),
  ('Aceite en spray', 'Despensa', 'ml', null, 900, 0, 0, 100, true),
  ('Azúcar moreno', 'Despensa', 'g', null, 380, 0, 98, 0, true),
  ('Edulcorante', 'Despensa', 'g', null, 0, 0, 0, 0, true),
  ('Sirope de agave', 'Despensa', 'g', null, 300, 0, 76, 0, false),
  ('Gelatina neutra', 'Despensa', 'g', null, 340, 85, 0, 0, false),
  ('Cerveza', 'Bebidas', 'ml', null, 43, 0.5, 3.6, 0, false),
  ('Vino tinto', 'Bebidas', 'ml', null, 85, 0.1, 2.6, 0, false),
  ('Brandy / coñac', 'Bebidas', 'ml', null, 230, 0, 0, 0, false),
  ('Zumo de naranja', 'Bebidas', 'ml', null, 45, 0.7, 10, 0.2, false),
  ('Agua', 'Bebidas', 'ml', null, 0, 0, 0, 0, true),
  ('Hielo', 'Bebidas', 'g', null, 0, 0, 0, 0, true)
) as v(nombre, categoria, unidad_base, peso_unidad_g, kcal_100, proteina_100, hidratos_100, grasa_100, es_despensa)
where not exists (
  select 1 from public.ingredients i
  where i.household_id is null and public.nombre_normalizado(i.nombre) = public.nombre_normalizado(v.nombre)
);

-- Ingredientes propios que ahora ya están en el catálogo común: las recetas pasan a usar el común
with iguales as (
  select p.id as propio, c.id as comun
  from public.ingredients p
  join public.ingredients c on c.household_id is null
    and public.nombre_normalizado(c.nombre) = public.nombre_normalizado(p.nombre)
  where p.household_id is not null
)
update public.recipe_ingredients ri set ingredient_id = i.comun from iguales i where ri.ingredient_id = i.propio;
delete from public.ingredients p
where p.household_id is not null and exists (
  select 1 from public.ingredients c
  where c.household_id is null and public.nombre_normalizado(c.nombre) = public.nombre_normalizado(p.nombre)
);
