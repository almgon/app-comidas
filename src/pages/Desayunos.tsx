import { useMemo, useState } from 'react'
import { normalizar } from '../../shared/parser.js'
import { useDatos } from '../lib/datos'
import { useComensales, useMenu } from '../lib/menu'
import { useSemanaElegida } from '../lib/useSemanaElegida'
import { proteinaDesayunos } from '../lib/contexto'
import { fmt } from '../lib/nutricion'
import type { LineaDesayuno } from '../lib/tipos'
import { EnlacesSemana } from '../components/SelectorSemana'

const TITULOS = { lv: 'Lunes a viernes', fd: 'Sábado y domingo' }
const UNIDADES = ['g', 'ml', 'ud', 'cda', 'cdta', 'rebanada', 'taza']

export default function Desayunos() {
  const [lunes] = useSemanaElegida()
  const { ingredientes, mapaIngredientes } = useDatos()
  const { desayunos, guardarDesayuno, borrarDesayuno } = useMenu()
  const comensales = useComensales()
  const prot = useMemo(() => proteinaDesayunos(desayunos, comensales, mapaIngredientes), [desayunos, comensales, mapaIngredientes])
  const [error, setError] = useState<string | null>(null)

  const cambiarCantidad = (l: LineaDesayuno, persona: string, v: string) => {
    const n = Number(v.replace(',', '.'))
    guardarDesayuno({ id: l.id, dias: l.dias, ingredient_id: l.ingredient_id, cantidades: { ...l.cantidades, [persona]: Number.isFinite(n) ? n : 0 } }).catch((e) => setError(e.message))
  }

  return (
    <div>
      <header className="cabecera">
        <h1>Desayunos</h1>
      </header>
      <EnlacesSemana lunes={lunes} actual="desayunos" />
      <p className="suave">Se ponen solos en el menú, cuentan para la proteína del día y entran en la lista de la compra. Las cantidades son por persona y día.</p>
      {error && <p className="error">{error}</p>}
      {(['lv', 'fd'] as const).map((dias) => {
        const lineas = desayunos.filter((d) => d.dias === dias).sort((a, b) => a.orden - b.orden)
        return (
          <section key={dias} className="tarjeta">
            <h2>{TITULOS[dias]}</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  {comensales.map((c) => (
                    <th key={c.id}>{c.nombre}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {mapaIngredientes.get(l.ingredient_id)?.nombre ?? '¿?'}
                      <select className="mini" value={l.unidad} onChange={(e) => guardarDesayuno({ id: l.id, dias, ingredient_id: l.ingredient_id, unidad: e.target.value })}>
                        {UNIDADES.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    {comensales.map((c) => (
                      <td key={c.id}>
                        <input
                          className="mini-num"
                          inputMode="decimal"
                          defaultValue={l.cantidades[c.id] ?? ''}
                          key={`${l.id}-${c.id}-${l.cantidades[c.id]}`}
                          onBlur={(e) => e.target.value !== String(l.cantidades[c.id] ?? '') && cambiarCantidad(l, c.id, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button className="enlace peligro" onClick={() => borrarDesayuno(l.id)} aria-label="Quitar">✕</button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><b>Proteína</b></td>
                  {comensales.map((c) => (
                    <td key={c.id}><b>{fmt(prot.get(c.id)?.[dias === 'lv' ? 0 : 1] ?? 0)} g</b></td>
                  ))}
                  <td></td>
                </tr>
              </tbody>
            </table>
            <AnadirIngrediente
              excluir={new Set(lineas.map((l) => l.ingredient_id))}
              ingredientes={ingredientes}
              onAnadir={(id) => {
                const ing = mapaIngredientes.get(id)!
                guardarDesayuno({ dias, ingredient_id: id, unidad: ing.unidad_base, cantidades: Object.fromEntries(comensales.map((c) => [c.id, 0])) }).catch((e) => setError(e.message))
              }}
            />
          </section>
        )
      })}
    </div>
  )
}

function AnadirIngrediente({ ingredientes, excluir, onAnadir }: { ingredientes: { id: string; nombre: string }[]; excluir: Set<string>; onAnadir: (id: string) => void }) {
  const [q, setQ] = useState('')
  const nq = normalizar(q)
  const res = nq.length < 2 ? [] : ingredientes.filter((i) => !excluir.has(i.id) && normalizar(i.nombre).includes(nq)).slice(0, 8)
  return (
    <div className="margen-arriba">
      <input placeholder="Añadir ingrediente (fruta, yogur…)" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <div className="chips margen-arriba">
          {res.map((i) => (
            <button key={i.id} className="chip sugerencia" onClick={() => { onAnadir(i.id); setQ('') }}>+ {i.nombre}</button>
          ))}
        </div>
      )}
    </div>
  )
}
