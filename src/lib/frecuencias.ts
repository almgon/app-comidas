// Cuántas veces a la semana queréis comer cada tipo de alimento (legumbre, pescado, carne, huevo…).
// Lo elegís en Ajustes; el generador del menú intenta acercarse a esas veces. El tipo de cada receta
// se deduce de sus ingredientes (el que más pesa por ración), no se elige a mano.
import { normalizar } from '../../shared/parser.js'
import { repartoPorRacion } from './reparto'
import type { EntradaPlan, Hogar, Ingrediente, Receta } from './tipos'

export const TIPOS_ALIMENTO = ['legumbre', 'pescado_blanco', 'pescado_azul', 'carne_blanca', 'carne_roja', 'huevo', 'vegetal'] as const
export type TipoAlimento = (typeof TIPOS_ALIMENTO)[number]

export const INFO_TIPOS: Record<TipoAlimento, { etiqueta: string; emoji: string; ejemplos: string }> = {
  legumbre: { etiqueta: 'Legumbre', emoji: '🫘', ejemplos: 'lentejas, garbanzos, alubias, soja texturizada' },
  pescado_blanco: { etiqueta: 'Pescado blanco y marisco', emoji: '🐟', ejemplos: 'merluza, bacalao, dorada, gambas, calamar' },
  pescado_azul: { etiqueta: 'Pescado azul', emoji: '🐠', ejemplos: 'salmón, atún, sardinas, caballa' },
  carne_blanca: { etiqueta: 'Carne blanca', emoji: '🍗', ejemplos: 'pollo, pavo, conejo' },
  carne_roja: { etiqueta: 'Carne roja y embutido', emoji: '🥩', ejemplos: 'ternera, cerdo, cordero, chorizo, jamón' },
  huevo: { etiqueta: 'Huevo', emoji: '🥚', ejemplos: 'tortilla, huevos revueltos' },
  vegetal: { etiqueta: 'Proteína vegetal', emoji: '🌱', ejemplos: 'tofu, tempeh, seitán, heura' },
}

/** Veces por semana (comidas y cenas). null = da igual. */
export type Frecuencias = Record<TipoAlimento, number | null>

/** Valores de partida (los que usaba la app hasta ahora); se cambian en Ajustes */
export const FRECUENCIAS_POR_DEFECTO: Frecuencias = {
  legumbre: 4,
  pescado_blanco: 2,
  pescado_azul: 1,
  carne_blanca: 3,
  carne_roja: 1,
  huevo: 2,
  vegetal: null,
}

export function frecuenciasDe(hogar: Pick<Hogar, 'frecuencias'> | null | undefined): Frecuencias {
  const f = { ...FRECUENCIAS_POR_DEFECTO }
  const guardadas = hogar?.frecuencias
  if (guardadas && typeof guardadas === 'object')
    for (const t of TIPOS_ALIMENTO) if (t in guardadas) f[t] = guardadas[t] == null ? null : Math.max(0, Number(guardadas[t]) || 0)
  return f
}

// ---------------------------------------------------------
// Tipo de cada ingrediente y de cada receta
// ---------------------------------------------------------
const tiene = (n: string, ...palabras: string[]) => palabras.some((p) => ` ${n}`.includes(` ${p}`))

const AZUL = ['salmon', 'atun', 'bonito', 'caballa', 'sardina', 'anchoa', 'boqueron', 'jurel', 'emperador', 'pez espada', 'trucha', 'arenque', 'salmonete', 'chicharro', 'melva', 'palometa']
const BLANCO = ['merluza', 'bacalao', 'abadejo', 'gallo', 'lenguado', 'dorada', 'lubina', 'rape', 'pescadilla', 'panga', 'tilapia', 'rodaballo', 'mero', 'corvina', 'perca',
  'gamba', 'langostino', 'mejillon', 'almeja', 'berberecho', 'calamar', 'sepia', 'pulpo', 'chipiron', 'surimi', 'gulas', 'marisco', 'varitas', 'pescado', 'navaja', 'vieira', 'cigala']
const BLANCA = ['pollo', 'pavo', 'conejo', 'codorniz', 'gallina', 'pularda', 'contramuslo']
const ROJA = ['ternera', 'vaca', 'buey', 'cerdo', 'cordero', 'cabrito', 'lomo', 'solomillo', 'costilla', 'chuleta', 'carne picada', 'hamburguesa', 'albondiga', 'secreto', 'presa', 'carrillada',
  'chorizo', 'salchicha', 'salchichon', 'jamon', 'bacon', 'beicon', 'panceta', 'morcilla', 'fuet', 'lacon', 'sobrasada', 'butifarra', 'cecina', 'mortadela', 'longaniza', 'pato', 'caza', 'ciervo', 'jabali']
const LEGUMBRE = ['lenteja', 'garbanzo', 'alubia', 'judion', 'frijol', 'habas secas', 'soja texturizada', 'edamame', 'hummus', 'azuki', 'falafel']
const VEGETAL = ['tofu', 'tempeh', 'seitan', 'heura', 'proteina de guisante']
const SECCIONES_SIN_TIPO = new Set(['verdura', 'fruta', 'lacteos', 'panaderia', 'pasta y arroz', 'desayuno', 'frutos secos', 'bebidas'])

