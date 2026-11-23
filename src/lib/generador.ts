// Generador del menú semanal (sin IA): puntuación + búsqueda aleatoria con mejora local.
// Usa SOLO las recetas del recetario del hogar. Si faltan recetas para cumplir las reglas, lo dice.
// Cada comida o cena es un plato completo (lentejas) o un principal con 1-2 guarniciones (pollo + arroz + verduras).
// El equilibrio se mide por raciones de cada grupo en el día y en la semana (AESAN), no plato a plato.
import { aptaCenaRapida, papelDe, type Comensal, type Congelado, type EntradaPlan, type GrupoProteico, type Ingrediente, type Momento, type Origen, type Receta } from './tipos'
import { DIAS, fechasSemana } from './semana'
import { MACROS_CERO, sumarMacros, type Macros } from './nutricion'
import { MACROS_ESTIMADOS, desajuste, diaPersona } from './objetivos'
import type { Reparto } from './plato'
import { PORCIONES_CERO, desajustePorciones, porcionesEstimadas, porcionesPersona, sumarPorciones, tipoGuarnicion, type Porciones } from './grupos'

export const MOMENTOS: Momento[] = ['comida', 'cena']

/** Días que aguanta en nevera si la receta no lo dice */
export const NEVERA_POR_DEFECTO = 3

/** Comidas que se proponen cocinar de más para congelar cada semana (para la siguiente) */
export const CONGELAR_POR_SEMANA = 2

export interface Hueco {
  dia: number // 0 = lunes
  fecha: string
  momento: Momento
}

export interface Opcion {
  recipe_id: string
  origen: Origen
  freezer_item_id: string | null
}

export interface ContextoMenu {
  lunes: string
  recetas: Receta[]
  /** proteína por ración de cada receta (null si no se sabe) */
  proteina: Map<string, number | null>
  /** kcal y macros por ración de cada receta (null si no se sabe) */
  macros?: Map<string, Macros | null>
  /** reparto del método del plato por ración de cada receta (solo informativo) */
  platos?: Map<string, Reparto | null>
  /** raciones de cada grupo (verdura, hidratos…) por ración de cada receta (null si no se sabe) */
  porciones?: Map<string, Porciones | null>
  /** catálogo (para las kcal de los alimentos sueltos) */
  ingredientes?: Map<string, Ingrediente>
  comensales: Comensal[]
  /** uso interno: lo que ya se come cada día (desayuno, alimentos sueltos y recetas añadidas fijadas), por comensal */
  baseDia?: Map<string, Macros[]>
  /** uso interno: raciones de cada grupo que ya se comen cada día, por comensal */
  basePorciones?: Map<string, Porciones[]>
  /** uso interno: lo que suele sumar acompañar un principal con sus guarniciones */
  acomp?: Acompanamiento
  /** congelador disponible (raciones que quedan, sin contar lo ya reservado por las entradas fijas) */
  congelados: Congelado[]
  raciones: number
  /** comidas a cocinar de más para congelar cada semana (por defecto 2; 0 = ninguna) */
  congelarPorSemana?: number
}

// ---------------------------------------------------------
// Reglas duras
// ---------------------------------------------------------
export const esPlato = (r: Receta) => !r.es_base && r.tipo_comida !== 'desayuno'
export const esDesayuno = (r: Receta) => !r.es_base && r.tipo_comida === 'desayuno'
export const esGuarnicion = (r: Receta) => esPlato(r) && papelDe(r) === 'guarnicion'
export const esPrincipal = (r: Receta) => esPlato(r) && papelDe(r) === 'principal'
export const sirvePara = (r: Receta, m: Momento) => (m === 'desayuno' ? r.tipo_comida === 'desayuno' : r.tipo_comida === 'ambas' || r.tipo_comida === m)
export const MOMENTOS_DIA: Momento[] = ['desayuno', 'comida', 'cena']
export const esCenaEntreSemana = (h: Pick<Hueco, 'dia' | 'momento'>) => h.momento === 'cena' && h.dia <= 4
/** Lunes y martes a mediodía se come lo cocinado el domingo */
export const esComidaDeBatch = (h: Pick<Hueco, 'dia' | 'momento'>) => h.momento === 'comida' && h.dia <= 1
/** Comidas en las que se pueden comer las sobras de la cena del día anterior (de miércoles a domingo) */
export const admiteSobras = (h: Pick<Hueco, 'dia' | 'momento'>) => h.momento === 'comida' && h.dia >= 2
/** Las sobras se prefieren entre semana (no hay que cocinar a mediodía) */
const sobrasEntreSemana = (h: Pick<Hueco, 'dia' | 'momento'>) => admiteSobras(h) && h.dia <= 4

/** ¿Aguanta en nevera desde el domingo hasta este día? */
export const aguantaNevera = (r: Receta, dia: number) => dia + 1 <= (r.dias_nevera ?? NEVERA_POR_DEFECTO)
/** Cocinado el domingo y servible este día (de la nevera, o congelado y descongelado) */
export const sirveDeBatch = (r: Receta, dia: number) => aguantaNevera(r, dia) || r.congelable
/** ¿Se puede cocinar el doble en la cena y comer las sobras al día siguiente? */
export const daSobras = (r: Receta) => (r.dias_nevera ?? NEVERA_POR_DEFECTO) >= 2 && sirvePara(r, 'comida') && sirvePara(r, 'cena')

export function huecos(lunes: string): Hueco[] {
  return fechasSemana(lunes).flatMap((fecha, dia) => MOMENTOS.map((momento) => ({ dia, fecha, momento })))
}

/** ¿Vale para lo que se busca? «plato» = lo principal del hueco (completo o principal); «guarnicion» = lo que se añade */
const encaja = (r: Receta, m: Momento, que: 'plato' | 'guarnicion') =>
  !r.es_base && sirvePara(r, m) && (m === 'desayuno' || (que === 'guarnicion' ? papelDe(r) === 'guarnicion' : papelDe(r) !== 'guarnicion'))

/** Opciones válidas para un hueco según las reglas duras (sin mirar el resto del día) */
export function opcionesHueco(h: Hueco, ctx: ContextoMenu, disponibleCongelado: Map<string, number>, que: 'plato' | 'guarnicion' = 'plato'): Opcion[] {
  const res: Opcion[] = []
  for (const r of ctx.recetas) {
    if (!encaja(r, h.momento, que)) continue
    if (h.momento === 'desayuno') {
      res.push({ recipe_id: r.id, origen: 'fresco', freezer_item_id: null })
    } else if (esComidaDeBatch(h)) {
      if (sirveDeBatch(r, h.dia)) res.push({ recipe_id: r.id, origen: 'batch', freezer_item_id: null })
    } else if (esCenaEntreSemana(h)) {
      if (aptaCenaRapida(r)) res.push({ recipe_id: r.id, origen: 'fresco', freezer_item_id: null })
      else if (h.dia <= 2 && sirveDeBatch(r, h.dia)) res.push({ recipe_id: r.id, origen: 'batch', freezer_item_id: null })
    } else {
      res.push({ recipe_id: r.id, origen: 'fresco', freezer_item_id: null })
    }
  }
  if (que === 'guarnicion') return res
  // Lo que hay en el congelador vale para cualquier hueco (solo calentar)
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  for (const c of ctx.congelados) {
    const r = c.recipe_id ? recetas.get(c.recipe_id) : undefined
    if (!r || !encaja(r, h.momento, 'plato')) continue
    if ((disponibleCongelado.get(c.id) ?? 0) + 0.01 < ctx.raciones) continue
    res.push({ recipe_id: r.id, origen: 'congelador', freezer_item_id: c.id })
  }
  return res
}

