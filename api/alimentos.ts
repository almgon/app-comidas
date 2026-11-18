// Función de Vercel: GET /api/alimentos?q=... busca alimentos en Open Food Facts (gratis, sin clave)
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { usuarioValido } from './_auth.js'
import { alimentoDesdeOff, sinDuplicados, type AlimentoExterno } from '../shared/alimentos.js'

const CAMPOS = 'code,product_name,product_name_es,generic_name_es,brands,quantity,nutriments'
const UA = 'AppComidas/1.0 (uso personal)'

async function buscar(url: string): Promise<any[]> {
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(9000) })
  if (!r.ok) throw new Error(`Open Food Facts respondió ${r.status}`)
  const j: any = await r.json()
  return j.products ?? j.hits ?? []
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!(await usuarioValido(req))) return res.status(401).json({ error: 'Inicia sesión' })
    const q = String(req.query.q ?? '').trim().slice(0, 80)
    if (q.length < 2) return res.status(400).json({ error: 'Escribe al menos 2 letras' })
    const codigo = /^\d{8,14}$/.test(q)
    let productos: any[] = []
    if (codigo) {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${CAMPOS}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(9000) })
      const j: any = await r.json()
      if (j.product) productos = [j.product]
    } else {
      const params = new URLSearchParams({
        search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '30', fields: CAMPOS,
        tagtype_0: 'countries', tag_contains_0: 'contains', tag_0: 'spain', sort_by: 'unique_scans_n',
      })
      try {
        productos = await buscar(`https://es.openfoodfacts.org/cgi/search.pl?${params}`)
      } catch {
        // Buscador nuevo de Open Food Facts como alternativa
        productos = await buscar(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&langs=es&page_size=30&fields=${CAMPOS}`)
      }
    }
    const lista = sinDuplicados(productos.map(alimentoDesdeOff).filter((a): a is AlimentoExterno => a != null)).slice(0, 20)
    res.setHeader('cache-control', 's-maxage=86400')
    res.status(200).json(lista)
  } catch (e: any) {
    res.status(502).json({ error: 'Open Food Facts no responde ahora mismo. Prueba en un rato o rellena los valores a mano.' })
  }
}
