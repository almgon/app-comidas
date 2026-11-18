// Generador del menú semanal (sin IA): puntuación + búsqueda aleatoria con mejora local.
// Usa SOLO las recetas del recetario del hogar. Si faltan recetas para cumplir las reglas, lo dice.
import { aptaCenaRapida, type Comensal, type Congelado, type EntradaPlan, type GrupoProteico, type Momento, type Origen, type Receta } from './tipos'
import { DIAS, fechasSemana } from './semana'

export const MOMENTOS: Momento[] = ['comida', 'cena']

/** Días que aguanta en nevera si la receta no lo dice */
export const NEVERA_POR_DEFECTO = 3

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
  comensales: Comensal[]
  /** uso interno: proteína del desayuno por comensal y día (la calcula el generador) */
  proteinaDesayuno?: Map<string, number[]>
  /** congelador disponible (raciones que quedan, sin contar lo ya reservado por las entradas fijas) */
  congelados: Congelado[]
  raciones: number
}

// ---------------------------------------------------------
// Reglas duras
// ---------------------------------------------------------
export const esPlato = (r: Receta) => !r.es_base && r.tipo_comida !== 'desayuno'
export const esDesayuno = (r: Receta) => !r.es_base && r.tipo_comida === 'desayuno'
export const sirvePara = (r: Receta, m: Momento) => (m === 'desayuno' ? r.tipo_comida === 'desayuno' : r.tipo_comida === 'ambas' || r.tipo_comida === m)
export const MOMENTOS_DIA: Momento[] = ['desayuno', 'comida', 'cena']
export const esCenaEntreSemana = (h: Pick<Hueco, 'dia' | 'momento'>) => h.momento === 'cena' && h.dia <= 4
/** Lunes y martes a mediodía se come lo cocinado el domingo */
export const esComidaDeBatch = (h: Pick<Hueco, 'dia' | 'momento'>) => h.momento === 'comida' && h.dia <= 1

/** ¿Aguanta en nevera desde el domingo hasta este día? */
export const aguantaNevera = (r: Receta, dia: number) => dia + 1 <= (r.dias_nevera ?? NEVERA_POR_DEFECTO)
/** Cocinado el domingo y servible este día (de la nevera, o congelado y descongelado) */
export const sirveDeBatch = (r: Receta, dia: number) => aguantaNevera(r, dia) || r.congelable

export function huecos(lunes: string): Hueco[] {
  return fechasSemana(lunes).flatMap((fecha, dia) => MOMENTOS.map((momento) => ({ dia, fecha, momento })))
}

