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

export interface Nutricion {
  proteina: number | null
  kcal: number | null
  /** Ingredientes que no se han podido contar (sin vincular o sin cantidad) */
  sinContar: string[]
  manual: boolean
}

/** Nutrición por ración. Las preparaciones base se cuentan por raciones usadas. */
export function nutricionPorRacion(
  receta: Receta,
  ingredientes: Map<string, Ingrediente>,
  recetas: Map<string, Receta>,
  visitadas: Set<string> = new Set(),
): Nutricion {
  if (visitadas.has(receta.id)) return { proteina: null, kcal: null, sinContar: [], manual: false }
  visitadas.add(receta.id)
  let prot = 0
  let kcal = 0
  let algo = false
  const sinContar: string[] = []
  for (const l of receta.ingredientes) {
    if (l.sub_recipe_id) {
      const sub = recetas.get(l.sub_recipe_id)
      if (!sub || l.cantidad == null) {
        sinContar.push(l.texto_original)
        continue
      }
      const n = nutricionPorRacion(sub, ingredientes, recetas, new Set(visitadas))
      if (n.proteina == null) {
        sinContar.push(l.texto_original)
        continue
      }
      prot += n.proteina * l.cantidad
      kcal += (n.kcal ?? 0) * l.cantidad
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
    prot += (g * (ing.proteina_100 ?? 0)) / 100
    kcal += (g * (ing.kcal_100 ?? 0)) / 100
    algo = true
  }
  if (receta.proteina_racion_manual != null) {
    return { proteina: receta.proteina_racion_manual, kcal: algo ? kcal / receta.raciones : null, sinContar: [], manual: true }
  }
  const r = receta.raciones || 1
  return { proteina: algo ? prot / r : null, kcal: algo ? kcal / r : null, sinContar, manual: false }
}

export const fmt = (n: number | null | undefined, dec = 0) =>
  n == null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: 0 })
