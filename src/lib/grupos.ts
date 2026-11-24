// Equilibrio por raciones de cada grupo de alimentos (recomendaciones de la AESAN), contando el día entero
// y la semana, en lugar de pedir que cada comida cumpla el método del plato.
// Una «ración» es la cantidad de referencia de la AESAN: 150 g de verdura, una pieza de fruta, 70 g de arroz o pasta en crudo…
import { normalizar } from '../../shared/parser.js'
import { gramosDe, racionesDeBase } from './nutricion'
import { factorCocinado, grupoPlato } from './plato'
import { papelDe, type EntradaPlan, type Ingrediente, type Momento, type Receta } from './tipos'

export const GRUPOS_RACION = ['verdura', 'fruta', 'hidratos', 'lacteos', 'frutos_secos'] as const
export type GrupoRacion = (typeof GRUPOS_RACION)[number]
/** Raciones de cada grupo */
export type Porciones = Record<GrupoRacion, number>
export const PORCIONES_CERO: Porciones = { verdura: 0, fruta: 0, hidratos: 0, lacteos: 0, frutos_secos: 0 }
export const sumarPorciones = (a: Porciones, b: Porciones, k = 1): Porciones => ({
  verdura: a.verdura + b.verdura * k,
  fruta: a.fruta + b.fruta * k,
  hidratos: a.hidratos + b.hidratos * k,
  lacteos: a.lacteos + b.lacteos * k,
  frutos_secos: a.frutos_secos + b.frutos_secos * k,
})

export const INFO_GRUPOS: Record<GrupoRacion, { etiqueta: string; emoji: string; racion: string }> = {
  verdura: { etiqueta: 'Verdura', emoji: '🥦', racion: '150 g (un plato de ensalada, media de verdura cocinada)' },
  fruta: { etiqueta: 'Fruta', emoji: '🍎', racion: 'una pieza mediana (150 g)' },
  hidratos: { etiqueta: 'Hidratos', emoji: '🍚', racion: '70 g de arroz o pasta en crudo, 50 g de pan, 200 g de patata' },
  lacteos: { etiqueta: 'Lácteos', emoji: '🥛', racion: 'un vaso de leche, 1 yogur o 40 g de queso' },
  frutos_secos: { etiqueta: 'Frutos secos', emoji: '🥜', racion: 'un puñado (25 g)' },
}

const tiene = (n: string, ...palabras: string[]) => palabras.some((p) => ` ${n}`.includes(` ${p}`))

/** Grupo de raciones de un ingrediente (null si no cuenta: carne, pescado, aceite, especias…) */
export function grupoRacion(ing: Ingrediente): GrupoRacion | null {
  const n = normalizar(ing.nombre)
  const c = normalizar(ing.categoria ?? '')
  const gp = grupoPlato(ing)
  if (c === 'frutos secos' || tiene(n, 'nuez', 'nueces', 'almendra', 'avellana', 'anacardo', 'pistacho', 'cacahuete', 'piñon', 'pinon')) {
    // la crema de cacahuete o la harina de almendra también cuentan
    return 'frutos_secos'
  }
  if (c === 'lacteos' && gp !== 'grasa') return 'lacteos'
  if (tiene(n, 'yogur', 'kefir', 'queso') && gp !== 'grasa') return 'lacteos'
  if (gp === 'verdura') return c === 'fruta' || tiene(n, 'manzana', 'platano', 'pera', 'naranja', 'fresa', 'arandano', 'kiwi', 'melocoton', 'mango', 'uva', 'pina', 'sandia', 'melon', 'frambuesa', 'mandarina') ? 'fruta' : 'verdura'
  if (gp === 'hidratos') return 'hidratos'
  return null
}

/** Gramos (tal y como se compra) que hacen una ración de ese ingrediente */
export function gramosRacion(ing: Ingrediente, grupo: GrupoRacion): number {
  const n = normalizar(ing.nombre)
  switch (grupo) {
    case 'verdura':
    case 'fruta':
      return 150
    case 'frutos_secos':
      return 25
    case 'lacteos':
      if (tiene(n, 'queso fresco', 'queso de burgos', 'requeson', 'cottage', 'queso batido')) return 100
      if (tiene(n, 'queso')) return 40
      if (tiene(n, 'yogur', 'skyr', 'cuajada', 'petit')) return 125
      return 200 // leche, kéfir, bebidas
    case 'hidratos':
      if (tiene(n, 'patata', 'boniato', 'gnocchi', 'maiz')) return 200
      if (tiene(n, 'avena', 'muesli', 'granola', 'cereales', 'copos')) return 40
      if (tiene(n, 'pan', 'tostada', 'biscote', 'tortilla', 'tortitas', 'wrap', 'obleas', 'masa de', 'pita')) return 50
      if (factorCocinado(ing) > 1) return 70 // arroz, pasta, quinoa, cuscús… en crudo
      return 60
  }
}

