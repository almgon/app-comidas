import { describe, expect, it } from 'vitest'
import { avisosRecetario, desajusteDia, esCenaEntreSemana, generarMenu, indicadores, objetivos, ordenDe, otraAnadida, type ContextoMenu } from './generador'
import { nutricionPorRacion, racionesDeBase, pesoReceta } from './nutricion'
import { balance, diaPersona } from './objetivos'
import { sesionDomingo } from './batch'
import { calcularCompra } from './compra'
import { enEnvases, aUnidadBase } from './cantidades'
import { fechasSemana, indiceDia, semanaPorDefecto } from './semana'
import { comensalesDe, type Ingrediente, type Receta, type GrupoProteico, type TipoComida, type EntradaPlan } from './tipos'

let n = 0
function receta(titulo: string, grupo: GrupoProteico | null, extra: Partial<Receta> = {}): Receta {
  n++
  return {
    id: `r${n}`, household_id: 'h', titulo, foto_url: null, raciones: 4, t_prep_min: 15, t_coccion_min: 30, tipo_comida: 'ambas' as TipoComida,
    grupo_proteico: grupo, es_base: false, congelable: false, dias_nevera: 3, valoracion: null, favorita: false, proteina_racion_manual: null,
    fuente_url: null, fuente_tipo: 'manual', notas: null, creado_en: '', actualizado_en: '', ingredientes: [], pasos: [], etiquetas: [], ...extra,
  }
}
function ing(id: string, nombre: string, extra: Partial<Ingrediente> = {}): Ingrediente {
  return { id, household_id: null, nombre, categoria: 'Otros', unidad_base: 'g', peso_unidad_g: null, kcal_100: 100, proteina_100: 10, hidratos_100: 0, grasa_100: 0, es_despensa: false, ...extra }
}

const LUNES = '2026-11-23'
const comensales = [
  { id: 'a', nombre: 'Alberto', factor: 1, protMin: 84, protMax: 112 },
  { id: 'b', nombre: 'Pareja', factor: 1.25, protMin: 104, protMax: 139 },
]

function ctxCon(recetas: Receta[]): ContextoMenu {
  return {
    lunes: LUNES, recetas, proteina: new Map(recetas.map((r) => [r.id, 35])), comensales, congelados: [], raciones: 2.25,
  }
}

// Recetario variado de ejemplo SOLO para los tests
const variado = () => [
  receta('Lentejas', 'legumbre', { congelable: true, t_coccion_min: 45 }),
  receta('Garbanzos con espinacas', 'legumbre', { t_prep_min: 10, t_coccion_min: 15 }),
  receta('Alubias', 'legumbre', { congelable: true, t_coccion_min: 60 }),
  receta('Salmón al horno', 'pescado_azul', { t_prep_min: 5, t_coccion_min: 15 }),
  receta('Merluza en salsa', 'pescado_blanco', { t_prep_min: 10, t_coccion_min: 15 }),
  receta('Sardinas', 'pescado_azul', { t_prep_min: 5, t_coccion_min: 10, tipo_comida: 'cena' }),
  receta('Pollo al curry', 'carne_blanca', { congelable: true }),
  receta('Pavo a la plancha', 'carne_blanca', { t_prep_min: 5, t_coccion_min: 10 }),
  receta('Albóndigas', 'carne_roja', { congelable: true, t_coccion_min: 40 }),
  receta('Tortilla', 'huevo', { t_prep_min: 10, t_coccion_min: 10, tipo_comida: 'cena' }),
  receta('Crema de calabacín', 'vegetal', { t_prep_min: 10, t_coccion_min: 20 }),
  receta('Arroz con verduras', 'vegetal'),
]

describe('semana', () => {
  it('calcula fechas y semana por defecto', () => {
    expect(fechasSemana(LUNES)[6]).toBe('2026-11-29')
    expect(indiceDia(LUNES, '2026-11-25')).toBe(2)
    expect(semanaPorDefecto(new Date(2026, 10, 18))).toBe('2026-11-16') // miércoles
    expect(semanaPorDefecto(new Date(2026, 10, 22))).toBe('2026-11-23') // domingo → la siguiente
  })
})