/** La cena del día anterior (de la que salen las sobras de una comida) */
export function cenaAnterior<T extends Pick<EntradaPlan, 'fecha' | 'momento' | 'orden'>>(entradas: T[], fecha: string, lunes: string): T | undefined {
  const fechas = fechasSemana(lunes)
  const i = fechas.indexOf(fecha)
  if (i <= 0) return undefined
  return entradas.find((e) => e.fecha === fechas[i - 1] && e.momento === 'cena' && ordenDe(e) === 0)
}

/** La comida del día siguiente si son las sobras de esta cena */
export function comidaConSobras<T extends Pick<EntradaPlan, 'fecha' | 'momento' | 'orden' | 'origen' | 'recipe_id'>>(entradas: T[], cena: T, lunes: string): T | undefined {
  if (cena.momento !== 'cena' || !cena.recipe_id) return undefined
  const fechas = fechasSemana(lunes)
  const i = fechas.indexOf(cena.fecha)
  if (i < 0 || i >= 6) return undefined
  return entradas.find((e) => e.fecha === fechas[i + 1] && e.momento === 'comida' && ordenDe(e) === 0 && e.origen === 'sobras' && e.recipe_id === cena.recipe_id)
}

// ---------------------------------------------------------
// Indicadores AESAN y proteína
// ---------------------------------------------------------
export interface Indicadores {
  huecosPlanificados: number
  escala: number
  legumbre: number
  pescado: number
  pescadoAzul: number
  carne: number
  carneRoja: number
  huevo: number
  vegetal: number
  sinGrupo: number
  /** proteína por comensal y día (null si no hay datos de algún plato) */
  proteinaDia: Map<string, number[]>
  /** platos sin dato de proteína */
  sinProteina: number
}

type EntradaMin = Pick<EntradaPlan, 'fecha' | 'momento' | 'recipe_id' | 'origen'> & Partial<Pick<EntradaPlan, 'orden'>>

/** Frecuencias AESAN con comida y cena (las guarniciones no cuentan); la proteína del día cuenta también el desayuno */
export function indicadores(entradas: EntradaMin[], ctx: Pick<ContextoMenu, 'lunes' | 'recetas' | 'proteina' | 'comensales'>, estimarDesconocida = 0): Indicadores {
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const fechas = fechasSemana(ctx.lunes)
  const ind: Indicadores = {
    huecosPlanificados: 0, escala: 0, legumbre: 0, pescado: 0, pescadoAzul: 0, carne: 0, carneRoja: 0, huevo: 0, vegetal: 0, sinGrupo: 0,
    proteinaDia: new Map(), sinProteina: 0,
  }
  const libres = entradas.filter((e) => e.origen === 'libre' && e.momento !== 'desayuno' && ordenDe(e) === 0).length
  ind.huecosPlanificados = 14 - libres
  ind.escala = ind.huecosPlanificados / 14
  const protPlatos = fechas.map(() => 0)
  for (const e of entradas) {
    if (e.origen === 'libre' || !e.recipe_id) continue
    const r = recetas.get(e.recipe_id)
    if (!r) continue
    if (e.momento !== 'desayuno' && papelDe(r) !== 'guarnicion') contarGrupo(ind, r.grupo_proteico)
    const d = fechas.indexOf(e.fecha)
    const p = ctx.proteina.get(r.id)
    if (p == null) ind.sinProteina++
    if (d >= 0) protPlatos[d] += p ?? estimarDesconocida
  }
  for (const c of ctx.comensales) ind.proteinaDia.set(c.id, protPlatos.map((p) => p * c.factor))
  return ind
}

function contarGrupo(ind: Indicadores, g: GrupoProteico | null) {
  switch (g) {
    case 'legumbre': ind.legumbre++; break
    case 'pescado_blanco': ind.pescado++; break
    case 'pescado_azul': ind.pescado++; ind.pescadoAzul++; break
    case 'carne_blanca': ind.carne++; break
    case 'carne_roja': ind.carne++; ind.carneRoja++; break
    case 'huevo': ind.huevo++; break
    case 'vegetal': ind.vegetal++; break
    default: ind.sinGrupo++
  }
}

export type Semaforo = 'verde' | 'ambar' | 'rojo'
export interface Objetivo {
  clave: string
  etiqueta: string
  valor: number
  texto: string
  estado: Semaforo
}

/** Objetivos semanales de la AESAN, ajustados a los huecos que sí se planifican */
export function objetivos(ind: Indicadores): Objetivo[] {
  const s = ind.escala
  const r = (n: number) => Math.round(n * s)
  const minimo = (v: number, obj: number): Semaforo => (v >= obj ? 'verde' : v >= obj - 1 ? 'ambar' : 'rojo')
  const rango = (v: number, a: number, b: number): Semaforo => (v >= a && v <= b ? 'verde' : v >= a - 1 && v <= b + 1 ? 'ambar' : 'rojo')
  const maximo = (v: number, m: number): Semaforo => (v <= m ? 'verde' : v <= m + 1 ? 'ambar' : 'rojo')
  const leg = r(4), pa = r(3), pb = Math.max(r(4), 1), ca = r(3), cb = Math.max(r(4), 1)
  return [
    { clave: 'legumbre', etiqueta: '🫘 Legumbre', valor: ind.legumbre, texto: `${ind.legumbre} de ≥${leg}`, estado: minimo(ind.legumbre, leg) },
    {
      clave: 'pescado', etiqueta: '🐟 Pescado', valor: ind.pescado, texto: `${ind.pescado} (${ind.pescadoAzul} azul) de ${pa}-${pb}`,
      estado: rango(ind.pescado, pa, pb) === 'verde' && ind.pescadoAzul === 0 && s > 0.5 ? 'ambar' : rango(ind.pescado, pa, pb),
    },
    { clave: 'carne', etiqueta: '🍗 Carne', valor: ind.carne, texto: `${ind.carne} de ${ca}-${cb}`, estado: rango(ind.carne, ca, cb) },
    { clave: 'roja', etiqueta: '🥩 Carne roja', valor: ind.carneRoja, texto: `${ind.carneRoja} de máx. 2`, estado: ind.carneRoja <= 1 ? 'verde' : ind.carneRoja === 2 ? 'ambar' : 'rojo' },
    { clave: 'huevo', etiqueta: '🥚 Huevo', valor: ind.huevo, texto: `${ind.huevo} de máx. 4`, estado: maximo(ind.huevo, 4) },
  ]
}

export function semaforoProteina(g: number, c: Comensal): Semaforo {
  if (g >= c.protMin && g <= c.protMax * 1.1) return 'verde'
  if (g >= c.protMin * 0.85) return 'ambar'
  return 'rojo'
}

// ---------------------------------------------------------
// Raciones de cada grupo y acompañamientos
// ---------------------------------------------------------
export const ordenDe = (e: Pick<EntradaPlan, 'orden'>) => e.orden ?? 0

