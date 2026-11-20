import { useMemo } from 'react'
import { useDatos } from './datos'
import { useComensales, useMenu } from './menu'
import { aMacros, nutricionPorRacion } from './nutricion'
import { pesoPlato, platoPorRacion } from './plato'
import type { ContextoMenu } from './generador'
import { racionesHogar } from './tipos'

export function useContextoMenu(lunes: string): ContextoMenu {
  const { recetas, mapaIngredientes, mapaRecetas } = useDatos()
  const { congelados } = useMenu()
  const comensales = useComensales()
  const nutricion = useMemo(() => new Map(recetas.map((r) => [r.id, nutricionPorRacion(r, mapaIngredientes, mapaRecetas)])), [recetas, mapaIngredientes, mapaRecetas])
  const proteina = useMemo(() => new Map([...nutricion].map(([id, n]) => [id, n.proteina])), [nutricion])
  const macros = useMemo(() => new Map([...nutricion].map(([id, n]) => [id, aMacros(n)])), [nutricion])
  const platos = useMemo(
    () => new Map(recetas.map((r) => {
      const p = platoPorRacion(r, mapaIngredientes, mapaRecetas).reparto
      return [r.id, pesoPlato(p) >= 30 ? p : null]
    })),
    [recetas, mapaIngredientes, mapaRecetas],
  )
  return useMemo(
    () => ({ lunes, recetas, proteina, macros, platos, ingredientes: mapaIngredientes, comensales, congelados, raciones: racionesHogar(comensales) }),
    [lunes, recetas, proteina, macros, platos, mapaIngredientes, comensales, congelados],
  )
}
