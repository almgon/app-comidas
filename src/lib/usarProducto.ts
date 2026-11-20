import { useCallback } from 'react'
import { normalizar } from '../../shared/parser.js'
import { useDatos } from './datos'
import { useMenu } from './menu'
import { ingredienteDeProducto, ingredienteDesdeProducto } from './mercadona'
import type { ProductoTienda } from './tipos'

export type ModoProducto = 'existente' | 'enlazado' | 'nuevo'

/**
 * Usar un producto de Mercadona en una línea de receta. Devuelve el ingrediente que tiene que llevar la línea:
 * - si ya hay un ingrediente con ese producto, ese;
 * - si la línea tenía un ingrediente sin producto, se le enlaza (vale para todas las recetas que lo usan);
 * - si no, se crea un ingrediente con el nombre del producto y las kcal/macros del alimento más parecido.
 */
export function useUsarProducto() {
  const { ingredientes, mapaIngredientes, guardarIngrediente } = useDatos()
  const { enlaces, enlazar } = useMenu()
  return useCallback(
    async (p: ProductoTienda, actualId: string | null): Promise<{ ingId: string; modo: ModoProducto }> => {
      const ya = ingredienteDeProducto(p.id, enlaces)
      if (ya) return { ingId: ya, modo: 'existente' }
      const actual = actualId ? mapaIngredientes.get(actualId) : undefined
      if (actual && !enlaces.get(actual.id)?.mercadona) {
        await enlazar(actual.id, 'mercadona', p.id)
        return { ingId: actual.id, modo: 'enlazado' }
      }
      const mismoNombre = ingredientes.find((i) => normalizar(i.nombre) === normalizar(p.nombre))
      if (mismoNombre) {
        if (!enlaces.get(mismoNombre.id)?.mercadona) await enlazar(mismoNombre.id, 'mercadona', p.id)
        return { ingId: mismoNombre.id, modo: 'existente' }
      }
      const nuevo = await guardarIngrediente(ingredienteDesdeProducto(p, ingredientes, actual))
      await enlazar(nuevo.id, 'mercadona', p.id)
      return { ingId: nuevo.id, modo: 'nuevo' }
    },
    [ingredientes, mapaIngredientes, guardarIngrediente, enlaces, enlazar],
  )
}
