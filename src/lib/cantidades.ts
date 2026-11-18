import type { Envase, Ingrediente } from './tipos'
import { fmt } from './nutricion'

// Gramos (o ml) aproximados de una medida casera
const BASE_POR_UNIDAD: Record<string, number> = {
  g: 1, kg: 1000, ml: 1, l: 1000, dl: 100, cl: 10,
  cda: 15, cdta: 5, taza: 240, pellizco: 1, chorrito: 10, puñado: 30,
  loncha: 20, rodaja: 30, rebanada: 35, filete: 120, hoja: 1, manojo: 25,
  oz: 28.35, lb: 453.6,
}
const SIN_PESO = new Set(['ud', 'unidad', 'unidades', 'diente', 'dientes', 'pieza', 'piezas', ''])

/**
 * Convierte una cantidad de receta a la unidad base del ingrediente (g, ml o ud).
 * Devuelve null si no se puede (p. ej. "1 lata" de algo sin peso por unidad).
 */
export function aUnidadBase(cantidad: number | null, unidad: string | null, ing: Ingrediente): number | null {
  if (cantidad == null) return null
  const u = (unidad ?? '').trim().toLowerCase()
  if (ing.unidad_base === 'ud') {
    if (SIN_PESO.has(u)) return cantidad
    const g = u in BASE_POR_UNIDAD ? cantidad * BASE_POR_UNIDAD[u] : null
    if (g != null && ing.peso_unidad_g) return g / ing.peso_unidad_g
    return null
  }
  // g o ml (1 ml ≈ 1 g)
  if (u in BASE_POR_UNIDAD) return cantidad * BASE_POR_UNIDAD[u]
  if (u === 'diente' || u === 'dientes') return cantidad * (ing.peso_unidad_g ?? 5)
  if (ing.peso_unidad_g) return cantidad * ing.peso_unidad_g // ud, lata, bote...
  return null
}

/** "600 g", "1,2 kg", "750 ml", "3 ud" */
export function fmtBase(c: number, unidad: 'g' | 'ml' | 'ud'): string {
  if (unidad === 'ud') return `${fmt(redondearUd(c), 1)} ud`
  if (c >= 1000) return `${fmt(c / 1000, 2)} ${unidad === 'g' ? 'kg' : 'l'}`
  return `${fmt(redondeo(c))} ${unidad}`
}

const redondeo = (c: number) => (c >= 100 ? Math.round(c / 10) * 10 : c >= 10 ? Math.round(c / 5) * 5 : Math.round(c))
const redondearUd = (c: number) => Math.ceil(c * 2 - 0.05) / 2 // a medias unidades, hacia arriba

/** Cantidad redondeada para comprar (las unidades, enteras hacia arriba) */
export function cantidadCompra(c: number, unidad: 'g' | 'ml' | 'ud'): number {
  if (unidad === 'ud') return Math.max(1, Math.ceil(c - 0.05))
  return Math.max(1, redondeo(c))
}

export interface EnEnvases {
  envases: number
  texto: string
}

/** 600 g con bandejas de 400 g → "2 bandejas (400 g) · sobran 200 g" */
export function enEnvases(c: number, unidad: 'g' | 'ml' | 'ud', env: Envase | null | undefined): EnEnvases | null {
  if (!env || !(env.cantidad > 0) || !(c > 0)) return null
  const n = Math.max(1, Math.ceil(c / env.cantidad - 0.02))
  const sobra = n * env.cantidad - c
  const nombre = n === 1 ? env.nombre : plural(env.nombre)
  let texto = /\d/.test(env.nombre) ? `${n} ${nombre}` : `${n} ${nombre} (${fmtBase(env.cantidad, unidad)})`
  if (sobra > env.cantidad * 0.05 && sobra >= (unidad === 'ud' ? 1 : 5)) texto += ` · sobran ${fmtBase(sobra, unidad)}`
  return { envases: n, texto }
}

export function plural(s: string): string {
  // Solo la primera palabra: "pack de 3 latas" → "packs de 3 latas"
  const [p, ...resto] = s.split(' ')
  const pl = /[aeiouáéó]$/i.test(p) ? p + 's' : /[sx]$/i.test(p) ? p : /z$/i.test(p) ? p.slice(0, -1) + 'ces' : /[lnrdj]$/i.test(p) ? p + 'es' : p + 's'
  return [pl, ...resto].join(' ')
}