/** Opciones válidas para un hueco según las reglas duras (sin mirar el resto del día) */
export function opcionesHueco(h: Hueco, ctx: ContextoMenu, disponibleCongelado: Map<string, number>): Opcion[] {
  const res: Opcion[] = []
  for (const r of ctx.recetas) {
    if (r.es_base || !sirvePara(r, h.momento)) continue
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
  // Lo que hay en el congelador vale para cualquier hueco (solo calentar)
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  for (const c of ctx.congelados) {
    const r = c.recipe_id ? recetas.get(c.recipe_id) : undefined
    if (!r || r.es_base || !sirvePara(r, h.momento)) continue
    if ((disponibleCongelado.get(c.id) ?? 0) + 0.01 < ctx.raciones) continue
    res.push({ recipe_id: r.id, origen: 'congelador', freezer_item_id: c.id })
  }
  return res
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

type EntradaMin = Pick<EntradaPlan, 'fecha' | 'momento' | 'recipe_id' | 'origen'>

/** Frecuencias AESAN con comida y cena; la proteína del día cuenta también el desayuno */
export function indicadores(entradas: EntradaMin[], ctx: Pick<ContextoMenu, 'lunes' | 'recetas' | 'proteina' | 'comensales'>, estimarDesconocida = 0): Indicadores {
  const recetas = new Map(ctx.recetas.map((r) => [r.id, r]))
  const fechas = fechasSemana(ctx.lunes)
  const ind: Indicadores = {
    huecosPlanificados: 0, escala: 0, legumbre: 0, pescado: 0, pescadoAzul: 0, carne: 0, carneRoja: 0, huevo: 0, vegetal: 0, sinGrupo: 0,
    proteinaDia: new Map(), sinProteina: 0,
  }
  const libres = entradas.filter((e) => e.origen === 'libre' && e.momento !== 'desayuno').length
  ind.huecosPlanificados = 14 - libres
  ind.escala = ind.huecosPlanificados / 14
  const protPlatos = fechas.map(() => 0)
  for (const e of entradas) {
    if (e.origen === 'libre' || !e.recipe_id) continue
    const r = recetas.get(e.recipe_id)
    if (!r) continue
    if (e.momento !== 'desayuno') contarGrupo(ind, r.grupo_proteico)
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
// Puntuación (cuanto más baja, mejor)
// ---------------------------------------------------------
interface Asignada extends Opcion {
  dia: number
  momento: Momento
  fijada: boolean
}

function penalizacion(asig: (Asignada | null)[], ctx: ContextoMenu, recetas: Map<string, Receta>, libres: Set<number>): number {
  const ind: Indicadores = {
    huecosPlanificados: 14 - libres.size, escala: (14 - libres.size) / 14, legumbre: 0, pescado: 0, pescadoAzul: 0, carne: 0, carneRoja: 0, huevo: 0, vegetal: 0, sinGrupo: 0,
    proteinaDia: new Map(), sinProteina: 0,
  }
  const protPlatos = [0, 0, 0, 0, 0, 0, 0]
  for (const a of asig) {
    if (!a) continue
    contarGrupo(ind, recetas.get(a.recipe_id)!.grupo_proteico)
    protPlatos[a.dia] += ctx.proteina.get(a.recipe_id) ?? 25
  }
  for (const c of ctx.comensales) {
    const des = ctx.proteinaDesayuno?.get(c.id) ?? []
    ind.proteinaDia.set(c.id, protPlatos.map((g, d) => (des[d] ?? 0) + g * c.factor))
  }
  const s = ind.escala
  let p = 0
  // Frecuencias AESAN
  p += 3 * Math.max(0, 4 * s - ind.legumbre)
  p += 3 * Math.max(0, 3 * s - ind.pescado) + 1 * Math.max(0, ind.pescado - 4 * s)
  if (ind.pescadoAzul === 0 && s > 0.5) p += 2
  p += 1 * Math.max(0, 3 * s - ind.carne) + 1.5 * Math.max(0, ind.carne - 4 * s)
  p += 1.5 * Math.max(0, ind.carneRoja - 1) + 3 * Math.max(0, ind.carneRoja - 2)
  p += 2.5 * Math.max(0, ind.huevo - 4 * s)
  p += 0.5 * ind.sinGrupo
  // Proteína de cada uno, cada día (solo días con todo planificado)
  for (const c of ctx.comensales) {
    const dias = ind.proteinaDia.get(c.id) ?? []
    dias.forEach((g, d) => {
      const completo = asig[d * 2] && asig[d * 2 + 1]
      if (!completo) return
      if (g < c.protMin) p += 0.06 * (c.protMin - g)
      else if (g > c.protMax * 1.15) p += 0.02 * (g - c.protMax * 1.15)
    })
  }
  // Variedad, preferencias, congelador y bases reutilizadas
  const usos = new Map<string, number>()
  const usosBase = new Map<string, number>()
  for (let i = 0; i < asig.length; i++) {
    const a = asig[i]
    if (!a) continue
    const r = recetas.get(a.recipe_id)!
    const n = (usos.get(a.recipe_id) ?? 0) + 1
    usos.set(a.recipe_id, n)
    if (n > 1) p += 1.6 * (n - 1)
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
 * y los huecos libres; el resto se vuelve a elegir. Con `soloHueco` solo se cambia ese hueco.
 */
export function generarMenu(ctx: ContextoMenu, actuales: EntradaPlan[], opciones: OpcionesGenerar = {}): ResultadoMenu {
  const rnd = opciones.rnd ?? Math.random
  const desActuales = actuales.filter((e) => e.momento === 'desayuno')
  const resto = actuales.filter((e) => e.momento !== 'desayuno')
  const solo = opciones.soloHueco
  const desayunos = solo && solo.momento !== 'desayuno' ? desActuales : generarDesayunos(ctx, desActuales, rnd, solo?.fecha)
  if (solo?.momento === 'desayuno') return { entradas: [...desayunos, ...resto], avisos: [] }
  // Proteína de cada desayuno, por persona y día, para equilibrar el resto del día
  const fechas = fechasSemana(ctx.lunes)
  const proteinaDesayuno = new Map(
    ctx.comensales.map((c) => [c.id, fechas.map((f) => {
      const e = desayunos.find((x) => x.fecha === f)
      return e?.recipe_id && e.origen !== 'libre' ? (ctx.proteina.get(e.recipe_id) ?? 20) * c.factor : 0
    })]),
  )
  const r = generarComidasCenas({ ...ctx, proteinaDesayuno }, resto, opciones)
  return { entradas: [...desayunos, ...r.entradas], avisos: r.avisos }
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
      id: e?.id, fecha, momento: 'desayuno', recipe_id: mejor?.recipe_id ?? null, raciones: ctx.raciones, origen: mejor?.origen ?? 'fresco',
      freezer_item_id: mejor?.freezer_item_id ?? null, fijado: false, nota: null, extras: e?.extras ?? [],
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
    for (let pasada = 0; pasada < 2; pasada++) {
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
      recipe_id: a?.recipe_id ?? null,
      raciones: ctx.raciones,
      origen: a?.origen ?? 'fresco',
      freezer_item_id: a?.freezer_item_id ?? null,
      fijado: false,
      nota: null,
      extras: e?.extras ?? [],
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
export function avisosRecetario(recetas: Receta[]): string[] {
  const platos = recetas.filter(esPlato)
  const av: string[] = []
  if (!recetas.some(esDesayuno)) av.push('No hay recetas de desayuno (tipo «Desayuno»): los desayunos se quedan vacíos. Puedes crear las vuestras o añadir alimentos sueltos a cada desayuno.')
  if (platos.length === 0) {
    const bases = recetas.filter((r) => r.es_base).length
    const des = recetas.filter(esDesayuno).length
    const motivo = recetas.length === 0 ? 'El recetario está vacío' : `Tienes ${recetas.length} receta${recetas.length === 1 ? '' : 's'}, pero ${[des ? `${des} de desayuno` : '', bases ? `${bases} marcada${bases === 1 ? '' : 's'} como preparación base` : ''].filter(Boolean).join(' y ')}`
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
  return av
}

export function avisosMenu(entradas: EntradaPlan[], ctx: ContextoMenu): string[] {
  const av: string[] = []
  const vacios = entradas.filter((e) => e.origen !== 'libre' && !e.recipe_id && e.momento !== 'desayuno')
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
export function problemasEntrada(e: EntradaPlan, otra: EntradaPlan | undefined, r: Receta | undefined, dia: number): string[] {
  if (!r || e.origen === 'libre') return []
  if (e.momento === 'desayuno') return r.tipo_comida === 'desayuno' ? [] : ['No es una receta de desayuno']
  const p: string[] = []
  if (otra?.recipe_id && otra.recipe_id === e.recipe_id && otra.origen !== 'libre') p.push('Se repite en el mismo día')
  if (esCenaEntreSemana({ dia, momento: e.momento }) && e.origen === 'fresco' && !aptaCenaRapida(r)) {
    const t = (r.t_prep_min ?? 0) + (r.t_coccion_min ?? 0)
    p.push(t ? `Cena de ${t} min entre semana` : 'Cena sin tiempo: no se sabe si es ≤30 min')
  }
  if (esComidaDeBatch({ dia, momento: e.momento }) && e.origen === 'fresco') p.push('Lunes y martes se come lo del domingo')
  if (e.origen === 'batch' && !sirveDeBatch(r, dia)) p.push(`Aguanta ${r.dias_nevera ?? NEVERA_POR_DEFECTO} días en nevera y no es congelable`)
  if (r.tipo_comida !== 'ambas' && r.tipo_comida !== e.momento) p.push(`Es una receta de ${r.tipo_comida}`)
  return p
}
