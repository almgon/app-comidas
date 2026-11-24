import { describe, expect, it } from 'vitest'
import { repartoPorRacion, tipoGuarnicion } from './reparto'
import { contarTipos, tipoReceta } from './frecuencias'
import { cenaAnterior, generarMenu, ordenDe, otraAnadida, proponerCongelar, type ContextoMenu } from './generador'
import { fechasSemana } from './semana'
import { aMacros, nutricionPorRacion } from './nutricion'
import { comensalesDe, papelDe, type EntradaPlan, type Ingrediente, type LineaIngrediente, type Papel, type Receta } from './tipos'

const ing = (id: string, nombre: string, categoria: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({
  id, household_id: null, nombre, categoria, unidad_base: 'g', peso_unidad_g: null, kcal_100: 120, proteina_100: 6, hidratos_100: 15, grasa_100: 3, es_despensa: false, ...extra,
})
const linea = (ingredient_id: string, cantidad: number, unidad = 'g'): LineaIngrediente => ({ orden: 0, ingredient_id, sub_recipe_id: null, cantidad, unidad, texto_original: ingredient_id })
let n = 0
const receta = (titulo: string, papel: Papel, ingredientes: LineaIngrediente[], extra: Partial<Receta> = {}): Receta => ({
  id: `g${++n}`, household_id: 'h', titulo, foto_url: null, raciones: 1, t_prep_min: 10, t_coccion_min: 15, tipo_comida: 'ambas', es_base: false,
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

// Recetario de prueba: platos completos, principales y guarniciones
function recetario() {
  const rs = [
    receta('Lentejas con verduras', 'completo', [linea('lentejas', 70), linea('zanahoria', 100), linea('cebolla', 50), linea('patata', 100)], { congelable: true, t_coccion_min: 45 }),
    receta('Lentejas estofadas', 'completo', [linea('lentejas', 70), linea('pimiento', 80), linea('patata', 120)], { congelable: true, t_coccion_min: 50 }),
    receta('Macarrones con boloñesa', 'completo', [linea('pasta', 90), linea('ternera', 100), linea('tomate', 150)], { congelable: true, t_coccion_min: 30 }),
    receta('Ensalada de lentejas', 'completo', [linea('lentejas', 60), linea('tomate', 120), linea('pimiento', 60)], { t_coccion_min: 0 }),
    receta('Garbanzos salteados', 'completo', [linea('lentejas', 70), linea('calabacin', 150)], { t_coccion_min: 10 }),
    receta('Filete de pollo', 'principal', [linea('pollo', 150)], { t_coccion_min: 10 }),
    receta('Pollo al limón', 'principal', [linea('pollo', 150)], { t_coccion_min: 15 }),
    receta('Merluza a la plancha', 'principal', [linea('merluza', 180)], { t_coccion_min: 10 }),
    receta('Merluza en salsa verde', 'principal', [linea('merluza', 180)], { t_coccion_min: 15 }),
    receta('Salmón al horno', 'principal', [linea('salmon', 150)], { t_coccion_min: 15 }),
    receta('Tortilla francesa', 'principal', [linea('huevo', 2, 'ud')], { t_coccion_min: 5, tipo_comida: 'cena' }),
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
    repartos: new Map(rs.map((r) => [r.id, repartoPorRacion(r, mapa, porId).reparto])),
    tipos: new Map(rs.map((r) => [r.id, tipoReceta(r, mapa, porId)])),
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

  it('a un principal le pone verdura + hidratos si hay de las dos', () => {
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(2) })
    let mezcla = 0
    for (const f of fechasSemana(ctx.lunes))
      for (const m of ['comida', 'cena'] as const) {
        const g = entradas.filter((e) => e.fecha === f && e.momento === m && ordenDe(e) > 0 && e.origen !== 'sobras')
        if (g.length === 2) {
          expect(new Set(g.map((e) => tipoGuarnicion(ctx.repartos!.get(e.recipe_id!))))).toEqual(new Set(['verdura', 'hidratos']))
          mezcla++
        }
      }
    expect(mezcla).toBeGreaterThan(0)
  })

  it('cambiar una guarnición busca otra del mismo tipo', () => {
    const { entradas } = generarMenu(ctx, [], { rnd: semilla(3) })
    const g = entradas.find((e) => ordenDe(e) > 0 && e.momento !== 'desayuno' && tipoGuarnicion(ctx.repartos!.get(e.recipe_id!)) === 'hidratos')!
    const otra = otraAnadida(ctx, entradas, g, semilla(4))!
    expect(otra.recipe_id).not.toBe(g.recipe_id)
    expect(tipoGuarnicion(ctx.repartos!.get(otra.recipe_id!))).toBe('hidratos')
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
      receta('Pollo al curry rápido', 'completo', [linea('pollo', 140), linea('arroz', 60), linea('pimiento', 150), linea('cebolla', 100)], { t_coccion_min: 20, dias_nevera: 3 }),
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

  it('el tipo de cada receta sale de sus ingredientes y se acerca a las veces elegidas', () => {
    const t = (titulo: string) => ctx.tipos!.get(rs.find((r) => r.titulo === titulo)!.id)
    expect(t('Lentejas con verduras')).toBe('legumbre')
    expect(t('Macarrones con boloñesa')).toBe('carne_roja')
    expect(t('Salmón al horno')).toBe('pescado_azul')
    expect(t('Merluza a la plancha')).toBe('pescado_blanco')
    expect(t('Tortilla francesa')).toBe('huevo')
    expect(t('Arroz blanco')).toBeNull()
    // cuando lo pedido llena las 14 comidas y cenas, el menú lo cumple
    const veces = (f: NonNullable<ContextoMenu['frecuencias']>) => contarTipos(generarMenu({ ...ctx, frecuencias: f }, [], { rnd: semilla(13) }).entradas, ctx.tipos!)
    const a = { legumbre: 2, pescado_blanco: 3, pescado_azul: 2, carne_blanca: 5, carne_roja: 0, huevo: 2, vegetal: null }
    expect(veces(a)).toEqual({ ...a, vegetal: 0 })
    const b = { legumbre: 5, pescado_blanco: 2, pescado_azul: 1, carne_blanca: 3, carne_roja: 2, huevo: 1, vegetal: null }
    expect(veces(b)).toEqual({ ...b, vegetal: 0 })
  })
})