/** Lo que se supone que aporta un principal o una guarnición sin datos (un plato completo: MACROS_ESTIMADOS) */
const MACROS_PAPEL = {
  principal: { kcal: 330, proteina: 32, hidratos: 5, grasa: 18 },
  guarnicion: { kcal: 200, proteina: 5, hidratos: 32, grasa: 5 },
}
const cachePapeles = new WeakMap<Receta[], Map<string, Receta>>()
function recetaDe(ctx: Pick<ContextoMenu, 'recetas'>, id: string): Receta | undefined {
  if (!ctx.recetas) return undefined
  let m = cachePapeles.get(ctx.recetas)
  if (!m) cachePapeles.set(ctx.recetas, (m = new Map(ctx.recetas.map((r) => [r.id, r]))))
  return m.get(id)
}

/** Kcal y macros por ración de una receta (o lo que se supone si no tiene datos) */
export function macrosRacion(ctx: Pick<ContextoMenu, 'macros' | 'proteina'> & Partial<Pick<ContextoMenu, 'recetas'>>, id: string, momento: Momento): Macros {
  const m = ctx.macros?.get(id)
  if (m) return m
  const r = ctx.recetas ? recetaDe(ctx as Pick<ContextoMenu, 'recetas'>, id) : undefined
  const papel = r && momento !== 'desayuno' ? papelDe(r) : 'completo'
  const est = papel === 'completo' ? MACROS_ESTIMADOS[momento] : MACROS_PAPEL[papel]
  const p = ctx.proteina.get(id)
  return p != null ? { ...est, proteina: p } : est
}

/** Raciones de cada grupo por ración de una receta (o lo que se supone si no tiene datos) */
export function porcionesRacion(ctx: Pick<ContextoMenu, 'porciones'>, r: Receta, momento: Momento): Porciones {
  return ctx.porciones?.get(r.id) ?? porcionesEstimadas(r, momento)
}

/** Lo que suele sumar un acompañamiento: una guarnición de verdura y otra de hidratos (la media de las del recetario) */
export interface Acompanamiento {
  macros: Macros
  porciones: Porciones
  /** hay guarniciones en el recetario */
  hay: boolean
}

export function acompanamiento(ctx: ContextoMenu): Acompanamiento {
  const guarn = ctx.recetas.filter(esGuarnicion)
  const media = (rs: Receta[]) => {
    if (!rs.length) return null
    let m = { ...MACROS_CERO }
    let p = { ...PORCIONES_CERO }
    for (const r of rs) {
      m = sumarMacros(m, macrosRacion(ctx, r.id, 'comida'), 1 / rs.length)
      p = sumarPorciones(p, porcionesRacion(ctx, r, 'comida'), 1 / rs.length)
    }
    return { m, p }
  }
  const v = media(guarn.filter((r) => tipoGuarnicion(ctx.porciones?.get(r.id)) === 'verdura'))
  const h = media(guarn.filter((r) => tipoGuarnicion(ctx.porciones?.get(r.id)) !== 'verdura'))
  let macros = { ...MACROS_CERO }
  let porciones = { ...PORCIONES_CERO }
  for (const x of [v, h]) {
    if (!x) continue
    macros = sumarMacros(macros, x.m)
    porciones = sumarPorciones(porciones, x.p)
  }
  // Sin guarniciones en el recetario: se supone el típico acompañamiento (verdura + hidratos)
  if (!guarn.length) return { macros: { kcal: 250, proteina: 6, hidratos: 45, grasa: 6 }, porciones: { ...PORCIONES_CERO, verdura: 1, hidratos: 1 }, hay: false }
  return { macros, porciones, hay: true }
}

/** Lo que come cada uno ese día (con las recetas sin datos estimadas y un desayuno normal si está vacío) */
function macrosDia(ctx: ContextoMenu, delDia: EntradaPlan[], c: Comensal): Macros {
  const factorHogar = factorHogarDe(ctx)
  const m = diaPersona(delDia, c, mapaMacros(ctx, delDia), ctx.ingredientes ?? new Map(), factorHogar, true).macros
  return hayDesayuno(delDia) ? m : sumarMacros(m, MACROS_ESTIMADOS.desayuno, c.factor)
}

const hayDesayuno = (delDia: Pick<EntradaPlan, 'momento' | 'recipe_id' | 'extras' | 'origen'>[]) =>
  delDia.some((e) => e.momento === 'desayuno' && (e.recipe_id || e.extras?.length || e.origen === 'libre'))

function porcionesDia(ctx: ContextoMenu, delDia: EntradaPlan[], c: Comensal): Porciones {
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const p = porcionesPersona(delDia, c.factor, ctx.porciones ?? new Map(), ctx.ingredientes ?? new Map(), factorHogarDe(ctx), recetas)
  return hayDesayuno(delDia) ? p : sumarPorciones(p, porcionesEstimadas({}, 'desayuno'), c.factor)
}

/** Lo lejos que queda un día de los objetivos de kcal y macros de todos (0 = perfecto) */
export function desajusteDia(ctx: ContextoMenu, delDia: EntradaPlan[]): number {
  return ctx.comensales.reduce((s, c) => s + desajuste(macrosDia(ctx, delDia, c), c), 0)
}

/** Lo lejos que queda un día de las raciones recomendadas (verdura, hidratos, lácteos), de media entre los comensales */
export function desajusteRacionesDia(ctx: ContextoMenu, delDia: EntradaPlan[]): number {
  const cs = ctx.comensales.length ? ctx.comensales : [{ id: '_', nombre: '', factor: 1, protMin: 0, protMax: 0 }]
  return cs.reduce((s, c) => s + desajustePorciones(porcionesDia(ctx, delDia, c)), 0) / cs.length
}

/** Puntuación de un día entero (lo que se minimiza al añadir guarniciones) */
export function costeDia(ctx: ContextoMenu, delDia: EntradaPlan[]): number {
  const libre = delDia.some((e) => e.origen === 'libre' && e.momento !== 'desayuno')
  if (libre) return 0
  return (ctx.comensales.length ? desajusteDia(ctx, delDia) : 0) + desajusteRacionesDia(ctx, delDia)
}

const factorHogarDe = (ctx: Pick<ContextoMenu, 'comensales'>) => ctx.comensales.reduce((s, c) => s + c.factor, 0) || 1

function mapaMacros(ctx: ContextoMenu, entradas: Pick<EntradaPlan, 'recipe_id' | 'momento'>[]): Map<string, Macros | null> {
  const m = new Map<string, Macros | null>()
  for (const e of entradas) if (e.recipe_id) m.set(e.recipe_id, macrosRacion(ctx, e.recipe_id, e.momento))
  return m
}

// ---------------------------------------------------------
// Puntuación (cuanto más baja, mejor)
// ---------------------------------------------------------
interface Asignada extends Opcion {
  dia: number
  momento: Momento
  fijada: boolean
}

/** Premio por comer sobras entre semana (una comida menos que cocinar) */
const PREMIO_SOBRAS = 0.9

