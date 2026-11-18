// Escritura en Supabase con la clave de servicio (solo en GitHub Actions, nunca en la app)
const base = (process.env.SUPABASE_URL ?? '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
const clave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

export function comprobarSecretos() {
  if (!base || !clave) {
    console.error('Faltan los secretos SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en GitHub (Settings → Secrets and variables → Actions).')
    process.exit(1)
  }
}

const cabeceras = (extra = {}) => ({ apikey: clave, authorization: `Bearer ${clave}`, 'content-type': 'application/json', ...extra })

export async function upsert(tabla, filas, conflicto) {
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500)
    const r = await fetch(`${base}/rest/v1/${tabla}?on_conflict=${conflicto}`, {
      method: 'POST',
      headers: cabeceras({ prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(lote),
    })
    if (!r.ok) throw new Error(`Supabase ${tabla}: ${r.status} ${await r.text()}`)
  }
}

export async function leer(ruta) {
  const r = await fetch(`${base}/rest/v1/${ruta}`, { headers: cabeceras() })
  if (!r.ok) throw new Error(`Supabase ${ruta}: ${r.status} ${await r.text()}`)
  return r.json()
}

export async function actualizar(tabla, filtro, cambios) {
  const r = await fetch(`${base}/rest/v1/${tabla}?${filtro}`, { method: 'PATCH', headers: cabeceras({ prefer: 'return=minimal' }), body: JSON.stringify(cambios) })
  if (!r.ok) throw new Error(`Supabase ${tabla}: ${r.status} ${await r.text()}`)
}

export const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms))
