// Conversión de productos de Open Food Facts a ingredientes del catálogo
import { normalizar } from './parser.js'

export interface AlimentoExterno {
  codigo_off: string
  nombre: string
  marca: string | null
  formato: string | null
  unidad_base: 'g' | 'ml'
  kcal_100: number | null
  proteina_100: number | null
  hidratos_100: number | null
  grasa_100: number | null
}

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN
  return isFinite(x) ? Math.round(x * 10) / 10 : null
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function alimentoDesdeOff(p: any): AlimentoExterno | null {
  const nombre = String(p?.product_name_es || p?.product_name || p?.generic_name_es || '').trim()
  const nt = p?.nutriments ?? {}
  const proteina = n(nt.proteins_100g)
  let kcal = n(nt['energy-kcal_100g'])
  if (kcal == null && n(nt['energy-kj_100g']) != null) kcal = Math.round(n(nt['energy-kj_100g'])! / 4.184)
  if (!nombre || !p?.code || (proteina == null && kcal == null)) return null
  const marca = String(p.brands ?? '').split(',')[0].trim() || null
  const formato = String(p.quantity ?? '').trim() || null
  const liquido = /\b(ml|cl|l|litros?)\b/i.test(formato ?? '') || /bebida|leche|zumo|aceite|caldo|nata l[ií]quida/i.test(nombre)
  return {
    codigo_off: String(p.code),
    nombre: capitalizar(nombre.replace(/\s+/g, ' ')),
    marca,
    formato,
    unidad_base: liquido ? 'ml' : 'g',
    kcal_100: kcal,
    proteina_100: proteina,
    hidratos_100: n(nt.carbohydrates_100g),
    grasa_100: n(nt.fat_100g),
  }
}

/** Nombre con el que se guarda: «Queso fresco batido 0% (Hacendado)» */
export const nombreConMarca = (a: Pick<AlimentoExterno, 'nombre' | 'marca'>) =>
  a.marca && !normalizar(a.nombre).includes(normalizar(a.marca)) ? `${a.nombre} (${a.marca})` : a.nombre

/** Quita resultados repetidos (mismo código o mismo nombre+marca) */
export function sinDuplicados(lista: AlimentoExterno[]): AlimentoExterno[] {
  const vistos = new Set<string>()
  return lista.filter((a) => {
    const claves = [a.codigo_off, normalizar(nombreConMarca(a))]
    if (claves.some((c) => vistos.has(c))) return false
    claves.forEach((c) => vistos.add(c))
    return true
  })
}
