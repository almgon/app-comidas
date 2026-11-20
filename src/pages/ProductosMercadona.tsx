import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useMenu } from '../lib/menu'
import { euros } from '../lib/precios'
import SelectorProducto from '../components/SelectorProducto'
import type { Ingrediente, Receta } from '../lib/tipos'

/**
 * Pasar las recetas que ya existen a productos de Mercadona: cada ingrediente que se usa en alguna receta
 * se enlaza una vez con su producto y vale para todas las recetas que lo llevan. No se borra nada.
 */
export default function ProductosMercadona() {
  const nav = useNavigate()
  const { recetas, mapaIngredientes } = useDatos()
  const { enlaces, enlazar } = useMenu()
  const [eligiendo, setEligiendo] = useState<Ingrediente | null>(null)
  const [verEnlazados, setVerEnlazados] = useState(false)
  const [verDespensa, setVerDespensa] = useState(false)

  const { usos, sueltas } = useMemo(() => {
    const usos = new Map<string, Receta[]>()
    const sueltas: { receta: Receta; texto: string }[] = []
    for (const r of recetas)
      for (const l of r.ingredientes) {
        if (l.sub_recipe_id) continue
        if (l.ingredient_id && mapaIngredientes.has(l.ingredient_id)) {
          const lista = usos.get(l.ingredient_id) ?? []
          if (!lista.includes(r)) lista.push(r)
          usos.set(l.ingredient_id, lista)
        } else if (l.texto_original.trim()) sueltas.push({ receta: r, texto: l.texto_original })
      }
    return { usos, sueltas }
  }, [recetas, mapaIngredientes])

  const filas = [...usos].map(([id, rs]) => ({ ing: mapaIngredientes.get(id)!, recetas: rs })).sort((a, b) => b.recetas.length - a.recetas.length || a.ing.nombre.localeCompare(b.ing.nombre, 'es'))
  const pendientes = filas.filter((f) => !enlaces.get(f.ing.id)?.mercadona && !f.ing.es_despensa)
  const despensa = filas.filter((f) => !enlaces.get(f.ing.id)?.mercadona && f.ing.es_despensa)
  const enlazados = filas.filter((f) => enlaces.get(f.ing.id)?.mercadona)

  const fila = (f: (typeof filas)[0]) => {
    const p = enlaces.get(f.ing.id)?.mercadona
    return (
      <li key={f.ing.id} className="fila espacio">
        <span>
          <b>{f.ing.nombre}</b>
          <br />
          <span className="suave">
            {f.recetas.length} receta{f.recetas.length === 1 ? '' : 's'}: {f.recetas.slice(0, 3).map((r) => r.titulo).join(', ')}
            {f.recetas.length > 3 ? '…' : ''}
          </span>
          {p && (
            <>
              <br />
              <span className="producto-linea">🛒 {p.nombre} · {euros(p.precio)}</span>
            </>
          )}
        </span>
        <button className={`boton ${p ? '' : 'primario'}`} onClick={() => setEligiendo(f.ing)}>{p ? 'Cambiar' : 'Elegir'}</button>
      </li>
    )
  }

  return (
    <div>
      <header className="cabecera">
        <button className="volver" onClick={() => nav(-1)} aria-label="Volver">‹</button>
        <h1>Productos de Mercadona</h1>
      </header>
      <p className="suave">
        Elige el producto de Mercadona de cada ingrediente de tus recetas. Se elige una vez y vale para todas las recetas que lo llevan: de ahí salen el precio y el envase de la lista de la compra. Las kcal y macros siguen saliendo del ingrediente.
      </p>
      <p>
        <b>{enlazados.length}</b> de {filas.length} ingredientes ya tienen producto.
      </p>

      <section className="tarjeta">
        <h2>Sin producto ({pendientes.length})</h2>
        {pendientes.length === 0 ? <p className="ok">✓ Todo enlazado</p> : <ul className="lista-simple">{pendientes.map(fila)}</ul>}
      </section>

      {despensa.length > 0 && (
        <section className="tarjeta">
          <button className="enlace" onClick={() => setVerDespensa(!verDespensa)}>
            Despensa sin producto ({despensa.length}) {verDespensa ? '▲' : '▼'}
          </button>
          {verDespensa && <ul className="lista-simple">{despensa.map(fila)}</ul>}
        </section>
      )}

      {sueltas.length > 0 && (
        <section className="tarjeta">
          <h2>Ingredientes sin vincular ({sueltas.length})</h2>
          <p className="suave">No están en el catálogo: ábrelos en la receta y pulsa «🛒 Buscar en Mercadona».</p>
          <ul className="lista-simple">
            {sueltas.slice(0, 40).map((s, i) => (
              <li key={i}>
                <Link to={`/receta/${s.receta.id}/editar`}>{s.receta.titulo}</Link>: {s.texto}
              </li>
            ))}
          </ul>
        </section>
      )}

      {enlazados.length > 0 && (
        <section className="tarjeta">
          <button className="enlace" onClick={() => setVerEnlazados(!verEnlazados)}>
            Ya enlazados ({enlazados.length}) {verEnlazados ? '▲' : '▼'}
          </button>
          {verEnlazados && <ul className="lista-simple">{enlazados.map(fila)}</ul>}
        </section>
      )}

      {eligiendo && (
        <SelectorProducto
          inicial={eligiendo.nombre}
          titulo={eligiendo.nombre}
          nota={`Se usará en las ${usos.get(eligiendo.id)?.length ?? 0} recetas que llevan «${eligiendo.nombre}».`}
          onCerrar={() => setEligiendo(null)}
          onElegir={async (p) => {
            await enlazar(eligiendo.id, 'mercadona', p.id)
            setEligiendo(null)
          }}
        />
      )}
    </div>
  )
}
