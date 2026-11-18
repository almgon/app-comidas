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
