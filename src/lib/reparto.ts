// Reparto de lo que se come entre verdura (y fruta), proteína, hidratos y grasa, calculado desde los ingredientes.
// Se mide por PESO en el plato ya cocinado (no por kcal: la verdura casi no tiene kcal y saldría siempre cerca del 0 %).
// Es solo información: no hay porcentajes objetivo.
import { normalizar } from '../../shared/parser.js'
import { gramosDe, racionesDeBase } from './nutricion'
import type { EntradaPlan, GrupoPlato, Ingrediente, Receta } from './tipos'

export type { GrupoPlato }
/** Los grupos que cuentan para el porcentaje (lo de «otro» no cuenta: especias, caldos, bebidas, salsas…) */
export const GRUPOS_CUENTAN = ['verdura', 'proteina', 'hidratos', 'grasa'] as const
export type GrupoCuenta = (typeof GRUPOS_CUENTAN)[number]

export const GRUPOS_PLATO: { valor: GrupoPlato; etiqueta: string; corta: string; emoji: string }[] = [
  { valor: 'verdura', etiqueta: 'Verdura y fruta', corta: 'Verduras', emoji: '🥦' },
  { valor: 'proteina', etiqueta: 'Proteínas', corta: 'Proteínas', emoji: '🍗' },
  { valor: 'hidratos', etiqueta: 'Hidratos', corta: 'Hidratos', emoji: '🍞' },
  { valor: 'grasa', etiqueta: 'Grasas', corta: 'Grasas', emoji: '🫒' },
  { valor: 'otro', etiqueta: 'No cuenta (especias, caldos, bebidas, salsas…)', corta: 'No cuenta', emoji: '🧂' },
]
export const etiquetaGrupoPlato = (g: GrupoPlato) => GRUPOS_PLATO.find((x) => x.valor === g)!

export type Reparto = Record<GrupoPlato, number>
export const REPARTO_CERO: Reparto = { verdura: 0, proteina: 0, hidratos: 0, grasa: 0, otro: 0 }
export const sumarReparto = (a: Reparto, b: Reparto, k = 1): Reparto => ({
  verdura: a.verdura + b.verdura * k,
  proteina: a.proteina + b.proteina * k,
  hidratos: a.hidratos + b.hidratos * k,
  grasa: a.grasa + b.grasa * k,
  otro: a.otro + b.otro * k,
})
/** Gramos que cuentan para el plato */
export const pesoPlato = (r: Reparto) => r.verdura + r.proteina + r.hidratos + r.grasa

// ---------------------------------------------------------
// A qué grupo va cada ingrediente
// ---------------------------------------------------------
/** ¿Alguna palabra del nombre empieza por alguno de estos textos? («nata» no es «desnatada») */
const tiene = (n: string, ...palabras: string[]) => palabras.some((p) => ` ${n}`.includes(` ${p}`))