function penalizacion(asig: (Asignada | null)[], ctx: ContextoMenu, recetas: Map<string, Receta>, libres: Set<number>): number {
  const ind: Indicadores = {
    huecosPlanificados: 14 - libres.size, escala: (14 - libres.size) / 14, legumbre: 0, pescado: 0, pescadoAzul: 0, carne: 0, carneRoja: 0, huevo: 0, vegetal: 0, sinGrupo: 0,
    proteinaDia: new Map(), sinProteina: 0,
  }
  const acomp = ctx.acomp ?? acompanamiento(ctx)
  const platosDia: Macros[] = [0, 1, 2, 3, 4, 5, 6].map(() => ({ ...MACROS_CERO }))
  const porcDia: Porciones[] = [0, 1, 2, 3, 4, 5, 6].map(() => ({ ...PORCIONES_CERO }))
  let p = 0
  for (let i = 0; i < asig.length; i++) {
    const a = asig[i]
    if (!a) continue
    const r = recetas.get(a.recipe_id)!
    contarGrupo(ind, r.grupo_proteico)
    platosDia[a.dia] = sumarMacros(platosDia[a.dia], macrosRacion(ctx, a.recipe_id, a.momento))
    porcDia[a.dia] = sumarPorciones(porcDia[a.dia], porcionesRacion(ctx, r, a.momento))
    // Un principal lleva guarniciones: cuenta lo que suelen sumar
    if (papelDe(r) === 'principal') {
      platosDia[a.dia] = sumarMacros(platosDia[a.dia], acomp.macros)
      porcDia[a.dia] = sumarPorciones(porcDia[a.dia], acomp.porciones)
      if (!acomp.hay) p += 0.3
    }
    // Sobras: tienen que ser de la cena de ayer
    if (a.origen === 'sobras') {
      const cena = asig[i - 1]
      if (!cena || cena.recipe_id !== a.recipe_id || cena.origen === 'congelador' || cena.origen === 'sobras') p += 30
      else if (sobrasEntreSemana(a)) p -= PREMIO_SOBRAS
    }
  }
  const s = ind.escala
  // Frecuencias AESAN
  p += 3 * Math.max(0, 4 * s - ind.legumbre)
  p += 3 * Math.max(0, 3 * s - ind.pescado) + 1 * Math.max(0, ind.pescado - 4 * s)
  if (ind.pescadoAzul === 0 && s > 0.5) p += 2
  p += 1 * Math.max(0, 3 * s - ind.carne) + 1.5 * Math.max(0, ind.carne - 4 * s)
  p += 1.5 * Math.max(0, ind.carneRoja - 1) + 3 * Math.max(0, ind.carneRoja - 2)
  p += 2.5 * Math.max(0, ind.huevo - 4 * s)
  p += 0.5 * ind.sinGrupo
  // Kcal, macros y raciones de cada grupo de cada uno, cada día (solo días con todo planificado)
  const cs = ctx.comensales.length ? ctx.comensales : null
  for (let d = 0; d < 7; d++) {
    const completo = asig[d * 2] && asig[d * 2 + 1]
    if (!completo || libres.has(d * 2) || libres.has(d * 2 + 1)) continue
    if (cs) {
      let porc = 0
      for (const c of cs) {
        p += desajuste(sumarMacros(ctx.baseDia?.get(c.id)?.[d] ?? MACROS_ESTIMADOS.desayuno, platosDia[d], c.factor), c)
        porc += desajustePorciones(sumarPorciones(ctx.basePorciones?.get(c.id)?.[d] ?? porcionesEstimadas({}, 'desayuno'), porcDia[d], c.factor))
      }
      p += porc / cs.length
    } else p += desajustePorciones(sumarPorciones(porcionesEstimadas({}, 'desayuno'), porcDia[d]))
  }
  // Variedad, preferencias, congelador y bases reutilizadas
  const usos = new Map<string, number>()
  const usosBase = new Map<string, number>()
  for (let i = 0; i < asig.length; i++) {
    const a = asig[i]
    if (!a) continue
    const r = recetas.get(a.recipe_id)!
    // las sobras son el mismo guiso: no cuentan como repetir
    if (a.origen !== 'sobras') {
      const n = (usos.get(a.recipe_id) ?? 0) + 1
      usos.set(a.recipe_id, n)
      if (n > 1) p += 1.6 * (n - 1)
    }
    // mismo grupo en comida y cena del mismo día
    if (i % 2 === 1 && asig[i - 1]) {
      const otro = recetas.get(asig[i - 1]!.recipe_id)!
      if (r.grupo_proteico && r.grupo_proteico === otro.grupo_proteico) p += 0.8
    }
    p -= 0.35 * ((r.valoracion ?? 3) - 3) + (r.favorita ? 0.4 : 0)
    if (a.origen === 'congelador') {
      const c = ctx.congelados.find((x) => x.id === a.freezer_item_id)
      const antig = c ? Math.max(0, (Date.now() - new Date(c.congelado_en).getTime()) / 86400000) : 0
      p -= 1.5 + Math.min(1, antig / 60)
    }
    if (a.origen === 'batch' && !esComidaDeBatch(a)) p += 0.3 // mejor fresco si se puede
    for (const l of r.ingredientes) if (l.sub_recipe_id) usosBase.set(l.sub_recipe_id, (usosBase.get(l.sub_recipe_id) ?? 0) + 1)
  }
  for (const n of usosBase.values()) if (n > 1) p -= 0.8 * Math.min(n - 1, 2)
  return p
}

// ---------------------------------------------------------
// Generar
// ---------------------------------------------------------
export interface ResultadoMenu {
  entradas: EntradaPlan[]
  avisos: string[]
}

type OpcionesGenerar = { rnd?: () => number; intentos?: number; soloHueco?: { fecha: string; momento: Momento } }

/**
 * Propone la semana (desayuno, comida y cena). `actuales` son las entradas que ya hay: se respetan las fijadas
 * y los huecos libres; el resto se vuelve a elegir. Con `soloHueco` solo se cambia la receta principal de ese hueco.
 * Después pone guarniciones a los principales (y, si el día lo pide, a algún plato completo o desayuno)
 * y propone qué cocinar de más para congelar.
 */
export function generarMenu(ctx: ContextoMenu, actuales: EntradaPlan[], opciones: OpcionesGenerar = {}): ResultadoMenu {
  const rnd = opciones.rnd ?? Math.random
  if (!ctx.acomp) ctx = { ...ctx, acomp: acompanamiento(ctx) }
  const principales = actuales.filter((e) => ordenDe(e) === 0)
  const anadidas = actuales.filter((e) => ordenDe(e) > 0)
  const fijadas = opciones.soloHueco ? anadidas : anadidas.filter((e) => e.fijado)
  const desActuales = principales.filter((e) => e.momento === 'desayuno')
  const resto = principales.filter((e) => e.momento !== 'desayuno')
  const solo = opciones.soloHueco
  const desayunos = solo && solo.momento !== 'desayuno' ? desActuales : generarDesayunos(ctx, desActuales, rnd, solo?.fecha)
  if (solo?.momento === 'desayuno') return { entradas: [...desayunos, ...resto, ...fijadas], avisos: [] }
  // Lo que ya se come cada día (desayuno, sueltos y recetas añadidas que se mantienen), para equilibrar el resto
  const fechas = fechasSemana(ctx.lunes)
  const conocido = [...desayunos, ...fijadas, ...resto.map((e) => ({ ...e, recipe_id: null, origen: 'fresco' as Origen }))]
  const baseDia = new Map(ctx.comensales.map((c) => [c.id, fechas.map((f) => macrosDia(ctx, conocido.filter((e) => e.fecha === f), c))]))
  const basePorciones = new Map(ctx.comensales.map((c) => [c.id, fechas.map((f) => porcionesDia(ctx, conocido.filter((e) => e.fecha === f), c))]))
  const r = generarComidasCenas({ ...ctx, baseDia, basePorciones }, resto, opciones)
  const base = [...desayunos, ...r.entradas, ...fijadas]
  if (solo) {
    // Si el nuevo plato es un principal, se le ponen guarniciones (las que había en ese hueco se cambian)
    const nuevo = r.entradas.find((e) => e.fecha === solo.fecha && e.momento === solo.momento && ordenDe(e) === 0)
    const sinHueco = base.filter((e) => !(e.fecha === solo.fecha && e.momento === solo.momento && ordenDe(e) > 0 && !e.fijado))
    const nuevas = nuevo ? complementar(ctx, sinHueco, rnd, solo) : []
    return { entradas: [...sinHueco, ...nuevas], avisos: r.avisos }
  }
  const nuevas = complementar(ctx, base, rnd)
  const todas = proponerCongelar(ctx, [...base, ...nuevas])
  return { entradas: todas, avisos: r.avisos }
}

