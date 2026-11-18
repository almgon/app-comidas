// Prototipo de precios de Dia: lee solo las páginas de los productos que tenéis enlazados (con URL de dia.es).
// Si Dia bloquea el acceso automático, no pasa nada: la app sigue en modo semimanual (precio a mano).
import { pareceBloqueo, precioDesdeHtml } from './analizar.mjs'
import { actualizar, comprobarSecretos, esperar, leer } from './supabase.mjs'

const CABECERAS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  accept: 'text/html,application/xhtml+xml', 'accept-language': 'es-ES,es;q=0.9',
}

comprobarSecretos()
const productos = await leer("store_products?tienda=eq.dia&url=like.*dia.es*&select=id,nombre,url,precio")
console.log(`${productos.length} productos de Dia con enlace`)
let ok = 0, bloqueados = 0, sinPrecio = 0
for (const p of productos) {
  try {
    const r = await fetch(p.url, { headers: CABECERAS, redirect: 'follow' })
    const html = await r.text()
    if (pareceBloqueo(r.status, html)) {
      bloqueados++
      console.warn(`Bloqueado (${r.status}): ${p.nombre}`)
      if (bloqueados >= 3 && ok === 0) break // si bloquea desde el principio no se insiste
    } else {
      const precio = precioDesdeHtml(html)
      if (precio != null) {
        await actualizar('store_products', `id=eq.${p.id}`, { precio, origen: 'auto', actualizado_en: new Date().toISOString() })
        ok++
      } else sinPrecio++
    }
  } catch (e) {
    sinPrecio++
    console.warn(`${p.nombre}: ${e.message}`)
  }
  await esperar(3000)
}
console.log(`✓ Dia: ${ok} precios actualizados, ${bloqueados} bloqueados, ${sinPrecio} sin precio en la página`)
if (bloqueados > 0 && ok === 0) console.log('Dia bloquea el acceso automático: seguid con el modo semimanual (precio a mano en la lista de la compra).')
