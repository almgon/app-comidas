import { describe, expect, it } from 'vitest'
import { factorCocinado, grupoInferido, grupoPlato, porcentajes, repartoEntradas, repartoPorRacion, tipoGuarnicion, type Reparto } from './reparto'
import type { Ingrediente, LineaIngrediente, Receta } from './tipos'

const ing = (id: string, nombre: string, categoria: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({
  id, household_id: null, nombre, categoria, unidad_base: 'g', peso_unidad_g: null, kcal_100: 100, proteina_100: 5, hidratos_100: 10, grasa_100: 2, es_despensa: false, ...extra,
})
const linea = (ingredient_id: string, cantidad: number, unidad = 'g', sub_recipe_id: string | null = null): LineaIngrediente => ({
  orden: 0, ingredient_id: sub_recipe_id ? null : ingredient_id, sub_recipe_id, cantidad, unidad, texto_original: ingredient_id,
})
let n = 0
const receta = (titulo: string, ingredientes: LineaIngrediente[], extra: Partial<Receta> = {}): Receta => ({
  id: `p${++n}`, household_id: 'h', titulo, foto_url: null, raciones: 1, t_prep_min: 10, t_coccion_min: 10, tipo_comida: 'ambas', es_base: false,
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

describe('grupos de cada ingrediente', () => {
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
  it('calcula los % por peso, sin objetivos', () => {
    const r = receta('Pollo con verduras y arroz', [linea('pollo', 120), linea('calabacin', 200), linea('cebolla', 50), linea('arrozc', 110), linea('aceite', 10), linea('sal', 2)])
    const p = repartoPorRacion(r, mapa, new Map())
    expect(p.reparto.verdura).toBe(250)
    expect(p.reparto.otro).toBe(2)
    const pc = porcentajes(p.reparto)!
    expect(pc.verdura).toBeCloseTo((250 / 490) * 100)
    const sinVerdura = repartoPorRacion(receta('Pasta con pollo', [linea('pasta', 100), linea('pollo', 120)]), mapa, new Map())
    expect(porcentajes(sinVerdura.reparto)!.verdura).toBe(0)
    expect(porcentajes(null)).toBeNull()
  })

  it('las preparaciones base cuentan en proporción a lo que se usa', () => {
    const bolo = receta('Boloñesa', [linea('carne', 500), linea('tomate', 400), linea('cebolla', 150)], { es_base: true, raciones: 4 })
    const recetas = new Map([[bolo.id, bolo]])
    const plato = receta('Pasta boloñesa', [linea(bolo.id, 210, 'g', bolo.id), linea('pasta', 80)])
    const p = repartoPorRacion(plato, mapa, recetas)
    expect(p.reparto.proteina).toBeCloseTo(100) // 210 de 1050 g → una quinta parte de la carne
    expect(p.reparto.verdura).toBeCloseTo(110)
    expect(p.reparto.hidratos).toBeCloseTo(80 * 2.3)
  })

  it('suma el día entero: recetas y alimentos sueltos (repartidos entre el hogar), sin contar lo de fuera', () => {
    const platos = new Map<string, Reparto | null>([
      ['a', { verdura: 200, proteina: 100, hidratos: 0, grasa: 5, otro: 0 }],
      ['b', { verdura: 50, proteina: 0, hidratos: 150, grasa: 10, otro: 0 }],
      ['c', null],
    ])
    const d = repartoEntradas(
      [
        { recipe_id: 'b', origen: 'fresco', extras: [{ ingredient_id: 'pan', cantidad: 120 }] },
        { recipe_id: 'a', origen: 'fresco', extras: [] },
        { recipe_id: 'c', origen: 'fresco', extras: [] },
        { recipe_id: null, origen: 'libre', extras: [] },
      ],
      platos, mapa, 2,
    )
    expect(d.reparto!.hidratos).toBe(150 + 60)
    expect(d.reparto!.verdura).toBe(250)
    expect(d.sinDatos).toBe(1)
    expect(d.fuera).toBe(true)
    const pc = porcentajes(d.reparto)!
    expect(pc.verdura + pc.proteina + pc.hidratos + pc.grasa).toBeCloseTo(100)
  })

  it('sabe si una guarnición es de verdura o de hidratos', () => {
    expect(tipoGuarnicion({ verdura: 200, proteina: 0, hidratos: 0, grasa: 5, otro: 0 })).toBe('verdura')
    expect(tipoGuarnicion({ verdura: 0, proteina: 0, hidratos: 196, grasa: 0, otro: 0 })).toBe('hidratos')
    expect(tipoGuarnicion(null)).toBe('otra')
  })
})