/** Tipo de alimento de un ingrediente (null si no es legumbre, pescado, carne, huevo ni proteína vegetal) */
export function tipoIngrediente(ing: Pick<Ingrediente, 'nombre' | 'categoria'>): TipoAlimento | null {
  const n = normalizar(ing.nombre)
  const c = normalizar(ing.categoria ?? '')
  // lo que no es el alimento en sí
  if (tiene(n, 'caldo', 'pastilla', 'sazonador', 'salsa', 'fumet', 'aroma')) return null
  // «tomate corazón de buey», «fideos al huevo», «yogur», «pan»…
  if (SECCIONES_SIN_TIPO.has(c)) return null
  if (tiene(n, 'tortilla de patata', 'huevo', 'clara', 'yema')) return 'huevo'
  if (tiene(n, ...VEGETAL)) return 'vegetal'
  if (tiene(n, ...LEGUMBRE)) return 'legumbre'
  // «pechuga de pavo» de charcutería y «jamón de pavo» son carne blanca; «jamón» a secas, roja
  if (tiene(n, ...BLANCA)) return 'carne_blanca'
  if (tiene(n, ...AZUL)) return 'pescado_azul'
  if (tiene(n, ...BLANCO)) return 'pescado_blanco'
  if (tiene(n, ...ROJA)) return 'carne_roja'
  switch (c) {
    case 'legumbres':
      return 'legumbre'
    case 'pescado':
      return 'pescado_blanco'
    case 'carne':
    case 'charcuteria':
      return 'carne_roja'
    case 'huevos':
      return 'huevo'
  }
  return null
}

/** Gramos (por ración, en el plato) a partir de los que un ingrediente da tipo a la receta: el taco de jamón de unas lentejas no la hace «carne» */
const MINIMO_G = 40

/**
 * Tipo de una receta: el tipo de alimento que más pesa por ración (contando las preparaciones base en proporción).
 * null si no lleva ninguno (o muy poco): una guarnición, una crema de verduras, unos macarrones con tomate…
 */
export function tipoReceta(receta: Receta, ingredientes: Map<string, Ingrediente>, recetas: Map<string, Receta>): TipoAlimento | null {
  const pesos = new Map<TipoAlimento, number>()
  for (const d of repartoPorRacion(receta, ingredientes, recetas).detalle) {
    const ing = d.ingredient_id ? ingredientes.get(d.ingredient_id) : undefined
    const t = ing ? tipoIngrediente(ing) : null
    if (t) pesos.set(t, (pesos.get(t) ?? 0) + d.g)
  }
  let mejor: TipoAlimento | null = null
  let max = MINIMO_G - 0.01
  for (const [t, g] of pesos) if (g > max) [mejor, max] = [t, g]
  return mejor
}

// ---------------------------------------------------------
// Veces por semana
// ---------------------------------------------------------
export type Conteo = Record<TipoAlimento, number>
export const CONTEO_CERO = (): Conteo => ({ legumbre: 0, pescado_blanco: 0, pescado_azul: 0, carne_blanca: 0, carne_roja: 0, huevo: 0, vegetal: 0 })

type EntradaMin = Pick<EntradaPlan, 'fecha' | 'momento' | 'recipe_id' | 'origen'>

/**
 * Veces que se come cada tipo en la semana, en comidas y cenas (el desayuno no cuenta).
 * Una comida o cena cuenta una vez por tipo aunque lleve varias recetas (pollo + arroz + ensalada = 1 de carne blanca).
 */
export function contarTipos(entradas: EntradaMin[], tipos: Map<string, TipoAlimento | null>): Conteo {
  const c = CONTEO_CERO()
  const porHueco = new Map<string, Set<TipoAlimento>>()
  for (const e of entradas) {
    if (e.momento === 'desayuno' || e.origen === 'libre' || !e.recipe_id) continue
    const t = tipos.get(e.recipe_id)
    if (!t) continue
    const k = `${e.fecha}|${e.momento}`
    if (!porHueco.has(k)) porHueco.set(k, new Set())
    porHueco.get(k)!.add(t)
  }
  for (const s of porHueco.values()) for (const t of s) c[t]++
  return c
}

export type Semaforo = 'verde' | 'ambar' | 'rojo'
export interface EstadoTipo {
  tipo: TipoAlimento
  valor: number
  objetivo: number
  estado: Semaforo
}

/** Objetivo ajustado a las comidas y cenas que sí se hacen en casa (si salís a cenar 2 veces, se pide algo menos) */
export const objetivoAjustado = (veces: number, escala: number) => Math.round(veces * escala)

/** Cómo va la semana en cada tipo con objetivo (los «da igual» no salen) */
export function evaluarFrecuencias(c: Conteo, f: Frecuencias, escala = 1): EstadoTipo[] {
  return TIPOS_ALIMENTO.filter((t) => f[t] != null).map((t) => {
    const objetivo = objetivoAjustado(f[t]!, escala)
    const d = Math.abs(c[t] - objetivo)
    return { tipo: t, valor: c[t], objetivo, estado: d === 0 ? 'verde' : d === 1 ? 'ambar' : 'rojo' }
  })
}

/** Lo lejos que queda la semana de las veces elegidas (lo usa el generador): faltar pesa algo más que pasarse */
export function desajusteFrecuencias(c: Conteo, f: Frecuencias, escala = 1): number {
  let p = 0
  for (const t of TIPOS_ALIMENTO) {
    const v = f[t]
    if (v == null) continue
    const obj = v * escala
    p += 3 * Math.max(0, obj - c[t]) + 2 * Math.max(0, c[t] - obj)
  }
  return p
}