/** Recetas que se pueden añadir a un hueco que ya tiene su plato: guarniciones (o, en el desayuno, otra receta de desayuno) */
function candidatasAnadir(ctx: ContextoMenu, dia: number, fecha: string, momento: Momento, delDia: EntradaPlan[]): Opcion[] {
  const usadas = new Set(delDia.map((e) => e.recipe_id).filter(Boolean))
  return opcionesHueco({ dia, fecha, momento }, ctx, new Map(), 'guarnicion').filter((o) => !usadas.has(o.recipe_id))
}

const nuevaAnadida = (ctx: ContextoMenu, fecha: string, momento: Momento, orden: number, o: Opcion): EntradaPlan => ({
  fecha, momento, orden, recipe_id: o.recipe_id, raciones: ctx.raciones, origen: o.origen, freezer_item_id: null, fijado: false, nota: null, extras: [], cocinar_extra: 0, extra_congelado: false,
})

/** Lo que cuesta añadir una guarnición a un principal (mejor 1-2) y a un plato completo o desayuno (solo si hace falta) */
const COSTE_GUARNICION = 0.15
const COSTE_ANADIR_COMPLETO = 0.9

/**
 * Pone 1 o 2 guarniciones a cada principal (pollo + arroz + verduras), eligiendo las que mejor dejan el día
 * (raciones de verdura e hidratos, kcal y macros). A un plato completo o a un desayuno solo se le añade algo
 * si el día lo necesita de verdad (por ejemplo, una ensalada con unas lentejas).
 */
function complementar(ctx: ContextoMenu, entradas: EntradaPlan[], rnd: () => number, solo?: { fecha: string; momento: Momento }): EntradaPlan[] {
  const usos = new Map<string, number>()
  for (const e of entradas) if (e.recipe_id) usos.set(e.recipe_id, (usos.get(e.recipe_id) ?? 0) + 1)
  const nuevas: EntradaPlan[] = []
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const variedad = (id: string) => 0.5 * (usos.get(id) ?? 0)
  fechasSemana(ctx.lunes).forEach((fecha, dia) => {
    const delDia = entradas.filter((e) => e.fecha === fecha)
    if (delDia.some((e) => e.origen === 'libre' && e.momento !== 'desayuno')) return
    for (const momento of MOMENTOS_DIA) {
      if (solo && !(solo.fecha === fecha && solo.momento === momento)) continue
      const delHueco = delDia.filter((e) => e.momento === momento)
      const principal = delHueco.find((e) => ordenDe(e) === 0 && e.recipe_id)
      if (!principal || delHueco.some((e) => e.origen === 'libre') || delHueco.some((e) => ordenDe(e) > 0)) continue
      const rp = recetas.get(principal.recipe_id!)
      if (!rp) continue
      const esPrin = momento !== 'desayuno' && papelDe(rp) === 'principal'
      const orden = 1
      // Sobras: las mismas guarniciones que la cena de ayer
      if (principal.origen === 'sobras') {
        const ayer = fechasSemana(ctx.lunes)[dia - 1]
        const guarnAyer = entradas.concat(nuevas).filter((e) => e.fecha === ayer && e.momento === 'cena' && ordenDe(e) > 0 && e.recipe_id)
        for (const g of guarnAyer) {
          if (delDia.some((x) => x.recipe_id === g.recipe_id)) continue
          const e = { ...nuevaAnadida(ctx, fecha, momento, ordenDe(g), { recipe_id: g.recipe_id!, origen: 'sobras', freezer_item_id: null }) }
          delDia.push(e)
          nuevas.push(e)
        }
        if (guarnAyer.length || !esPrin) continue
      }
      const cands = candidatasAnadir(ctx, dia, fecha, momento, delDia)
      if (!cands.length) continue
      const base = costeDia(ctx, delDia)
      const coste = esPrin ? COSTE_GUARNICION : COSTE_ANADIR_COMPLETO
      // Un principal sin guarniciones queda cojo: se pone al menos una
      let mejor: EntradaPlan[] = []
      let mejorP = esPrin ? Infinity : base
      const solas = cands.map((o) => {
        const e = nuevaAnadida(ctx, fecha, momento, orden, o)
        return { e, p: costeDia(ctx, [...delDia, e]) + variedad(o.recipe_id) + coste + 0.15 * rnd() }
      })
      for (const x of solas) if (x.p < mejorP) [mejorP, mejor] = [x.p, [x.e]]
      // Dos guarniciones (entre las que mejor van solas): lo normal con un principal es verdura + hidratos
      const top = [...solas].sort((a, b) => a.p - b.p).slice(0, 10)
      for (let i = 0; i < top.length; i++)
        for (let j = i + 1; j < top.length; j++) {
          const a = top[i].e
          const b = { ...top[j].e, orden: orden + 1 }
          if (a.recipe_id === b.recipe_id) continue
          const tipos = new Set([a, b].map((x) => tipoGuarnicion(ctx.porciones?.get(x.recipe_id!))))
          const mezcla = tipos.has('verdura') && tipos.has('hidratos') ? -0.1 : 0.2
          const p = costeDia(ctx, [...delDia, a, b]) + variedad(a.recipe_id!) + variedad(b.recipe_id!) + 2 * coste + mezcla + 0.15 * rnd()
          if (p < mejorP) [mejorP, mejor] = [p, [a, b]]
        }
      for (const e of mejor) {
        delDia.push(e)
        nuevas.push(e)
        usos.set(e.recipe_id!, (usos.get(e.recipe_id!) ?? 0) + 1)
      }
    }
  })
  return nuevas
}

/** Otra receta para una receta añadida (guarnición) de un hueco: la que mejor ajuste el día */
export function otraAnadida(ctx: ContextoMenu, entradas: EntradaPlan[], e: EntradaPlan, rnd: () => number = Math.random): EntradaPlan | null {
  const fechas = fechasSemana(ctx.lunes)
  const dia = fechas.indexOf(e.fecha)
  const mismo = (x: EntradaPlan) => x.fecha === e.fecha && x.momento === e.momento && ordenDe(x) === ordenDe(e)
  const delDia = entradas.filter((x) => x.fecha === e.fecha && !mismo(x))
  const usos = new Map<string, number>()
  for (const x of entradas) if (x.recipe_id) usos.set(x.recipe_id, (usos.get(x.recipe_id) ?? 0) + 1)
  // misma clase de guarnición si se puede (cambiar arroz por quinoa, no por ensalada)
  const tipo = e.recipe_id ? tipoGuarnicion(ctx.porciones?.get(e.recipe_id)) : 'otra'
  let mejor: EntradaPlan | null = null
  let mejorP = Infinity
  for (const o of candidatasAnadir(ctx, dia, e.fecha, e.momento, delDia)) {
    if (o.recipe_id === e.recipe_id) continue
    const cand = { ...e, recipe_id: o.recipe_id, origen: o.origen, freezer_item_id: null, fijado: false }
    const otroTipo = tipo !== 'otra' && tipoGuarnicion(ctx.porciones?.get(o.recipe_id)) !== tipo ? 1 : 0
    const p = costeDia(ctx, [...delDia, cand]) + otroTipo + 0.4 * (usos.get(o.recipe_id) ?? 0) + 0.8 * rnd()
    if (p < mejorP) {
      mejorP = p
      mejor = cand
    }
  }
  return mejor
}

