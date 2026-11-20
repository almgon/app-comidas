// Kcal y macros de cada día, por persona, comparados con su objetivo diario
import { MACROS_CERO, macrosDe, sumarMacros, fmt, type Macros } from './nutricion'
import { objetivosPersona, type Comensal, type EntradaPlan, type Ingrediente, type Momento } from './tipos'

/** Lo que se supone que aporta una ración cuando una receta no tiene datos (solo para el generador) */
export const MACROS_ESTIMADOS: Record<Momento, Macros> = {
  desayuno: { kcal: 420, proteina: 16, hidratos: 55, grasa: 14 },
  comida: { kcal: 650, proteina: 32, hidratos: 65, grasa: 24 },
  cena: { kcal: 550, proteina: 30, hidratos: 50, grasa: 22 },
}

/** Objetivos completos de un comensal (por si vienen sin las kcal) */
export function objetivosDe(c: Comensal) {
  if (c.kcal != null && c.hcMin != null && c.hcMax != null && c.grasaMin != null && c.grasaMax != null)
    return { kcal: c.kcal, protMin: c.protMin, protMax: c.protMax, hcMin: c.hcMin, hcMax: c.hcMax, grasaMin: c.grasaMin, grasaMax: c.grasaMax }
  return { ...objetivosPersona((c.protMin / 1.2) || 70), protMin: c.protMin, protMax: c.protMax }
}

export interface DiaPersona {
  macros: Macros
  /** desayuno, comida y cena tienen algo y nadie come fuera */
  completo: boolean
  /** recetas del día sin datos de kcal */
  sinDatos: number
}

/** Gramos de un alimento suelto (cantidad en su unidad base) */
const gramosSuelto = (ing: Ingrediente, cantidad: number) => (ing.unidad_base === 'ud' ? (ing.peso_unidad_g ? cantidad * ing.peso_unidad_g : null) : cantidad)

/**
 * Lo que come una persona un día. Cada receta: macros por ración × su factor.
 * Los alimentos sueltos son para todo el hogar: se reparten según el factor de cada uno.
 */
export function diaPersona(
  entradasDia: Pick<EntradaPlan, 'momento' | 'recipe_id' | 'origen' | 'extras'>[],
  c: Comensal,
  macrosReceta: Map<string, Macros | null>,
  ingredientes: Map<string, Ingrediente>,
  factorHogar: number,
  estimar = false,
): DiaPersona {
  let m: Macros = { ...MACROS_CERO }
  let sinDatos = 0
  const momentos = new Set<Momento>()
  let fuera = false
  for (const e of entradasDia) {
    if (e.origen === 'libre') {
      fuera = true
      continue
    }
    if (e.recipe_id) {
      momentos.add(e.momento)
      const x = macrosReceta.get(e.recipe_id)
      if (x) m = sumarMacros(m, x, c.factor)
      else {
        sinDatos++
        if (estimar) m = sumarMacros(m, MACROS_ESTIMADOS[e.momento], c.factor)
      }
    }
    for (const s of e.extras ?? []) {
      const ing = ingredientes.get(s.ingredient_id)
      if (!ing) continue
      momentos.add(e.momento)
      const g = s.cantidad == null ? null : gramosSuelto(ing, s.cantidad)
      if (g != null) m = sumarMacros(m, macrosDe(ing, g), c.factor / (factorHogar || 1))
    }
  }
  return { macros: m, completo: !fuera && momentos.size === 3, sinDatos }
}

export type EstadoMacro = 'ok' | 'falta' | 'sobra'
export interface Balance {
  clave: keyof Macros
  etiqueta: string
  valor: number
  min: number
  max: number
  estado: EstadoMacro
  /** cuánto falta (negativo) o sobra (positivo) respecto al rango */
  diferencia: number
  texto: string
}

const ETIQUETAS: Record<keyof Macros, string> = { kcal: 'kcal', proteina: 'proteína', hidratos: 'hidratos', grasa: 'grasa' }

/** Rangos del día: kcal ±10 %, proteína 1,2-1,6 g/kg, hidratos 45-60 % y grasa 20-35 % de las kcal */
export function rangos(c: Comensal): Record<keyof Macros, [number, number]> {
  const o = objetivosDe(c)
  return {
    kcal: [o.kcal * 0.9, o.kcal * 1.1],
    proteina: [o.protMin, o.protMax * 1.1],
    hidratos: [o.hcMin, o.hcMax],
    grasa: [o.grasaMin, o.grasaMax],
  }
}

export function balance(m: Macros, c: Comensal): Balance[] {
  const r = rangos(c)
  return (Object.keys(ETIQUETAS) as (keyof Macros)[]).map((k) => {
    const [min, max] = r[k]
    const v = m[k]
    const estado: EstadoMacro = v < min ? 'falta' : v > max ? 'sobra' : 'ok'
    const diferencia = estado === 'falta' ? v - min : estado === 'sobra' ? v - max : 0
    const u = k === 'kcal' ? ' kcal' : ' g'
    const nombre = k === 'kcal' ? '' : ` de ${ETIQUETAS[k]}`
    const texto =
      estado === 'ok' ? `${ETIQUETAS[k][0].toUpperCase()}${ETIQUETAS[k].slice(1)} bien` : `${estado === 'falta' ? 'Faltan' : 'Sobran'} ${fmt(Math.abs(diferencia))}${u}${nombre}`
    return { clave: k, etiqueta: ETIQUETAS[k], valor: v, min, max, estado, diferencia, texto }
  })
}

/**
 * Lo lejos que queda un día de los objetivos (0 = todo dentro de rango). Lo usa el generador.
 * Las kcal pesan más; el resto, en proporción a lo que se sale del rango.
 */
export function desajuste(m: Macros, c: Comensal): number {
  const o = objetivosDe(c)
  const r = rangos(c)
  const fuera = (v: number, [a, b]: [number, number]) => (v < a ? a - v : v > b ? v - b : 0)
  return (
    8 * (fuera(m.kcal, r.kcal) / o.kcal) +
    4 * (fuera(m.proteina, [r.proteina[0], r.proteina[1] * 1.05]) / o.protMin) +
    2 * (fuera(m.hidratos, r.hidratos) / ((o.hcMin + o.hcMax) / 2)) +
    2 * (fuera(m.grasa, r.grasa) / ((o.grasaMin + o.grasaMax) / 2))
  )
}
