// Análisis de recetas sin IA: JSON-LD schema.org/Recipe, texto libre y líneas de ingredientes.
// Se usa tanto en el navegador (pegar texto) como en la función /api/importar.

export type FuenteTipo = 'web' | 'instagram' | 'tiktok' | 'texto' | 'manual'

export interface IngredienteParseado {
  cantidad: number | null
  unidad: string | null
  nombre: string
  texto_original: string
}

export interface RecetaImportada {
  titulo: string
  foto_url: string | null
  raciones: number | null
  t_prep_min: number | null
  t_coccion_min: number | null
  ingredientes: IngredienteParseado[]
  pasos: string[]
  etiquetas: string[]
  notas: string | null
  fuente_url: string | null
  fuente_tipo: FuenteTipo
  /** true si se ha leído un bloque schema.org/Recipe; false si viene de texto libre */
  estructurada: boolean
}

// ---------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é',
  iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í',
  Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iexcl: '¡', iquest: '¿', ordm: 'º',
  ordf: 'ª', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', hellip: '…', ndash: '–',
  mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•',
}

export function decodificarHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? m)
}

export function limpiarTexto(s: unknown): string {
  if (typeof s !== 'string') return ''
  return decodificarHtml(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

/** Minúsculas, sin acentos ni signos: para comparar nombres */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Tiempos y raciones
// ---------------------------------------------------------------------------

/** "PT1H30M" -> 90. También acepta números y textos como "45 min". */
export function duracionAMinutos(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Math.round(v)
  const s = String(v).trim()
  const iso = s.match(/^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (iso && s.length > 1) {
    const [, d, h, m, sec] = iso
    const total = (+(d ?? 0)) * 1440 + (+(h ?? 0)) * 60 + (+(m ?? 0)) + (+(sec ?? 0)) / 60
    return total > 0 ? Math.round(total) : null
  }
  let total = 0
  const horas = s.match(/(\d+(?:[.,]\d+)?)\s*(?:h|horas?)\b/i)
  const mins = s.match(/(\d+)\s*(?:m|min|minutos?)\b/i)
  if (horas) total += parseFloat(horas[1].replace(',', '.')) * 60
  if (mins) total += parseInt(mins[1], 10)
  if (!horas && !mins && /^\d+$/.test(s)) total = parseInt(s, 10)
  return total > 0 ? Math.round(total) : null
}

export function parsearRaciones(v: unknown): number | null {
  if (v == null) return null
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = parsearRaciones(x)
      if (r) return r
    }
    return null
  }
  if (typeof v === 'number') return v > 0 ? v : null
  const m = String(v).match(/(\d+(?:[.,]\d+)?)/)
  return m ? parseFloat(m[1].replace(',', '.')) : null
}

// ---------------------------------------------------------------------------
// Líneas de ingredientes
// ---------------------------------------------------------------------------

const FRACCIONES: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

const PALABRAS_NUMERO: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, medio: 0.5, media: 0.5, doce: 12, docena: 12,
}

