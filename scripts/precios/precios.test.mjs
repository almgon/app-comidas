import { describe, expect, it } from 'vitest'
import { envaseMercadona, pareceBloqueo, precioDesdeHtml, productosDeCategoria } from './analizar.mjs'

describe('Mercadona', () => {
  it('convierte el formato del envase', () => {
    expect(envaseMercadona({ unit_size: 0.5, size_format: 'kg' })).toEqual({ cantidad: 500, unidad: 'g' })
    expect(envaseMercadona({ unit_size: 6, size_format: 'l', is_pack: true, total_units: 6 })).toEqual({ cantidad: 6000, unidad: 'ml' })
    expect(envaseMercadona({ total_units: 12 })).toEqual({ cantidad: 12, unidad: 'ud' })
  })
  it('lee los productos de una categoría con subcategorías', () => {
    const json = { id: 112, name: 'Aceite', categories: [{ id: 420, name: 'Aceite de oliva', products: [
      { id: '4241', display_name: 'Aceite de oliva virgen extra Hacendado', packaging: 'Garrafa', share_url: 'https://tienda.mercadona.es/product/4241/x', thumbnail: 'https://prod.x/4241.jpg',
        price_instructions: { unit_price: '19.95', bulk_price: '3.99', reference_price: '3.990', reference_format: 'L', unit_size: 5, size_format: 'l', approx_size: false } },
      { id: '1', display_name: 'Sin precio', price_instructions: {} },
    ] }] }
    const ps = productosDeCategoria(json, 'Aceite, especias y salsas')
    expect(ps).toHaveLength(1)
    expect(ps[0]).toMatchObject({ tienda: 'mercadona', id_externo: '4241', precio: 19.95, envase_cantidad: 5000, envase_unidad: 'ml', categoria: 'Aceite, especias y salsas', precio_referencia: 3.99 })
  })
})

describe('Dia', () => {
  it('saca el precio del JSON-LD', () => {
    const html = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Leche","offers":{"@type":"Offer","price":"0.95","priceCurrency":"EUR"}}</script>'
    expect(precioDesdeHtml(html)).toBe(0.95)
  })
  it('o de las metaetiquetas', () => {
    expect(precioDesdeHtml('<meta property="product:price:amount" content="2,49">')).toBe(2.49)
  })
  it('detecta bloqueos', () => {
    expect(pareceBloqueo(403, '')).toBe(true)
    expect(pareceBloqueo(200, '<div id="captcha">')).toBe(true)
    expect(pareceBloqueo(200, '<html>ok</html>')).toBe(false)
  })
})
