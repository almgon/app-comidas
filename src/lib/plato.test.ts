import { describe, expect, it } from 'vitest'
import { evaluarPlato, factorCocinado, grupoInferido, grupoPlato, platoPorRacion, porcentajes, repartoHueco, type Reparto } from './plato'
import { combosPlato, costePlatoHueco, generarMenu, ordenDe, type ContextoMenu } from './generador'
import { fechasSemana } from './semana'
import type { Ingrediente, LineaIngrediente, Receta } from './tipos'

const ing = (id: string, nombre: string, categoria: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({
  id, household_id: null, nombre, categoria, unidad_base: 'g', peso_unidad_g: null, kcal_100: 100, proteina_100: 5, hidratos_100: 10, grasa_100: 2, es_despensa: false, ...extra,
})
const linea = (ingredient_id: string, cantidad: number, unidad = 'g', sub_recipe_id: string | null = null): LineaIngrediente => ({
  orden: 0, ingredient_id: sub_recipe_id ? null : ingredient_id, sub_recipe_id, cantidad, unidad, texto_original: ingredient_id,
})
let n = 0
const receta = (titulo: string, ingredientes: LineaIngrediente[], extra: Partial<Receta> = {}): Receta => ({
  id: `p${++n}`, household_id: 'h', titulo, foto_url: null, raciones: 1, t_prep_min: 10, t_coccion_min: 10, tipo_comida: 'ambas', grupo_proteico: null, es_base: false,
  congelable: false, dias_nevera: 3, valoracion: null, favorita: false, proteina_racion_manual: null, fuente_url: null, fuente_tipo: 'manual', notas: null,
  creado_en: '', actualizado_en: '', ingredientes, pasos: [], etiquetas: [], ...extra,
})

const CATALOGO = [
  ing('calabacin', 'Calabacín', 'Verdura'),
  ing('cebolla', 'Cebolla', 'Verdura'),
  ing('lechuga', 'Lechuga', 'Verdura'),
  ing('tomate', 'Tomate triturado', 'Conservas'),
  ing('huevo', 'Huevo', 'Huevos', { unidad_base: 'ud', peso_unidad_g: 60 }),
  ing('pollo', 'Pechuga de pollo', 'Carne'),
  ing('carne', 'Carne picada de ternera', 'Carne'),
  ing('pan', 'Pan', 'Panadería'),
  ing('pasta', 'Pasta', 'Pasta y arroz'),
  ing('arrozc', 'Arroz cocido (vasito)', 'Pasta y arroz'),
  ing('aceite', 'Aceite de oliva virgen extra', 'Despensa'),
  ing('sal', 'Sal', 'Despensa'),
  ing('lentejas', 'Lentejas secas', 'Legumbres'),
  ing('zanahoria', 'Zanahoria', 'Verdura'),
  ing('salmon', 'Salmón', 'Pescado'),
  ing('brocoli', 'Brócoli', 'Verdura'),
  ing('patata', 'Patata', 'Verdura'),
]
const mapa = new Map(CATALOGO.map((i) => [i.id, i]))

describe('grupos del plato', () => {
  it('clasifica el catálogo por sección y nombre', () => {
    const g = (nombre: string, cat: string) => grupoInferido(ing('x', nombre, cat))
    expect(g('Calabacín', 'Verdura')).toBe('verdura')
    expect(g('Plátano', 'Fruta')).toBe('verdura')
    expect(g('Patata', 'Verdura')).toBe('hidratos') // la patata no cuenta como verdura
    expect(g('Aguacate', 'Fruta')).toBe('grasa')
    expect(g('Lentejas secas', 'Legumbres')).toBe('proteina')
    expect(g('Atún en lata en aceite', 'Conservas')).toBe('proteina')
    expect(g('Tomate triturado', 'Conservas')).toBe('verdura')
    expect(g('Caldo de pollo', 'Conservas')).toBe('otro')
    expect(g('Yogur griego', 'Lácteos')).toBe('proteina')
    expect(g('Leche semidesnatada', 'Lácteos')).toBe('otro')
    expect(g('Nueces', 'Frutos secos')).toBe('grasa')
    expect(g('Aceite de oliva virgen extra', 'Despensa')).toBe('grasa')
    expect(g('Copos de avena', 'Desayuno')).toBe('hidratos')
    expect(g('Tortilla de patatas (refrigerada)', 'Refrigerados')).toBe('proteina')
    expect(g('Pan integral', 'Panadería')).toBe('hidratos')
    expect(g('Sal', 'Despensa')).toBe('otro')
  })

  it('respeta el grupo puesto a mano', () => {
    expect(grupoPlato({ ...ing('x', 'Hummus', 'Refrigerados'), grupo_plato: 'grasa' })).toBe('grasa')
  })

  it('cuenta en cocido el arroz, la pasta y las legumbres secas', () => {
    expect(factorCocinado(ing('x', 'Arroz', 'Pasta y arroz'))).toBeCloseTo(2.8)
    expect(factorCocinado(ing('x', 'Arroz cocido (vasito)', 'Pasta y arroz'))).toBe(1)
    expect(factorCocinado(ing('x', 'Garbanzos secos', 'Legumbres'))).toBe(2.5)
    expect(factorCocinado(ing('x', 'Garbanzos cocidos (bote)', 'Legumbres'))).toBe(1)
  })
})

describe('reparto de una receta', () => {
  it('calcula los % por peso y dice si cumple', () => {
    const r = receta('Pollo con verduras y arroz', [linea('pollo', 120), linea('calabacin', 200), linea('cebolla', 50), linea('arrozc', 110), linea('aceite', 10), linea('sal', 2)])
    const p = platoPorRacion(r, mapa, new Map())
    expect(p.reparto.verdura).toBe(250)
    expect(p.reparto.otro).toBe(2)
    const pc = porcentajes(p.reparto)!
    expect(pc.verdura).toBeCloseTo((250 / 490) * 100)
    expect(evaluarPlato(p.reparto).estado).toBe('cumple')
    const sinVerdura = platoPorRacion(receta('Pasta con pollo', [linea('pasta', 100), linea('pollo', 120)]), mapa, new Map())
    const ev = evaluarPlato(sinVerdura.reparto)
    expect(ev.estado).toBe('no')
    expect(ev.consejos).toContain('Falta verdura')
  })

  it('las preparaciones base cuentan en proporción a lo que se usa', () => {
    const bolo = receta('Boloñesa', [linea('carne', 500), linea('tomate', 400), linea('cebolla', 150)], { es_base: true, raciones: 4 })
    const recetas = new Map([[bolo.id, bolo]])
    const plato = receta('Pasta boloñesa', [linea(bolo.id, 210, 'g', bolo.id), linea('pasta', 80)])
    const p = platoPorRacion(plato, mapa, recetas)
    expect(p.reparto.proteina).toBeCloseTo(100) // 210 de 1050 g → una quinta parte de la carne
    expect(p.reparto.verdura).toBeCloseTo(110)
    expect(p.reparto.hidratos).toBeCloseTo(80 * 2.3)
  })

  it('el desayuno es más flexible', () => {
    const r: Reparto = { verdura: 120, proteina: 125, hidratos: 200, grasa: 15, otro: 200 } // fruta + yogur + avena en cocido + nueces
    expect(evaluarPlato(r, 'principal').estado).not.toBe('cumple')
    expect(evaluarPlato(r, 'desayuno').estado).toBe('cumple')
  })

  it('suma las recetas y los alimentos sueltos de un hueco', () => {
    const platos = new Map<string, Reparto | null>([['a', { verdura: 200, proteina: 0, hidratos: 0, grasa: 5, otro: 0 }]])
    const r = repartoHueco([{ recipe_id: 'a', origen: 'fresco', extras: [{ ingredient_id: 'pan', cantidad: 120 }] }], platos, mapa, 2)
    expect(r!.hidratos).toBe(60)
  })
})

describe('el menú cumple el método del plato', () => {
  const crema = receta('Crema de calabacín', [linea('calabacin', 700), linea('cebolla', 100), linea('aceite', 20)], { raciones: 4 })
  const tortilla = receta('Tortilla francesa', [linea('huevo', 2, 'ud'), linea('aceite', 5)], { grupo_proteico: 'huevo' })
  const pan = receta('Pan con tomate', [linea('pan', 70), linea('tomate', 10)])
  const ensalada = receta('Ensalada de pollo y arroz', [linea('lechuga', 150), linea('tomate', 100), linea('pollo', 110), linea('arrozc', 110), linea('aceite', 10)], { grupo_proteico: 'carne_blanca' })
  const pasta = receta('Pasta boloñesa sin verdura', [linea('pasta', 100), linea('carne', 120)], { grupo_proteico: 'carne_roja' })
  const lentejas = receta('Lentejas con verduras', [linea('lentejas', 50), linea('zanahoria', 150), linea('cebolla', 60), linea('patata', 60), linea('pan', 40), linea('aceite', 8)], { grupo_proteico: 'legumbre' })
  const salmon = receta('Salmón con patata y brócoli', [linea('salmon', 130), linea('brocoli', 220), linea('patata', 150), linea('aceite', 8)], { grupo_proteico: 'pescado_azul' })
  const recetas = [crema, tortilla, pan, ensalada, pasta, lentejas, salmon]
  const recetasMapa = new Map(recetas.map((r) => [r.id, r]))
  const ctx: ContextoMenu = {
    lunes: '2026-11-23', recetas, proteina: new Map(), comensales: [], congelados: [], raciones: 2, ingredientes: mapa,
    platos: new Map(recetas.map((r) => [r.id, platoPorRacion(r, mapa, recetasMapa).reparto])),
  }

  it('busca con qué completar cada receta', () => {
    const c = combosPlato(ctx)
    expect(c.get(`cena|${ensalada.id}`)!.ids).toEqual([])
    // la crema sola no cumple: se completa (con la ensalada, o con tortilla + pan)
    expect(c.get(`cena|${crema.id}`)!.ids.length).toBeGreaterThan(0)
    expect(c.get(`cena|${crema.id}`)!.coste).toBeLessThan(1)
  })

  it('pone en cada comida y cena una receta que cumple o varias que cumplen juntas', () => {
    let s = 3
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    const { entradas } = generarMenu(ctx, [], { rnd })
    let huecos = 0
    for (const f of fechasSemana(ctx.lunes))
      for (const m of ['comida', 'cena'] as const) {
        const del = entradas.filter((e) => e.fecha === f && e.momento === m)
        if (!del.some((e) => ordenDe(e) === 0 && e.recipe_id)) continue
        huecos++
        expect(costePlatoHueco(ctx, del, m)).toBe(0)
      }
    expect(huecos).toBe(14)
  })
})
