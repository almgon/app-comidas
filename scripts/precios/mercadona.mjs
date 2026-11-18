// Precios de Mercadona (API no oficial de tienda.mercadona.es). Se ejecuta una vez por semana en GitHub Actions.
// Uso personal: pocas peticiones, despacio, y solo lectura.
import { productosDeCategoria } from './analizar.mjs'
import { comprobarSecretos, esperar, upsert } from './supabase.mjs'

const API = 'https://tienda.mercadona.es'
const CP = process.env.CODIGO_POSTAL ?? '28032'
const CABECERAS = { accept: 'application/json', 'accept-language': 'es', 'user-agent': 'AppComidas/1.0 (uso personal, 1 vez por semana)' }

async function almacen() {
  if (process.env.MERCADONA_WH) return process.env.MERCADONA_WH
  try {
    const r = await fetch(`${API}/api/postal-codes/actions/change-pc/`, {
      method: 'PUT', headers: { ...CABECERAS, 'content-type': 'application/json' }, body: JSON.stringify({ new_postal_code: CP }), redirect: 'manual',
    })
    const wh = r.headers.get('x-customer-wh')
    if (wh) return wh
    console.warn(`El código postal ${CP} no devolvió almacén (HTTP ${r.status}); se usa mad1`)
  } catch (e) {
    console.warn(`No se pudo consultar el almacén: ${e.message}; se usa mad1`)
  }
  return 'mad1'
}

async function json(ruta, wh, intento = 1) {
  const r = await fetch(`${API}${ruta}?lang=es&wh=${wh}`, { headers: CABECERAS })
  if ((r.status === 429 || r.status >= 500) && intento < 4) {
    await esperar(5000 * intento)
    return json(ruta, wh, intento + 1)
  }
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status}`)
  return r.json()
}

comprobarSecretos()
const wh = await almacen()
console.log(`Código postal ${CP} → almacén ${wh}`)
const raiz = await json('/api/categories/', wh)
const subcategorias = (raiz.results ?? []).flatMap((c) => (c.categories ?? []).map((s) => ({ id: s.id, nombre: c.name })))
console.log(`${subcategorias.length} categorías`)

const productos = new Map()
let fallos = 0
for (const s of subcategorias) {
  try {
    const datos = await json(`/api/categories/${s.id}/`, wh)
    for (const p of productosDeCategoria(datos, s.nombre)) productos.set(p.id_externo, p)
  } catch (e) {
    fallos++
    console.warn(`Categoría ${s.id}: ${e.message}`)
  }
  await esperar(700)
}
if (productos.size === 0) {
  console.error('No se ha leído ningún producto: puede que la API de Mercadona haya cambiado.')
  process.exit(1)
}
await upsert('store_products', [...productos.values()], 'tienda,id_externo')
console.log(`✓ ${productos.size} productos de Mercadona actualizados (${fallos} categorías con error)`)