/**
 * Propone cocinar de más algunos platos congelables para tener comidas hechas la semana siguiente:
 * primero lo que ya se cocina el domingo, luego el fin de semana, luego entre semana. Recetas distintas y,
 * a ser posible, que no estén ya en el congelador. Respeta lo fijado.
 */
export function proponerCongelar(ctx: ContextoMenu, entradas: EntradaPlan[]): EntradaPlan[] {
  const objetivo = ctx.congelarPorSemana ?? CONGELAR_POR_SEMANA
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const fechas = fechasSemana(ctx.lunes)
  const res = entradas.map((e) => (e.fijado ? e : { ...e, cocinar_extra: 0 }))
  const ya = res.filter((e) => (e.cocinar_extra ?? 0) > 0)
  let faltan = objetivo - new Set(ya.map((e) => e.recipe_id)).size
  if (faltan <= 0) return res
  const enCongelador = new Set(ctx.congelados.filter((c) => c.raciones > 0.5).map((c) => c.recipe_id))
  const elegidas = new Set(ya.map((e) => e.recipe_id))
  const prioridad = (e: EntradaPlan) => {
    const dia = fechas.indexOf(e.fecha)
    return (e.origen === 'batch' ? 0 : dia >= 5 ? 1 : 2) + (enCongelador.has(e.recipe_id) ? 3 : 0) + (e.momento === 'cena' ? 0.5 : 0) + (comidaConSobras(res, e, ctx.lunes) ? 1.5 : 0)
  }
  const candidatas = res
    .filter((e) => !e.fijado && ordenDe(e) === 0 && e.recipe_id && (e.origen === 'fresco' || e.origen === 'batch'))
    .filter((e) => {
      const r = recetas.get(e.recipe_id!)
      return r && r.congelable
    })
    .sort((a, b) => prioridad(a) - prioridad(b) || a.fecha.localeCompare(b.fecha))
  for (const e of candidatas) {
    if (faltan <= 0) break
    if (elegidas.has(e.recipe_id)) continue
    elegidas.add(e.recipe_id)
    e.cocinar_extra = ctx.raciones
    faltan--
  }
  return res
}

/** Desayunos: recetas de tipo desayuno, con variedad suave (repetir desayuno es normal) */
function generarDesayunos(ctx: ContextoMenu, actuales: EntradaPlan[], rnd: () => number, soloFecha?: string): EntradaPlan[] {
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const actual = new Map(actuales.map((e) => [e.fecha, e]))
  const fechas = fechasSemana(ctx.lunes)
  const cambia = (f: string) => {
    const e = actual.get(f)
    return soloFecha ? f === soloFecha : !(e && (e.fijado || e.origen === 'libre'))
  }
  const disp = new Map(ctx.congelados.map((c) => [c.id, c.raciones]))
  for (const e of actuales) if (e.freezer_item_id && cambia(e.fecha)) disp.set(e.freezer_item_id, (disp.get(e.freezer_item_id) ?? 0) + e.raciones)
  const usos = new Map<string, number>()
  for (const e of actuales) if (e.recipe_id && !cambia(e.fecha)) usos.set(e.recipe_id, (usos.get(e.recipe_id) ?? 0) + 1)
  return fechas.map((fecha, dia) => {
    const e = actual.get(fecha)
    if (!cambia(fecha)) return { ...e! }
    let mejor: Opcion | null = null
    let mejorP = Infinity
    for (const o of opcionesHueco({ dia, fecha, momento: 'desayuno' }, ctx, disp)) {
      const r = recetas.get(o.recipe_id)!
      let p = 0.5 * (usos.get(o.recipe_id) ?? 0) - 0.35 * ((r.valoracion ?? 3) - 3) - (r.favorita ? 0.4 : 0) + rnd() * 1.2
      // un poco mejor si lleva fruta o algo de verdura
      const porc = ctx.porciones?.get(r.id)
      if (porc) p -= 0.3 * Math.min(1, porc.fruta + porc.verdura)
      if (o.origen === 'congelador') p -= 1.5
      if (soloFecha && e?.recipe_id === o.recipe_id) p += 3 // «otro desayuno»: mejor uno distinto
      if (p < mejorP) {
        mejorP = p
        mejor = o
      }
    }
    if (mejor) {
      usos.set(mejor.recipe_id, (usos.get(mejor.recipe_id) ?? 0) + 1)
      if (mejor.freezer_item_id) disp.set(mejor.freezer_item_id, (disp.get(mejor.freezer_item_id) ?? 0) - ctx.raciones)
    }
    return {
      id: e?.id, fecha, momento: 'desayuno', orden: 0, recipe_id: mejor?.recipe_id ?? null, raciones: ctx.raciones, origen: mejor?.origen ?? 'fresco',
      freezer_item_id: mejor?.freezer_item_id ?? null, fijado: false, nota: null, extras: e?.extras ?? [], cocinar_extra: 0, extra_congelado: false,
    }
  })
}

