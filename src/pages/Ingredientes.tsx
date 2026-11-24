import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizar } from '../../shared/parser.js'
import { useDatos } from '../lib/datos'
import { fmt } from '../lib/nutricion'
import NuevoIngrediente from '../components/NuevoIngrediente'
import { GRUPOS_PLATO, grupoInferido, type GrupoPlato } from '../lib/plato'

export default function Ingredientes() {
  const nav = useNavigate()
  const { ingredientes, recetas, guardarIngrediente, borrarIngrediente, guardarGrupoPlato } = useDatos()
  const [errorGrupo, setErrorGrupo] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [editando, setEditando] = useState<string | null>(null)

  const usos = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of recetas) for (const l of r.ingredientes) if (l.ingredient_id) m.set(l.ingredient_id, (m.get(l.ingredient_id) ?? 0) + 1)
    return m
  }, [recetas])

  const lista = ingredientes.filter((i) => !q || normalizar(i.nombre).includes(normalizar(q)))
  const porCategoria = new Map<string, typeof lista>()
  for (const i of lista) porCategoria.set(i.categoria, [...(porCategoria.get(i.categoria) ?? []), i])

  return (
    <div>
      <header className="cabecera">
        <button className="volver" onClick={() => nav(-1)} aria-label="Volver">‹</button>
        <h1>Ingredientes</h1>
      </header>
      <div className="buscador">
        <input type="search" placeholder="Buscar ingrediente" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="boton primario" onClick={() => setEditando('nuevo')}>+ Nuevo</button>
      </div>
      {editando === 'nuevo' && (
        <div className="tarjeta">
          <NuevoIngrediente
            nombre={q}
            onCancelar={() => setEditando(null)}
            onGuardar={async (d) => {
              await guardarIngrediente(d)
              setEditando(null)
            }}
          />
        </div>
      )}
      <p className="suave">Valores aproximados por 100 g o 100 ml. Los del catálogo común no se editan; crea tu propia versión si necesitas otros valores.</p>
      <p className="suave">🍽️ Grupo del método del plato: la app lo deduce de la sección y el nombre («Auto»). Si alguno no te cuadra, cámbialo aquí (vale también para los del catálogo común).</p>
      {errorGrupo && <p className="error">{errorGrupo}</p>}
      {[...porCategoria.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([cat, items]) => (
        <section key={cat} className="tarjeta">
          <h2>{cat}</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th>Prot.</th>
                <th>Kcal</th>
                <th>Plato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) =>
                editando === i.id ? (
                  <tr key={i.id}>
                    <td colSpan={5}>
                      <NuevoIngrediente
                        inicial={i}
                        onCancelar={() => setEditando(null)}
                        onGuardar={async (d) => {
                          await guardarIngrediente(d)
                          setEditando(null)
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={i.id}>
                    <td>
                      {i.nombre}
                      {i.peso_unidad_g ? <span className="suave"> · {i.peso_unidad_aprox ? '≈ ' : ''}{fmt(i.peso_unidad_g)} g/ud</span> : null}
                      {i.household_id && <span className="chip">propio</span>}
                      {usos.get(i.id) ? <span className="suave"> · en {usos.get(i.id)} recetas</span> : null}
                    </td>
                    <td>{fmt(i.proteina_100, 1)}</td>
                    <td>{fmt(i.kcal_100)}</td>
                    <td>
                      <select
                        className="mini-select"
                        value={i.grupo_plato ?? ''}
                        aria-label={`Grupo del plato de ${i.nombre}`}
                        onChange={(e) => {
                          setErrorGrupo(null)
                          guardarGrupoPlato(i.id, (e.target.value || null) as GrupoPlato | null).catch((x) => setErrorGrupo(x.message))
                        }}
                      >
                        <option value="">Auto: {GRUPOS_PLATO.find((x) => x.valor === grupoInferido(i))!.emoji}</option>
                        {GRUPOS_PLATO.map((x) => (
                          <option key={x.valor} value={x.valor}>{x.emoji} {x.corta}</option>
                        ))}
                      </select>
                    </td>
                    <td className="derecha">
                      {i.household_id && (
                        <>
                          <button className="enlace" onClick={() => setEditando(i.id)}>Editar</button>
                          <button
                            className="enlace peligro"
                            onClick={async () => {
                              if (confirm(`¿Borrar «${i.nombre}»? Las recetas que lo usan quedarán sin vincular.`)) await borrarIngrediente(i.id)
                            }}
                          >
                            Borrar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
