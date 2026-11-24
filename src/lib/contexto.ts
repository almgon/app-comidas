import { useMemo } from 'react'
import { useDatos } from './datos'
import { useComensales, useMenu } from './menu'
import { aMacros, nutricionPorRacion } from './nutricion'
import { pesoPlato, repartoPorRacion } from './reparto'
import { frecuenciasDe, tipoReceta } from './frecuencias'
import type { ContextoMenu } from './generador'
import { racionesHogar } from './tipos'

export function useContextoMenu(lunes: string): ContextoMenu {
  const { recetas, mapaIngredientes, mapaRecetas, hogar } = useDatos()
  const { congelados } = useMenu()
  const comensales = useComensales()
  const nutricion = useMemo(() => new Map(recetas.map((r) => [r.id, nutricionPorRacion(r, mapaIngredientes, mapaRecetas)])), [recetas, mapaIngredientes, mapaRecetas])
  const proteina = useMemo(() => new Map([...nutricion].map(([id, n]) => [id, n.proteina])), [nutricion])
  const macros = useMemo(() => new Map([...nutricion].map(([id, n]) => [id, aMacros(n)])), [nutricion])
  const repartos = useMemo(
    () => new Map(recetas.map((r) => {
      const p = repartoPorRacion(r, mapaIngredientes, mapaRecetas).reparto
      return [r.id, pesoPlato(p) >= 30 ? p : null]
    })),
    [recetas, mapaIngredientes, mapaRecetas],
  )
  const tipos = useMemo(() => new Map(recetas.map((r) => [r.id, tipoReceta(r, mapaIngredientes, mapaRecetas)])), [recetas, mapaIngredientes, mapaRecetas])
  const frecuencias = useMemo(() => frecuenciasDe(hogar), [hogar])
  return useMemo(
    () => ({ lunes, recetas, proteina, macros, repartos, tipos, frecuencias, ingredientes: mapaIngredientes, comensales, congelados, raciones: racionesHogar(comensales) }),
    [lunes, recetas, proteina, macros, repartos, tipos, frecuencias, mapaIngredientes, comensales, congelados],
  )
}