/** Grupo según la sección y el nombre (se puede cambiar a mano en cada ingrediente) */
export function grupoInferido(ing: Pick<Ingrediente, 'nombre' | 'categoria' | 'kcal_100' | 'proteina_100' | 'hidratos_100' | 'grasa_100'>): GrupoPlato {
  const n = normalizar(ing.nombre)
  const c = normalizar(ing.categoria ?? '')
  // Excepciones por nombre, valgan para cualquier sección
  if (tiene(n, 'caldo', 'especia', 'vinagre', 'salsa de soja', 'tabasco', 'perrins', 'ketchup', 'mostaza', 'azucar', 'edulcorante', 'miel', 'sirope', 'mermelada', 'levadura', 'gelatina', 'colorante', 'cacao', 'chocolate', 'crema de cacao', 'teriyaki', 'barbacoa'))
    return 'otro'
  if (n === 'sal') return 'otro'
  if (tiene(n, 'tortilla de patata')) return 'proteina'
  if (tiene(n, 'patata', 'boniato', 'gnocchi', 'maiz', 'masa de', 'obleas', 'tortillas de', 'tortitas de arroz', 'pasta fresca', 'harina', 'maicena', 'pan rallado'))
    return 'hidratos'
  if (tiene(n, 'edamame', 'hummus', 'tofu', 'tempeh', 'seitan', 'heura', 'soja texturizada', 'proteina', 'surimi', 'gulas', 'atun', 'bonito', 'caballa', 'sardina', 'anchoa', 'berberecho', 'mejillon', 'varitas', 'pescado'))
    return 'proteina'
  if (tiene(n, 'aguacate', 'aceituna', 'aceite', 'mayonesa', 'pesto', 'mantequilla', 'nata', 'mascarpone', 'queso crema', 'queso de untar', 'coco rallado', 'leche de coco', 'carbonara', 'semillas', 'pipas', 'crema de cacahuete'))
    return 'grasa'
  if (tiene(n, 'zumo', 'gazpacho')) return n.includes('gazpacho') ? 'verdura' : 'otro'
  switch (c) {
    case 'verdura':
    case 'fruta':
      return 'verdura'
    case 'carne':
    case 'pescado':
    case 'huevos':
    case 'charcuteria':
    case 'legumbres':
      return 'proteina'
    case 'pasta y arroz':
    case 'panaderia':
      return 'hidratos'
    case 'frutos secos':
      return 'grasa'
    case 'desayuno':
      return tiene(n, 'avena', 'muesli', 'granola', 'cereales', 'copos', 'salvado') ? 'hidratos' : 'otro'
    case 'lacteos':
      // leche y bebidas vegetales: acompañan (como el vaso de agua del plato); yogur y queso: proteína
      return tiene(n, 'leche', 'bebida', 'soja (bebida)') ? 'otro' : 'proteina'
    case 'congelados':
    case 'conservas':
      return tiene(n, 'pescado', 'merluza', 'gamba', 'langostino') ? 'proteina' : 'verdura'
    case 'bebidas':
    case 'despensa':
      return 'otro'
  }
  // Sección desconocida: por sus macros
  const k = ing.kcal_100 ?? 0
  if (!k) return 'otro'
  const p = ((ing.proteina_100 ?? 0) * 4) / k
  const h = ((ing.hidratos_100 ?? 0) * 4) / k
  const g = ((ing.grasa_100 ?? 0) * 9) / k
  if (p >= 0.35 && (ing.proteina_100 ?? 0) >= 8) return 'proteina'
  if (g >= 0.6 && k >= 250) return 'grasa'
  if (h >= 0.6 && (ing.hidratos_100 ?? 0) >= 15) return 'hidratos'
  return 'otro'
}

export const grupoPlato = (ing: Ingrediente): GrupoPlato => ing.grupo_plato ?? grupoInferido(ing)

/**
 * Lo que pesa en el plato 1 g del ingrediente tal y como se compra: el arroz, la pasta y las legumbres secas
 * se pesan en crudo pero en el plato están cocidos (absorben agua).
 */
export function factorCocinado(ing: Pick<Ingrediente, 'nombre' | 'categoria'>): number {
  const n = normalizar(ing.nombre)
  if (tiene(n, 'cocid', 'vasito', 'bote', 'lata', 'fresca', 'gnocchi', 'harina', 'rallado')) return 1
  if (tiene(n, 'soja texturizada')) return 3
  if (normalizar(ing.categoria ?? '') === 'legumbres' && tiene(n, 'seca', 'seco')) return 2.5
  if (tiene(n, 'arroz')) return n.includes('tortita') ? 1 : 2.8
  if (tiene(n, 'pasta', 'espagueti', 'macarron', 'fideo', 'tallarin', 'lasana', 'noodle')) return 2.3
  if (tiene(n, 'cuscus', 'bulgur', 'quinoa', 'mijo', 'trigo sarraceno', 'copos de avena')) return 2.5
  return 1
}

// ---------------------------------------------------------
// Reparto de una receta (por ración)
// ---------------------------------------------------------
export interface RepartoReceta {
  /** gramos por ración en el plato (ya cocinado) de cada grupo */
  reparto: Reparto
  /** líneas que no se han podido pesar */
  sinContar: string[]
  /** gramos (por ración) de cada ingrediente, para enseñar de dónde sale cada grupo */
  detalle: { nombre: string; ingredient_id: string | null; grupo: GrupoPlato; g: number }[]
}