// Unidad normalizada -> variantes que se escriben en recetas
const UNIDADES: [string, string[]][] = [
  ['kg', ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos']],
  ['g', ['g', 'gr', 'grs', 'gramo', 'gramos', 'grm']],
  ['l', ['l', 'lt', 'lts', 'litro', 'litros']],
  ['dl', ['dl', 'decilitro', 'decilitros']],
  ['cl', ['cl', 'centilitro', 'centilitros']],
  ['ml', ['ml', 'mililitro', 'mililitros', 'cc']],
  ['cda', ['cda', 'cdas', 'cucharada', 'cucharadas', 'tbsp', 'cs']],
  ['cdta', ['cdta', 'cdtas', 'cucharadita', 'cucharaditas', 'tsp', 'cc.', 'cuchara de postre']],
  ['taza', ['taza', 'tazas', 'cup', 'cups', 'vaso', 'vasos']],
  ['diente', ['diente', 'dientes']],
  ['lata', ['lata', 'latas']],
  ['bote', ['bote', 'botes', 'tarro', 'tarros']],
  ['sobre', ['sobre', 'sobres']],
  ['loncha', ['loncha', 'lonchas', 'lonja', 'lonjas']],
  ['rodaja', ['rodaja', 'rodajas']],
  ['rebanada', ['rebanada', 'rebanadas']],
  ['filete', ['filete', 'filetes']],
  ['pellizco', ['pizca', 'pizcas', 'pellizco', 'pellizcos']],
  ['puñado', ['puñado', 'puñados']],
  ['manojo', ['manojo', 'manojos', 'ramillete', 'rama', 'ramas', 'ramita', 'ramitas']],
  ['hoja', ['hoja', 'hojas']],
  ['chorrito', ['chorro', 'chorros', 'chorrito', 'chorritos']],
  ['paquete', ['paquete', 'paquetes', 'bandeja', 'bandejas']],
  ['ud', ['ud', 'uds', 'unidad', 'unidades', 'u', 'pieza', 'piezas']],
  ['oz', ['oz', 'onza', 'onzas']],
  ['lb', ['lb', 'lbs', 'libra', 'libras']],
]

const MAPA_UNIDADES = new Map<string, string>()
for (const [norm, vars] of UNIDADES) for (const v of vars) MAPA_UNIDADES.set(v, norm)

export const UNIDADES_DISPONIBLES = UNIDADES.map(([u]) => u)

function numeroDe(tok: string): number | null {
  tok = tok.trim()
  if (!tok) return null
  if (tok in FRACCIONES) return FRACCIONES[tok]
  // "1½"
  const mixta = tok.match(/^(\d+)([½¼¾⅓⅔⅛])$/)
  if (mixta) return parseInt(mixta[1], 10) + FRACCIONES[mixta[2]]
  const frac = tok.match(/^(\d+)\/(\d+)$/)
  if (frac) return +frac[2] ? +frac[1] / +frac[2] : null
  if (/^\d+(?:[.,]\d+)?$/.test(tok)) return parseFloat(tok.replace(',', '.'))
  const palabra = PALABRAS_NUMERO[tok.toLowerCase()]
  return palabra ?? null
}

/** "200 g de harina" -> { cantidad: 200, unidad: 'g', nombre: 'harina' } */
export function parsearIngrediente(linea: string): IngredienteParseado {
  const original = limpiarTexto(linea).replace(/^[\s•·\-–—*▪◦●✓✔️☑️🔸🔹▫️]+/u, '').trim()
  let resto = original
  let cantidad: number | null = null
  let unidad: string | null = null

  // Cantidad: "1 1/2", "1½", "1/2", "1,5", "1-2" (se toma la primera), "dos", "media"
  const mCant = resto.match(/^(\d+\s+\d+\/\d+|\d+[½¼¾⅓⅔⅛]|\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛])(?:\s*[-–a]\s*\d+(?:[.,]\d+)?)?\s*/)
  if (mCant) {
    const partes = mCant[1].split(/\s+/)
    cantidad = partes.reduce((acc, p) => acc + (numeroDe(p) ?? 0), 0)
    resto = resto.slice(mCant[0].length)
  } else {
    const mPal = resto.match(/^(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|medio|media)\s+/i)
    if (mPal) {
      cantidad = numeroDe(mPal[1])
      resto = resto.slice(mPal[0].length)
      // "media docena de huevos"
      const doc = resto.match(/^docena\s+(de\s+)?/i)
      if (doc && cantidad != null) {
        cantidad *= 12
        resto = resto.slice(doc[0].length)
      }
    }
  }

  // Unidad: "200g", "200 g.", "2 cucharadas", "1 cuchara de postre"
  const mUni = resto.match(/^([a-záéíóúñ]+\.?(?:\s+de\s+postre)?)(?=[\s.,(]|$)\s*/i)
  if (mUni) {
    const clave = mUni[1].toLowerCase().replace(/\.$/, '')
    const norm = MAPA_UNIDADES.get(clave)
    // Sin cantidad solo aceptamos unidades "contables" del tipo "pizca", "chorrito", "puñado"
    if (norm && (cantidad != null || ['pellizco', 'chorrito', 'puñado', 'manojo'].includes(norm))) {
      unidad = norm
      resto = resto.slice(mUni[0].length)
      if (cantidad == null) cantidad = 1
    }
  }
  if (cantidad != null && !unidad) unidad = 'ud'

  let nombre = resto.replace(/^(de|del)\s+/i, '').replace(/^[\s.,:]+/, '').trim()
  if (!nombre) nombre = original
  nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1)

  return { cantidad: cantidad != null && isFinite(cantidad) ? Math.round(cantidad * 100) / 100 : null, unidad, nombre, texto_original: original }
}

