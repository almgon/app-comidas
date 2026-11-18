import { useMemo, useState } from 'react'
import { normalizar } from '../../shared/parser.js'
import { esComidaDeBatch, opcionesHueco, problemasEntrada, type ContextoMenu, type Hueco, type Opcion } from '../lib/generador'
import { useDatos } from '../lib/datos'
import { DIAS, fechasSemana, fechaCorta } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import { ORIGENES, etiquetaGrupo, tiempoTotal, type EntradaPlan, type Extra, type Momento, type Origen } from '../lib/tipos'

interface Props {
  hueco: { fecha: string; momento: Momento }
  ctx: ContextoMenu
  actual: EntradaPlan | undefined
  otra: EntradaPlan | undefined
  entradas: EntradaPlan[]
  onElegir: (e: EntradaPlan) => void
  /** guarda sin cerrar (alimentos sueltos) */
  onGuardar: (e: EntradaPlan) => Promise<void>
  onVaciar: () => void
  onCerrar: () => void
}

export default function SelectorPlato({ hueco, ctx, actual, otra, entradas, onElegir, onGuardar, onVaciar, onCerrar }: Props) {
  const [q, setQ] = useState('')
  const [todas, setTodas] = useState(false)
  const [nota, setNota] = useState(actual?.origen === 'libre' ? actual.nota ?? '' : '')
  const dia = fechasSemana(ctx.lunes).indexOf(hueco.fecha)
  const h: Hueco = useMemo(() => ({ dia, fecha: hueco.fecha, momento: hueco.momento }), [dia, hueco.fecha, hueco.momento])
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
        .filter((r) => !r.es_base && !idsValidos.has(r.id) && coincide(r.id))
        .map((r): Opcion => ({ recipe_id: r.id, origen: esComidaDeBatch(h) ? 'batch' : 'fresco', freezer_item_id: null }))
    : []

  const entrada = (o: Opcion): EntradaPlan => ({
    id: actual?.id, fecha: hueco.fecha, momento: hueco.momento, recipe_id: o.recipe_id, raciones: actual?.raciones ?? ctx.raciones,
    origen: o.origen, freezer_item_id: o.freezer_item_id, fijado: true, nota: null, extras: actual?.extras ?? [],
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
            {DIAS[dia]} · {{ desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena' }[hueco.momento]}
          </h2>
          <button className="enlace" onClick={onCerrar}>Cerrar</button>
        </div>
        {actual?.recipe_id && actual.origen !== 'congelador' && actual.origen !== 'libre' && hueco.momento !== 'desayuno' && (
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
          {resto.length > 0 && <li className="grupo">{hueco.momento === 'desayuno' ? 'Recetas de desayuno' : 'Cumplen las reglas de este hueco'}</li>}
          {resto.map((o) => fila(o))}
          {resto.length === 0 && congelador.length === 0 && !todas && (
            <li className="suave">
              {hueco.momento === 'desayuno' ? 'No hay recetas de tipo «Desayuno»' : 'Ninguna receta cumple las reglas de este hueco'}
              {q ? ' con esa búsqueda' : ''}. Puedes ver todas o añadir alimentos sueltos abajo.
            </li>
          )}
          {todas && otras.length > 0 && <li className="grupo">Otras recetas (no cumplen alguna regla)</li>}
          {otras.map((o) => fila(o, true))}
        </ul>
        {!todas && (
          <button className="enlace" onClick={() => setTodas(true)}>Ver también las que no cumplen las reglas</button>
        )}
        <AlimentosSueltos
          extras={actual?.extras ?? []}
          onCambiar={(extras) =>
            onGuardar({
              ...(actual ?? { fecha: hueco.fecha, momento: hueco.momento, recipe_id: null, raciones: ctx.raciones, origen: 'fresco', freezer_item_id: null, fijado: false, nota: null }),
              extras,
            })
          }
        />
        <div className="libre-form">
          <input placeholder="Nota (opcional): restaurante, casa de…" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button
            className="boton"
            onClick={() =>
              onElegir({
                id: actual?.id, fecha: hueco.fecha, momento: hueco.momento, recipe_id: null, raciones: 0, origen: 'libre',
                freezer_item_id: null, fijado: true, nota: nota.trim() || null, extras: [],
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

/** Alimentos sueltos del hueco (fruta, yogur, pan…): van a la lista de la compra */
function AlimentosSueltos({ extras, onCambiar }: { extras: Extra[]; onCambiar: (e: Extra[]) => Promise<void> }) {
  const { ingredientes, mapaIngredientes } = useDatos()
  const [q, setQ] = useState('')
  const [guardando, setGuardando] = useState(false)
  const nq = normalizar(q)
  const res = nq.length < 2 ? [] : ingredientes.filter((i) => !extras.some((x) => x.ingredient_id === i.id) && normalizar(i.nombre).includes(nq)).slice(0, 8)
  const cambiar = async (e: Extra[]) => {
    setGuardando(true)
    try {
      await onCambiar(e)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <div className="sueltos">
      <h3>Alimentos sueltos {guardando && <span className="suave">· guardando…</span>}</h3>
      <p className="suave">Cantidad total para los dos. Se suman a la lista de la compra.</p>
      {extras.map((x) => {
        const ing = mapaIngredientes.get(x.ingredient_id)
        return (
          <div key={x.ingredient_id} className="fila">
            <span className="nombre-suelto">{ing?.nombre ?? '¿?'}</span>
            <input
              className="mini-num"
              inputMode="decimal"
              defaultValue={x.cantidad ?? ''}
              key={`${x.ingredient_id}-${x.cantidad}`}
              onBlur={(e) => {
                const n = Number(e.target.value.replace(',', '.'))
                const cantidad = e.target.value.trim() && Number.isFinite(n) ? n : null
                if (cantidad !== x.cantidad) cambiar(extras.map((y) => (y.ingredient_id === x.ingredient_id ? { ...y, cantidad } : y)))
              }}
            />
            <span className="suave">{ing?.unidad_base}</span>
            <button className="enlace peligro" onClick={() => cambiar(extras.filter((y) => y.ingredient_id !== x.ingredient_id))} aria-label="Quitar">✕</button>
          </div>
        )
      })}
      <input placeholder="Añadir alimento (plátano, yogur, pan…)" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <div className="chips">
          {res.map((i) => (
            <button
              key={i.id}
              className="chip sugerencia"
              onClick={() => {
                setQ('')
                cambiar([...extras, { ingredient_id: i.id, cantidad: i.unidad_base === 'ud' ? 2 : null }])
              }}
            >
              + {i.nombre}
            </button>
          ))}
        </div>
      )}
      {extras.some((x) => x.cantidad == null) && <p className="suave">Sin cantidad sale en la lista como «al gusto».</p>}
    </div>
  )
}