describe('generador', () => {
  it('cumple las reglas duras con un recetario variado', () => {
    const rs = variado()
    const ctx = ctxCon(rs)
    const { entradas: conAnadidas } = generarMenu(ctx, [], { rnd: semilla(1) })
    const todas = conAnadidas.filter((e) => ordenDe(e) === 0)
    expect(todas).toHaveLength(21)
    expect(todas.filter((e) => e.momento === 'desayuno').every((e) => e.recipe_id === null)).toBe(true) // no hay recetas de desayuno: vacíos
    const entradas = todas.filter((e) => e.momento !== 'desayuno')
    const mapa = new Map(rs.map((r) => [r.id, r]))
    for (const f of fechasSemana(LUNES)) {
      const [c, d] = entradas.filter((e) => e.fecha === f)
      expect(c.recipe_id).not.toBe(d.recipe_id) // no se repite el mismo día
    }
    for (const e of entradas) {
      const r = mapa.get(e.recipe_id!)!
      expect(r).toBeDefined()
      const dia = indiceDia(LUNES, e.fecha)
      if (e.momento === 'comida' && dia <= 1) expect(e.origen).toBe('batch')
      if (esCenaEntreSemana({ dia, momento: e.momento }) && e.origen === 'fresco') expect((r.t_prep_min ?? 0) + (r.t_coccion_min ?? 0)).toBeLessThanOrEqual(30)
      expect(r.tipo_comida === 'ambas' || r.tipo_comida === e.momento).toBe(true)
    }
    const ind = indicadores(entradas, ctx)
    expect(ind.legumbre).toBeGreaterThanOrEqual(4)
    expect(ind.pescado).toBeGreaterThanOrEqual(3)
    expect(ind.pescadoAzul).toBeGreaterThanOrEqual(1)
    expect(ind.carneRoja).toBeLessThanOrEqual(2)
    expect(objetivos(ind).find((o) => o.clave === 'legumbre')!.estado).toBe('verde')
  })

  it('elige desayunos entre las recetas de desayuno y cuenta su proteína', () => {
    const rs = [...variado(), receta('Overnight oats', null, { tipo_comida: 'desayuno' }), receta('Tostadas con tomate', null, { tipo_comida: 'desayuno' })]
    const ctx = ctxCon(rs)
    const { entradas: conAnadidas } = generarMenu(ctx, [], { rnd: semilla(7) })
    const entradas = conAnadidas.filter((e) => ordenDe(e) === 0)
    const des = entradas.filter((e) => e.momento === 'desayuno')
    expect(des).toHaveLength(7)
    expect(des.every((e) => ['Overnight oats', 'Tostadas con tomate'].includes(rs.find((r) => r.id === e.recipe_id)!.titulo))).toBe(true)
    expect(new Set(des.map((e) => e.recipe_id)).size).toBe(2) // algo de variedad
    expect(entradas.filter((e) => e.momento !== 'desayuno').every((e) => rs.find((r) => r.id === e.recipe_id)!.tipo_comida !== 'desayuno')).toBe(true)
    const ind = indicadores(entradas, ctx)
    expect(ind.proteinaDia.get('a')![0]).toBeCloseTo(35 * 3) // desayuno + comida + cena
    // «otro desayuno» solo cambia ese hueco
    const { entradas: otra } = generarMenu(ctx, entradas, { soloHueco: { fecha: LUNES, momento: 'desayuno' }, rnd: semilla(8) })
    expect(otra.filter((e) => e.momento !== 'desayuno').map((e) => e.recipe_id)).toEqual(entradas.filter((e) => e.momento !== 'desayuno').map((e) => e.recipe_id))
  })

  it('explica por qué no hay recetas de comida o cena', () => {
    const av = avisosRecetario([receta('Overnight oats', null, { tipo_comida: 'desayuno' })]).join(' ')
    expect(av).toMatch(/1 receta, pero 1 de desayuno/)
    expect(avisosRecetario([receta('Boloñesa', null, { es_base: true })]).join(' ')).toMatch(/preparación base/)
  })

  it('respeta los platos fijados y los huecos libres', () => {
    const rs = variado()
    const ctx = ctxCon(rs)
    const fijo: EntradaPlan = { fecha: '2026-11-27', momento: 'comida', recipe_id: rs[8].id, raciones: 2.25, origen: 'fresco', freezer_item_id: null, fijado: true, nota: null }
    const libre: EntradaPlan = { fecha: '2026-11-28', momento: 'cena', recipe_id: null, raciones: 0, origen: 'libre', freezer_item_id: null, fijado: true, nota: 'Cumpleaños' }
    const { entradas } = generarMenu(ctx, [fijo, libre], { rnd: semilla(2) })
    expect(entradas.find((e) => e.fecha === fijo.fecha && e.momento === 'comida')!.recipe_id).toBe(rs[8].id)
    const l = entradas.find((e) => e.fecha === libre.fecha && e.momento === 'cena')!
    expect(l.origen).toBe('libre')
    expect(l.recipe_id).toBeNull()
  })

  it('no inventa platos: si no hay recetas, deja huecos vacíos y avisa', () => {
    const rs = [receta('Lentejas', 'legumbre', { t_coccion_min: 60 })]
    const ctx = ctxCon(rs)
    const { entradas, avisos } = generarMenu(ctx, [], { rnd: semilla(3) })
    expect(entradas.every((e) => e.recipe_id === null || e.recipe_id === rs[0].id)).toBe(true)
    expect(entradas.filter((e) => e.recipe_id === null).length).toBeGreaterThan(0)
    expect(avisos.length).toBeGreaterThan(0)
    const rec = avisosRecetario(rs).join(' ')
    expect(rec).toMatch(/30 minutos/)
    expect(rec).toMatch(/pescado/)
  })

  it('usa primero lo congelado', () => {
    const rs = variado()
    const ctx = { ...ctxCon(rs), congelados: [{ id: 'c1', recipe_id: rs[6].id, nombre: 'Pollo al curry', raciones: 4.5, congelado_en: '2026-10-01', nota: null }] }
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(4) })
    const usos = entradas.filter((e) => e.freezer_item_id === 'c1')
    expect(usos.length).toBeGreaterThanOrEqual(1)
    expect(usos.length).toBeLessThanOrEqual(2) // 4,5 raciones = 2 comidas de 2,25
  })

  it('solo cambia un hueco al pedir otro plato', () => {
    const rs = variado()
    const ctx = ctxCon(rs)
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(5) })
    const { entradas: nuevas } = generarMenu(ctx, entradas, { soloHueco: { fecha: '2026-11-26', momento: 'comida' }, rnd: semilla(6) })
    const clave = (e: EntradaPlan) => `${e.fecha}|${e.momento}|${ordenDe(e)}`
    const antes = new Map(entradas.map((e) => [clave(e), e]))
    const distintas = nuevas.filter((e) => e.recipe_id !== antes.get(clave(e))?.recipe_id || e.origen !== antes.get(clave(e))?.origen)
    expect(distintas.every((e) => e.fecha === '2026-11-26' && e.momento === 'comida')).toBe(true)
  })
})

