// Precios de Mercadona para la lista de la compra
import type { ArticuloCompra, Ingrediente, ProductoTienda, Tienda } from './tipos'

export const DIAS_PRECIO_ANTIGUO = 14

export interface PrecioArticulo {
  tienda: Tienda
  producto: ProductoTienda
  envases: number
  coste: number
}

/** Pasa una cantidad de la unidad del ingrediente a la del envase del producto */
function enUnidadProducto(cantidad: number, unidad: string | null, ing: Ingrediente | undefined, p: ProductoTienda): number | null {
  const u = unidad ?? ing?.unidad_base ?? 'g'
  if (u === p.envase_unidad || (u !== 'ud' && p.envase_unidad !== 'ud')) return cantidad // g ≈ ml
  const peso = ing?.peso_unidad_g
  if (!peso) return null
  return u === 'ud' ? cantidad * peso : cantidad / peso
}

export function precioArticulo(a: Pick<ArticuloCompra, 'cantidad' | 'unidad'>, ing: Ingrediente | undefined, p: ProductoTienda | undefined): PrecioArticulo | null {
  if (!p || p.precio == null) return null
  const tam = p.envase_cantidad && p.envase_cantidad > 0 ? p.envase_cantidad : null
  let envases = 1
  if (a.cantidad != null && tam) {
    const q = enUnidadProducto(a.cantidad, a.unidad, ing, p)
    if (q != null) envases = Math.max(1, Math.ceil(q / tam - 0.02))
  }
  return { tienda: p.tienda, producto: p, envases, coste: Math.round(envases * p.precio * 100) / 100 }
}

export interface TotalCompra {
  /** precio de cada artículo de la lista (por id) */
  precios: Map<string, PrecioArticulo>
  total: number
  conPrecio: number
  sinPrecio: number
  antiguos: number
}

/** Total de la lista en Mercadona con los productos enlazados */
export function totalCompra(
  articulos: ArticuloCompra[],
  ingredientes: Map<string, Ingrediente>,
  enlaces: Map<string, Partial<Record<Tienda, ProductoTienda>>>,
  ahora = Date.now(),
): TotalCompra {
  const precios = new Map<string, PrecioArticulo>()
  let total = 0, conPrecio = 0, sinPrecio = 0, antiguos = 0
  const vistos = new Set<string>()
  for (const a of articulos) {
    if (!a.ingredient_id || a.es_despensa) continue
    const p = precioArticulo(a, ingredientes.get(a.ingredient_id), enlaces.get(a.ingredient_id)?.mercadona)
    if (!p) {
      sinPrecio++
      continue
    }
    precios.set(a.id, p)
    total += p.coste
    conPrecio++
    if (!vistos.has(p.producto.id) && ahora - new Date(p.producto.actualizado_en).getTime() > DIAS_PRECIO_ANTIGUO * 86400000) {
      antiguos++
      vistos.add(p.producto.id)
    }
  }
  return { precios, total: Math.round(total * 100) / 100, conPrecio, sinPrecio, antiguos }
}

export const euros = (n: number | null | undefined) =>
  n == null ? '–' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
