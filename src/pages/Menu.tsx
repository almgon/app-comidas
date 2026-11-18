import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useComensales, useSemana } from '../lib/menu'
import { useContextoMenu } from '../lib/contexto'
import { useSemanaElegida } from '../lib/useSemanaElegida'
import { MOMENTOS_DIA, avisosMenu, avisosRecetario, generarMenu, indicadores, objetivos, problemasEntrada, semaforoProteina } from '../lib/generador'
import { DIAS, fechaCorta, fechasSemana } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import { ORIGENES, etiquetaGrupo, type EntradaPlan, type Momento } from '../lib/tipos'
import SelectorSemana, { EnlacesSemana } from '../components/SelectorSemana'
import SelectorPlato from '../components/SelectorPlato'

const NOMBRE_MOMENTO: Record<Momento, string> = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena' }

export default function Menu() {
  const [lunes, setLunes] = useSemanaElegida()
  const { mapaRecetas, recetas, mapaIngredientes } = useDatos()
  const comensales = useComensales()
  const semana = useSemana(lunes)
  const ctx = useContextoMenu(lunes)
  const [eligiendo, setEligiendo] = useState<{ fecha: string; momento: Momento } | null>(null)
  const [generando, setGenerando] = useState(false)
  const [verAvisos, setVerAvisos] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fechas = fechasSemana(lunes)
  const porHueco = useMemo(() => new Map(semana.entradas.map((e) => [`${e.fecha}|${e.momento}`, e])), [semana.entradas])
  const ind = useMemo(() => indicadores(semana.entradas, ctx), [semana.entradas, ctx])
  const obj = objetivos(ind)
  const avisos = useMemo(() => {
    const a = avisosRecetario(recetas)
    if (semana.entradas.some((e) => e.recipe_id || e.origen === 'libre')) a.push(...avisosMenu(fechas.flatMap((f) => (['comida', 'cena'] as Momento[]).map((m) => porHueco.get(`${f}|${m}`) ?? { fecha: f, momento: m, recipe_id: null, raciones: ctx.raciones, origen: 'fresco' as const, freezer_item_id: null, fijado: false, nota: null })), ctx))
    return a
  }, [recetas, semana.entradas, ctx, fechas, porHueco])

  // Bases que se reutilizan en varios platos de la semana
  const basesCompartidas = useMemo(() => {
    const usos = new Map<string, string[]>()
    for (const e of semana.entradas) {
      const r = e.recipe_id ? mapaRecetas.get(e.recipe_id) : undefined
      if (!r || e.origen === 'libre' || e.origen === 'congelador') continue
      for (const l of r.ingredientes) if (l.sub_recipe_id) usos.set(l.sub_recipe_id, [...(usos.get(l.sub_recipe_id) ?? []), `${r.titulo} (${DIAS[fechas.indexOf(e.fecha)]?.slice(0, 3).toLowerCase()})`])
    }
    return [...usos].filter(([, u]) => u.length > 1).map(([id, u]) => ({ base: mapaRecetas.get(id)?.titulo ?? 'Base', usos: u }))
  }, [semana.entradas, mapaRecetas, fechas])

  async function proponer() {
    const sinFijar = semana.entradas.filter((e) => e.recipe_id && !e.fijado && e.origen !== 'libre').length
    if (sinFijar > 0 && !confirm(`Se cambiarán ${sinFijar} platos que no están fijados (📌). ¿Seguir?`)) return
    setGenerando(true)
    setError(null)
    try {
      const { entradas } = generarMenu(ctx, semana.entradas)
      await semana.guardarEntradas(entradas)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerando(false)
    }
  }

  async function otroPlato(fecha: string, momento: Momento) {
    const { entradas } = generarMenu(ctx, semana.entradas, { soloHueco: { fecha, momento }, intentos: 8 })
    const nueva = entradas.find((e) => e.fecha === fecha && e.momento === momento)
    if (nueva) await semana.guardarEntradas([nueva])
  }

  const cambiar = (e: EntradaPlan) => semana.guardarEntradas([e]).catch((x) => setError(x.message))

  const protMedia = (id: string) => {
    const dias = ind.proteinaDia.get(id) ?? []
    return dias.length ? dias.reduce((s, x) => s + x, 0) / dias.length : 0
  }

  return (
    <div className="menu">
      <header className="cabecera">
        <h1>Menú</h1>
        <button className="boton primario" onClick={proponer} disabled={generando || !semana.plan}>
          {generando ? 'Pensando…' : '✨ Proponer semana'}
        </button>
      </header>
      <SelectorSemana lunes={lunes} onCambiar={setLunes} />
      <EnlacesSemana lunes={lunes} actual="menu" />
      {semana.error && <p className="aviso">{semana.error}</p>}
      {error && <p className="error">{error}</p>}

      <section className="tarjeta indicadores">
        <div className="fila espacio">
          <h2>Esta semana</h2>
          {ind.huecosPlanificados < 14 && <span className="suave">{ind.huecosPlanificados} de 14 comidas en casa</span>}
        </div>
        <div className="semaforos">
          {obj.map((o) => (
            <div key={o.clave} className={`semaforo ${o.estado}`}>
              <span>{o.etiqueta}</span>
              <b>{o.texto}</b>
            </div>
          ))}
        </div>
        <div className="semaforos">
          {comensales.map((c) => {
            const m = protMedia(c.id)
            return (
              <div key={c.id} className={`semaforo ${semaforoProteina(m, c)}`}>
                <span>💪 {c.nombre}</span>
                <b>{fmt(m)} g/día <small>({c.protMin}-{c.protMax})</small></b>
              </div>
            )
          })}
        </div>
        {ind.sinProteina > 0 && <p className="suave">{ind.sinProteina} plato{ind.sinProteina === 1 ? '' : 's'} sin datos de proteína: la cifra es aproximada.</p>}
      </section>

      {avisos.length > 0 && (
        <section className="aviso">
          <button className="enlace-aviso" onClick={() => setVerAvisos(!verAvisos)}>
            ⚠️ {avisos.length} aviso{avisos.length === 1 ? '' : 's'} sobre el menú y el recetario {verAvisos ? '▲' : '▼'}
          </button>
          {verAvisos && (
            <ul>
              {avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {basesCompartidas.map((b) => (
        <p key={b.base} className="nota-base">🥣 <b>{b.base}</b> se cocina una vez el domingo y se usa en {b.usos.join(' y ')}.</p>
      ))}

      {fechas.map((fecha, dia) => (
        <section key={fecha} className="dia tarjeta">
          <div className="fila espacio">
            <h2>
              {DIAS[dia]} <span className="suave">{fechaCorta(fecha)}</span>
            </h2>
            <span className="prot-dia">
              {comensales.map((c) => {
                const g = ind.proteinaDia.get(c.id)?.[dia] ?? 0
                return (
                  <span key={c.id} className={`punto ${semaforoProteina(g, c)}`} title={`${c.nombre}: ${fmt(g)} g de proteína`}>
                    {c.nombre.slice(0, 1).toUpperCase()} {fmt(g)} g
                  </span>
                )
              })}
            </span>
          </div>
          {MOMENTOS_DIA.map((momento) => {
            const e = porHueco.get(`${fecha}|${momento}`)
            const otra = momento === 'desayuno' ? undefined : porHueco.get(`${fecha}|${momento === 'comida' ? 'cena' : 'comida'}`)
            const r = e?.recipe_id ? mapaRecetas.get(e.recipe_id) : undefined
            const g = etiquetaGrupo(r?.grupo_proteico)
            const problemas = e ? problemasEntrada(e, otra, r, dia) : []
            return (
              <div key={momento} className={`hueco ${e?.fijado ? 'fijado' : ''}`}>
                <span className="momento">{NOMBRE_MOMENTO[momento]}</span>
                <div className="plato">
                  {e?.origen === 'libre' ? (
                    <button className="titulo-plato libre" onClick={() => setEligiendo({ fecha, momento })}>🚶 Fuera de casa{e.nota ? ` · ${e.nota}` : ''}</button>
                  ) : r ? (
                    <>
                      <Link to={`/receta/${r.id}`} className="titulo-plato">{r.titulo}</Link>
                      <div className="chips">
                        {g && <span className={`chip g-${g.valor}`}>{g.emoji} {g.etiqueta}</span>}
                        {!(momento === 'desayuno' && e!.origen === 'fresco') && <span className="chip">{ORIGENES[e!.origen].emoji} {ORIGENES[e!.origen].etiqueta}</span>}
                        {problemas.map((p) => (
                          <span key={p} className="chip problema">⚠️ {p}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    !e?.extras?.length && (
                      <button className="titulo-plato vacio-plato" onClick={() => setEligiendo({ fecha, momento })}>
                        {e?.recipe_id ? 'Receta borrada · elegir otra' : momento === 'desayuno' ? '+ Elegir desayuno' : '+ Elegir plato'}
                      </button>
                    )
                  )}
                  {e && e.origen !== 'libre' && (e.extras?.length ?? 0) > 0 && (
                    <button className="extras" onClick={() => setEligiendo({ fecha, momento })}>
                      ➕ {e.extras!.map((x) => mapaIngredientes.get(x.ingredient_id)?.nombre ?? '¿?').join(', ')}
                    </button>
                  )}
                </div>
                <div className="acciones-hueco">
                  {e && (e.recipe_id || e.origen === 'libre') && (
                    <button className={`icono ${e.fijado ? 'on' : ''}`} title={e.fijado ? 'Fijado: no cambia al proponer' : 'Fijar'} onClick={() => cambiar({ ...e, fijado: !e.fijado })}>📌</button>
                  )}
                  <button className="icono" title="Otro plato" onClick={() => otroPlato(fecha, momento)} disabled={e?.fijado}>🎲</button>
                  <button className="icono" title="Cambiar" onClick={() => setEligiendo({ fecha, momento })}>✏️</button>
                </div>
              </div>
            )
          })}
        </section>
      ))}

      {eligiendo && (
        <SelectorPlato
          hueco={eligiendo}
          ctx={ctx}
          actual={porHueco.get(`${eligiendo.fecha}|${eligiendo.momento}`)}
          otra={eligiendo.momento === 'desayuno' ? undefined : porHueco.get(`${eligiendo.fecha}|${eligiendo.momento === 'comida' ? 'cena' : 'comida'}`)}
          entradas={semana.entradas}
          onElegir={async (e) => {
            setEligiendo(null)
            await cambiar(e)
          }}
          onGuardar={async (e) => {
            await cambiar(e)
          }}
          onVaciar={async () => {
            const { fecha, momento } = eligiendo
            setEligiendo(null)
            await semana.borrarEntrada(fecha, momento)
          }}
          onCerrar={() => setEligiendo(null)}
        />
      )}
    </div>
  )
}
