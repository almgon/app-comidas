# Puesta en marcha (unos 15 minutos, todo gratis)

Necesitas un ordenador para estos pasos (una sola vez). Después la app se usa desde el iPhone.

## 1. Supabase (base de datos, cuentas y tiempo real)

1. Entra en [supabase.com](https://supabase.com) y pulsa **Start your project**. Regístrate con tu cuenta de GitHub.
2. Pulsa **New project**:
   - Organization: la tuya (plan **Free**).
   - Name: `app-comidas`.
   - Database password: pulsa *Generate* y guárdala en un sitio seguro (no hace falta para la app).
   - Region: **West EU (Ireland)** o la más cercana a Madrid.
   - Pulsa **Create new project** y espera 1-2 minutos.
3. Crear las tablas: menú de la izquierda **SQL Editor** → **New query**.
   - Abre en GitHub el archivo [`supabase/migrations/001_recetario.sql`](supabase/migrations/001_recetario.sql), pulsa el botón de copiar, pégalo y pulsa **Run**. Debe decir *Success*.
   - Repite con [`supabase/migrations/002_catalogo_ingredientes.sql`](supabase/migrations/002_catalogo_ingredientes.sql) (el catálogo de ingredientes).
   - Y con [`supabase/migrations/003_mas_alimentos.sql`](supabase/migrations/003_mas_alimentos.sql) (más alimentos y protección contra duplicados).
   - Y con [`supabase/migrations/004_menu_y_compra.sql`](supabase/migrations/004_menu_y_compra.sql) (menú semanal, desayunos, domingo de cocina, congelador y lista de la compra).
4. Login: menú **Authentication** → **Sign In / Providers** → **Email**.
   - Recomendado: desactiva **Confirm email** y guarda. Así podéis entrar nada más crear la cuenta (si lo dejas activado, el enlace del email se abre en Safari y luego hay que volver a la app).
5. Copia las claves: menú **Project Settings** → **API Keys** (o **Data API**):
   - **Project URL** (algo como `https://abcdxyz.supabase.co`).
   - **anon public** key (o la *publishable key*, que empieza por `sb_publishable_`).
   Las necesitas en el paso 2. *No* uses la `service_role`/`secret`.

## 2. Vercel (publicar la app)

1. Entra en [vercel.com](https://vercel.com/signup) → **Continue with GitHub** con la cuenta `almgon` (la dueña del repositorio). Plan **Hobby** (gratis).
2. **Add New… → Project** → busca `app-comidas` → **Import**. Si no aparece, pulsa *Adjust GitHub App Permissions* y dale acceso al repositorio.
3. Antes de desplegar, abre **Environment Variables** y añade:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | la Project URL de Supabase |
   | `VITE_SUPABASE_ANON_KEY` | la anon / publishable key |
4. Pulsa **Deploy**. En 1 minuto tendrás una dirección tipo `https://app-comidas-xxxx.vercel.app`.
5. Vuelve a Supabase → **Authentication** → **URL Configuration** y pon esa dirección en **Site URL** (y también en *Redirect URLs*).

Cada vez que se suba código a GitHub, Vercel publica la nueva versión solo.

## 3. En los iPhone

1. Abre la dirección de Vercel en **Safari**.
2. **Compartir** → **Añadir a pantalla de inicio**.
3. Abre la app desde el icono, crea tu cuenta y pulsa **Crear hogar**.
4. En **Ajustes** verás el código del hogar. Tu pareja instala la app igual, crea su cuenta y pulsa **Unirme con un código**.
5. En **Ajustes** pon vuestro peso y el factor de ración (Alberto 1, pareja 1,25).

Opcional: en Ajustes están los pasos para crear el Atajo de iOS «Guardar receta» y mandar recetas desde Instagram, TikTok o Safari con el botón Compartir.

## Límites del plan gratuito

- Supabase Free: 500 MB de base de datos y 1 GB de fotos (miles de recetas). **Pausa el proyecto si pasa 7 días sin uso**; se reactiva desde el panel de Supabase con un clic.
- Vercel Hobby: de sobra para uso personal.


## Actualizar a la fase 2 (menú y lista de la compra)

Si ya tenías la app funcionando, solo hay un paso:

1. En Supabase: **SQL Editor** → **New query**.
2. Abre [`supabase/migrations/004_menu_y_compra.sql`](supabase/migrations/004_menu_y_compra.sql) en GitHub, copia todo, pégalo y pulsa **Run**. Debe decir *Success* (se puede ejecutar más de una vez sin problema).
3. En el iPhone, cierra la app del todo y vuelve a abrirla (a veces hace falta dos veces) para que cargue la versión nueva.

Primeros pasos en la app:
- **Ajustes**: comprobad que cada uno tiene su peso y factor (Alberto 1, pareja 1,25).
- **Recetas**: para que el generador funcione bien, cada receta de comida/cena necesita *tipo* (comida, cena o ambas), *proteína principal*, *tiempos* (para saber si vale como cena de entre semana) y, si se puede, *congelable* y *días en nevera*. El menú avisa de lo que falta.
- **Menú → ✨ Proponer semana**. Fija (📌) lo que quieras mantener y vuelve a proponer; 🎲 cambia un solo plato; ✏️ para elegirlo a mano o marcar «comemos fuera».
- **🍲 Domingo**: lo que hay que cocinar, cuánto y qué va a la nevera o al congelador. Al terminar, lo que sobra se guarda en **❄️ Congelador**.
- **🛒 Compra**: «Crear lista desde el menú». Lo que marca uno lo ve el otro al momento.

## Precios de Mercadona (fase 2b)

1. **Supabase → SQL Editor → New query**: pega [`supabase/migrations/005_precios.sql`](supabase/migrations/005_precios.sql) y pulsa **Run** (se puede repetir sin problema). Después, igual con [`supabase/migrations/006_permisos_action.sql`](supabase/migrations/006_permisos_action.sql) (permisos para el Action).
2. **Copia la clave de servicio de Supabase**: **Project Settings → API Keys** → la clave **`service_role`** (o la *secret key*, `sb_secret_…`). ⚠️ Esta clave es secreta: solo se pega en GitHub, nunca en Vercel ni en la app.
3. **GitHub** (con la cuenta `almgon`): abre el repositorio `app-comidas` → **Settings → Secrets and variables → Actions → New repository secret** y crea dos:
   | Name | Secret |
   |---|---|
   | `SUPABASE_URL` | la Project URL de Supabase (`https://….supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clave `service_role` del paso 2 |
4. **Primera actualización**: pestaña **Actions** → **Precios semanales** → **Run workflow** → **Run workflow**. Tarda unos 3-5 minutos. Si sale en verde, ya tienes los precios de Mercadona (almacén del código postal 28032). Después se ejecuta sola cada viernes de madrugada.
5. **En la app** (pestaña Compra): toca 💶 en cada producto para enlazarlo con su producto de Mercadona (buscador). Si no aparece, añádelo a mano (nombre, envase y precio). Arriba de la lista verás el total en Mercadona.

## Desayunos en el menú (migración 007)

1. **Supabase → SQL Editor → New query**: pega [`supabase/migrations/007_desayunos_en_menu.sql`](supabase/migrations/007_desayunos_en_menu.sql) y pulsa **Run**. Sin este paso no se puede guardar el menú con la versión nueva.
2. Los desayunos ya no son fijos: son recetas con el tipo **«Desayuno»** que el menú elige igual que las comidas y cenas (se pueden fijar 📌, cambiar 🎲 o elegir a mano ✏️).
3. En cualquier desayuno, comida o cena (✏️) puedes añadir **alimentos sueltos** (fruta, yogur, pan…) con su cantidad para los dos: se suman a la lista de la compra.

## Varias recetas por comida, kcal y macros, productos de Mercadona (migración 008)

1. **Supabase → SQL Editor → New query**: pega [`supabase/migrations/008_varias_recetas_y_macros.sql`](supabase/migrations/008_varias_recetas_y_macros.sql) y pulsa **Run**. No borra nada: los platos que ya hay en el menú quedan como la receta principal de cada hueco. Sin este paso no se puede guardar el menú con la versión nueva.
2. En el iPhone, cierra la app del todo y vuelve a abrirla (a veces dos veces).
3. **Ajustes**: comprobad el peso de cada uno. El objetivo de kcal se estima con el peso (32 kcal/kg, para quien entrena 3-4 días a la semana); si sabéis el vuestro, ponedlo a mano. Los hidratos (45-60 %) y la grasa (20-35 %) salen de las kcal.
4. **Recetas → 🛒 Elegir productos** (o Ajustes → Productos de Mercadona): elige una vez el producto de Mercadona de cada ingrediente que usan vuestras recetas; vale para todas las recetas que lo llevan. En las recetas nuevas, cada ingrediente tiene el botón «🛒 Buscar en Mercadona».
5. **Menú**: en cada desayuno, comida o cena, «+ Añadir otra receta». Cada día muestra las kcal de cada uno y qué falta o sobra. «✨ Proponer semana» elige los platos para acercarse a vuestros objetivos y, si a un día le faltan kcal, añade otra receta a algún hueco.
6. **Preparaciones base** (boloñesa, sofrito…): en el editor, «+ Añadir preparación base», en raciones, en gramos o la receta entera. Si la base reduce al cocinarse, pon su «peso de la receta terminada» para que los gramos cuenten bien.

## Método del plato (migración 009)

> Desde la migración 010 el menú ya no obliga a que cada comida cumpla el método del plato: la tarta queda como información y el equilibrio se mira en el día entero (ver abajo).

1. **Supabase → SQL Editor → New query**: pega [`supabase/migrations/009_metodo_plato.sql`](supabase/migrations/009_metodo_plato.sql) y pulsa **Run**. No borra nada. Sin este paso todo funciona igual, pero no se puede cambiar a mano el grupo de un ingrediente.
2. En el iPhone, cierra la app del todo y vuelve a abrirla (a veces dos veces).
3. Cada ingrediente cuenta en un grupo: 🥦 verdura y fruta, 🍗 proteína (carne, pescado, huevo, legumbres, yogur, queso), 🍞 hidratos (pan, arroz, pasta, patata, avena) o 🫒 grasa saludable (aceite, frutos secos, aguacate). Especias, caldos, leche, bebidas y salsas no cuentan. La app lo deduce de la sección y del nombre; si alguno no cuadra, cámbialo en **Ajustes → Ingredientes** o en la receta («De dónde sale cada grupo»).
4. Se mide por **peso en el plato ya cocinado** (no por kcal): el arroz, la pasta y las legumbres secas cuentan unas 2,5 veces su peso en crudo. Objetivo: 50 % verdura y fruta, 25 % proteína, 25 % hidratos y poca grasa. Se da por bueno con verdura 40-65 %, proteína 15-35 %, hidratos 15-35 % y grasa ≤ 12 %.
5. **Desayuno, más flexible**: verdura y fruta 15-65 % (con una pieza de fruta basta), proteína 10-40 %, hidratos 20-60 %, grasa ≤ 20 %.
6. Cada receta muestra su tarta y si cumple (✓), casi (≈) o no (✗). En **Recetas → Filtros → Método del plato** se ven las que cumplen.
7. En el **Menú**, la tarta pequeña de cada desayuno, comida o cena cuenta todas sus recetas y alimentos sueltos juntos; tócala para ver el reparto. «✨ Proponer semana» busca para cada hueco una receta que cumpla sola o la completa con 1 o 2 recetas más (por ejemplo, crema de calabacín + tortilla francesa + pan).

## Platos completos, principales y guarniciones · cuándo cocinar (migración 010)

1. **Supabase → SQL Editor → New query**: pega [`supabase/migrations/010_papeles_y_cocina.sql`](supabase/migrations/010_papeles_y_cocina.sql) y pulsa **Run**. No borra nada. **Hace falta** para proponer la semana, cambiar el papel de una receta y usar «Ya lo tengo».
2. En el iPhone, cierra la app del todo y vuelve a abrirla (a veces dos veces). Ahora se abre en **☀️ Hoy**; el menú de la semana está en **🗓️ Menú**.
3. **Papel de cada receta** (en la receta o al editarla): 🍲 *plato completo* (lentejas, macarrones con boloñesa), 🍗 *principal* (filete de pollo, merluza a la plancha) o 🥗 *guarnición* (arroz, patatas, quinoa, ensalada, verduras asadas). Todas las recetas que ya tenías quedan como plato completo: cambia las que sean principales o guarniciones. Una guarnición puede ser solo un ingrediente con sus gramos por ración, sin pasos.
4. **Proponer semana** pone un plato completo solo o un principal con 1-2 guarniciones (mejor una de verdura y otra de hidratos). 🎲 en una guarnición la cambia por otra del mismo tipo.
5. **Equilibrio por raciones (AESAN)**, por persona y día: verdura ≥3 raciones (150 g), hidratos 3-6 (70 g de arroz o pasta en crudo, 50 g de pan, 200 g de patata), lácteos ≤3. Por semana: legumbre ≥4, pescado 3-4 (1 azul), carne 3-4 (roja ≤2), huevo ≤4, frutos secos ≥3. La fruta va en la lista de la compra (3 piezas al día). Los objetivos están en `src/lib/grupos.ts`.
6. **Cuándo se cocina** cada plato: 🔥 ese día, 🍲 el domingo, 🥡 sobras de la cena de ayer (de miércoles a domingo a mediodía: la cena se hace el doble) o ❄️ del congelador. Además, la semana propone **2 platos congelables para hacer de más y congelar** para la semana siguiente (se puede cambiar en cada plato: «Cocinar de más para congelar»). Lo del domingo se congela al cerrar la sesión; lo de otros días, con «✓ Hecho: al congelador» en **Hoy**.
7. **Hoy** enseña hoy y mañana: qué toca, qué cocinar y cuánto, y arriba lo que hay que **sacar del congelador esta noche**.
8. **Compra**: al recalcular la lista ya no se pierde lo marcado (tampoco si el otro está comprando); sin cobertura se puede añadir y quitar (se guarda al volver la conexión). «🏠 Repasar lo que ya hay en casa» quita de la lista lo que ya tenéis y no vuelve al recalcularla.


## Borrar semana, vaciar la compra, sin reglas de tiempo ni kcal, pesos aproximados

No hace falta SQL: basta con cerrar la app del todo en el iPhone y volver a abrirla (a veces dos veces).

1. **Menú → 🗑 Borrar la semana**: borra todos los platos de esa semana (también los fijados 📌). La lista de la compra no se toca.
2. **Compra → 🔄 Actualizar con el menú**: recalcula la lista con el menú de la semana y conserva lo marcado y lo añadido a mano. **🗑 Vaciar lista** la borra entera; después se puede volver a crear desde el menú.
3. **Sin reglas de tiempo**: las cenas de lunes a viernes ya no tienen que ser de ≤ 30 min. Sigue la regla de que lunes y martes a mediodía se come lo cocinado el domingo.
4. **Sin objetivos de kcal**: el menú ya no ajusta ni avisa por kcal, hidratos o grasa. Se equilibra por raciones (verdura, hidratos, lácteos) y frecuencias AESAN. Las kcal de cada receta se siguen viendo como información.
5. **Pesos aproximados**: la verdura y la fruta que no tienen peso por unidad usan el de una pieza mediana («2 patatas» = 400 g, «1 brócoli» = 400 g; la lista está en `src/lib/pesos.ts`). En Ingredientes se ven con «≈». Si pones el peso a mano en el ingrediente, manda el tuyo.
6. **Proteína sin peso**: la carne, el pescado, el tofu… sin gramos en la receta («pechuga de pollo», «4 filetes de merluza») cuentan **150 g por ración** para la compra, la nutrición y las raciones. Si pones los gramos, se usan los tuyos.