// ---------------------------------------------------------------------------
// Texto libre (descripción de Instagram/TikTok o receta pegada)
// ---------------------------------------------------------------------------

const RE_CABECERA_ING = /^\W*(ingredientes?|ingredients|necesitas|lo que necesitas)\b.*$/i
const RE_CABECERA_PASOS = /^\W*(preparaci[oó]n|elaboraci[oó]n|pasos|instrucciones|modo de preparaci[oó]n|procedimiento|c[oó]mo (se )?hacer?l[oa]|method|steps|directions)\b.*$/i
const RE_RACIONES = /(?:para|raciones|porciones|personas|servings?)\D{0,12}(\d+)|(\d+)\s*(?:raciones|porciones|personas|comensales)/i
const RE_TIEMPO = /(?:tiempo|listo en|en)\s*:?\s*(\d+\s*(?:h|horas?|min|minutos?)[^\n,.]*)/i

function pareceIngrediente(l: string): boolean {
  const t = l.replace(/^[\s•·\-–—*▪◦●✓✔️☑️🔸🔹▫️]+/u, '').trim()
  if (!t || t.length > 90) return false
  if (/^(\d+\s*[.)º]|paso\s*\d+)\s+/i.test(t) && t.length > 40) return false
  const p = parsearIngrediente(t)
  if (p.cantidad != null) return true
  return /^(sal|pimienta|aceite|agua|perejil|or[eé]gano|az[uú]car)\b/i.test(t) || /\bal gusto\b|\bc\/n\b|\bcantidad necesaria\b/i.test(t)
}

function esHashtags(l: string): boolean {
  const palabras = l.trim().split(/\s+/)
  return palabras.length > 0 && palabras.filter((p) => p.startsWith('#') || p.startsWith('@')).length >= palabras.length * 0.6
}

function quitarNumeroPaso(l: string): string {
  return l.replace(/^[\s•·\-–—*▪◦●]*(?:paso\s*)?\d+\s*[.)º:\-–]\s*/i, '').replace(/^[\s•·\-–—*▪◦●]+/, '').trim()
}