describe('batch y compra', () => {
  const pollo = ing('i-pollo', 'Pechuga de pollo', { categoria: 'Carne', envase_cantidad: 400, envase_nombre: 'bandeja' })
  const tomate = ing('i-tomate', 'Tomate triturado', { categoria: 'Conservas' })
  const carne = ing('i-carne', 'Carne picada', { categoria: 'Carne' })
  const huevo = ing('i-huevo', 'Huevo', { categoria: 'Huevos', unidad_base: 'ud', peso_unidad_g: 60, envase_cantidad: 12, envase_nombre: 'docena' })
  const sal = ing('i-sal', 'Sal', { es_despensa: true })
  const ingredientes = new Map([pollo, tomate, carne, huevo, sal].map((i) => [i.id, i]))

  const bolo = receta('Boloñesa', null, { es_base: true, raciones: 6, congelable: true, ingredientes: [
    { orden: 0, ingredient_id: 'i-carne', sub_recipe_id: null, cantidad: 500, unidad: 'g', texto_original: 'carne' },
    { orden: 1, ingredient_id: 'i-tomate', sub_recipe_id: null, cantidad: 800, unidad: 'g', texto_original: 'tomate' },
  ] })
  const pasta = receta('Pasta boloñesa', 'carne_roja', { raciones: 2, ingredientes: [{ orden: 0, ingredient_id: null, sub_recipe_id: bolo.id, cantidad: 2, unidad: 'racion', texto_original: 'boloñesa' }] })
  const berenjenas = receta('Berenjenas rellenas', 'carne_roja', { raciones: 2, ingredientes: [{ orden: 0, ingredient_id: null, sub_recipe_id: bolo.id, cantidad: 2, unidad: 'racion', texto_original: 'boloñesa' }] })
  const polloR = receta('Pollo asado', 'carne_blanca', { raciones: 2, congelable: true, ingredientes: [
    { orden: 0, ingredient_id: 'i-pollo', sub_recipe_id: null, cantidad: 300, unidad: 'g', texto_original: 'pollo' },
    { orden: 1, ingredient_id: 'i-sal', sub_recipe_id: null, cantidad: null, unidad: null, texto_original: 'sal' },
  ] })
  const tortilla = receta('Tortilla', 'huevo', { raciones: 2, ingredientes: [{ orden: 0, ingredient_id: 'i-huevo', sub_recipe_id: null, cantidad: 4, unidad: 'ud', texto_original: 'huevos' }] })
  const recetas = new Map([bolo, pasta, berenjenas, polloR, tortilla].map((r) => [r.id, r]))
  const e = (fecha: string, momento: 'comida' | 'cena', r: Receta, origen: EntradaPlan['origen']): EntradaPlan => ({ fecha, momento, recipe_id: r.id, raciones: 2.25, origen, freezer_item_id: null, fijado: false, nota: null })
  const entradas = [
    e('2026-11-23', 'comida', polloR, 'batch'),
    e('2026-11-24', 'comida', pasta, 'batch'),
    e('2026-11-27', 'comida', berenjenas, 'fresco'),
    e('2026-11-26', 'cena', tortilla, 'fresco'),
  ]

  it('la base se cocina una vez el domingo para los dos platos', () => {
    const items = sesionDomingo(LUNES, entradas, recetas, {}, [])
    expect(items[0].receta.id).toBe(bolo.id) // las bases primero
    expect(items[0].necesarias).toBeCloseTo(4.5)
    expect(items[0].usos).toHaveLength(2)
    expect(items[0].usos.find((u) => u.fecha === '2026-11-27')!.destino).toBe('congelador') // viernes: no aguanta 3 días
    // receta de 6 raciones y congelable: se hace entera y sobra 1,5 para el congelador
    expect(items[0].cocinar).toBeCloseTo(6)
    expect(items[0].extra).toBeCloseTo(1.5)
    const p = items.find((i) => i.receta.id === polloR.id)!
    expect(p.necesarias).toBeCloseTo(2.25)
    expect(p.nevera).toBeCloseTo(2.25)
  })

  it('usa la base congelada antes de cocinar más', () => {
    const items = sesionDomingo(LUNES, entradas, recetas, {}, [{ id: 'c', recipe_id: bolo.id, nombre: 'Boloñesa', raciones: 3, congelado_en: '2026-11-01', nota: null }])
    const b = items.find((i) => i.receta.id === bolo.id)!
    expect(b.delCongelador).toBeCloseTo(3)
    expect(b.congeladosUsados).toEqual([{ id: 'c', raciones: 3 }])
  })

  it('agrupa, convierte a envases, separa la despensa y no cuenta lo congelado', () => {
    const conCongelado = [...entradas, { ...e('2026-11-25', 'comida', polloR, 'congelador'), freezer_item_id: 'x' }]
    const batch = sesionDomingo(LUNES, conCongelado, recetas, {}, [])
    const lista = calcularCompra({ lunes: LUNES, entradas: conCongelado, recetas, ingredientes, batch, comensales, envases: new Map() })
    const p = lista.find((x) => x.ingredient_id === 'i-pollo')!
    // batch del lunes: 2,25 rac. → receta de 2, congelable → se hacen 4 rac. = 600 g; el del congelador no cuenta
    expect(p.cantidad).toBe(600)
    expect(p.detalle).toMatch(/2 bandejas/)
    expect(lista.find((x) => x.ingredient_id === 'i-carne')!.cantidad).toBe(500) // boloñesa una sola vez (6 rac.)
    const h = lista.find((x) => x.ingredient_id === 'i-huevo')!
    expect(h.cantidad).toBe(5) // 4 × 2,25/2 = 4,5 → 5
    expect(h.detalle).toMatch(/1 docena/)
    expect(lista.find((x) => x.ingredient_id === 'i-sal')!.es_despensa).toBe(true)
    expect(lista.find((x) => x.clave === 'fruta-temporada')!.cantidad).toBe(42)
    // ordenado por pasillo: la fruta va antes que la carne
    expect(lista.findIndex((x) => x.categoria === 'Fruta')).toBeLessThan(lista.findIndex((x) => x.categoria === 'Carne'))
  })

  it('suma los alimentos sueltos de cualquier hueco', () => {
    const avena = ing('i-avena', 'Copos de avena', { envase_cantidad: 500, envase_nombre: 'paquete' })
    const des = (fecha: string): EntradaPlan => ({ fecha, momento: 'desayuno', recipe_id: null, raciones: 2.25, origen: 'fresco', freezer_item_id: null, fijado: false, nota: null, extras: [{ ingredient_id: 'i-avena', cantidad: 110 }] })
    const lista = calcularCompra({
      lunes: LUNES, entradas: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'].map(des), recetas, ingredientes: new Map([['i-avena', avena]]),
      batch: [], comensales, envases: new Map(), fruta: false,
    })
    expect(lista[0].cantidad).toBe(550)
    expect(lista[0].detalle).toBe('2 paquetes (500 g) · sobran 450 g')
    expect(lista[0].origen).toBe('Desayunos')
  })
})

