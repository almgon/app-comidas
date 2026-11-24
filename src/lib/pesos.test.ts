import { describe, expect, it } from 'vitest'
import { esProteinaPlato, pesoPiezaAprox } from './pesos'
import { gramosDe, nutricionPorRacion } from './nutricion'
import { calcularCompra } from './compra'
import type { Ingrediente, LineaIngrediente, Receta } from './tipos'

const ing = (id: string, nombre: string, categoria: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({
  id, household_id: null, nombre, categoria, unidad_base: 'g', peso_unidad_g: null, kcal_100: 100, proteina_100: 20, hidratos_100: 0, grasa_100: 5, es_despensa: false, ...extra,
})
const linea = (ingredient_id: string, cantidad: number | null, unidad: string | null): LineaIngrediente => ({ orden: 0, ingredient_id, sub_recipe_id: null, cantidad, unidad, texto_original: ingredient_id })
const receta = (raciones: number, ingredientes: LineaIngrediente[]): Receta => ({
  id: 'r', household_id: 'h', titulo: 'Plato', foto_url: null, raciones, t_prep_min: 10, t_coccion_min: 20, tipo_comida: 'ambas', grupo_proteico: 'carne_blanca',
  es_base: false, congelable: false, dias_nevera: 3, valoracion: null, favorita: false, proteina_racion_manual: null, fuente_url: null, fuente_tipo: 'manual',
  notas: null, creado_en: '', actualizado_en: '', ingredientes, pasos: [], etiquetas: [],
})

describe('pesos por pieza de verdura y fruta', () => {
  it('da el peso de una pieza mediana', () => {
    expect(pesoPiezaAprox('Patatas', 'Verdura')).toBe(200)
    expect(pesoPiezaAprox('Brócoli', 'Verdura')).toBe(400)
    expect(pesoPiezaAprox('Tomate cherry', 'Verdura')).toBe(15)
    expect(pesoPiezaAprox('Tomate', 'Verdura')).toBe(150)
    expect(pesoPiezaAprox('Champiñones', 'Verdura')).toBe(20)
    expect(pesoPiezaAprox('Mango', 'Fruta')).toBe(300)
    expect(pesoPiezaAprox('Col de Bruselas', 'Verdura')).toBe(15)
  })
  it('no se aplica a lo elaborado ni a otras secciones', () => {
    expect(pesoPiezaAprox('Tomate triturado', 'Conservas')).toBeNull()
    expect(pesoPiezaAprox('Tomate frito', 'Otros')).toBeNull()
    expect(pesoPiezaAprox('Yogur de fresa', 'Lácteos')).toBeNull()
    expect(pesoPiezaAprox('Ajo en polvo', 'Despensa')).toBeNull()
    expect(pesoPiezaAprox('Pimentón', 'Despensa')).toBeNull()
    expect(pesoPiezaAprox('Espinacas', 'Verdura')).toBeNull()
  })
  it('«2 patatas» se cuentan como 400 g', () => {
    const patata = ing('p', 'Patata', 'Verdura', { peso_unidad_g: pesoPiezaAprox('Patata', 'Verdura') })
    expect(gramosDe({ cantidad: 2, unidad: null }, patata, 2)).toBe(400)
  })
})

describe('proteína sin peso: 150 g por ración', () => {
  const pollo = ing('pollo', 'Pechuga de pollo', 'Carne')
  const merluza = ing('merluza', 'Merluza', 'Pescado')
  it('sabe qué es proteína', () => {
    expect(esProteinaPlato(pollo)).toBe(true)
    expect(esProteinaPlato(ing('t', 'Tofu firme', 'Refrigerados'))).toBe(true)
    expect(esProteinaPlato(ing('h', 'Huevo', 'Huevos'))).toBe(false)
    expect(esProteinaPlato(ing('c', 'Cebolla', 'Verdura'))).toBe(false)
  })
  it('sin cantidad, en unidades o en filetes: 150 g por ración', () => {
    expect(gramosDe({ cantidad: null, unidad: null }, pollo, 4)).toBe(600)
    expect(gramosDe({ cantidad: 2, unidad: 'ud' }, pollo, 2)).toBe(300)
    expect(gramosDe({ cantidad: 4, unidad: 'filete' }, merluza, 2)).toBe(300)
  })
  it('si se pone el peso, se respeta', () => {
    expect(gramosDe({ cantidad: 500, unidad: 'g' }, pollo, 4)).toBe(500)
    expect(gramosDe({ cantidad: 1, unidad: 'kg' }, pollo, 4)).toBe(1000)
    // con peso por unidad propio, cuentan las unidades
    expect(gramosDe({ cantidad: 2, unidad: 'ud' }, { ...pollo, peso_unidad_g: 250 }, 4)).toBe(500)
  })
  it('cuenta para la nutrición y para la lista de la compra', () => {
    const r = receta(2, [linea('pollo', null, null)])
    const ings = new Map([[pollo.id, pollo]])
    expect(nutricionPorRacion(r, ings, new Map()).proteina).toBeCloseTo(30) // 150 g × 20 %
    const lista = calcularCompra({
      lunes: '2026-11-23', recetas: new Map([[r.id, r]]), ingredientes: ings, batch: [], comensales: [], envases: new Map(), fruta: false,
      entradas: [{ fecha: '2026-11-25', momento: 'cena', recipe_id: r.id, raciones: 2, origen: 'fresco', freezer_item_id: null, fijado: false, nota: null }],
    })
    expect(lista.find((x) => x.ingredient_id === 'pollo')!.cantidad).toBe(300)
  })
})
