import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useMenu, useSemana } from '../lib/menu'
import { useSemanaElegida } from '../lib/useSemanaElegida'
import { sesionDomingo } from '../lib/batch'
import { DIAS_CORTOS, fechaCorta, indiceDia, sumarDias } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import SelectorSemana, { EnlacesSemana } from '../components/SelectorSemana'

export default function Domingo() {
  const [lunes, setLunes] = useSemanaElegida()
  const { mapaRecetas, mapaIngredientes } = useDatos()
  const { congelados } = useMenu()
  const semana = useSemana(lunes)
  const [cerrando, setCerrando] = useState(false)
  const domingo = sumarDias(lunes, -1)
  const estado = semana.plan?.batch ?? {}
  const items = useMemo(() => sesionDomingo(lunes, semana.entradas, mapaRecetas, estado, congelados, mapaIngredientes), [lunes, semana.entradas, mapaRecetas, estado, congelados, mapaIngredientes])
  const cerrado = semana.plan?.batch_cerrado_en
  const minutos = items.reduce((s, i) => s + (i.receta.t_prep_min ?? 0), 0)
  const alCongelador = items.reduce((s, i) => s + i.extra, 0)

  const cambiar = (id: string, cambios: { extra?: number; hecho?: boolean }) =>
    semana.guardarBatch({ ...estado, [id]: { ...(estado[id] ?? {}), ...cambios } })

  async function terminar() {
    const txt = alCongelador > 0 ? `Se guardarán ${fmt(alCongelador, 1)} raciones en el congelador para otras semanas.` : 'No hay raciones de más para congelar.'
    if (!confirm(`¿Terminar la sesión del domingo?\n${txt}`)) return
    setCerrando(true)
    try {
      await semana.cerrarBatch(items, domingo)
    } finally {
      setCerrando(false)
    }
  }

  return (
    <div>
      <header className="cabecera">
        <h1>Domingo de cocina</h1>
      </header>
      <SelectorSemana lunes={lunes} onCambiar={setLunes} />
      <EnlacesSemana lunes={lunes} actual="domingo" />
      <p className="suave">
        Sesión del domingo {fechaCorta(domingo)} para la semana del {fechaCorta(lunes)}: las preparaciones base y los platos marcados como «Cocinado el domingo» (como mínimo las comidas del lunes y del martes).
      </p>
      {semana.error && <p className="aviso">{semana.error}</p>}

      {items.length === 0 ? (
        <p className="vacio">
          No hay nada que cocinar el domingo para esta semana. <Link to={`/menu?semana=${lunes}`}>Propón el menú</Link> primero.
        </p>
      ) : (
        <>
          <section className="tarjeta resumen-batch">
            <div><b>{items.length}</b><span>preparaciones</span></div>
            <div><b>{fmt(items.reduce((s, i) => s + i.cocinar, 0), 1)}</b><span>raciones</span></div>
            <div><b>~{fmt(minutos / 60, 1)} h</b><span>de trabajo activo</span></div>
          </section>
          {cerrado && <p className="ok">✓ Sesión terminada el {new Date(cerrado).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>}
          <ol className="lista-batch">
            {items.map((i, n) => (
              <li key={i.receta.id} className={`tarjeta ${i.hecho ? 'hecho' : ''}`}>
                <div className="fila espacio">
                  <label className="check">
                    <input type="checkbox" checked={i.hecho} onChange={(e) => cambiar(i.receta.id, { hecho: e.target.checked })} />
                    <span>
                      <b>{n + 1}. {i.receta.titulo}</b> {i.esBase && <span className="chip base">Base</span>}
                    </span>
                  </label>
                  <Link to={`/receta/${i.receta.id}`} className="enlace">Receta</Link>
                </div>
                <p>
                  Cocinar <b>{fmt(i.cocinar, 1)} raciones</b>
                  {i.receta.raciones ? <span className="suave"> (la receta es para {fmt(i.receta.raciones, 1)}: ×{fmt(i.cocinar / i.receta.raciones, 2)})</span> : null}
                  {(i.receta.t_prep_min || i.receta.t_coccion_min) && <span className="suave"> · ⏱ {i.receta.t_prep_min ?? 0} + {i.receta.t_coccion_min ?? 0} min</span>}
                </p>
                {i.delCongelador > 0 && <p className="suave">❄️ Ya hay {fmt(i.delCongelador, 1)} raciones congeladas: se usan y se cocina solo el resto.</p>}
                <ul className="usos">
                  {i.usos.map((u, k) => (
                    <li key={k}>
                      {DIAS_CORTOS[indiceDia(lunes, u.fecha)]} {u.momento}: {fmt(u.raciones, 2)} rac. {u.plato ? `para ${u.plato}` : ''} → {u.destino === 'nevera' ? '🧊 nevera' : '❄️ congelar y sacar la víspera'}
                    </li>
                  ))}
                </ul>
                <div className="fila destino">
                  <span>🧊 Nevera: <b>{fmt(i.nevera, 1)}</b></span>
                  <span>❄️ Congelador: <b>{fmt(i.congelador, 1)}</b></span>
                </div>
                {i.receta.congelable && (
                  <div className="fila">
                    <span className="suave">De más para el congelador (otras semanas):</span>
                    <div className="contador">
                      <button onClick={() => cambiar(i.receta.id, { extra: Math.max(0, Math.round((i.extra - 1) * 4) / 4) })}>−</button>
                      <span>{fmt(i.extra, 2)}</span>
                      <button onClick={() => cambiar(i.receta.id, { extra: Math.round((i.extra + 1) * 4) / 4 })}>+</button>
                    </div>
                  </div>
                )}
                {i.avisos.map((a) => (
                  <p key={a} className="aviso">{a}</p>
                ))}
              </li>
            ))}
          </ol>
          <button className="boton primario" onClick={terminar} disabled={cerrando || !!cerrado}>
            {cerrado ? 'Sesión terminada' : alCongelador > 0 ? `Terminar y guardar ${fmt(alCongelador, 1)} rac. en el congelador` : 'Terminar sesión'}
          </button>
          {cerrado && (
            <button className="enlace" onClick={() => semana.guardarBatch(estado, null)}>Reabrir sesión</button>
          )}
        </>
      )}
    </div>
  )
}
