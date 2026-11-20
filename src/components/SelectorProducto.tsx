import { useEffect, useState, type ReactNode } from 'react'
import { useMenu } from '../lib/menu'
import { euros } from '../lib/precios'
import { fmtBase } from '../lib/cantidades'
import type { ProductoTienda } from '../lib/tipos'

/** Buscador de productos de Mercadona (catálogo que actualiza el Action de precios) */
export default function SelectorProducto({ inicial, titulo, nota, onElegir, onCerrar }: { inicial: string; titulo: string; nota?: ReactNode; onElegir: (p: ProductoTienda) => Promise<void>; onCerrar: () => void }) {
  const { buscarProductos } = useMenu()
  const [q, setQ] = useState(inicial)
  const [res, setRes] = useState<ProductoTienda[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return
    const t = window.setTimeout(() => {
      buscarProductos('mercadona', q)
        .then((r) => {
          setRes(r)
          setError(null)
        })
        .catch((e) => setError(e.message))
    }, 300)
    return () => window.clearTimeout(t)
  }, [q, buscarProductos])

  async function elegir(p: ProductoTienda) {
    setGuardando(true)
    try {
      await onElegir(p)
    } catch (e: any) {
      setError(e.message ?? String(e))
      setGuardando(false)
    }
  }

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="fila espacio">
          <h2>🛒 {titulo}</h2>
          <button type="button" className="enlace" onClick={onCerrar}>Cerrar</button>
        </div>
        {nota && <p className="suave">{nota}</p>}
        <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en Mercadona…" />
        {error && <p className="error">{error}</p>}
        {guardando && <p className="suave">Guardando…</p>}
        {res && res.length === 0 && <p className="suave">Sin resultados. Prueba con menos palabras (p. ej. «tomate triturado»).</p>}
        <ul className="resultados-off">
          {(res ?? []).map((r) => (
            <li key={r.id}>
              <button type="button" disabled={guardando} onClick={() => elegir(r)}>
                <b>{r.nombre}</b>
                <span className="suave">
                  {r.envase_texto || (r.envase_cantidad ? fmtBase(r.envase_cantidad, r.envase_unidad) : '')} · {euros(r.precio)}
                  {r.precio_referencia ? ` · ${euros(r.precio_referencia)}/${r.formato_referencia ?? ''}` : ''}
                  {r.categoria ? ` · ${r.categoria}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
