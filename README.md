# App Comidas

PWA para planificar las comidas de la semana entre dos personas. **Fase 1: recetario compartido. Fase 2: menú semanal y lista de la compra.**

- Menú semanal generado solo con vuestras recetas (sin IA): frecuencias AESAN, proteína diaria por persona, sin repetir plato el mismo día, cenas de entre semana ≤ 30 min, lunes y martes del domingo, congelador primero y bases reutilizadas. Se fija, se regenera y se edita a mano.
- Desayunos fijos (L-V y fin de semana) con cantidades por persona.
- Domingo de cocina (bases + platos, nevera o congelador) e inventario del congelador.
- Lista de la compra compartida en tiempo real, agrupada, en envases y por pasillo.
- Precios de Mercadona: se actualizan cada semana con un GitHub Action (`scripts/precios/`) y la lista muestra el coste de cada producto y el total.

- Recetas propias con foto, raciones, tiempos, ingredientes, pasos, etiquetas, notas, favorita y valoración.
- Clasificación para el planificador: comida/cena, grupo proteico principal, cena rápida (≤ 30 min), congelable y días en nevera.
- Preparaciones base (boloñesa, sofrito…) que se usan como ingrediente de otras recetas.
- Proteína y kcal por ración calculadas con un catálogo de ingredientes (BEDCA aproximado), y por persona según su factor de ración.
- Importación sin IA: webs con schema.org/Recipe, texto de publicaciones de TikTok (oEmbed) e Instagram, o pegando el texto. Siempre con pantalla de revisión.
- Hogar compartido con código de invitación y sincronización en tiempo real (Supabase Realtime). Funciona sin conexión con la última copia.

Requisitos completos: ver el documento de requisitos del proyecto.
**Puesta en marcha paso a paso: [GUIA-PUESTA-EN-MARCHA.md](GUIA-PUESTA-EN-MARCHA.md).**

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellenar con los datos de Supabase
npm run dev                  # app (la importación por link necesita `vercel dev`)
npm test                     # pruebas del analizador de recetas
npm run build
```

## Estructura

| Ruta | Qué es |
|---|---|
| `src/` | App React (Vite + vite-plugin-pwa) |
| `src/lib/datos.tsx` | Estado, carga, caché local y tiempo real |
| `src/lib/nutricion.ts` | Cálculo de proteína/kcal por ración |
| `src/lib/generador.ts` | Generador del menú, reglas e indicadores AESAN |
| `src/lib/batch.ts` | Sesión de cocina del domingo |
| `src/lib/compra.ts` | Lista de la compra (agrupar, convertir unidades y envases) |
| `src/lib/menu.tsx` | Datos del menú, congelador y compra con tiempo real |
| `shared/parser.ts` | Analizador de recetas (JSON-LD, texto libre, líneas de ingredientes) |
| `api/importar.ts` | Función de Vercel que lee el enlace en el servidor |
| `supabase/migrations/` | Esquema, seguridad por hogar (RLS) y catálogo |
