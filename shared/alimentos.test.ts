import { describe, it, expect } from 'vitest'
import { alimentoDesdeOff, nombreConMarca, sinDuplicados } from './alimentos.js'

describe('alimentoDesdeOff', () => {
  it('convierte un producto', () => {
    const a = alimentoDesdeOff({ code: '8480000123', product_name_es: 'queso fresco batido 0%', brands: 'Hacendado,Mercadona', quantity: '500 g', nutriments: { 'energy-kcal_100g': 46, proteins_100g: 8, carbohydrates_100g: 3.5, fat_100g: 0.2 } })!
    expect(a).toMatchObject({ nombre: 'Queso fresco batido 0%', marca: 'Hacendado', unidad_base: 'g', proteina_100: 8, kcal_100: 46 })
    expect(nombreConMarca(a)).toBe('Queso fresco batido 0% (Hacendado)')
  })
  it('detecta líquidos y kJ', () => {
    const a = alimentoDesdeOff({ code: '1', product_name: 'Bebida de avena', quantity: '1 l', nutriments: { 'energy-kj_100g': 188, proteins_100g: '0,5' } })!
    expect(a.unidad_base).toBe('ml')
    expect(a.kcal_100).toBe(45)
    expect(a.proteina_100).toBe(0.5)
  })
  it('descarta productos sin nutrientes', () => {
    expect(alimentoDesdeOff({ code: '2', product_name: 'X', nutriments: {} })).toBeNull()
  })
  it('quita duplicados', () => {
    const base = { formato: null, unidad_base: 'g' as const, kcal_100: 1, proteina_100: 1, hidratos_100: null, grasa_100: null }
    const l = sinDuplicados([
      { ...base, codigo_off: '1', nombre: 'Atún claro', marca: 'Hacendado' },
      { ...base, codigo_off: '1', nombre: 'Atún claro', marca: 'Hacendado' },
      { ...base, codigo_off: '2', nombre: 'Atún  claro', marca: 'hacendado' },
      { ...base, codigo_off: '3', nombre: 'Atún claro', marca: 'Dia' },
    ])
    expect(l.map((x) => x.codigo_off)).toEqual(['1', '3'])
  })
})
