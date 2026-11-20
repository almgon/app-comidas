// Recetas hechas con productos de Mercadona: cada producto se guarda como un ingrediente del catálogo
// (con sus kcal y macros) enlazado a su producto (precio y envase).
import { normalizar } from '../../shared/parser.js'
import { mejorSugerencia } from './emparejar'
import type { Ingrediente, ProductoTienda } from './tipos'

const FRUTA = /manzana|pera\b|peras\b|platano|banana|naranja|mandarina|uva|fresa|kiwi|melon|sandia|pina|mango|aguacate|limon|lima\b|cereza|melocoton|ciruela|arandano|frambuesa|granada|higo|caqui|nectarina|papaya|paraguaya|chirimoya|fruta/

/** Pasillo de la lista de la compra a partir de la categoría de Mercadona */
export function pasilloMercadona(categoria: string | null, nombre: string): string {
  const c = normalizar(categoria ?? '')
  const n = normalizar(nombre)
  if (c.includes('fruta y verdura')) return FRUTA.test(n) ? 'Fruta' : 'Verdura'
  if (c.includes('carne')) return 'Carne'
  if (c.includes('pescado') || c.includes('marisco')) return 'Pescado'
  if (c.includes('huevos')) return /huevo/.test(n) ? 'Huevos' : 'Lácteos'
  if (c.includes('charcuteria')) return /queso/.test(n) ? 'Lácteos' : 'Charcutería'
  if (c.includes('postres') || c.includes('yogur')) return 'Lácteos'
  if (c.includes('panaderia')) return 'Panadería'
  if (c.includes('arroz') || c.includes('legumbre') || c.includes('pasta')) return /arroz|pasta|macarr|espagu|fideo|tallarin|lasana|cuscus|quinoa|harina/.test(n) ? 'Pasta y arroz' : 'Legumbres'
  if (c.includes('conservas')) return 'Conservas'
  if (c.includes('congelados')) return 'Congelados'
  if (c.includes('cereales') || c.includes('cacao') || c.includes('cafe')) return 'Desayuno'
  if (c.includes('platos preparados') || c.includes('pizzas')) return 'Refrigerados'
  if (c.includes('agua') || c.includes('zumo') || c.includes('bodega') || c.includes('refresco')) return 'Bebidas'
  if (c.includes('aceite') || c.includes('azucar') || c.includes('aperitivos') || c.includes('especias')) return /fruto seco|almendra|nuez|nueces|cacahuete|anacardo|pistacho|avellana/.test(n) ? 'Frutos secos' : 'Despensa'
  return 'Otros'
}

/**
 * Ingrediente nuevo para un producto de Mercadona. Las kcal y macros se copian de `plantilla`
 * (el ingrediente que tenía la línea) o del alimento más parecido del catálogo; se pueden corregir después.
 */
export function ingredienteDesdeProducto(p: ProductoTienda, ingredientes: Ingrediente[], plantilla?: Ingrediente | null): Partial<Ingrediente> & { nombre: string } {
  const genericos = ingredientes.filter((i) => i.kcal_100 != null || i.proteina_100 != null)
  const s = plantilla ? null : mejorSugerencia(p.nombre, genericos, [])
  const t = plantilla ?? (s ? ingredientes.find((i) => i.id === s.id) : undefined)
  return {
    nombre: p.nombre,
    categoria: t?.categoria && t.categoria !== 'Otros' ? t.categoria : pasilloMercadona(p.categoria, p.nombre),
    unidad_base: p.envase_unidad,
    peso_unidad_g: t?.peso_unidad_g ?? null,
    kcal_100: t?.kcal_100 ?? null,
    proteina_100: t?.proteina_100 ?? null,
    hidratos_100: t?.hidratos_100 ?? null,
    grasa_100: t?.grasa_100 ?? null,
    es_despensa: t?.es_despensa ?? false,
    envase_cantidad: p.envase_cantidad,
    envase_nombre: 'envase',
  }
}

/** Ingrediente ya enlazado a este producto (para no crear duplicados) */
export function ingredienteDeProducto(productoId: string, enlaces: Map<string, { mercadona?: ProductoTienda }>): string | null {
  for (const [ingId, e] of enlaces) if (e.mercadona?.id === productoId) return ingId
  return null
}