function generarComidasCenas(ctx: ContextoMenu, actuales: EntradaPlan[], opciones: OpcionesGenerar = {}): ResultadoMenu {
  const rnd = opciones.rnd ?? Math.random
  const intentos = opciones.intentos ?? 30
  const hs = huecos(ctx.lunes)
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const actual = new Map(actuales.map((e) => [`${e.fecha}|${e.momento}`, e]))

  // Qué se mantiene
  const libres = new Set<number>()
  const fijas: (Asignada | null)[] = hs.map((h, i) => {
    const e = actual.get(`${h.fecha}|${h.momento}`)
    const mantener = e && (opciones.soloHueco ? !(e.fecha === opciones.soloHueco.fecha && e.momento === opciones.soloHueco.momento) : e.fijado || e.origen === 'libre')
    if (!e || !mantener) return null
    if (e.origen === 'libre') {
      libres.add(i)
      return null
    }
    if (!e.recipe_id || !recetas.has(e.recipe_id)) return null
    return { recipe_id: e.recipe_id, origen: e.origen, freezer_item_id: e.freezer_item_id, dia: h.dia, momento: h.momento, fijada: true }
  })
  // Con soloHueco, el resto de entradas actuales se mantienen tal cual
  if (opciones.soloHueco) {
    hs.forEach((h, i) => {
      if (fijas[i] || libres.has(i)) return
      if (h.fecha === opciones.soloHueco!.fecha && h.momento === opciones.soloHueco!.momento) return
      const e = actual.get(`${h.fecha}|${h.momento}`)
      if (e?.recipe_id && recetas.has(e.recipe_id)) fijas[i] = { recipe_id: e.recipe_id, origen: e.origen, freezer_item_id: e.freezer_item_id, dia: h.dia, momento: h.momento, fijada: true }
    })
  }

  // Congelador: lo que ya reservan las entradas actuales que se van a cambiar vuelve a estar disponible
  const dispBase = new Map(ctx.congelados.map((c) => [c.id, c.raciones]))
  for (const e of actuales) {
    if (!e.freezer_item_id) continue
    const i = hs.findIndex((h) => h.fecha === e.fecha && h.momento === e.momento)
    if (i >= 0 && !fijas[i]) dispBase.set(e.freezer_item_id, (dispBase.get(e.freezer_item_id) ?? 0) + e.raciones)
  }
  const ctxDisp: ContextoMenu = { ...ctx, congelados: ctx.congelados.map((c) => ({ ...c, raciones: dispBase.get(c.id) ?? c.raciones })) }

  const pendientes = hs
    .map((_, i) => i)
    .filter((i) => !fijas[i] && !libres.has(i))
    .filter((i) => !opciones.soloHueco || (hs[i].fecha === opciones.soloHueco.fecha && hs[i].momento === opciones.soloHueco.momento))
  // Primero lo más restringido: comidas de lunes y martes, cenas entre semana, el resto
  const prioridad = (i: number) => (esComidaDeBatch(hs[i]) ? 0 : esCenaEntreSemana(hs[i]) ? 1 : 2)

  let mejor: (Asignada | null)[] = fijas
  let mejorP = Infinity

  for (let t = 0; t < intentos; t++) {
    const asig = [...fijas]
    const disp = new Map(dispBase)
    const orden = [...pendientes].sort((a, b) => prioridad(a) - prioridad(b) || rnd() - 0.5)
    for (const i of orden) {
      const elegida = elegir(i, asig, disp, hs, ctxDisp, recetas, libres, rnd, 1.6)
      asig[i] = elegida
      if (elegida?.freezer_item_id) disp.set(elegida.freezer_item_id, (disp.get(elegida.freezer_item_id) ?? 0) - ctx.raciones)
    }
    // Mejora local: probar cada hueco con todas sus opciones
    for (let pasada = 0; pasada < 3; pasada++) {
      let cambio = false
      for (const i of pendientes) {
        const previa = asig[i]
        if (previa?.freezer_item_id) disp.set(previa.freezer_item_id, (disp.get(previa.freezer_item_id) ?? 0) + ctx.raciones)
        asig[i] = null
        const elegida = elegir(i, asig, disp, hs, ctxDisp, recetas, libres, rnd, 0) ?? previa
        asig[i] = elegida
        if (elegida?.freezer_item_id) disp.set(elegida.freezer_item_id, (disp.get(elegida.freezer_item_id) ?? 0) - ctx.raciones)
        if (elegida?.recipe_id !== previa?.recipe_id || elegida?.origen !== previa?.origen) cambio = true
      }
      if (!cambio) break
    }
    // Sobras que se han quedado sin su cena (porque la cena cambió después): se cocinan ese día
    for (const i of pendientes) {
      const a = asig[i]
      if (a?.origen === 'sobras' && asig[i - 1]?.recipe_id !== a.recipe_id) asig[i] = { ...a, origen: esComidaDeBatch(a) ? 'batch' : 'fresco' }
    }
    const p = penalizacion(asig, ctx, recetas, libres) + 50 * asig.filter((a, i) => !a && !libres.has(i)).length
    if (p < mejorP) {
      mejorP = p
      mejor = asig
    }
  }

  const entradas: EntradaPlan[] = hs.map((h, i) => {
    const e = actual.get(`${h.fecha}|${h.momento}`)
    if (libres.has(i)) return { ...(e as EntradaPlan) }
    const a = mejor[i]
    const seMantiene = a && fijas[i] && e
    if (seMantiene) return { ...e! }
    return {
      id: e?.id,
      fecha: h.fecha,
      momento: h.momento,
      orden: 0,
      recipe_id: a?.recipe_id ?? null,
      raciones: ctx.raciones,
      origen: a?.origen ?? 'fresco',
      freezer_item_id: a?.freezer_item_id ?? null,
      fijado: false,
      nota: null,
      extras: e?.extras ?? [],
      cocinar_extra: 0,
      extra_congelado: false,
    }
  })

  return { entradas, avisos: avisosMenu(entradas, ctx) }
}

function elegir(
  i: number,
  asig: (Asignada | null)[],
  disp: Map<string, number>,
  hs: Hueco[],
  ctx: ContextoMenu,
  recetas: Map<string, Receta>,
  libres: Set<number>,
  rnd: () => number,
  ruido: number,
): Asignada | null {
  const h = hs[i]
  const otro = asig[i % 2 === 0 ? i + 1 : i - 1]
  const ops = opcionesHueco(h, ctx, disp).filter((o) => o.recipe_id !== otro?.recipe_id)
  // Sobras de la cena de ayer (si esa cena da para dos días)
  const ayer = admiteSobras(h) ? asig[i - 1] : null
  if (ayer && (ayer.origen === 'fresco' || ayer.origen === 'batch') && ayer.recipe_id !== otro?.recipe_id) {
    const r = recetas.get(ayer.recipe_id)
    if (r && daSobras(r)) ops.push({ recipe_id: r.id, origen: 'sobras', freezer_item_id: null })
  }
  let mejor: Asignada | null = null
  let mejorP = Infinity
  for (const o of ops) {
    const cand: Asignada = { ...o, dia: h.dia, momento: h.momento, fijada: false }
    asig[i] = cand
    const p = penalizacion(asig, ctx, recetas, libres) + ruido * rnd()
    if (p < mejorP) {
      mejorP = p
      mejor = cand
    }
  }
  asig[i] = null
  return mejor
}

