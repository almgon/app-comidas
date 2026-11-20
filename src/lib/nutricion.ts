import type { Ingrediente, LineaIngrediente, Receta } from './tipos'

// Gramos aproximados de una unidad de medida casera
const GRAMOS_POR_UNIDAD: Record<string, number> = {
  g: 1, kg: 1000, ml: 1, l: 1000, dl: 100, cl: 10,
  cda: 15, cdta: 5, taza: 240, pellizco: 1, chorrito: 10, puñado: 30,
  loncha: 20, rodaja: 30, rebanada: 35, filete: 120, hoja: 1, manojo: 25,
  oz: 28.35, lb: 453.6,
}

export function gramosDe(linea: Pick<LineaIngrediente, 'cantidad' | 'unidad'>, ing: Ingrediente): number | null {
  if (linea.cantidad == null) return null
  const u = linea.unidad ?? 'ud'
  if (u in GRAMOS_POR_UNIDAD) return linea.cantidad * GRAMOS_POR_UNIDAD[u]
  if (u === 'diente') return linea.cantidad * (ing.peso_unidad_g ?? 5)
  // ud, lata, bote, sobre, paquete...
  if (ing.peso_unidad_g) return linea.cantidad * ing.peso_unidad_g
  return null
}

// ---------------------------------------------------------
// Preparaciones base usadas como ingrediente
// ---------------------------------------------------------
/** Unidades con las que se puede poner una preparación base dentro de otra receta */
export const UNIDADES_BASE: { valor: string; etiqueta: string }[] = [
  { valor: 'racion', etiqueta: 'raciones' },
  { valor: 'g', etiqueta: 'g' },
  { valor: 'receta', etiqueta: 'receta entera' },
]
export const esUnidadBase = (u: string | null | undefined) => UNIDADES_BASE.some((x) => x.valor === u)

/** Peso de la receta terminada: el que se haya puesto a mano o, si no, la suma de sus ingredientes */
export function pesoReceta(r: Receta, ingredientes: Map<string, Ingrediente>, recetas: Map<string, Receta>, visitadas: Set<string> = new Set()): number | null {
  if (r.peso_total_g != null && r.peso_total_g > 0) return r.peso_total_g
  if (visitadas.has(r.id)) return null
  visitadas.add(r.id)
  let g = 0
  for (const l of r.ingredientes) {
    if (l.sub_recipe_id) {
      const sub = recetas.get(l.sub_recipe_id)
      if (!sub) continue
      const rac = racionesDeBase(l, sub, ingredientes, recetas, new Set(visitadas))
      const p = rac == null ? null : pesoReceta(sub, ingredientes, recetas, new Set(visitadas))
      if (p != null && rac != null) g += (p / (sub.raciones || 1)) * rac
      continue
    }
    const ing = l.ingredient_id ? ingredientes.get(l.ingredient_id) : undefined
    const x = ing ? gramosDe(l, ing) : null
    if (x != null) g += x
  }
  return g > 0 ? g : null
}

/**
 * Cuántas raciones de la preparación base pide una línea: "2 raciones", "1 receta entera" o "300 g"
 * (los gramos se reparten en proporción al peso total de la base). null si no se puede saber.
 */
export function racionesDeBase(
  l: Pick<LineaIngrediente, 'cantidad' | 'unidad'>,
  sub: Receta,
  ingredientes?: Map<string, Ingrediente>,
  recetas?: Map<string, Receta>,
  visitadas: Set<string> = new Set(),
): number | null {
  if (l.cantidad == null) return null
  const u = (l.unidad ?? 'racion').toLowerCase()
  if (u === 'receta') return l.cantidad * (sub.raciones || 1)
  if (u in GRAMOS_POR_UNIDAD && u !== 'pellizco') {
    if (!ingredientes || !recetas) return null
    const peso = pesoReceta(sub, ingredientes, recetas, visitadas)
    if (!peso) return null
    return ((l.cantidad * GRAMOS_POR_UNIDAD[u]) / peso) * (sub.raciones || 1)
  }
  return l.cantidad
}

