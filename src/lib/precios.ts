// Comparador Mercadona / Dia para la lista de la compra
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

export interface Comparacion {
  /** precio por artículo y tienda */
  precios: Map<string, Partial<Record<Tienda, PrecioArticulo>>>
  totalMercadona: number
  totalDia: number
  /** solo con los artículos que tienen precio en las dos tiendas */
  comparables: number
  mercadonaComparable: number
  diaComparable: number
  mixtoComparable: number
  ahorro: number
  /** tienda recomendada si no se divide */
  mejor: Tienda | null
  dividir: boolean
  /** tienda en la que comprar cada artículo */
  asignacion: Map<string, Tienda | null>
  sinPrecio: number
  antiguos: number
}

export function comparar(
  articulos: ArticuloCompra[],
  ingredientes: Map<string, Ingrediente>,
  enlaces: Map<string, Partial<Record<Tienda, ProductoTienda>>>,
  umbral: number,
  ahora = Date.now(),
): Comparacion {
  const precios = new Map<string, Partial<Record<Tienda, PrecioArticulo>>>()
  let totalMercadona = 0, totalDia = 0, mC = 0, dC = 0, mix = 0, comparables = 0, sinPrecio = 0, antiguos = 0
  const vistos = new Set<string>()
  for (const a of articulos) {
    if (!a.ingredient_id || a.es_despensa) continue
    const ing = ingredientes.get(a.ingredient_id)
    const e = enlaces.get(a.ingredient_id) ?? {}
    const m = precioArticulo(a, ing, e.mercadona)
    const d = precioArticulo(a, ing, e.dia)
    precios.set(a.id, { ...(m ? { mercadona: m } : {}), ...(d ? { dia: d } : {}) })
    if (m) totalMercadona += m.coste
    if (d) totalDia += d.coste
    if (!m && !d) sinPrecio++
    for (const x of [m, d]) {
      if (x && !vistos.has(x.producto.id) && ahora - new Date(x.producto.actualizado_en).getTime() > DIAS_PRECIO_ANTIGUO * 86400000) {
        antiguos++
        vistos.add(x.producto.id)
      }
    }
    if (m && d) {
      comparables++
      mC += m.coste
      dC += d.coste
      mix += Math.min(m.coste, d.coste)
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100
  const mejor: Tienda | null = comparables ? (mC <= dC ? 'mercadona' : 'dia') : totalMercadona || totalDia ? (totalMercadona >= totalDia ? 'mercadona' : 'dia') : null
  const ahorro = r(Math.min(mC, dC) - mix)
  const dividir = comparables > 0 && ahorro >= umbral
  const asignacion = new Map<string, Tienda | null>()
  for (const a of articulos) {
    const p = precios.get(a.id)
    if (!dividir) {
      asignacion.set(a.id, mejor)
      continue
    }
    if (!p || (!p.mercadona && !p.dia)) {
      asignacion.set(a.id, null)
      continue
    }
    if (p.mercadona && p.dia) asignacion.set(a.id, p.mercadona.coste <= p.dia.coste ? 'mercadona' : 'dia')
    else asignacion.set(a.id, p.mercadona ? 'mercadona' : 'dia')
  }
  return {
    precios, totalMercadona: r(totalMercadona), totalDia: r(totalDia), comparables, mercadonaComparable: r(mC), diaComparable: r(dC), mixtoComparable: r(mix),
    ahorro, mejor, dividir, asignacion, sinPrecio, antiguos,
  }
}

export const euros = (n: number | null | undefined) =>
  n == null ? '–' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