// ---------------------------------------------------------
// Avisos: qué falta en el recetario para cumplir las reglas
// ---------------------------------------------------------
export function avisosRecetario(recetas: Receta[], porciones?: Map<string, Porciones | null>): string[] {
  const platos = recetas.filter((r) => esPlato(r) && papelDe(r) !== 'guarnicion')
  const av: string[] = []
  if (!recetas.some(esDesayuno)) av.push('No hay recetas de desayuno (tipo «Desayuno»): los desayunos se quedan vacíos. Puedes crear las vuestras o añadir alimentos sueltos a cada desayuno.')
  if (platos.length === 0) {
    const bases = recetas.filter((r) => r.es_base).length
    const des = recetas.filter(esDesayuno).length
    const guarn = recetas.filter(esGuarnicion).length
    const motivo = recetas.length === 0 ? 'El recetario está vacío' : `Tienes ${recetas.length} receta${recetas.length === 1 ? '' : 's'}, pero ${[des ? `${des} de desayuno` : '', bases ? `${bases} marcada${bases === 1 ? '' : 's'} como preparación base` : '', guarn ? `${guarn} guarnici${guarn === 1 ? 'ón' : 'ones'}` : ''].filter(Boolean).join(' y ')}`
    av.push(`${motivo}: no hay ninguna de comida o cena. Edita la receta y elige «Comida», «Cena» o «Comida o cena» (y quita «Preparación base» si es un plato completo).`)
    return av
  }
  const comidas = platos.filter((r) => sirvePara(r, 'comida'))
  const cenas = platos.filter((r) => sirvePara(r, 'cena'))
  const rapidas = cenas.filter(aptaCenaRapida)
  const batchLunes = comidas.filter((r) => sirveDeBatch(r, 1))
  const n = (g: GrupoProteico[]) => platos.filter((r) => r.grupo_proteico && g.includes(r.grupo_proteico)).length
  if (comidas.length < 2) av.push(`Solo hay ${comidas.length} receta${comidas.length === 1 ? '' : 's'} para comida: hacen falta al menos 2 distintas para no repetir y más para tener variedad.`)
  if (cenas.length < 2) av.push(`Solo hay ${cenas.length} receta${cenas.length === 1 ? '' : 's'} para cena.`)
  if (rapidas.length === 0)
    av.push('No hay cenas de 30 minutos o menos (tiempo de preparación + cocción). Las cenas de lunes a viernes solo podrán ser del domingo o del congelador. Añade recetas de cena rápidas o revisa sus tiempos.')
  else if (rapidas.length < 3) av.push(`Solo hay ${rapidas.length} cena${rapidas.length === 1 ? '' : 's'} rápida${rapidas.length === 1 ? '' : 's'} (≤30 min): se repetirán entre semana.`)
  if (batchLunes.length === 0 && comidas.length > 0)
    av.push('Ninguna comida aguanta hasta el martes en nevera ni es congelable: marca en las recetas los días de nevera o «congelable» para poder cocinarlas el domingo.')
  if (n(['legumbre']) === 0) av.push('No hay recetas de legumbre (la AESAN recomienda 4 raciones a la semana).')
  else if (n(['legumbre']) < 2) av.push('Solo hay 1 receta de legumbre: se repetirá para llegar a las 4 raciones semanales.')
  if (n(['pescado_blanco', 'pescado_azul']) === 0) av.push('No hay recetas de pescado (recomendado 3-4 raciones a la semana).')
  else if (n(['pescado_azul']) === 0) av.push('No hay recetas de pescado azul (salmón, sardinas, caballa, atún…): al menos 1 a la semana.')
  if (n(['carne_blanca']) === 0 && n(['carne_roja']) > 0) av.push('No hay recetas de carne blanca (pollo, pavo, conejo): la AESAN recomienda priorizarlas sobre la roja.')
  const sinGrupo = platos.filter((r) => !r.grupo_proteico)
  if (sinGrupo.length)
    av.push(`${sinGrupo.length} receta${sinGrupo.length === 1 ? '' : 's'} sin proteína principal (${sinGrupo.slice(0, 3).map((r) => r.titulo).join(', ')}${sinGrupo.length > 3 ? '…' : ''}): no cuentan para las frecuencias. Edítalas y elige el grupo.`)
  // Principales y guarniciones
  const principales = platos.filter((r) => papelDe(r) === 'principal')
  const guarn = recetas.filter(esGuarnicion)
  if (principales.length && !guarn.length)
    av.push(`Hay ${principales.length} receta${principales.length === 1 ? '' : 's'} «principal» (para acompañar) pero ninguna guarnición. Crea guarniciones sencillas (arroz, patatas, quinoa, ensalada, verduras asadas) y márcalas como «Guarnición».`)
  else if (principales.length && porciones) {
    const tipos = new Set(guarn.map((r) => tipoGuarnicion(porciones.get(r.id))))
    if (!tipos.has('verdura')) av.push('No hay guarniciones de verdura (ensalada, verduras asadas, salteado…): los principales irán solo con hidratos.')
    if (!tipos.has('hidratos')) av.push('No hay guarniciones de hidratos (arroz, patatas, quinoa, pan…): los principales irán solo con verdura.')
  }
  return av
}

export function avisosMenu(entradas: EntradaPlan[], ctx: ContextoMenu): string[] {
  const av: string[] = []
  const vacios = entradas.filter((e) => e.origen !== 'libre' && !e.recipe_id && e.momento !== 'desayuno' && ordenDe(e) === 0)
  for (const e of vacios) {
    const d = DIAS[fechasSemana(ctx.lunes).indexOf(e.fecha)]
    const motivo = esComidaDeBatch({ dia: fechasSemana(ctx.lunes).indexOf(e.fecha), momento: e.momento })
      ? 'ninguna comida se puede cocinar el domingo y aguantar hasta ese día'
      : esCenaEntreSemana({ dia: fechasSemana(ctx.lunes).indexOf(e.fecha), momento: e.momento })
        ? 'no hay otra cena de ≤30 min distinta de la comida de ese día'
        : 'no hay otra receta distinta de la del otro plato del día'
    av.push(`${d}, ${e.momento}: sin plato (${motivo}).`)
  }
  const ind = indicadores(entradas, ctx)
  const obj = objetivos(ind)
  const recetas = ctx.recetas.filter(esPlato)
  const hay = (g: GrupoProteico[]) => recetas.some((r) => r.grupo_proteico && g.includes(r.grupo_proteico))
  for (const o of obj) {
    if (o.estado === 'verde') continue
    if (o.clave === 'legumbre' && !hay(['legumbre'])) continue // ya avisado en el recetario
    if (o.clave === 'pescado' && !hay(['pescado_blanco', 'pescado_azul'])) continue
    if (o.clave === 'legumbre') av.push(`Legumbre: ${o.texto} raciones. Faltan recetas de legumbre que encajen (más variedad o cenas rápidas de legumbre).`)
    if (o.clave === 'pescado') av.push(`Pescado: ${o.texto}. Añade más recetas de pescado${ind.pescadoAzul === 0 ? ', sobre todo azul' : ''}.`)
    if (o.clave === 'roja') av.push(`Carne roja: ${ind.carneRoja} raciones (máx. 1-2). Faltan alternativas de otros grupos.`)
    if (o.clave === 'huevo') av.push(`Huevo: ${ind.huevo} raciones (máx. 4).`)
  }
  return av
}

/** Reglas duras que incumple un plato puesto a mano (para avisar, no para impedirlo) */
export function problemasEntrada(e: EntradaPlan, delDia: EntradaPlan[], r: Receta | undefined, dia: number, todas?: EntradaPlan[], lunes?: string): string[] {
  if (!r || e.origen === 'libre') return []
  const repetida = delDia.some((x) => x.recipe_id === e.recipe_id && x.origen !== 'libre' && !(x.momento === e.momento && ordenDe(x) === ordenDe(e)))
  if (e.momento === 'desayuno') return [...(r.tipo_comida === 'desayuno' ? [] : ['No es una receta de desayuno']), ...(repetida ? ['Se repite en el mismo día'] : [])]
  const p: string[] = []
  if (repetida) p.push('Se repite en el mismo día')
  if (ordenDe(e) === 0 && papelDe(r) === 'guarnicion') p.push('Es una guarnición: mejor como acompañamiento')
  if (esCenaEntreSemana({ dia, momento: e.momento }) && e.origen === 'fresco' && !aptaCenaRapida(r)) {
    const t = (r.t_prep_min ?? 0) + (r.t_coccion_min ?? 0)
    p.push(t ? `Cena de ${t} min entre semana` : 'Cena sin tiempo: no se sabe si es ≤30 min')
  }
  if (esComidaDeBatch({ dia, momento: e.momento }) && e.origen === 'fresco') p.push('Lunes y martes se come lo del domingo')
  if (e.origen === 'batch' && !sirveDeBatch(r, dia)) p.push(`Aguanta ${r.dias_nevera ?? NEVERA_POR_DEFECTO} días en nevera y no es congelable`)
  if (e.origen === 'sobras' && ordenDe(e) === 0 && todas && lunes) {
    const cena = cenaAnterior(todas, e.fecha, lunes)
    if (!cena || cena.recipe_id !== e.recipe_id) p.push('La cena de ayer no es este plato: no hay sobras')
  }
  if (r.tipo_comida !== 'ambas' && r.tipo_comida !== e.momento) p.push(`Es una receta de ${r.tipo_comida}`)
  return p
}
