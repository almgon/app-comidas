import { useMemo, useState } from 'react'
import { normalizar } from '../../shared/parser.js'
import { esComidaDeBatch, esPlato, huecos, opcionesHueco, problemasEntrada, type ContextoMenu, type Opcion } from '../lib/generador'
import { DIAS, fechasSemana, fechaCorta } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import { ORIGENES, etiquetaGrupo, tiempoTotal, type EntradaPlan, type Momento, type Origen } from '../lib/tipos'

interface Props {
  hueco: { fecha: string; momento: Momento }
  ctx: ContextoMenu
  actual: EntradaPlan | undefined
  otra: EntradaPlan | undefined
  entradas: EntradaPlan[]
  onElegir: (e: EntradaPlan) => void
  onVaciar: () => void
  onCerrar: () => void
}

export default function SelectorPlato({ hueco, ctx, actual, otra, entradas, onElegir, onVaciar, onCerrar }: Props) {
  const [q, setQ] = useState('')
  const [todas, setTodas] = useState(false)
  const [nota, setNota] = useState(actual?.origen === 'libre' ? actual.nota ?? '' : '')
  const dia = fechasSemana(ctx.lunes).indexOf(hueco.fecha)
  const h = huecos(ctx.lunes).find((x) => x.fecha === hueco.fecha && x.momento === hueco.momento)!
  const recetas = useMemo(() => new Map(ctx.recetas.map((r) => [r.id, r])), [ctx.recetas])
  const usosSemana = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entradas) if (e.recipe_id && e.origen !== 'libre') m.set(e.recipe_id, (m.get(e.recipe_id) ?? 0) + 1)
    return m
  }, [entradas])

  const validas = useMemo(() => {
    const disp = new Map(ctx.congelados.map((c) => [c.id, c.raciones + (actual?.freezer_item_id === c.id ? actual.raciones : 0)]))
    return opcionesHueco(h, ctx, disp).filter((o) => o.recipe_id !== otra?.recipe_id || otra?.origen === 'libre')
  }, [h, ctx, actual, otra])

  const nq = normalizar(q)
  const coincide = (id: string) => !nq || normalizar(recetas.get(id)?.titulo ?? '').includes(nq)
  const congelador = validas.filter((o) => o.origen === 'congelador' && coincide(o.recipe_id))
  const resto = validas.filter((o) => o.origen !== 'congelador' && coincide(o.recipe_id))
  const idsValidos = new Set(resto.map((o) => o.recipe_id))
  const otras = todas
    ? ctx.recetas
        .filter((r) => esPlato(r) && !idsValidos.has(r.id) && coincide(r.id))
        .map((r): Opcion => ({ recipe_id: r.id, origen: esComidaDeBatch(h) ? 'batch' : 'fresco', freezer_item_id: null }))
    : []

  const entrada = (o: Opcion): EntradaPlan => ({
    id: actual?.id, fecha: hueco.fecha, momento: hueco.momento, recipe_id: o.recipe_id, raciones: actual?.raciones ?? ctx.raciones,
    origen: o.origen, freezer_item_id: o.freezer_item_id, fijado: true, nota: null,
  })

  const fila = (o: Opcion, conProblemas = false) => {
    const r = recetas.get(o.recipe_id)!
    const g = etiquetaGrupo(r.grupo_proteico)
    const t = tiempoTotal(r)
    const p = ctx.proteina.get(r.id)
    const c = o.freezer_item_id ? ctx.congelados.find((x) => x.id === o.freezer_item_id) : undefined
    const problemas = conProblemas ? problemasEntrada(entrada(o), otra, r, dia) : []
    const n = usosSemana.get(r.id) ?? 0
    return (
      <li key={`${o.recipe_id}-${o.origen}-${o.freezer_item_id ?? ''}`}>
        <button onClick={() => onElegir(entrada(o))}>
          <span className="titulo">{r.favorita ? '★ ' : ''}{r.titulo}</span>
          <span className="chips">
            {g && <span className={`chip g-${g.valor}`}>{g.emoji} {g.etiqueta}</span>}
            {t != null && <span className="chip">⏱ {t} min</span>}
            {p != null && <span className="chip">💪 {fmt(p)} g</span>}
            <span className="chip">{ORIGENES[o.origen].emoji} {o.origen === 'congelador' && c ? `${fmt(c.raciones, 1)} rac. · ${fechaCorta(c.congelado_en)}` : ORIGENES[o.origen].etiqueta}</span>
            {n > 0 && <span className="chip">ya {n}× esta semana</span>}
            {problemas.map((x) => (
              <span key={x} className="chip problema">⚠️ {x}</span>
            ))}
          </span>
        </button>
      </li>
    )
  }

  const cambiarOrigen = (origen: Origen) => actual?.recipe_id && onElegir({ ...actual, origen, freezer_item_id: null })

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="fila espacio">
          <h2>
            {DIAS[dia]} · {hueco.momento === 'comida' ? 'Comida' : 'Cena'}
          </h2>
          <button className="enlace" onClick={onCerrar}>Cerrar</button>
        </div>
        {actual?.recipe_id && actual.origen !== 'congelador' && actual.origen !== 'libre' && (
          <div className="segmentado ancho">
            {(['fresco', 'batch'] as Origen[]).map((o) => (
              <button key={o} className={actual.origen === o ? 'on' : ''} onClick={() => cambiarOrigen(o)}>
                {ORIGENES[o].emoji} {ORIGENES[o].etiqueta}
              </button>
            ))}
          </div>
        )}
        <input type="search" placeholder="Buscar receta…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="opciones-plato">
          {congelador.length > 0 && <li className="grupo">❄️ En el congelador</li>}
          {congelador.map((o) => fila(o))}
          {resto.length > 0 && <li className="grupo">Cumplen las reglas de este hueco</li>}
          {resto.map((o) => fila(o))}
          {resto.length === 0 && congelador.length === 0 && !todas && (
            <li className="suave">Ninguna receta cumple las reglas de este hueco{q ? ' con esa búsqueda' : ''}.</li>
          )}
          {todas && otras.length > 0 && <li className="grupo">Otras recetas (no cumplen alguna regla)</li>}
          {otras.map((o) => fila(o, true))}
        </ul>
        {!todas && (
          <button className="enlace" onClick={() => setTodas(true)}>Ver también las que no cumplen las reglas</button>
        )}
        <div className="libre-form">
          <input placeholder="Nota (opcional): restaurante, casa de…" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button
            className="boton"
            onClick={() =>
              onElegir({
                id: actual?.id, fecha: hueco.fecha, momento: hueco.momento, recipe_id: null, raciones: 0, origen: 'libre',
                freezer_item_id: null, fijado: true, nota: nota.trim() || null,
              })
            }
          >
            🚶 Comemos fuera
          </button>
        </div>
        {actual && (
          <button className="boton peligro margen-arriba" onClick={onVaciar}>Vaciar hueco</button>
        )}
      </div>
    </div>
  )
}
