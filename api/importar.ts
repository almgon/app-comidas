// Función de Vercel: GET /api/importar?url=...
// Lee la página en el servidor (el navegador no puede por CORS) y devuelve la receta normalizada.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { recetaDesdeHtml, parsearTextoReceta, tipoDeUrl, leerMeta, limpiarTexto, type RecetaImportada } from '../shared/parser.js'

const UA_NAVEGADOR =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const UA_PREVIEW = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const MAX_BYTES = 3_000_000

function ipPrivada(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase()
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l === '::' || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.')
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

async function comprobarUrl(raw: string): Promise<URL> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new ErrorHttp(400, 'El enlace no es válido')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ErrorHttp(400, 'Solo se admiten enlaces http(s)')
  const host = u.hostname
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new ErrorHttp(400, 'Enlace no permitido')
  if (process.env.IMPORTAR_SIN_DNS === '1') return u // solo para pruebas locales detrás de un proxy
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((x) => x.address)
  if (!ips.length) throw new ErrorHttp(400, 'No se encuentra esa web')
  if (ips.some(ipPrivada)) throw new ErrorHttp(400, 'Enlace no permitido')
  return u
}

class ErrorHttp extends Error {
  constructor(public status: number, msg: string) {
    super(msg)
  }
}

async function descargar(url: string, ua = UA_NAVEGADOR, saltos = 0): Promise<{ html: string; url: string }> {
  await comprobarUrl(url)
  const res = await fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'es-ES,es;q=0.9' },
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    if (saltos > 5) throw new ErrorHttp(502, 'Demasiadas redirecciones')
    return descargar(new URL(res.headers.get('location')!, url).toString(), ua, saltos + 1)
  }
  if (!res.ok) throw new ErrorHttp(502, `La web respondió con un error (${res.status})`)
  const reader = res.body?.getReader()
  if (!reader) return { html: '', url }
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    partes.push(value)
    total += value.length
    if (total > MAX_BYTES) {
      await reader.cancel()
      break
    }
  }
  return { html: Buffer.concat(partes).toString('utf8'), url }
}

async function importarTikTok(url: string): Promise<RecetaImportada> {
  // Los enlaces cortos (vm.tiktok.com) redirigen a la URL completa
  let final = url
  try {
    final = (await descargar(url)).url
  } catch {
    /* seguimos con la original */
  }
  const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(final)}`, { signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new ErrorHttp(502, 'TikTok no ha devuelto la descripción. Copia el texto y usa «Pegar texto».')
  const j: any = await r.json()
  const texto = String(j.title ?? '')
  if (!texto.trim()) throw new ErrorHttp(422, 'La publicación de TikTok no tiene descripción. Usa «Pegar texto».')
  return parsearTextoReceta(texto, {
    foto_url: j.thumbnail_url ?? null,
    fuente_url: final,
    fuente_tipo: 'tiktok',
  })
}

function captionInstagram(desc: string): string {
  // og:description suele ser: '123 likes, 4 comments - usuario on 1 de enero: "texto..."'
  const m = desc.match(/:\s*[“"]([\s\S]+)[”"]\.?\s*$/)
  return m ? m[1] : desc
}

async function importarInstagram(url: string): Promise<RecetaImportada> {
  const u = new URL(url)
  const codigo = u.pathname.match(/\/(p|reel|reels|tv)\/([^/?#]+)/)
  // 1) Página de inserción, que trae el texto completo de la publicación
  if (codigo) {
    try {
      const { html } = await descargar(`https://www.instagram.com/p/${codigo[2]}/embed/captioned/`)
      const cap = html.match(/class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i)?.[1]
      if (cap) {
        const texto = limpiarTexto(cap.replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, ''))
        const img = html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i)?.[1]
        if (texto.length > 20) {
          return parsearTextoReceta(texto, { foto_url: img ? limpiarTexto(img) : null, fuente_url: url, fuente_tipo: 'instagram' })
        }
      }
    } catch {
      /* probamos la siguiente vía */
    }
  }
  // 2) Metaetiquetas de la página
  const { html } = await descargar(url, UA_PREVIEW)
  const desc = leerMeta(html, 'og:description') ?? leerMeta(html, 'description')
  if (!desc || desc.length < 20) throw new ErrorHttp(422, 'Instagram no deja leer esta publicación. Copia el texto y usa «Pegar texto».')
  return parsearTextoReceta(captionInstagram(desc), {
    foto_url: leerMeta(html, 'og:image'),
    fuente_url: url,
    fuente_tipo: 'instagram',
  })
}

async function usuarioValido(req: VercelRequest): Promise<boolean> {
  const baseRaw = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const base = baseRaw ? new URL(baseRaw.trim()).origin : undefined
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!base || !anon) return true // sin configurar: no se comprueba (desarrollo local)
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` } })
  return r.ok
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') throw new ErrorHttp(405, 'Método no permitido')
    if (!(await usuarioValido(req))) throw new ErrorHttp(401, 'Inicia sesión para importar')
    const url = String(req.query.url ?? '').trim()
    if (!url) throw new ErrorHttp(400, 'Falta el enlace')
    await comprobarUrl(url)

    const tipo = tipoDeUrl(url)
    let receta: RecetaImportada | null
    if (tipo === 'tiktok') receta = await importarTikTok(url)
    else if (tipo === 'instagram') receta = await importarInstagram(url)
    else {
      const { html, url: final } = await descargar(url)
      receta = recetaDesdeHtml(html, final)
      if (!receta) throw new ErrorHttp(422, 'No he encontrado una receta en esa página. Prueba con «Pegar texto».')
    }
    if (receta.foto_url) {
      try {
        receta.foto_url = new URL(receta.foto_url, url).toString()
      } catch {
        receta.foto_url = null
      }
    }
    res.setHeader('cache-control', 'no-store')
    res.status(200).json(receta)
  } catch (e: any) {
    const status = e instanceof ErrorHttp ? e.status : 502
    const msg = e instanceof ErrorHttp ? e.message : 'No se ha podido leer la página. Prueba con «Pegar texto».'
    res.status(status).json({ error: msg })
  }
}
