import { describe, expect, it } from 'vitest'
import { comparar, precioArticulo } from './precios'
import type { ArticuloCompra, Ingrediente, ProductoTienda } from './tipos'

const ing = (id: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({ id, household_id: null, nombre: id, categoria: 'Otros', unidad_base: 'g', peso_unidad_g: null, kcal_100: 0, proteina_100: 0, hidratos_100: 0, grasa_100: 0, es_despensa: false, ...extra })
const prod = (id: string, tienda: 'mercadona' | 'dia', cantidad: number, precio: number, unidad: 'g' | 'ml' | 'ud' = 'g'): ProductoTienda => ({
  id, household_id: null, tienda, id_externo: id, nombre: id, categoria: null, envase_cantidad: cantidad, envase_unidad: unidad, envase_texto: null, precio,
  precio_referencia: null, formato_referencia: null, url: null, foto_url: null, origen: 'auto', actualizado_en: new Date().toISOString(),
})
const art = (id: string, ingrediente: string, cantidad: number, unidad = 'g'): ArticuloCompra => ({
  id, list_id: 'l', ingredient_id: ingrediente, texto: ingrediente, categoria: 'Otros', cantidad, unidad, detalle: null, origen: null, es_despensa: false, manual: false, comprado: false, comprado_por: null, comprado_en: null,
})

describe('precios', () => {
  it('calcula envases y coste, también de unidades a gramos', () => {
    expect(precioArticulo({ cantidad: 600, unidad: 'g' }, ing('pollo'), prod('p', 'mercadona', 400, 3.2))).toMatchObject({ envases: 2, coste: 6.4 })
    expect(precioArticulo({ cantidad: 3, unidad: 'ud' }, ing('cebolla', { unidad_base: 'ud', peso_unidad_g: 150 }), prod('c', 'dia', 1000, 1.5))).toMatchObject({ envases: 1, coste: 1.5 })
  })

  it('divide la compra solo si el ahorro llega al umbral', () => {
    const ings = new Map([['a', ing('a')], ['b', ing('b')]])
    const enlaces = new Map([
      ['a', { mercadona: prod('am', 'mercadona', 500, 2), dia: prod('ad', 'dia', 500, 4) }],
      ['b', { mercadona: prod('bm', 'mercadona', 500, 5), dia: prod('bd', 'dia', 500, 2) }],
    ])
    const arts = [art('1', 'a', 500), art('2', 'b', 500)]
    const c = comparar(arts, ings, enlaces, 3)
    expect(c.mercadonaComparable).toBe(7)
    expect(c.diaComparable).toBe(6)
    expect(c.mixtoComparable).toBe(4)
    expect(c.ahorro).toBe(2)
    expect(c.dividir).toBe(false)
    expect(c.mejor).toBe('dia')
    expect(c.asignacion.get('1')).toBe('dia')
    const c2 = comparar(arts, ings, enlaces, 2)
    expect(c2.dividir).toBe(true)
    expect(c2.asignacion.get('1')).toBe('mercadona')
    expect(c2.asignacion.get('2')).toBe('dia')
  })
})
