// Conversión de las respuestas de Mercadona y Dia a filas de store_products (sin dependencias, Node 20+)

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

/** Precio de una página de producto de dia.es: JSON-LD, metaetiquetas o JSON incrustado */
export function precioDesdeHtml(html) {
  if (!html) return null
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const datos = JSON.parse(m[1].trim())
      const lista = Array.isArray(datos) ? datos : datos['@graph'] ?? [datos]
      for (const d of lista) {
        const tipo = [].concat(d?.['@type'] ?? [])
        if (!tipo.includes('Product')) continue
        const ofertas = [].concat(d.offers ?? [])
        for (const o of ofertas) {
          const p = num(o.price ?? o.lowPrice)
          if (p != null && p > 0) return p
        }
      }
    } catch {
      /* JSON-LD roto: se prueban las otras vías */
    }
  }
  const meta = /<meta[^>]+(?:property|itemprop|name)=["'](?:product:price:amount|og:price:amount|price)["'][^>]*content=["']([\d.,]+)["']/i.exec(html)
    ?? /<meta[^>]+content=["']([\d.,]+)["'][^>]*(?:property|itemprop|name)=["'](?:product:price:amount|og:price:amount|price)["']/i.exec(html)
  if (meta) return num(meta[1])
  const json = /"(?:active_price|activePrice|sellingPrice|price)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/.exec(html)
  if (json) return num(json[1])
  return null
}

/** ¿La respuesta parece un bloqueo anti-bots? */
export const pareceBloqueo = (status, html) =>
  status === 403 || status === 429 || status === 503 || /captcha|cf-chl|access denied|datadome|perimeterx|incapsula/i.test(html ?? '')
