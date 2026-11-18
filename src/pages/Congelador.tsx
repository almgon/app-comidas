import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useComensales, useMenu } from '../lib/menu'
import { racionesHogar } from '../lib/tipos'
import { useSemanaElegida } from '../lib/useSemanaElegida'
import { aIso, diasEntre, fechaCorta } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import { EnlacesSemana } from '../components/SelectorSemana'

export default function Congelador() {
  const [lunes] = useSemanaElegida()
  const { recetas, mapaRecetas } = useDatos()
  const { congelados, guardarCongelado, borrarCongelado } = useMenu()
  const comensales = useComensales()
  const [receta, setReceta] = useState('')
  const [raciones, setRaciones] = useState('2')
  const [fecha, setFecha] = useState(aIso(new Date()))
  const [error, setError] = useState<string | null>(null)
  const hoy = aIso(new Date())
  const lista = congelados.filter((c) => c.raciones > 0.01).sort((a, b) => a.congelado_en.localeCompare(b.congelado_en))
  const opciones = [...recetas].filter((r) => r.tipo_comida !== 'desayuno').sort((a, b) => Number(b.congelable) - Number(a.congelable) || a.titulo.localeCompare(b.titulo, 'es'))

  async function anadir() {
    const r = mapaRecetas.get(receta)
    if (!r) return setError('Elige una receta')
    const n = Number(raciones.replace(',', '.'))
    if (!(n > 0)) return setError('Pon cuántas raciones')
    setError(null)
    try {
      await guardarCongelado({ recipe_id: r.id, nombre: r.titulo, raciones: n, congelado_en: fecha })
      setReceta('')
    } catch (e: any) {
      setError(/relation|schema cache/i.test(e.message) ? 'Falta ejecutar la migración 004 en Supabase.' : e.message)
    }
  }

  return (
    <div>
      <header className="cabecera">
        <h1>Congelador</h1>
      </header>
      <EnlacesSemana lunes={lunes} actual="congelador" />
      <p className="suave">
        Lo que hay congelado. Al proponer el menú se usa primero lo más antiguo, y lo que sale del congelador no entra en la lista de la compra. Las raciones ya descuentan lo que está puesto en el menú.
      </p>

      {lista.length === 0 ? (
        <p className="vacio">El congelador está vacío.</p>
      ) : (
        <ul className="lista-congelador">
          {lista.map((c) => {
            const dias = diasEntre(c.congelado_en, hoy)
            const r = c.recipe_id ? mapaRecetas.get(c.recipe_id) : undefined
            return (
              <li key={c.id} className="tarjeta">
                <div className="fila espacio">
                  <div>
                    {r ? <Link to={`/receta/${r.id}`}><b>{r.titulo}</b></Link> : <b>{c.nombre}</b>}
                    {r?.es_base && <span className="chip base">Base</span>}
                    <div className="suave">
                      Congelado el {fechaCorta(c.congelado_en)} · {dias} día{dias === 1 ? '' : 's'}
                      {dias > 90 && <span className="aviso-mini"> · más de 3 meses</span>}
                      {c.nota ? ` · ${c.nota}` : ''}
                    </div>
                  </div>
                  <div className="contador">
                    <button onClick={() => (c.raciones - 1 <= 0.01 ? confirm(`¿Quitar «${c.nombre}» del congelador?`) && borrarCongelado(c.id) : guardarCongelado({ id: c.id, nombre: c.nombre, raciones: Math.max(0, c.raciones - 1) }))}>−</button>
                    <span>{fmt(c.raciones, 2)}</span>
                    <button onClick={() => guardarCongelado({ id: c.id, nombre: c.nombre, raciones: c.raciones + 1 })}>+</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <section className="tarjeta formulario">
        <h2>Añadir al congelador</h2>
        <label>
          Receta
          <select value={receta} onChange={(e) => setReceta(e.target.value)}>
            <option value="">Elige…</option>
            {opciones.map((r) => (
              <option key={r.id} value={r.id}>
                {r.congelable ? '❄️ ' : ''}{r.titulo}{r.es_base ? ' (base)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="rejilla-2">
          <label>
            Raciones
            <input inputMode="decimal" value={raciones} onChange={(e) => setRaciones(e.target.value)} />
          </label>
          <label>
            Congelado el
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="boton primario" onClick={anadir}>Añadir</button>
        <p className="suave">Una ración es la de una persona con factor 1. Una comida para el hogar ({comensales.map((c) => `${c.nombre} ×${fmt(c.factor, 2)}`).join(', ')}) gasta {fmt(racionesHogar(comensales), 2)} raciones.</p>
      </section>
    </div>
  )
}