// ---------------------------------------------------------
// Kcal y macros
// ---------------------------------------------------------
export interface Macros {
  kcal: number
  proteina: number
  hidratos: number
  grasa: number
}
export const MACROS_CERO: Macros = { kcal: 0, proteina: 0, hidratos: 0, grasa: 0 }
export const sumarMacros = (a: Macros, b: Macros, k = 1): Macros => ({
  kcal: a.kcal + b.kcal * k, proteina: a.proteina + b.proteina * k, hidratos: a.hidratos + b.hidratos * k, grasa: a.grasa + b.grasa * k,
})

export interface Nutricion {
  proteina: number | null
  kcal: number | null
  hidratos: number | null
  grasa: number | null
  /** Ingredientes que no se han podido contar (sin vincular o sin cantidad) */
  sinContar: string[]
  /** Ingredientes vinculados pero sin datos nutricionales en el catálogo */
  sinDatos: string[]
  manual: boolean
}

const VACIA: Nutricion = { proteina: null, kcal: null, hidratos: null, grasa: null, sinContar: [], sinDatos: [], manual: false }

/** Macros de un alimento para unos gramos (o ml) */
export function macrosDe(ing: Ingrediente, g: number): Macros {
  return {
    kcal: (g * (ing.kcal_100 ?? 0)) / 100,
    proteina: (g * (ing.proteina_100 ?? 0)) / 100,
    hidratos: (g * (ing.hidratos_100 ?? 0)) / 100,
    grasa: (g * (ing.grasa_100 ?? 0)) / 100,
  }
}

/** Nutrición por ración. Las preparaciones base cuentan en proporción a lo que se usa de ellas. */
export function nutricionPorRacion(
  receta: Receta,
  ingredientes: Map<string, Ingrediente>,
  recetas: Map<string, Receta>,
  visitadas: Set<string> = new Set(),
): Nutricion {
  if (visitadas.has(receta.id)) return { ...VACIA, sinContar: [], sinDatos: [] }
  visitadas.add(receta.id)
  let t: Macros = { ...MACROS_CERO }
  let algo = false
  const sinContar: string[] = []
  const sinDatos: string[] = []
  for (const l of receta.ingredientes) {
    if (l.sub_recipe_id) {
      const sub = recetas.get(l.sub_recipe_id)
      const rac = sub ? racionesDeBase(l, sub, ingredientes, recetas) : null
      if (!sub || rac == null) {
        sinContar.push(l.texto_original || sub?.titulo || 'preparación base')
        continue
      }
      const n = nutricionPorRacion(sub, ingredientes, recetas, new Set(visitadas))
      if (n.kcal == null && n.proteina == null) {
        sinContar.push(l.texto_original || sub.titulo)
        continue
      }
      t = sumarMacros(t, { kcal: n.kcal ?? 0, proteina: n.proteina ?? 0, hidratos: n.hidratos ?? 0, grasa: n.grasa ?? 0 }, rac)
      algo = true
      continue
    }
    const ing = l.ingredient_id ? ingredientes.get(l.ingredient_id) : undefined
    if (!ing) {
      sinContar.push(l.texto_original)
      continue
    }
    const g = gramosDe(l, ing)
    if (g == null) {
      // "sal al gusto": sin cantidad y sin aporte relevante no se avisa
      if ((ing.proteina_100 ?? 0) > 1 || (ing.kcal_100 ?? 0) > 100) sinContar.push(l.texto_original)
      continue
    }
    if (ing.kcal_100 == null && ing.proteina_100 == null) {
      if (g > 5) sinDatos.push(ing.nombre)
      continue
    }
    t = sumarMacros(t, macrosDe(ing, g))
    algo = true
  }
  const r = receta.raciones || 1
  const por = (x: number) => (algo ? x / r : null)
  if (receta.proteina_racion_manual != null) {
    return { proteina: receta.proteina_racion_manual, kcal: por(t.kcal), hidratos: por(t.hidratos), grasa: por(t.grasa), sinContar: [], sinDatos: [], manual: true }
  }
  return { proteina: por(t.proteina), kcal: por(t.kcal), hidratos: por(t.hidratos), grasa: por(t.grasa), sinContar, sinDatos, manual: false }
}

/** Macros completos (o null si no hay datos de kcal) */
export const aMacros = (n: Nutricion): Macros | null =>
  n.kcal == null ? null : { kcal: n.kcal, proteina: n.proteina ?? 0, hidratos: n.hidratos ?? 0, grasa: n.grasa ?? 0 }

export const fmt = (n: number | null | undefined, dec = 0) =>
  n == null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: 0 })
