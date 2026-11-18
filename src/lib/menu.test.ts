import { describe, expect, it } from 'vitest'
import { avisosRecetario, esCenaEntreSemana, generarMenu, indicadores, objetivos, type ContextoMenu } from './generador'
import { sesionDomingo } from './batch'
import { calcularCompra } from './compra'
import { enEnvases, aUnidadBase } from './cantidades'
import { fechasSemana, indiceDia, semanaPorDefecto } from './semana'
import type { Ingrediente, Receta, GrupoProteico, TipoComida, EntradaPlan } from './tipos'

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
    lunes: LUNES, recetas, proteina: new Map(recetas.map((r) => [r.id, 35])), comensales,
    proteinaDesayuno: new Map([['a', [38, 15]], ['b', [45, 18]]]), congelados: [], raciones: 2.25,
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
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(1) })
    expect(entradas).toHaveLength(14)
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
    const distintas = nuevas.filter((e, i) => e.recipe_id !== entradas[i].recipe_id || e.origen !== entradas[i].origen)
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
    const lista = calcularCompra({ lunes: LUNES, entradas: conCongelado, recetas, ingredientes, batch, desayunos: [], comensales, envases: new Map() })
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

  it('cuenta los desayunos de cada persona', () => {
    const avena = ing('i-avena', 'Copos de avena', { envase_cantidad: 500, envase_nombre: 'paquete' })
    const lista = calcularCompra({
      lunes: LUNES, entradas: [], recetas, ingredientes: new Map([['i-avena', avena]]), batch: [], comensales, envases: new Map(), fruta: false,
      desayunos: [{ id: 'd', dias: 'lv', ingredient_id: 'i-avena', unidad: 'g', cantidades: { a: 50, b: 60 }, orden: 0 }],
    })
    expect(lista[0].cantidad).toBe(550) // (50 + 60) × 5
    expect(lista[0].detalle).toBe('2 paquetes (500 g) · sobran 450 g')
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
