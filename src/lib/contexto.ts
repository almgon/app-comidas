import { useMemo } from 'react'
import { useDatos } from './datos'
import { useComensales, useMenu } from './menu'
import { nutricionPorRacion } from './nutricion'
import { aUnidadBase } from './cantidades'
import type { ContextoMenu } from './generador'
import { racionesHogar, type Comensal, type Ingrediente, type LineaDesayuno } from './tipos'

/** Proteína del desayuno de cada persona: [lunes-viernes, fin de semana] */
export function proteinaDesayunos(desayunos: LineaDesayuno[], comensales: Comensal[], ingredientes: Map<string, Ingrediente>): Map<string, [number, number]> {
  const res = new Map<string, [number, number]>()
  for (const c of comensales) {
    const t: [number, number] = [0, 0]
    for (const l of desayunos) {
      const ing = ingredientes.get(l.ingredient_id)
      const q = ing ? aUnidadBase(Number(l.cantidades[c.id]) || 0, l.unidad, ing) : null
      if (!ing || q == null) continue
      const g = ing.unidad_base === 'ud' ? q * (ing.peso_unidad_g ?? 0) : q
      t[l.dias === 'lv' ? 0 : 1] += (g * (ing.proteina_100 ?? 0)) / 100
    }
    res.set(c.id, t)
  }
  return res
}

export function useContextoMenu(lunes: string): ContextoMenu {
  const { recetas, mapaIngredientes, mapaRecetas } = useDatos()
  const { desayunos, congelados } = useMenu()
  const comensales = useComensales()
  const proteina = useMemo(() => new Map(recetas.map((r) => [r.id, nutricionPorRacion(r, mapaIngredientes, mapaRecetas).proteina])), [recetas, mapaIngredientes, mapaRecetas])
  const proteinaDesayuno = useMemo(() => proteinaDesayunos(desayunos, comensales, mapaIngredientes), [desayunos, comensales, mapaIngredientes])
  return useMemo(
    () => ({ lunes, recetas, proteina, comensales, proteinaDesayuno, congelados, raciones: racionesHogar(comensales) }),
    [lunes, recetas, proteina, comensales, proteinaDesayuno, congelados],
  )
}