/** Raciones que aportan unos gramos de un ingrediente */
export function porcionesDe(ing: Ingrediente, g: number): Porciones {
  const p = { ...PORCIONES_CERO }
  const grupo = grupoRacion(ing)
  if (grupo) p[grupo] += g / gramosRacion(ing, grupo)
  return p
}

export interface PorcionesReceta {
  porciones: Porciones
  /** líneas que podrían contar pero no se han podido pesar */
  sinContar: string[]
}

/** Raciones de cada grupo por ración de receta. Las preparaciones base cuentan en proporción a lo que se usa. */
export function porcionesPorRacion(
  receta: Receta,
  ingredientes: Map<string, Ingrediente>,
  recetas: Map<string, Receta>,
  visitadas: Set<string> = new Set(),
): PorcionesReceta {
  const res: PorcionesReceta = { porciones: { ...PORCIONES_CERO }, sinContar: [] }
  if (visitadas.has(receta.id)) return res
  visitadas.add(receta.id)
  const r = receta.raciones || 1
  for (const l of receta.ingredientes) {
    if (l.sub_recipe_id) {
      const sub = recetas.get(l.sub_recipe_id)
      const rac = sub ? racionesDeBase(l, sub, ingredientes, recetas) : null
      if (!sub || rac == null) {
        res.sinContar.push(l.texto_original || sub?.titulo || 'preparación base')
        continue
      }
      const p = porcionesPorRacion(sub, ingredientes, recetas, new Set(visitadas))
      res.porciones = sumarPorciones(res.porciones, p.porciones, rac / r)
      res.sinContar.push(...p.sinContar)
      continue
    }
    const ing = l.ingredient_id ? ingredientes.get(l.ingredient_id) : undefined
    if (!ing) continue
    const grupo = grupoRacion(ing)
    if (!grupo) continue
    const g = gramosDe(l, ing, r)
    if (g == null) {
      res.sinContar.push(l.texto_original)
      continue
    }
    res.porciones[grupo] += g / gramosRacion(ing, grupo) / r
  }
  return res
}

/** ¿La receta tiene algún dato de raciones? (si no tiene ingredientes vinculados, no se sabe lo que aporta) */
export const conDatos = (r: Receta) => r.ingredientes.some((l) => l.ingredient_id || l.sub_recipe_id)

/** Lo que se supone que aporta una receta sin datos (solo para el generador) */
export function porcionesEstimadas(r: Pick<Receta, 'papel'>, momento: Momento): Porciones {
  if (momento === 'desayuno') return { ...PORCIONES_CERO, hidratos: 1, lacteos: 1 }
  switch (papelDe(r)) {
    case 'principal':
      return { ...PORCIONES_CERO, verdura: 0.3 }
    case 'guarnicion':
      return { ...PORCIONES_CERO, verdura: 0.6, hidratos: 0.6 }
    default:
      return { ...PORCIONES_CERO, verdura: 1, hidratos: 1.2 }
  }
}

/** Tipo de guarnición según lo que más aporta */
export type TipoGuarnicion = 'verdura' | 'hidratos' | 'otra'
export function tipoGuarnicion(p: Porciones | null | undefined): TipoGuarnicion {
  if (!p) return 'otra'
  const v = p.verdura + p.fruta
  if (v < 0.2 && p.hidratos < 0.2) return 'otra'
  return v >= p.hidratos ? 'verdura' : 'hidratos'
}

const gramosSuelto = (ing: Ingrediente, cantidad: number) => (ing.unidad_base === 'ud' ? (ing.peso_unidad_g ? cantidad * ing.peso_unidad_g : null) : cantidad)

/**
 * Raciones de cada grupo que come una persona en unas entradas del menú (un día, un hueco…).
 * Cada receta: raciones por ración × su factor. Los alimentos sueltos son para todo el hogar y se reparten.
 */