/** Extrae los hashtags como etiquetas (sin #), máx. 10 */
export function extraerHashtags(texto: string): string[] {
  const set = new Set<string>()
  for (const m of texto.matchAll(/#([\p{L}\p{N}_]{3,30})/gu)) set.add(m[1].toLowerCase())
  return [...set].slice(0, 10)
}

export function parsearTextoReceta(texto: string, base: Partial<RecetaImportada> = {}): RecetaImportada {
  const limpio = limpiarTexto(texto)
  const lineas = limpio.split(/\n/).map((l) => l.trim())
  const ingredientes: IngredienteParseado[] = []
  const pasos: string[] = []
  const otras: string[] = []
  let titulo = base.titulo?.trim() || ''
  let modo: 'nada' | 'ing' | 'pasos' = 'nada'
  let haySecciones = false

  for (const l of lineas) {
    if (!l) continue
    if (esHashtags(l)) continue
    if (RE_CABECERA_ING.test(l) && l.length < 60) {
      modo = 'ing'
      haySecciones = true
      // "Ingredientes: 200 g de arroz, 1 cebolla"
      const tras = l.replace(/^\W*[^:]*:\s*/, '')
      if (tras && tras !== l) for (const parte of tras.split(/[,;]/)) if (parte.trim()) ingredientes.push(parsearIngrediente(parte))
      continue
    }
    if (RE_CABECERA_PASOS.test(l) && l.length < 60) {
      modo = 'pasos'
      haySecciones = true
      const tras = l.replace(/^\W*[^:]*:\s*/, '')
      if (tras && tras !== l) pasos.push(tras)
      continue
    }
    if (modo === 'ing') {
      if (pareceIngrediente(l) || l.length < 50) ingredientes.push(parsearIngrediente(l))
      else {
        modo = 'pasos'
        pasos.push(quitarNumeroPaso(l))
      }
    } else if (modo === 'pasos') {
      pasos.push(quitarNumeroPaso(l))
    } else if (!haySecciones && pareceIngrediente(l)) {
      ingredientes.push(parsearIngrediente(l))
    } else if (!haySecciones && ingredientes.length > 0 && (/^\s*(?:paso\s*)?\d+\s*[.)º:]/i.test(l) || l.length > 60)) {
      modo = 'pasos'
      pasos.push(quitarNumeroPaso(l))
    } else if (!titulo && l.length <= 90) {
      titulo = l.replace(/[#@][\p{L}\p{N}_]+/gu, '').replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim()
    } else {
      otras.push(l)
    }
  }

  const racionesM = limpio.match(RE_RACIONES)
  const tiempoM = limpio.match(RE_TIEMPO)

  return {
    titulo: titulo || 'Receta sin título',
    foto_url: base.foto_url ?? null,
    raciones: base.raciones ?? (racionesM ? parseInt(racionesM[1] ?? racionesM[2], 10) : null),
    t_prep_min: base.t_prep_min ?? (tiempoM ? duracionAMinutos(tiempoM[1]) : null),
    t_coccion_min: base.t_coccion_min ?? null,
    ingredientes,
    pasos: pasos.filter((p) => p && !esHashtags(p)),
    etiquetas: base.etiquetas ?? extraerHashtags(limpio),
    notas: otras.length ? otras.join('\n') : null,
    fuente_url: base.fuente_url ?? null,
    fuente_tipo: base.fuente_tipo ?? 'texto',
    estructurada: false,
  }
}

// ---------------------------------------------------------------------------
// HTML: JSON-LD schema.org/Recipe y metaetiquetas
// ---------------------------------------------------------------------------

function tipoIncluye(nodo: any, tipo: string): boolean {
  const t = nodo?.['@type']
  if (!t) return false
  return Array.isArray(t) ? t.some((x) => String(x).toLowerCase().endsWith(tipo.toLowerCase())) : String(t).toLowerCase().endsWith(tipo.toLowerCase())
}

function buscarReceta(nodo: any, prof = 0): any | null {
  if (!nodo || typeof nodo !== 'object' || prof > 8) return null
  if (Array.isArray(nodo)) {
    for (const n of nodo) {
      const r = buscarReceta(n, prof + 1)
      if (r) return r
    }
    return null
  }
  if (tipoIncluye(nodo, 'Recipe')) return nodo
  for (const clave of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    if (nodo[clave]) {
      const r = buscarReceta(nodo[clave], prof + 1)
      if (r) return r
    }
  }
  return null
}

function urlImagen(img: any): string | null {
  if (!img) return null
  if (typeof img === 'string') return img
  if (Array.isArray(img)) return urlImagen(img[img.length > 1 ? img.length - 1 : 0]) ?? urlImagen(img[0])
  return img.url ?? img.contentUrl ?? img['@id'] ?? null
}

function pasosDe(instr: any): string[] {
  if (!instr) return []
  if (typeof instr === 'string') {
    const t = limpiarTexto(instr)
    const porLinea = t.split(/\n+/).map(quitarNumeroPaso).filter(Boolean)
    if (porLinea.length > 1) return porLinea
    // Un párrafo con "1. ... 2. ..." o frases
    const numerados = t.split(/\s(?=\d+[.)]\s)/).map(quitarNumeroPaso).filter(Boolean)
    return numerados.length > 1 ? numerados : [t]
  }
  if (Array.isArray(instr)) return instr.flatMap(pasosDe)
  if (tipoIncluye(instr, 'HowToSection')) {
    const titulo = limpiarTexto(instr.name)
    const dentro = pasosDe(instr.itemListElement)
    return titulo && dentro.length ? [`— ${titulo} —`, ...dentro] : dentro
  }
  if (instr.text) return [limpiarTexto(instr.text)].filter(Boolean)
  if (instr.name) return [limpiarTexto(instr.name)].filter(Boolean)
  if (instr.itemListElement) return pasosDe(instr.itemListElement)
  return []
}

function listaTextos(v: any): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.flatMap(listaTextos)
  if (typeof v === 'string') return v.split(',').map((s) => limpiarTexto(s)).filter(Boolean)
  return []
}

function parsearJsonTolerante(s: string): any | null {
  try {
    return JSON.parse(s)
  } catch {
    try {
      // Saltos de línea sin escapar dentro de cadenas, comas finales, comentarios
      return JSON.parse(s.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1'))
    } catch {
      return null
    }
  }
}

export function extraerJsonLd(html: string): any[] {
  const res: any[] = []
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(re)) {
    const j = parsearJsonTolerante(m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, ''))
    if (j) res.push(j)
  }
  return res
}

