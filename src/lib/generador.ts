// Generador del menú semanal (sin IA): puntuación + búsqueda aleatoria con mejora local.
// Usa SOLO las recetas del recetario del hogar. Si faltan recetas para cumplir las reglas, lo dice.
// Cada comida o cena es un plato completo (lentejas) o un principal con 1-2 guarniciones (pollo + arroz + verduras).
// Se busca comer cada tipo de alimento (legumbre, pescado, carne…) las veces a la semana elegidas en Ajustes.
// El tipo de cada receta se deduce de sus ingredientes. El % de verdura, proteína, hidratos y grasa del día es solo informativo.
import { papelDe, type Comensal, type Congelado, type EntradaPlan, type Ingrediente, type Momento, type Origen, type Receta } from './tipos'
import { DIAS, fechasSemana } from './semana'
import type { Macros } from './nutricion'
import { conDatos, tipoGuarnicion, type Reparto } from './reparto'
import { CONTEO_CERO, FRECUENCIAS_POR_DEFECTO, INFO_TIPOS, TIPOS_ALIMENTO, contarTipos, desajusteFrecuencias, evaluarFrecuencias, type Conteo, type Frecuencias, type TipoAlimento } from './frecuencias'

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
  /** gramos por ración de verdura, proteína, hidratos y grasa de cada receta (null si no se sabe) */
  repartos?: Map<string, Reparto | null>
  /** tipo de alimento de cada receta (legumbre, pescado azul…), deducido de sus ingredientes */
  tipos?: Map<string, TipoAlimento | null>
  /** veces por semana de cada tipo (Ajustes); si falta, las de por defecto */
  frecuencias?: Frecuencias
  /** catálogo (para los alimentos sueltos) */
  ingredientes?: Map<string, Ingrediente>
  comensales: Comensal[]
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
// Veces por semana de cada tipo de alimento y proteína
// ---------------------------------------------------------
export interface Indicadores {
  huecosPlanificados: number
  escala: number
  /** veces que se come cada tipo en comidas y cenas */
  conteo: Conteo
  /** proteína por comensal y día (null si no hay datos de algún plato) */
  proteinaDia: Map<string, number[]>
  /** platos sin dato de proteína */
  sinProteina: number
}

type EntradaMin = Pick<EntradaPlan, 'fecha' | 'momento' | 'recipe_id' | 'origen'> & Partial<Pick<EntradaPlan, 'orden'>>

export const frecuenciasCtx = (ctx: Pick<ContextoMenu, 'frecuencias'>) => ctx.frecuencias ?? FRECUENCIAS_POR_DEFECTO

/** Tipos con comida y cena (una vez por hueco); la proteína del día cuenta también el desayuno */
export function indicadores(entradas: EntradaMin[], ctx: Pick<ContextoMenu, 'lunes' | 'recetas' | 'proteina' | 'comensales' | 'tipos'>, estimarDesconocida = 0): Indicadores {
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const fechas = fechasSemana(ctx.lunes)
  const libres = entradas.filter((e) => e.origen === 'libre' && e.momento !== 'desayuno' && ordenDe(e) === 0).length
  const ind: Indicadores = {
    huecosPlanificados: 14 - libres, escala: (14 - libres) / 14, conteo: contarTipos(entradas, ctx.tipos ?? new Map()), proteinaDia: new Map(), sinProteina: 0,
  }
  const protPlatos = fechas.map(() => 0)
  for (const e of entradas) {
    if (e.origen === 'libre' || !e.recipe_id) continue
    const r = recetas.get(e.recipe_id)
    if (!r) continue
    const d = fechas.indexOf(e.fecha)
    const p = ctx.proteina.get(r.id)
    if (p == null) ind.sinProteina++
    if (d >= 0) protPlatos[d] += p ?? estimarDesconocida
  }
  for (const c of ctx.comensales) ind.proteinaDia.set(c.id, protPlatos.map((p) => p * c.factor))
  return ind
}

export type Semaforo = 'verde' | 'ambar' | 'rojo'

export function semaforoProteina(g: number, c: Comensal): Semaforo {
  if (g >= c.protMin && g <= c.protMax * 1.1) return 'verde'
  if (g >= c.protMin * 0.85) return 'ambar'
  return 'rojo'
}

// ---------------------------------------------------------
// Guarniciones
// ---------------------------------------------------------
export const ordenDe = (e: Pick<EntradaPlan, 'orden'>) => e.orden ?? 0

