// Conversión de las respuestas de Mercadona a filas de store_products (sin dependencias, Node 20+)

const num = (v) => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Tamaño del envase en g, ml o ud a partir de price_instructions de Mercadona */
export function envaseMercadona(pi = {}) {
  const tam = num(pi.unit_size)
  const f = String(pi.size_format ?? '').toLowerCase()
  if (tam && (f === 'kg' || f === 'kilo')) return { cantidad: Math.round(tam * 1000 * 100) / 100, unidad: 'g' }
  if (tam && f === 'g') return { cantidad: tam, unidad: 'g' }
  if (tam && (f === 'l' || f === 'litro')) return { cantidad: Math.round(tam * 1000 * 100) / 100, unidad: 'ml' }
  if (tam && f === 'ml') return { cantidad: tam, unidad: 'ml' }
  const uds = num(pi.total_units) ?? tam
  return { cantidad: uds && uds > 0 ? uds : 1, unidad: 'ud' }
}

/** Producto de /api/categories/{id}/ → fila de store_products */
export function productoMercadona(p, categoria) {
  if (!p || p.id == null || !p.display_name) return null
  const pi = p.price_instructions ?? {}
  const env = envaseMercadona(pi)
  const precio = num(pi.unit_price) ?? num(pi.bulk_price)
  if (precio == null) return null
  const textoEnvase = [p.packaging, pi.unit_size && pi.size_format ? `${String(pi.unit_size).replace('.', ',')} ${pi.size_format}` : null, pi.approx_size ? 'aprox.' : null]
    .filter(Boolean).join(' ')
  return {
    household_id: null,
    tienda: 'mercadona',
    id_externo: String(p.id),
    nombre: String(p.display_name).trim(),
    categoria: categoria ?? null,
    envase_cantidad: env.cantidad,
    envase_unidad: env.unidad,
    envase_texto: textoEnvase || null,
    precio,
    precio_referencia: num(pi.reference_price),
    formato_referencia: pi.reference_format ?? null,
    url: p.share_url ?? null,
    foto_url: typeof p.thumbnail === 'string' ? p.thumbnail : p.thumbnail?.regular ?? null,
    origen: 'auto',
    actualizado_en: new Date().toISOString(),
  }
}

/** Recorre la respuesta de una categoría (que trae subcategorías con productos) */
export function productosDeCategoria(json, nombreSuperior) {
  const res = []
  const visitar = (c, nombre) => {
    for (const p of c.products ?? []) {
      const f = productoMercadona(p, nombre)
      if (f) res.push(f)
    }
    for (const sub of c.categories ?? []) visitar(sub, nombre)
  }
  visitar(json ?? {}, nombreSuperior ?? json?.name)
  return res
}
