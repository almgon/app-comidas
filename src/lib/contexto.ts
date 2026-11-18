import { useMemo } from 'react'
import { useDatos } from './datos'
import { useComensales, useMenu } from './menu'
import { nutricionPorRacion } from './nutricion'
import type { ContextoMenu } from './generador'
import { racionesHogar } from './tipos'

export function useContextoMenu(lunes: string): ContextoMenu {
  const { recetas, mapaIngredientes, mapaRecetas } = useDatos()
  const { congelados } = useMenu()
  const comensales = useComensales()
  const proteina = useMemo(() => new Map(recetas.map((r) => [r.id, nutricionPorRacion(r, mapaIngredientes, mapaRecetas).proteina])), [recetas, mapaIngredientes, mapaRecetas])
  return useMemo(
    () => ({ lunes, recetas, proteina, comensales, congelados, raciones: racionesHogar(comensales) }),
    [lunes, recetas, proteina, comensales, congelados],
  )
}