/** ¿Hay guarniciones en el recetario? (si no, los principales se quedan solos) */
const hayGuarniciones = (ctx: Pick<ContextoMenu, 'recetas'>) => ctx.recetas.some(esGuarnicion)

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
  const escala = (14 - libres.size) / 14
  const conteo = CONTEO_CERO()
  const sinGuarniciones = !hayGuarniciones(ctx)
  let p = 0
  for (let i = 0; i < asig.length; i++) {
    const a = asig[i]
    if (!a) continue
    const r = recetas.get(a.recipe_id)!
    const t = ctx.tipos?.get(r.id)
    if (t) conteo[t]++
    // Un principal sin guarniciones en el recetario queda cojo
    if (sinGuarniciones && papelDe(r) === 'principal') p += 0.3
    // Sobras: tienen que ser de la cena de ayer
    if (a.origen === 'sobras') {
      const cena = asig[i - 1]
      if (!cena || cena.recipe_id !== a.recipe_id || cena.origen === 'congelador' || cena.origen === 'sobras') p += 30
      else if (sobrasEntreSemana(a)) p -= PREMIO_SOBRAS
    }
  }
  // Veces por semana de cada tipo (Ajustes)
  p += desajusteFrecuencias(conteo, frecuenciasCtx(ctx), escala)
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
    // mismo tipo en comida y cena del mismo día
    if (i % 2 === 1 && asig[i - 1]) {
      const t = ctx.tipos?.get(r.id)
      if (t && t === ctx.tipos?.get(asig[i - 1]!.recipe_id)) p += 0.8
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
  const principales = actuales.filter((e) => ordenDe(e) === 0)
  const anadidas = actuales.filter((e) => ordenDe(e) > 0)
  const fijadas = opciones.soloHueco ? anadidas : anadidas.filter((e) => e.fijado)
  const desActuales = principales.filter((e) => e.momento === 'desayuno')
  const resto = principales.filter((e) => e.momento !== 'desayuno')
  const solo = opciones.soloHueco
  const desayunos = solo && solo.momento !== 'desayuno' ? desActuales : generarDesayunos(ctx, desActuales, rnd, solo?.fecha)
  if (solo?.momento === 'desayuno') return { entradas: [...desayunos, ...resto, ...fijadas], avisos: [] }
  const r = generarComidasCenas(ctx, resto, opciones)
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

/** Lo que cuesta cada guarnición: con una basta, pero verdura + hidratos (pollo + arroz + ensalada) sale mejor */
const COSTE_GUARNICION = 0.15
const PREMIO_MEZCLA = 0.3

/**
 * Pone 1 o 2 guarniciones a cada principal (pollo + arroz + verduras): mejor una de verdura y otra de hidratos,
 * con variedad en la semana. A los platos completos y a los desayunos no se les añade nada.
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
      if (!esPrin) continue
      const cands = candidatasAnadir(ctx, dia, fecha, momento, delDia)
      if (!cands.length) continue
      const tipoDe = (id: string) => tipoGuarnicion(ctx.repartos?.get(id))
      let mejor: EntradaPlan[] = []
      let mejorP = Infinity
      const solas = cands.map((o) => ({ e: nuevaAnadida(ctx, fecha, momento, orden, o), p: variedad(o.recipe_id) + COSTE_GUARNICION + 0.15 * rnd() }))
      for (const x of solas) if (x.p < mejorP) [mejorP, mejor] = [x.p, [x.e]]
      // Dos guarniciones: lo normal con un principal es verdura + hidratos
      for (let i = 0; i < solas.length; i++)
        for (let j = i + 1; j < solas.length; j++) {
          const a = solas[i].e
          const b = { ...solas[j].e, orden: orden + 1 }
          if (a.recipe_id === b.recipe_id) continue
          const tipos = new Set([tipoDe(a.recipe_id!), tipoDe(b.recipe_id!)])
          if (!(tipos.has('verdura') && tipos.has('hidratos'))) continue
          const p = solas[i].p + solas[j].p - PREMIO_MEZCLA
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
  const tipo = e.recipe_id ? tipoGuarnicion(ctx.repartos?.get(e.recipe_id)) : 'otra'
  let mejor: EntradaPlan | null = null
  let mejorP = Infinity
  for (const o of candidatasAnadir(ctx, dia, e.fecha, e.momento, delDia)) {
    if (o.recipe_id === e.recipe_id) continue
    const cand = { ...e, recipe_id: o.recipe_id, origen: o.origen, freezer_item_id: null, fijado: false }
    const otroTipo = tipo !== 'otra' && tipoGuarnicion(ctx.repartos?.get(o.recipe_id)) !== tipo ? 1 : 0
    const p = otroTipo + 0.4 * (usos.get(o.recipe_id) ?? 0) + 0.8 * rnd()
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
  // Primero lo más restringido: comidas de lunes y martes, luego el resto
  const prioridad = (i: number) => (esComidaDeBatch(hs[i]) ? 0 : 1)

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
/** Lo que hace falta para los avisos de tipos y guarniciones (si falta, esos avisos no salen) */
export type InfoAvisos = Pick<ContextoMenu, 'repartos' | 'tipos' | 'frecuencias'>

const nombreTipo = (t: TipoAlimento) => INFO_TIPOS[t].etiqueta.toLowerCase()
const veces = (n: number) => `${n} ${n === 1 ? 'vez' : 'veces'}`

export function avisosRecetario(recetas: Receta[], info: InfoAvisos = {}): string[] {
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
  const batchLunes = comidas.filter((r) => sirveDeBatch(r, 1))
  if (comidas.length < 2) av.push(`Solo hay ${comidas.length} receta${comidas.length === 1 ? '' : 's'} para comida: hacen falta al menos 2 distintas para no repetir y más para tener variedad.`)
  if (cenas.length < 2) av.push(`Solo hay ${cenas.length} receta${cenas.length === 1 ? '' : 's'} para cena.`)
  if (batchLunes.length === 0 && comidas.length > 0)
    av.push('Ninguna comida aguanta hasta el martes en nevera ni es congelable: marca en las recetas los días de nevera o «congelable» para poder cocinarlas el domingo.')
  // Tipos de alimento: lo que pedís en Ajustes y las recetas que hay de cada uno
  if (info.tipos) {
    const f = frecuenciasCtx(info)
    for (const t of TIPOS_ALIMENTO) {
      const v = f[t]
      if (!v) continue
      const hay = platos.filter((r) => info.tipos!.get(r.id) === t).length
      if (hay === 0) av.push(`Queréis comer ${nombreTipo(t)} ${veces(v)} a la semana, pero no hay ninguna receta de comida o cena con ${nombreTipo(t)} (${INFO_TIPOS[t].ejemplos}). Añade alguna o cambia las veces en Ajustes.`)
      else if (hay === 1 && v >= 3) av.push(`Solo hay 1 receta de ${nombreTipo(t)}: se repetirá para llegar a ${veces(v)} a la semana.`)
    }
    const sinDatos = platos.filter((r) => !conDatos(r))
    if (sinDatos.length)
      av.push(`${sinDatos.length} receta${sinDatos.length === 1 ? '' : 's'} sin ingredientes del catálogo (${sinDatos.slice(0, 3).map((r) => r.titulo).join(', ')}${sinDatos.length > 3 ? '…' : ''}): no se sabe qué llevan, así que no cuentan para las veces por semana ni para los porcentajes del día. Edítalas y vincula los ingredientes.`)
  }
  // Principales y guarniciones
  const principales = platos.filter((r) => papelDe(r) === 'principal')
  const guarn = recetas.filter(esGuarnicion)
  if (principales.length && !guarn.length)
    av.push(`Hay ${principales.length} receta${principales.length === 1 ? '' : 's'} «principal» (para acompañar) pero ninguna guarnición. Crea guarniciones sencillas (arroz, patatas, quinoa, ensalada, verduras asadas) y márcalas como «Guarnición».`)
  else if (principales.length && info.repartos) {
    const tipos = new Set(guarn.map((r) => tipoGuarnicion(info.repartos!.get(r.id))))
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
      : 'no hay otra receta distinta de la del otro plato del día'
    av.push(`${d}, ${e.momento}: sin plato (${motivo}).`)
  }
  const ind = indicadores(entradas, ctx)
  const platos = ctx.recetas.filter(esPlato)
  for (const o of evaluarFrecuencias(ind.conteo, frecuenciasCtx(ctx), ind.escala)) {
    if (o.estado === 'verde') continue
    if (o.valor < o.objetivo && !platos.some((r) => ctx.tipos?.get(r.id) === o.tipo)) continue // ya avisado en el recetario
    const nombre = INFO_TIPOS[o.tipo].etiqueta
    av.push(
      o.valor < o.objetivo
        ? `${nombre}: ${veces(o.valor)} de ${o.objetivo}. Faltan recetas de ${nombreTipo(o.tipo)} que encajen (más variedad).`
        : `${nombre}: ${veces(o.valor)} (queríais ${o.objetivo}). Faltan alternativas de otros tipos.`,
    )
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
  if (esComidaDeBatch({ dia, momento: e.momento }) && e.origen === 'fresco') p.push('Lunes y martes se come lo del domingo')
  if (e.origen === 'batch' && !sirveDeBatch(r, dia)) p.push(`Aguanta ${r.dias_nevera ?? NEVERA_POR_DEFECTO} días en nevera y no es congelable`)
  if (e.origen === 'sobras' && ordenDe(e) === 0 && todas && lunes) {
    const cena = cenaAnterior(todas, e.fecha, lunes)
    if (!cena || cena.recipe_id !== e.recipe_id) p.push('La cena de ayer no es este plato: no hay sobras')
  }
  if (r.tipo_comida !== 'ambas' && r.tipo_comida !== e.momento) p.push(`Es una receta de ${r.tipo_comida}`)
  return p
}
