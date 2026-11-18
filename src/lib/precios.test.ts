import { describe, expect, it } from 'vitest'
import { precioArticulo, totalCompra } from './precios'
import type { ArticuloCompra, Ingrediente, ProductoTienda } from './tipos'

const ing = (id: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({ id, household_id: null, nombre: id, categoria: 'Otros', unidad_base: 'g', peso_unidad_g: null, kcal_100: 0, proteina_100: 0, hidratos_100: 0, grasa_100: 0, es_despensa: false, ...extra })
const prod = (id: string, tienda: 'mercadona', cantidad: number, precio: number, unidad: 'g' | 'ml' | 'ud' = 'g'): ProductoTienda => ({
  id, household_id: null, tienda, id_externo: id, nombre: id, categoria: null, envase_cantidad: cantidad, envase_unidad: unidad, envase_texto: null, precio,
  precio_referencia: null, formato_referencia: null, url: null, foto_url: null, origen: 'auto', actualizado_en: new Date().toISOString(),
})
const art = (id: string, ingrediente: string, cantidad: number, unidad = 'g'): ArticuloCompra => ({
  id, list_id: 'l', ingredient_id: ingrediente, texto: ingrediente, categoria: 'Otros', cantidad, unidad, detalle: null, origen: null, es_despensa: false, manual: false, comprado: false, comprado_por: null, comprado_en: null,
})

describe('precios', () => {
  it('calcula envases y coste, también de unidades a gramos', () => {
    expect(precioArticulo({ cantidad: 600, unidad: 'g' }, ing('pollo'), prod('p', 'mercadona', 400, 3.2))).toMatchObject({ envases: 2, coste: 6.4 })
    expect(precioArticulo({ cantidad: 3, unidad: 'ud' }, ing('cebolla', { unidad_base: 'ud', peso_unidad_g: 150 }), prod('c', 'mercadona', 1000, 1.5))).toMatchObject({ envases: 1, coste: 1.5 })
  })

  it('suma el total de Mercadona y cuenta lo que no tiene precio', () => {
    const ings = new Map([['a', ing('a')], ['b', ing('b')]])
    const enlaces = new Map([['a', { mercadona: prod('am', 'mercadona', 500, 2) }]])
    const t = totalCompra([art('1', 'a', 900), art('2', 'b', 500)], ings, enlaces)
    expect(t.total).toBe(4)
    expect(t.conPrecio).toBe(1)
    expect(t.sinPrecio).toBe(1)
    expect(t.precios.get('1')).toMatchObject({ envases: 2, coste: 4 })
  })
})
