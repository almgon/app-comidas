import { useMemo } from 'react'
import { useDatos } from './datos'
import { useComensales, useMenu } from './menu'
import { aMacros, nutricionPorRacion } from './nutricion'
import type { ContextoMenu } from './generador'
import { racionesHogar } from './tipos'

export function useContextoMenu(lunes: string): ContextoMenu {
  const { recetas, mapaIngredientes, mapaRecetas } = useDatos()
  const { congelados } = useMenu()
  const comensales = useComensales()
  const nutricion = useMemo(() => new Map(recetas.map((r) => [r.id, nutricionPorRacion(r, mapaIngredientes, mapaRecetas)])), [recetas, mapaIngredientes, mapaRecetas])
  const proteina = useMemo(() => new Map([...nutricion].map(([id, n]) => [id, n.proteina])), [nutricion])
  const macros = useMemo(() => new Map([...nutricion].map(([id, n]) => [id, aMacros(n)])), [nutricion])
  return useMemo(
    () => ({ lunes, recetas, proteina, macros, ingredientes: mapaIngredientes, comensales, congelados, raciones: racionesHogar(comensales) }),
    [lunes, recetas, proteina, macros, mapaIngredientes, comensales, congelados],
  )
}