export function recetaDesdeSchema(r: any, url: string | null): RecetaImportada {
  const ingredientes = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : r.recipeIngredient ? [r.recipeIngredient] : r.ingredients ?? [])
    .flatMap((x: any) => (typeof x === 'string' ? x.split(/\n/) : []))
    .map((x: string) => limpiarTexto(x))
    .filter(Boolean)
    .map(parsearIngrediente)
  const total = duracionAMinutos(r.totalTime)
  let prep = duracionAMinutos(r.prepTime)
  const coccion = duracionAMinutos(r.cookTime)
  if (prep == null && coccion == null && total != null) prep = total
  const etiquetas = [...new Set([...listaTextos(r.recipeCategory), ...listaTextos(r.recipeCuisine), ...listaTextos(r.keywords)].map((e) => e.toLowerCase()))]
    .filter((e) => e.length >= 3 && e.length <= 30)
    .slice(0, 8)
  return {
    titulo: limpiarTexto(r.name) || 'Receta sin título',
    foto_url: urlImagen(r.image),
    raciones: parsearRaciones(r.recipeYield ?? r.yield),
    t_prep_min: prep,
    t_coccion_min: coccion,
    ingredientes,
    pasos: pasosDe(r.recipeInstructions),
    etiquetas,
    notas: limpiarTexto(r.description) || null,
    fuente_url: url,
    fuente_tipo: 'web',
    estructurada: true,
  }
}

export function leerMeta(html: string, nombre: string): string | null {
  const esc = nombre.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')
  const re1 = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${esc}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${esc}["']`, 'i')
  const m = html.match(re1) ?? html.match(re2)
  return m ? decodificarHtml(m[1]) : null
}

/** Intenta schema.org/Recipe; si no hay, usa título y descripción de las metaetiquetas como texto libre. */
export function recetaDesdeHtml(html: string, url: string | null, fuente_tipo: FuenteTipo = 'web'): RecetaImportada | null {
  for (const j of extraerJsonLd(html)) {
    const r = buscarReceta(j)
    if (r) {
      const rec = recetaDesdeSchema(r, url)
      if (rec.ingredientes.length || rec.pasos.length) return { ...rec, fuente_tipo }
    }
  }
  const titulo = leerMeta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null
  const desc = leerMeta(html, 'og:description') ?? leerMeta(html, 'description')
  const foto = leerMeta(html, 'og:image')
  if (!desc && !titulo) return null
  return parsearTextoReceta(desc ?? '', {
    titulo: titulo ? decodificarHtml(titulo).trim() : undefined,
    foto_url: foto,
    fuente_url: url,
    fuente_tipo,
  })
}

export function tipoDeUrl(url: string): FuenteTipo {
  const h = (() => {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return ''
    }
  })()
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram'
  if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok'
  return 'web'
}