export function porcionesPersona(
  entradas: Pick<EntradaPlan, 'momento' | 'recipe_id' | 'origen' | 'extras'>[],
  factor: number,
  porReceta: Map<string, Porciones | null>,
  ingredientes: Map<string, Ingrediente>,
  factorHogar: number,
  recetas?: Map<string, Receta>,
): Porciones {
  let p = { ...PORCIONES_CERO }
  for (const e of entradas) {
    if (e.origen === 'libre') continue
    if (e.recipe_id) {
      const x = porReceta.get(e.recipe_id)
      if (x) p = sumarPorciones(p, x, factor)
      else if (recetas) {
        const r = recetas.get(e.recipe_id)
        if (r) p = sumarPorciones(p, porcionesEstimadas(r, e.momento), factor)
      }
    }
    for (const s of e.extras ?? []) {
      const ing = ingredientes.get(s.ingredient_id)
      const g = ing && s.cantidad != null ? gramosSuelto(ing, s.cantidad) : null
      if (ing && g != null) p = sumarPorciones(p, porcionesDe(ing, g), factor / (factorHogar || 1))
    }
  }
  return p
}

// ---------------------------------------------------------
// Objetivos (AESAN). Se pueden ajustar aquí.
// ---------------------------------------------------------
/** Por persona y día. La fruta se compra aparte (3 piezas al día en la lista de la compra) y no se exige en el menú. */
export const OBJETIVOS_DIA = {
  verdura: { min: 3 },
  hidratos: { min: 3, max: 6 },
  lacteos: { max: 3 },
} as const
/** Por persona y semana */
export const OBJETIVOS_SEMANA = { frutos_secos: { min: 3 } } as const

export type Semaforo = 'verde' | 'ambar' | 'rojo'
export interface EstadoGrupo {
  grupo: GrupoRacion
  valor: number
  texto: string
  estado: Semaforo
}

/** Redondeo a medias raciones para enseñar (2,4 → 2,5) */
export const medias = (n: number) => Math.round(n * 2) / 2
const fmtR = (n: number) => medias(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })

/** Cómo va un día de una persona en cada grupo */
export function evaluarDia(p: Porciones): EstadoGrupo[] {
  const v = p.verdura
  const h = p.hidratos
  const l = p.lacteos
  const { verdura, hidratos, lacteos } = OBJETIVOS_DIA
  return [
    { grupo: 'verdura', valor: v, texto: `${fmtR(v)} de ${verdura.min}`, estado: v >= verdura.min - 0.25 ? 'verde' : v >= verdura.min - 1.25 ? 'ambar' : 'rojo' },
    {
      grupo: 'hidratos', valor: h, texto: `${fmtR(h)} (${hidratos.min}-${hidratos.max})`,
      estado: h >= hidratos.min - 0.25 && h <= hidratos.max + 0.25 ? 'verde' : h >= hidratos.min - 1.25 && h <= hidratos.max + 1.25 ? 'ambar' : 'rojo',
    },
    { grupo: 'lacteos', valor: l, texto: `${fmtR(l)} de máx. ${lacteos.max}`, estado: l <= lacteos.max + 0.25 ? 'verde' : l <= lacteos.max + 1.25 ? 'ambar' : 'rojo' },
  ]
}

/** Lo lejos que queda un día de los objetivos de raciones (0 = todo bien). Lo usa el generador. */
export function desajustePorciones(p: Porciones): number {
  const { verdura, hidratos, lacteos } = OBJETIVOS_DIA
  return (
    1.2 * Math.max(0, verdura.min - p.verdura) +
    1.0 * Math.max(0, hidratos.min - p.hidratos) +
    0.6 * Math.max(0, p.hidratos - hidratos.max) +
    0.6 * Math.max(0, p.lacteos - lacteos.max)
  )
}

export function evaluarFrutosSecos(total: number, dias: number): EstadoGrupo {
  const obj = Math.max(1, Math.round((OBJETIVOS_SEMANA.frutos_secos.min * dias) / 7))
  return { grupo: 'frutos_secos', valor: total, texto: `${fmtR(total)} de ≥${obj}`, estado: total >= obj - 0.25 ? 'verde' : total >= obj - 1.25 ? 'ambar' : 'rojo' }
}