describe('kcal y macros', () => {
  const arroz = ing('i-arroz', 'Arroz', { kcal_100: 350, proteina_100: 7, hidratos_100: 77, grasa_100: 1 })
  const carne = ing('i-carne', 'Carne picada', { kcal_100: 200, proteina_100: 20, hidratos_100: 0, grasa_100: 13 })
  const tomate = ing('i-tomate', 'Tomate triturado', { kcal_100: 30, proteina_100: 1, hidratos_100: 5, grasa_100: 0 })
  const ingredientes = new Map([arroz, carne, tomate].map((i) => [i.id, i]))
  const bolo = receta('Boloñesa', null, { es_base: true, raciones: 4, ingredientes: [
    { orden: 0, ingredient_id: 'i-carne', sub_recipe_id: null, cantidad: 500, unidad: 'g', texto_original: 'carne' },
    { orden: 1, ingredient_id: 'i-tomate', sub_recipe_id: null, cantidad: 500, unidad: 'g', texto_original: 'tomate' },
  ] })

  it('calcula kcal, proteína, hidratos y grasa por ración', () => {
    const n = nutricionPorRacion(bolo, ingredientes, new Map([[bolo.id, bolo]]))
    expect(n.kcal).toBeCloseTo((1000 + 150) / 4)
    expect(n.proteina).toBeCloseTo((100 + 5) / 4)
    expect(n.hidratos).toBeCloseTo(25 / 4)
    expect(n.grasa).toBeCloseTo(65 / 4)
  })

  it('usa una base como ingrediente en raciones, gramos o receta entera, en proporción', () => {
    const recetas = new Map([[bolo.id, bolo]])
    expect(pesoReceta(bolo, ingredientes, recetas)).toBe(1000)
    expect(racionesDeBase({ cantidad: 250, unidad: 'g' }, bolo, ingredientes, recetas)).toBeCloseTo(1) // 1000 g / 4 raciones
    expect(racionesDeBase({ cantidad: 1, unidad: 'receta' }, bolo)).toBe(4)
    expect(racionesDeBase({ cantidad: 2, unidad: 'racion' }, bolo)).toBe(2)
    // con el peso final puesto a mano (la salsa reduce), los gramos valen más
    expect(racionesDeBase({ cantidad: 200, unidad: 'g' }, { ...bolo, peso_total_g: 800 }, ingredientes, recetas)).toBeCloseTo(1)
    const pasta = receta('Arroz con boloñesa', 'carne_roja', { raciones: 2, ingredientes: [
      { orden: 0, ingredient_id: 'i-arroz', sub_recipe_id: null, cantidad: 160, unidad: 'g', texto_original: 'arroz' },
      { orden: 1, ingredient_id: null, sub_recipe_id: bolo.id, cantidad: 500, unidad: 'g', texto_original: 'boloñesa' },
    ] })
    const n = nutricionPorRacion(pasta, ingredientes, new Map([[bolo.id, bolo], [pasta.id, pasta]]))
    expect(n.kcal).toBeCloseTo((560 + 575) / 2) // 160 g de arroz + la mitad de la boloñesa
    expect(n.sinContar).toEqual([])
    // la compra y el domingo cuentan esos 500 g como 2 raciones de boloñesa
    const ent: EntradaPlan[] = [{ fecha: LUNES, momento: 'comida', recipe_id: pasta.id, raciones: 2, origen: 'fresco', freezer_item_id: null, fijado: false, nota: null }]
    const lista = calcularCompra({ lunes: LUNES, entradas: ent, recetas: new Map([[bolo.id, bolo], [pasta.id, pasta]]), ingredientes, batch: [], comensales, envases: new Map(), fruta: false })
    expect(lista.find((x) => x.ingredient_id === 'i-carne')!.cantidad).toBe(250)
  })

  it('estima objetivos por persona y dice qué falta o sobra', () => {
    const [a] = comensalesDe([{ id: 'a', household_id: 'h', nombre: 'Alberto', peso_kg: 70, factor_racion: 1 }])
    expect(a.kcal).toBe(2240)
    expect(a.protMin).toBe(84)
    const [b] = comensalesDe([{ id: 'b', household_id: 'h', nombre: 'Pareja', peso_kg: 87, factor_racion: 1.25, kcal_objetivo: 2600 }])
    expect(b.kcal).toBe(2600)
    const bal = balance({ kcal: 1700, proteina: 90, hidratos: 400, grasa: 60 }, a)
    expect(bal.find((x) => x.clave === 'kcal')!.estado).toBe('falta')
    expect(bal.find((x) => x.clave === 'kcal')!.texto).toMatch(/Faltan 316 kcal/)
    expect(bal.find((x) => x.clave === 'proteina')!.estado).toBe('ok')
    expect(bal.find((x) => x.clave === 'hidratos')!.estado).toBe('sobra')
  })

  it('reparte los alimentos sueltos según el factor de cada uno', () => {
    const [a, b] = comensales
    const avena = ing('i-avena', 'Avena', { kcal_100: 370, proteina_100: 13 })
    const e = [{ momento: 'desayuno' as const, recipe_id: null, origen: 'fresco' as const, extras: [{ ingredient_id: 'i-avena', cantidad: 225 }] }]
    const ia = diaPersona(e, a, new Map(), new Map([['i-avena', avena]]), 2.25)
    const ib = diaPersona(e, b, new Map(), new Map([['i-avena', avena]]), 2.25)
    expect(ia.macros.kcal).toBeCloseTo(370) // 100 g
    expect(ib.macros.kcal).toBeCloseTo(462.5) // 125 g
    expect(ia.completo).toBe(false)
  })

  it('si faltan kcal añade otra receta al hueco y el día queda más ajustado', () => {
    const rs = [
      ...variado(),
      receta('Ensalada de garbanzos', 'legumbre', { t_prep_min: 10, t_coccion_min: 0 }),
      receta('Yogur con nueces', null, { tipo_comida: 'desayuno' }),
      receta('Tostadas', null, { tipo_comida: 'desayuno' }),
    ]
    const ctx = ctxCon(rs)
    // platos ligeros: 350 kcal por ración; así a cada uno le faltan kcal
    ctx.macros = new Map(rs.map((r) => [r.id, { kcal: 350, proteina: 25, hidratos: 35, grasa: 12 }]))
    ctx.comensales = comensalesDe([
      { id: 'a', household_id: 'h', nombre: 'Alberto', peso_kg: 70, factor_racion: 1 },
      { id: 'b', household_id: 'h', nombre: 'Pareja', peso_kg: 87, factor_racion: 1.25 },
    ])
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(9) })
    const anadidas = entradas.filter((e) => ordenDe(e) > 0)
    expect(anadidas.length).toBeGreaterThan(0)
    for (const f of fechasSemana(LUNES)) {
      const delDia = entradas.filter((e) => e.fecha === f)
      const ids = delDia.map((e) => e.recipe_id).filter(Boolean)
      expect(new Set(ids).size).toBe(ids.length) // nada se repite en el mismo día
      expect(delDia.filter((e) => ordenDe(e) > 0).length).toBeLessThanOrEqual(2)
      const sin = delDia.filter((e) => ordenDe(e) === 0)
      if (delDia.length > sin.length) expect(desajusteDia(ctx, delDia)).toBeLessThan(desajusteDia(ctx, sin))
    }
    // las fijadas se respetan y las demás se recalculan
    const fija = { ...anadidas[0], fijado: true }
    const { entradas: otra } = generarMenu(ctx, [...entradas.filter((e) => e !== anadidas[0]), fija], { rnd: semilla(10) })
    expect(otra.some((e) => e.fecha === fija.fecha && e.momento === fija.momento && ordenDe(e) === ordenDe(fija) && e.recipe_id === fija.recipe_id)).toBe(true)
    // «otra receta» para una añadida: distinta y sin repetir en el día
    const aCambiar = anadidas.find((e) => e.momento !== 'desayuno')!
    const cambio = otraAnadida(ctx, entradas, aCambiar, semilla(11))!
    expect(cambio.recipe_id).not.toBe(aCambiar.recipe_id)
    expect(entradas.filter((e) => e.fecha === cambio.fecha && e !== aCambiar).some((e) => e.recipe_id === cambio.recipe_id)).toBe(false)
  })

  it('no añade nada si el día ya está en su objetivo', () => {
    const rs = variado()
    const ctx = ctxCon(rs)
    ctx.macros = new Map(rs.map((r) => [r.id, { kcal: 850, proteina: 40, hidratos: 100, grasa: 30 }]))
    ctx.comensales = comensalesDe([{ id: 'a', household_id: 'h', nombre: 'Alberto', peso_kg: 70, factor_racion: 1 }])
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(12) })
    // 420 (desayuno estimado) + 2 × 850 = 2120 kcal, dentro del ±10 % de 2240
    expect(entradas.filter((e) => ordenDe(e) > 0)).toHaveLength(0)
  })
})

describe('cantidades', () => {
  it('convierte unidades', () => {
    const cebolla = ing('c', 'Cebolla', { unidad_base: 'ud', peso_unidad_g: 150 })
    expect(aUnidadBase(300, 'g', cebolla)).toBe(2)
    expect(aUnidadBase(1, 'kg', ing('x', 'Harina'))).toBe(1000)
    expect(aUnidadBase(2, 'cda', ing('x', 'Aceite', { unidad_base: 'ml' }))).toBe(30)
    expect(aUnidadBase(1, 'lata', ing('x', 'Atún'))).toBeNull()
    expect(enEnvases(600, 'g', { cantidad: 400, nombre: 'bandeja' })!.texto).toBe('2 bandejas (400 g) · sobran 200 g')
    expect(enEnvases(156, 'g', { cantidad: 156, nombre: 'pack de 3 latas' })!.texto).toBe('1 pack de 3 latas')
  })
})

/** Números aleatorios reproducibles */
function semilla(s: number) {
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