/** Reparto por ración. Las preparaciones base cuentan en proporción a lo que se usa de ellas. */
export function repartoPorRacion(
  receta: Receta,
  ingredientes: Map<string, Ingrediente>,
  recetas: Map<string, Receta>,
  visitadas: Set<string> = new Set(),
): RepartoReceta {
  const res: RepartoReceta = { reparto: { ...REPARTO_CERO }, sinContar: [], detalle: [] }
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
      const p = repartoPorRacion(sub, ingredientes, recetas, new Set(visitadas))
      res.reparto = sumarReparto(res.reparto, p.reparto, rac / r)
      for (const d of p.detalle) res.detalle.push({ ...d, nombre: `${d.nombre} (de ${sub.titulo})`, g: (d.g * rac) / r })
      res.sinContar.push(...p.sinContar)
      continue
    }
    const ing = l.ingredient_id ? ingredientes.get(l.ingredient_id) : undefined
    if (!ing) {
      res.sinContar.push(l.texto_original)
      continue
    }
    const g = gramosDe(l, ing, r)
    const grupo = grupoPlato(ing)
    if (g == null) {
      if (grupo !== 'otro' && grupo !== 'grasa') res.sinContar.push(l.texto_original)
      continue
    }
    const enPlato = (g * factorCocinado(ing)) / r
    res.reparto[grupo] += enPlato
    res.detalle.push({ nombre: ing.nombre, ingredient_id: ing.id, grupo, g: enPlato })
  }
  return res
}

// ---------------------------------------------------------
// Porcentajes (por peso en el plato)
// ---------------------------------------------------------
export type Porcentajes = Record<GrupoCuenta, number>

/** % de cada grupo sobre lo que cuenta (verdura + proteína + hidratos + grasa). null si casi no hay datos. */
export function porcentajes(r: Reparto | null | undefined): Porcentajes | null {
  if (!r) return null
  const t = pesoPlato(r)
  if (t < 30) return null
  return { verdura: (100 * r.verdura) / t, proteina: (100 * r.proteina) / t, hidratos: (100 * r.hidratos) / t, grasa: (100 * r.grasa) / t }
}

/** Tipo de guarnición según lo que más pesa: verdura (ensalada, verduras asadas) o hidratos (arroz, patatas) */
export type TipoGuarnicion = 'verdura' | 'hidratos' | 'otra'
export function tipoGuarnicion(r: Reparto | null | undefined): TipoGuarnicion {
  if (!r || (r.verdura < 20 && r.hidratos < 20)) return 'otra'
  return r.verdura >= r.hidratos ? 'verdura' : 'hidratos'
}

// ---------------------------------------------------------
// Un día entero (desayuno, comida y cena: todas sus recetas y alimentos sueltos)
// ---------------------------------------------------------
const gramosSuelto = (ing: Ingrediente, cantidad: number) => (ing.unidad_base === 'ud' ? (ing.peso_unidad_g ? cantidad * ing.peso_unidad_g : null) : cantidad)

export interface RepartoDia {
  /** gramos por persona (una ración) de cada grupo; null si no hay nada con datos */
  reparto: Reparto | null
  /** recetas del día de las que no se sabe el reparto (sin ingredientes vinculados) */
  sinDatos: number
  /** hay algún hueco «fuera de casa» (no se sabe lo que se come) */
  fuera: boolean
}

/**
 * Lo que come una persona (una ración) en unas entradas del menú. Los alimentos sueltos son para todo el hogar:
 * se dividen entre las raciones del hogar. Los porcentajes son los mismos para todos (el factor de ración escala todo igual).
 */
export function repartoEntradas(
  entradas: Pick<EntradaPlan, 'recipe_id' | 'origen' | 'extras'>[],
  repartos: Map<string, Reparto | null>,
  ingredientes: Map<string, Ingrediente>,
  factorHogar: number,
): RepartoDia {
  let r: Reparto = { ...REPARTO_CERO }
  let algo = false
  let sinDatos = 0
  let fuera = false
  for (const e of entradas) {
    if (e.origen === 'libre') {
      fuera = true
      continue
    }
    if (e.recipe_id) {
      const p = repartos.get(e.recipe_id)
      if (p) {
        r = sumarReparto(r, p)
        algo = true
      } else sinDatos++
    }
    for (const s of e.extras ?? []) {
      const ing = ingredientes.get(s.ingredient_id)
      if (!ing || s.cantidad == null) continue
      const g = gramosSuelto(ing, s.cantidad)
      if (g == null) continue
      r[grupoPlato(ing)] += (g * factorCocinado(ing)) / (factorHogar || 1)
      algo = true
    }
  }
  return { reparto: algo ? r : null, sinDatos, fuera }
}

/** ¿La receta tiene ingredientes vinculados al catálogo? (si no, no se sabe lo que lleva) */
export const conDatos = (r: Receta) => r.ingredientes.some((l) => l.ingredient_id || l.sub_recipe_id)
