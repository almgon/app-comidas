import { describe, expect, it } from 'vitest'
import { evaluarDia, grupoRacion, porcionesPersona, porcionesPorRacion, tipoGuarnicion } from './grupos'
import { cenaAnterior, costeDia, desajusteRacionesDia, generarMenu, ordenDe, otraAnadida, proponerCongelar, type ContextoMenu } from './generador'
import { fechasSemana } from './semana'
import { aMacros, nutricionPorRacion } from './nutricion'
import { comensalesDe, papelDe, type EntradaPlan, type Ingrediente, type LineaIngrediente, type Papel, type Receta } from './tipos'

const ing = (id: string, nombre: string, categoria: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({
  id, household_id: null, nombre, categoria, unidad_base: 'g', peso_unidad_g: null, kcal_100: 120, proteina_100: 6, hidratos_100: 15, grasa_100: 3, es_despensa: false, ...extra,
})
const linea = (ingredient_id: string, cantidad: number, unidad = 'g'): LineaIngrediente => ({ orden: 0, ingredient_id, sub_recipe_id: null, cantidad, unidad, texto_original: ingredient_id })
let n = 0
const receta = (titulo: string, papel: Papel, ingredientes: LineaIngrediente[], extra: Partial<Receta> = {}): Receta => ({
  id: `g${++n}`, household_id: 'h', titulo, foto_url: null, raciones: 1, t_prep_min: 10, t_coccion_min: 15, tipo_comida: 'ambas', grupo_proteico: null, es_base: false,
  papel, congelable: false, dias_nevera: 3, valoracion: null, favorita: false, proteina_racion_manual: null, fuente_url: null, fuente_tipo: 'manual', notas: null,
  creado_en: '', actualizado_en: '', ingredientes, pasos: [], etiquetas: [], ...extra,
})

const CATALOGO = [
  ing('lechuga', 'Lechuga', 'Verdura'),
  ing('tomate', 'Tomate', 'Verdura'),
  ing('calabacin', 'Calabacín', 'Verdura'),
  ing('pimiento', 'Pimiento rojo', 'Verdura'),
  ing('cebolla', 'Cebolla', 'Verdura'),
  ing('zanahoria', 'Zanahoria', 'Verdura'),
  ing('platano', 'Plátano', 'Fruta', { unidad_base: 'ud', peso_unidad_g: 120 }),
  ing('arroz', 'Arroz redondo', 'Pasta y arroz', { kcal_100: 350, hidratos_100: 78 }),
  ing('quinoa', 'Quinoa', 'Pasta y arroz', { kcal_100: 360, hidratos_100: 64 }),
  ing('patata', 'Patata', 'Verdura', { kcal_100: 80, hidratos_100: 17 }),
  ing('pan', 'Pan de barra', 'Panadería', { kcal_100: 260, hidratos_100: 50 }),
  ing('pasta', 'Macarrones', 'Pasta y arroz', { kcal_100: 350, hidratos_100: 72 }),
  ing('lentejas', 'Lentejas secas', 'Legumbres', { kcal_100: 330, proteina_100: 24 }),
  ing('pollo', 'Pechuga de pollo', 'Carne', { kcal_100: 110, proteina_100: 23, hidratos_100: 0 }),
  ing('merluza', 'Merluza', 'Pescado', { kcal_100: 80, proteina_100: 17, hidratos_100: 0 }),
  ing('salmon', 'Salmón', 'Pescado', { kcal_100: 200, proteina_100: 20, hidratos_100: 0, grasa_100: 13 }),
  ing('ternera', 'Carne picada de ternera', 'Carne', { kcal_100: 200, proteina_100: 19, hidratos_100: 0, grasa_100: 14 }),
  ing('huevo', 'Huevo', 'Huevos', { unidad_base: 'ud', peso_unidad_g: 60 }),
  ing('yogur', 'Yogur natural', 'Lácteos'),
  ing('leche', 'Leche semidesnatada', 'Lácteos', { unidad_base: 'ml' }),
  ing('queso', 'Queso curado', 'Lácteos'),
  ing('nueces', 'Nueces', 'Frutos secos', { kcal_100: 650 }),
  ing('aceite', 'Aceite de oliva virgen extra', 'Despensa', { kcal_100: 900, grasa_100: 100 }),
  ing('avena', 'Copos de avena', 'Desayuno', { kcal_100: 370, hidratos_100: 60 }),
]
const mapa = new Map(CATALOGO.map((i) => [i.id, i]))

describe('raciones por grupo', () => {
  it('clasifica los ingredientes en grupos de la AESAN', () => {
    expect(grupoRacion(mapa.get('lechuga')!)).toBe('verdura')
    expect(grupoRacion(mapa.get('platano')!)).toBe('fruta')
    expect(grupoRacion(mapa.get('arroz')!)).toBe('hidratos')
    expect(grupoRacion(mapa.get('patata')!)).toBe('hidratos')
    expect(grupoRacion(mapa.get('yogur')!)).toBe('lacteos')
    expect(grupoRacion(mapa.get('leche')!)).toBe('lacteos')
    expect(grupoRacion(mapa.get('nueces')!)).toBe('frutos_secos')
    expect(grupoRacion(mapa.get('pollo')!)).toBeNull()
    expect(grupoRacion(mapa.get('aceite')!)).toBeNull()
  })

  it('cuenta las raciones de una receta por ración', () => {
    const lentejas = receta('Lentejas con verduras', 'completo', [linea('lentejas', 240), linea('zanahoria', 300), linea('cebolla', 150), linea('patata', 400), linea('aceite', 30)], { raciones: 4 })
    const p = porcionesPorRacion(lentejas, mapa, new Map()).porciones
    expect(p.verdura).toBeCloseTo(450 / 150 / 4) // 0,75
    expect(p.hidratos).toBeCloseTo(400 / 200 / 4) // 0,5
    const des = receta('Overnight oats', 'completo', [linea('avena', 40), linea('yogur', 125), linea('platano', 1, 'ud'), linea('nueces', 15)], { tipo_comida: 'desayuno' })
    const d = porcionesPorRacion(des, mapa, new Map()).porciones
    expect(d.hidratos).toBeCloseTo(1)
    expect(d.lacteos).toBeCloseTo(1)
    expect(d.fruta).toBeCloseTo(0.8)
    expect(d.frutos_secos).toBeCloseTo(0.6)
  })

  it('reparte los alimentos sueltos y aplica el factor de cada uno', () => {
    const e = [{ momento: 'comida' as const, recipe_id: null, origen: 'fresco' as const, extras: [{ ingredient_id: 'pan', cantidad: 225 }] }]
    expect(porcionesPersona(e, 1, new Map(), mapa, 2.25).hidratos).toBeCloseTo(2)
    expect(porcionesPersona(e, 1.25, new Map(), mapa, 2.25).hidratos).toBeCloseTo(2.5)
  })

  it('dice cómo va el día', () => {
    const est = evaluarDia({ verdura: 2, fruta: 0, hidratos: 7.5, lacteos: 1, frutos_secos: 0 })
    expect(est.find((x) => x.grupo === 'verdura')!.estado).toBe('ambar')
    expect(est.find((x) => x.grupo === 'hidratos')!.estado).toBe('rojo')
    expect(est.find((x) => x.grupo === 'lacteos')!.estado).toBe('verde')
  })
})

// Recetario de prueba: platos completos, principales y guarniciones
function recetario() {
  const rs = [
    receta('Lentejas con verduras', 'completo', [linea('lentejas', 70), linea('zanahoria', 100), linea('cebolla', 50), linea('patata', 100)], { grupo_proteico: 'legumbre', congelable: true, t_coccion_min: 45 }),
    receta('Lentejas estofadas', 'completo', [linea('lentejas', 70), linea('pimiento', 80), linea('patata', 120)], { grupo_proteico: 'legumbre', congelable: true, t_coccion_min: 50 }),
    receta('Macarrones con boloñesa', 'completo', [linea('pasta', 90), linea('ternera', 100), linea('tomate', 150)], { grupo_proteico: 'carne_roja', congelable: true, t_coccion_min: 30 }),
    receta('Ensalada de lentejas', 'completo', [linea('lentejas', 60), linea('tomate', 120), linea('pimiento', 60)], { grupo_proteico: 'legumbre', t_coccion_min: 0 }),
    receta('Garbanzos salteados', 'completo', [linea('lentejas', 70), linea('calabacin', 150)], { grupo_proteico: 'legumbre', t_coccion_min: 10 }),
    receta('Filete de pollo', 'principal', [linea('pollo', 150)], { grupo_proteico: 'carne_blanca', t_coccion_min: 10 }),
    receta('Pollo al limón', 'principal', [linea('pollo', 150)], { grupo_proteico: 'carne_blanca', t_coccion_min: 15 }),
    receta('Merluza a la plancha', 'principal', [linea('merluza', 180)], { grupo_proteico: 'pescado_blanco', t_coccion_min: 10 }),
    receta('Merluza en salsa verde', 'principal', [linea('merluza', 180)], { grupo_proteico: 'pescado_blanco', t_coccion_min: 15 }),
    receta('Salmón al horno', 'principal', [linea('salmon', 150)], { grupo_proteico: 'pescado_azul', t_coccion_min: 15 }),
    receta('Tortilla francesa', 'principal', [linea('huevo', 2, 'ud')], { grupo_proteico: 'huevo', t_coccion_min: 5, tipo_comida: 'cena' }),
    receta('Arroz blanco', 'guarnicion', [linea('arroz', 70)], { t_coccion_min: 18, dias_nevera: 4, congelable: true }),
    receta('Patatas asadas', 'guarnicion', [linea('patata', 200)], { t_coccion_min: 25 }),
    receta('Quinoa', 'guarnicion', [linea('quinoa', 70)], { t_coccion_min: 15 }),
    receta('Ensalada verde', 'guarnicion', [linea('lechuga', 100), linea('tomate', 100)], { t_coccion_min: 0 }),
    receta('Verduras asadas', 'guarnicion', [linea('calabacin', 150), linea('pimiento', 100), linea('cebolla', 50)], { t_coccion_min: 25 }),
    receta('Overnight oats', 'completo', [linea('avena', 50), linea('yogur', 125), linea('platano', 1, 'ud')], { tipo_comida: 'desayuno' }),
    receta('Tostadas con tomate', 'completo', [linea('pan', 80), linea('tomate', 60)], { tipo_comida: 'desayuno' }),
  ]
  const porId = new Map(rs.map((r) => [r.id, r]))
  return { rs, porId }
}

function contexto(rs: Receta[], porId: Map<string, Receta>): ContextoMenu {
  return {
    lunes: '2026-11-23', recetas: rs, proteina: new Map(rs.map((r) => [r.id, 30])), ingredientes: mapa, congelados: [], raciones: 2.25,
    porciones: new Map(rs.map((r) => [r.id, porcionesPorRacion(r, mapa, porId).porciones])),
    macros: new Map(rs.map((r) => [r.id, aMacros(nutricionPorRacion(r, mapa, porId))])),
    comensales: comensalesDe([
      { id: 'a', household_id: 'h', nombre: 'Alberto', peso_kg: 70, factor_racion: 1 },
      { id: 'b', household_id: 'h', nombre: 'Pareja', peso_kg: 87, factor_racion: 1.25 },
    ]),
  }
}
const semilla = (s: number) => () => ((s = (s * 9301 + 49297) % 233280) / 233280)

describe('menú con platos completos y principales con guarniciones', () => {
  const { rs, porId } = recetario()
  const ctx = contexto(rs, porId)

  it('los principales llevan 1 o 2 guarniciones y las guarniciones nunca van solas', () => {
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(1) })
    let principales = 0
    for (const f of fechasSemana(ctx.lunes))
      for (const m of ['comida', 'cena'] as const) {
        const del = entradas.filter((e) => e.fecha === f && e.momento === m)
        const p = del.find((e) => ordenDe(e) === 0)!
        const r = porId.get(p.recipe_id!)!
        expect(papelDe(r)).not.toBe('guarnicion')
        const g = del.filter((e) => ordenDe(e) > 0)
        expect(g.every((e) => papelDe(porId.get(e.recipe_id!)!) === 'guarnicion')).toBe(true)
        if (papelDe(r) === 'principal') {
          principales++
          expect(g.length).toBeGreaterThanOrEqual(1)
          expect(g.length).toBeLessThanOrEqual(2)
        }
        const ids = entradas.filter((e) => e.fecha === f && e.recipe_id).map((e) => e.recipe_id)
        expect(new Set(ids).size).toBe(ids.length) // nada se repite el mismo día (salvo sobras de ayer, que son otro día)
      }
    expect(principales).toBeGreaterThan(0)
  })

  it('las guarniciones mejoran las raciones del día', () => {
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(2) })
    let mejor = 0
    for (const f of fechasSemana(ctx.lunes)) {
      const del = entradas.filter((e) => e.fecha === f)
      const sin = del.filter((e) => ordenDe(e) === 0)
      if (del.length === sin.length) continue
      expect(desajusteRacionesDia(ctx, del)).toBeLessThanOrEqual(desajusteRacionesDia(ctx, sin) + 1e-9)
      if (desajusteRacionesDia(ctx, del) < desajusteRacionesDia(ctx, sin)) mejor++
    }
    expect(mejor).toBeGreaterThan(0)
  })

  it('cambiar una guarnición busca otra del mismo tipo', () => {
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(3) })
    const g = entradas.find((e) => ordenDe(e) > 0 && e.momento !== 'desayuno' && tipoGuarnicion(ctx.porciones!.get(e.recipe_id!)) === 'hidratos')!
    const otra = otraAnadida(ctx, entradas, g, semilla(4))!
    expect(otra.recipe_id).not.toBe(g.recipe_id)
    expect(tipoGuarnicion(ctx.porciones!.get(otra.recipe_id!))).toBe('hidratos')
  })

  it('al pedir otro plato para un hueco, le pone guarniciones si es un principal', () => {
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(5) })
    for (let s = 6; s < 12; s++) {
      const { entradas: nuevas } = generarMenu(ctx, entradas, { soloHueco: { fecha: '2026-11-28', momento: 'cena' }, rnd: semilla(s), intentos: 4 })
      const del = nuevas.filter((e) => e.fecha === '2026-11-28' && e.momento === 'cena')
      const p = del.find((e) => ordenDe(e) === 0)!
      if (papelDe(porId.get(p.recipe_id!)!) === 'principal') expect(del.length).toBeGreaterThan(1)
      // el resto de la semana no cambia
      const resto = (xs: EntradaPlan[]) => xs.filter((e) => !(e.fecha === '2026-11-28' && e.momento === 'cena')).map((e) => `${e.fecha}|${e.momento}|${ordenDe(e)}|${e.recipe_id}`).sort()
      expect(resto(nuevas)).toEqual(resto(entradas))
    }
  })

  it('aprovecha sobras de la cena para la comida del día siguiente entre semana', () => {
    // cenas rápidas que dan para dos días
    const extra = [
      receta('Pollo al curry rápido', 'completo', [linea('pollo', 140), linea('arroz', 60), linea('pimiento', 150), linea('cebolla', 100)], { grupo_proteico: 'carne_blanca', t_coccion_min: 20, dias_nevera: 3 }),
    ]
    const todos = [...rs, ...extra]
    const c2 = contexto(todos, new Map(todos.map((r) => [r.id, r])))
    let conSobras = 0
    for (let s = 1; s <= 4; s++) {
      const { entradas } = generarMenu(c2, [], { rnd: semilla(s) })
      for (const e of entradas.filter((x) => x.origen === 'sobras' && ordenDe(x) === 0)) {
        conSobras++
        const cena = cenaAnterior(entradas, e.fecha, c2.lunes)!
        expect(cena.recipe_id).toBe(e.recipe_id)
        expect(['fresco', 'batch']).toContain(cena.origen)
        expect(e.momento).toBe('comida')
      }
    }
    expect(conSobras).toBeGreaterThan(0)
  })

  it('propone cocinar de más algunos platos congelables', () => {
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(7) })
    const extra = entradas.filter((e) => (e.cocinar_extra ?? 0) > 0)
    expect(extra.length).toBeGreaterThanOrEqual(1)
    expect(extra.length).toBeLessThanOrEqual(2)
    expect(new Set(extra.map((e) => e.recipe_id)).size).toBe(extra.length)
    for (const e of extra) {
      expect(porId.get(e.recipe_id!)!.congelable).toBe(true)
      expect(e.cocinar_extra).toBeCloseTo(2.25)
    }
    // con 0 a la semana no propone nada; lo fijado se respeta
    expect(proponerCongelar({ ...ctx, congelarPorSemana: 0 }, entradas.map((e) => ({ ...e, cocinar_extra: 0 }))).some((e) => (e.cocinar_extra ?? 0) > 0)).toBe(false)
    const fija = { ...extra[0], fijado: true, cocinar_extra: 4 }
    const res = proponerCongelar(ctx, entradas.map((e) => (e === extra[0] ? fija : e)))
    expect(res.find((e) => e.fecha === fija.fecha && e.momento === fija.momento && ordenDe(e) === 0)!.cocinar_extra).toBe(4)
  })

  it('un día con todo planificado puntúa mejor con guarniciones que sin ellas', () => {
    const del: EntradaPlan[] = [
      { fecha: '2026-11-28', momento: 'comida', orden: 0, recipe_id: rs[5].id, raciones: 2.25, origen: 'fresco', freezer_item_id: null, fijado: false, nota: null },
      { fecha: '2026-11-28', momento: 'cena', orden: 0, recipe_id: rs[7].id, raciones: 2.25, origen: 'fresco', freezer_item_id: null, fijado: false, nota: null },
    ]
    const con = [...del, { ...del[0], orden: 1, recipe_id: rs[11].id }, { ...del[0], orden: 2, recipe_id: rs[15].id }, { ...del[1], orden: 1, recipe_id: rs[14].id }]
    expect(costeDia(ctx, con)).toBeLessThan(costeDia(ctx, del))
  })
})

