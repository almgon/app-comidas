import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useComensales, useSemana } from '../lib/menu'
import { useContextoMenu } from '../lib/contexto'
import { useSemanaElegida } from '../lib/useSemanaElegida'
import { MOMENTOS_DIA, avisosMenu, avisosRecetario, generarMenu, indicadores, objetivos, ordenDe, otraAnadida, problemasEntrada } from '../lib/generador'
import { balance, diaPersona, type Balance, type DiaPersona } from '../lib/objetivos'
import { DIAS, fechaCorta, fechasSemana } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import { ORIGENES, etiquetaGrupo, racionesHogar, type Comensal, type EntradaPlan, type Momento } from '../lib/tipos'
import SelectorSemana, { EnlacesSemana } from '../components/SelectorSemana'
import SelectorPlato from '../components/SelectorPlato'
import TartaPlato, { Tarta } from '../components/TartaPlato'
import { evaluarPlato, repartoHueco, tipoRangos } from '../lib/plato'

const NOMBRE_MOMENTO: Record<Momento, string> = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena' }
const clave = (e: Pick<EntradaPlan, 'fecha' | 'momento' | 'orden'>) => `${e.fecha}|${e.momento}|${ordenDe(e)}`

type Semaforo = 'verde' | 'ambar' | 'rojo'
/** Color del día: verde si kcal y macros están en rango, ámbar si algo se sale un poco, rojo si las kcal se van más de un 20 % */
function colorDia(b: Balance[]): Semaforo {
  const k = b.find((x) => x.clave === 'kcal')!
  if (k.estado !== 'ok' && Math.abs(k.valor - (k.min + k.max) / 2) > ((k.min + k.max) / 2) * 0.2) return 'rojo'
  return b.every((x) => x.estado === 'ok') ? 'verde' : 'ambar'
}

export default function Menu() {
  const [lunes, setLunes] = useSemanaElegida()
  const { mapaRecetas, recetas, mapaIngredientes } = useDatos()
  const comensales = useComensales()
  const semana = useSemana(lunes)
  const ctx = useContextoMenu(lunes)
  const [eligiendo, setEligiendo] = useState<{ fecha: string; momento: Momento; orden: number } | null>(null)
  const [generando, setGenerando] = useState(false)
  const [verAvisos, setVerAvisos] = useState(false)
  const [detalleDia, setDetalleDia] = useState<string | null>(null)
  const [verPlato, setVerPlato] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fechas = fechasSemana(lunes)
  const porClave = useMemo(() => new Map(semana.entradas.map((e) => [clave(e), e])), [semana.entradas])
  const delHueco = (fecha: string, momento: Momento) => semana.entradas.filter((e) => e.fecha === fecha && e.momento === momento).sort((a, b) => ordenDe(a) - ordenDe(b))
  const ind = useMemo(() => indicadores(semana.entradas, ctx), [semana.entradas, ctx])
  const obj = objetivos(ind)
  const avisos = useMemo(() => {
    const a = avisosRecetario(recetas)
    if (semana.entradas.some((e) => e.recipe_id || e.origen === 'libre'))
      a.push(...avisosMenu(fechas.flatMap((f) => (['comida', 'cena'] as Momento[]).map((m) => porClave.get(`${f}|${m}|0`) ?? { fecha: f, momento: m, orden: 0, recipe_id: null, raciones: ctx.raciones, origen: 'fresco' as const, freezer_item_id: null, fijado: false, nota: null })), ctx))
    return a
  }, [recetas, semana.entradas, ctx, fechas, porClave])

  // Kcal y macros de cada persona, cada día
  const factorHogar = racionesHogar(comensales)
  const nutDias = useMemo(
    () => fechas.map((f) => new Map(comensales.map((c) => [c.id, diaPersona(semana.entradas.filter((e) => e.fecha === f), c, ctx.macros ?? new Map(), mapaIngredientes, factorHogar)]))),
    [fechas, comensales, semana.entradas, ctx.macros, mapaIngredientes, factorHogar],
  )
  const media = (c: Comensal) => {
    const dias = nutDias.map((m) => m.get(c.id)!).filter((d) => d.completo)
    if (!dias.length) return null
    const s = (k: 'kcal' | 'proteina') => dias.reduce((t, d) => t + d.macros[k], 0) / dias.length
    return { kcal: s('kcal'), proteina: s('proteina'), dias: dias.length }
  }
  // Método del plato de cada desayuno, comida y cena (todas sus recetas y alimentos sueltos juntos)
  const platoHueco = (fecha: string, momento: Momento) => {
    const lista = delHueco(fecha, momento)
    if (!lista.some((e) => e.recipe_id || e.extras?.length) || lista.some((e) => e.origen === 'libre')) return null
    return repartoHueco(lista, ctx.platos ?? new Map(), mapaIngredientes, factorHogar)
  }
  const resumenPlato = useMemo(() => {
    const r = { cumple: 0, casi: 0, no: 0, total: 0 }
    for (const f of fechas)
      for (const m of MOMENTOS_DIA) {
        const lista = semana.entradas.filter((e) => e.fecha === f && e.momento === m)
        if (!lista.some((e) => e.recipe_id) || lista.some((e) => e.origen === 'libre')) continue
        const ev = evaluarPlato(repartoHueco(lista, ctx.platos ?? new Map(), mapaIngredientes, factorHogar), tipoRangos(m))
        if (ev.estado === 'sin_datos') continue
        r.total++
        r[ev.estado]++
      }
    return r
  }, [fechas, semana.entradas, ctx.platos, mapaIngredientes, factorHogar])
  const sinDatos = useMemo(() => new Set(semana.entradas.filter((e) => e.recipe_id && !ctx.macros?.get(e.recipe_id)).map((e) => e.recipe_id)).size, [semana.entradas, ctx.macros])

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
    if (sinFijar > 0 && !confirm(`Se cambiarán ${sinFijar} recetas que no están fijadas (📌). ¿Seguir?`)) return
    setGenerando(true)
    setError(null)
    try {
      const { entradas } = generarMenu(ctx, semana.entradas)
      const nuevas = new Set(entradas.map(clave))
      const sobran = semana.entradas.filter((e) => ordenDe(e) > 0 && !nuevas.has(clave(e)))
      await semana.guardarEntradas(entradas, sobran)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerando(false)
    }
  }

  async function otraReceta(e: EntradaPlan | undefined, fecha: string, momento: Momento) {
    try {
      if (e && ordenDe(e) > 0) {
        const nueva = otraAnadida(ctx, semana.entradas, e)
        if (nueva) await semana.guardarEntradas([nueva])
        else setError('No hay otra receta que encaje en este hueco.')
        return
      }
      const { entradas } = generarMenu(ctx, semana.entradas, { soloHueco: { fecha, momento }, intentos: 8 })
      const nueva = entradas.find((x) => x.fecha === fecha && x.momento === momento && ordenDe(x) === 0)
      if (nueva) await semana.guardarEntradas([nueva])
    } catch (x: any) {
      setError(x.message)
    }
  }

  const cambiar = (e: EntradaPlan) => semana.guardarEntradas([e]).catch((x) => setError(x.message))
  const quitar = (e: EntradaPlan) => semana.guardarEntradas([], [e]).catch((x) => setError(x.message))

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
            const m = media(c)
            const b = m ? balance({ kcal: m.kcal, proteina: m.proteina, hidratos: 0, grasa: 0 }, c) : null
            const ek = b?.find((x) => x.clave === 'kcal')!.estado
            const ep = b?.find((x) => x.clave === 'proteina')!.estado
            return (
              <div key={c.id} className={`semaforo ${!m ? '' : ek === 'ok' && ep === 'ok' ? 'verde' : 'ambar'}`}>
                <span>🔥 {c.nombre} <small>(media de {m?.dias ?? 0} días completos)</small></span>
                <b>{m ? `${fmt(m.kcal)} kcal · ${fmt(m.proteina)} g prot.` : '–'}</b>
                <small>Objetivo {fmt(c.kcal)} kcal · {c.protMin}-{c.protMax} g prot.</small>
              </div>
            )
          })}
        </div>
        {resumenPlato.total > 0 && (
          <div className="semaforos">
            <div className={`semaforo ${resumenPlato.cumple === resumenPlato.total ? 'verde' : resumenPlato.no === 0 ? 'ambar' : 'rojo'}`}>
              <span>🍽️ Método del plato <small>(½ verdura y fruta, ¼ proteína, ¼ hidratos)</small></span>
              <b>{resumenPlato.cumple} de {resumenPlato.total} cumplen{resumenPlato.casi ? ` · ${resumenPlato.casi} casi` : ''}</b>
              <small>Toca la tarta de cada comida para ver el reparto</small>
            </div>
          </div>
        )}
        {sinDatos > 0 && <p className="suave">{sinDatos} receta{sinDatos === 1 ? '' : 's'} del menú sin kcal (faltan ingredientes vinculados o sus datos): los totales se quedan cortos.</p>}
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

      {fechas.map((fecha, dia) => {
        const delDia = semana.entradas.filter((e) => e.fecha === fecha)
        return (
          <section key={fecha} className="dia tarjeta">
            <div className="fila espacio">
              <h2>
                {DIAS[dia]} <span className="suave">{fechaCorta(fecha)}</span>
              </h2>
              <button className="prot-dia sin-boton" onClick={() => setDetalleDia(detalleDia === fecha ? null : fecha)} title="Ver kcal y macros del día">
                {comensales.map((c) => {
                  const d = nutDias[dia].get(c.id)!
                  const col = d.completo ? colorDia(balance(d.macros, c)) : ''
                  return (
                    <span key={c.id} className={`punto ${col}`}>
                      {c.nombre.slice(0, 1).toUpperCase()} {fmt(d.macros.kcal)} kcal
                    </span>
                  )
                })}
              </button>
            </div>
            {(detalleDia === fecha || comensales.some((c) => nutDias[dia].get(c.id)!.completo && colorDia(balance(nutDias[dia].get(c.id)!.macros, c)) !== 'verde')) && (
              <ResumenDia comensales={comensales} dias={nutDias[dia]} detalle={detalleDia === fecha} />
            )}
            {MOMENTOS_DIA.map((momento) => {
              const lista = delHueco(fecha, momento)
              const principal = lista.find((e) => ordenDe(e) === 0)
              const anadidas = lista.filter((e) => ordenDe(e) > 0)
              const siguiente = Math.max(0, ...lista.map(ordenDe)) + 1
              const puedeAnadir = principal && principal.origen !== 'libre' && (principal.recipe_id || principal.extras?.length)
              const reparto = platoHueco(fecha, momento)
              const ev = evaluarPlato(reparto, tipoRangos(momento))
              const kPlato = `${fecha}|${momento}`
              return (
                <div key={momento} className={`hueco ${principal?.fijado ? 'fijado' : ''}`}>
                  <span className="momento momento-col">
                    {NOMBRE_MOMENTO[momento]}
                    {reparto && ev.estado !== 'sin_datos' && (
                      <button className="boton-tarta" onClick={() => setVerPlato(verPlato === kPlato ? null : kPlato)} title="Método del plato" aria-label={`Método del plato: ${ev.estado === 'cumple' ? 'cumple' : ev.estado === 'casi' ? 'casi cumple' : 'no cumple'}`}>
                        <Tarta reparto={reparto} size={26} mini />
                        <span className={`chip plato-${ev.estado}`}>{ev.estado === 'cumple' ? '✓' : ev.estado === 'casi' ? '≈' : '✗'}</span>
                      </button>
                    )}
                  </span>
                  <div className="plato">
                    <Plato
                      e={principal}
                      delDia={delDia}
                      dia={dia}
                      momento={momento}
                      kcal={principal?.recipe_id ? ctx.macros?.get(principal.recipe_id)?.kcal : undefined}
                      onElegir={() => setEligiendo({ fecha, momento, orden: 0 })}
                    />
                    {principal && principal.origen !== 'libre' && (principal.extras?.length ?? 0) > 0 && (
                      <button className="extras" onClick={() => setEligiendo({ fecha, momento, orden: 0 })}>
                        ➕ {principal.extras!.map((x) => mapaIngredientes.get(x.ingredient_id)?.nombre ?? '¿?').join(', ')}
                      </button>
                    )}
                    {anadidas.map((e) => (
                      <div key={clave(e)} className={`anadida ${e.fijado ? 'fijado' : ''}`}>
                        <Plato e={e} delDia={delDia} dia={dia} momento={momento} kcal={e.recipe_id ? ctx.macros?.get(e.recipe_id)?.kcal : undefined} onElegir={() => setEligiendo({ fecha, momento, orden: ordenDe(e) })} />
                        <div className="acciones-hueco">
                          <button className={`icono ${e.fijado ? 'on' : ''}`} title={e.fijado ? 'Fijada: no cambia al proponer' : 'Fijar'} onClick={() => cambiar({ ...e, fijado: !e.fijado })}>📌</button>
                          <button className="icono" title="Otra receta" onClick={() => otraReceta(e, fecha, momento)} disabled={e.fijado}>🎲</button>
                          <button className="icono" title="Quitar esta receta" onClick={() => quitar(e)}>✕</button>
                        </div>
                      </div>
                    ))}
                    {verPlato === kPlato && reparto && (
                      <div className="detalle-plato-hueco">
                        <TartaPlato reparto={reparto} tipo={tipoRangos(momento)} titulo={`Método del plato · ${NOMBRE_MOMENTO[momento].toLowerCase()} completo${lista.filter((e) => e.recipe_id).length > 1 ? ` (${lista.filter((e) => e.recipe_id).length} recetas)` : ''}`} />
                      </div>
                    )}
                    {puedeAnadir && (
                      <button className="enlace anadir-receta" onClick={() => setEligiendo({ fecha, momento, orden: siguiente })}>
                        + Añadir otra receta
                      </button>
                    )}
                  </div>
                  <div className="acciones-hueco">
                    {principal && (principal.recipe_id || principal.origen === 'libre') && (
                      <button className={`icono ${principal.fijado ? 'on' : ''}`} title={principal.fijado ? 'Fijado: no cambia al proponer' : 'Fijar'} onClick={() => cambiar({ ...principal, fijado: !principal.fijado })}>📌</button>
                    )}
                    <button className="icono" title="Otro plato" onClick={() => otraReceta(principal, fecha, momento)} disabled={principal?.fijado}>🎲</button>
                    <button className="icono" title="Cambiar" onClick={() => setEligiendo({ fecha, momento, orden: 0 })}>✏️</button>
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}

      {eligiendo && (
        <SelectorPlato
          hueco={eligiendo}
          ctx={ctx}
          actual={porClave.get(clave(eligiendo))}
          delDia={semana.entradas.filter((e) => e.fecha === eligiendo.fecha)}
          entradas={semana.entradas}
          onElegir={async (e) => {
            setEligiendo(null)
            // «Comemos fuera» sustituye a todas las recetas del hueco
            const sobran = e.origen === 'libre' ? delHueco(e.fecha, e.momento).filter((x) => ordenDe(x) > 0) : []
            await semana.guardarEntradas([e], sobran).catch((x) => setError(x.message))
          }}
          onGuardar={async (e) => {
            await cambiar(e)
          }}
          onVaciar={async () => {
            const { fecha, momento, orden } = eligiendo
            setEligiendo(null)
            const actual = porClave.get(clave(eligiendo))
            if (orden > 0) {
              if (actual) await quitar(actual)
            } else await semana.borrarEntrada(fecha, momento).catch((x) => setError(x.message))
          }}
          onCerrar={() => setEligiendo(null)}
        />
      )}
    </div>
  )
}

function Plato({ e, delDia, dia, momento, kcal, onElegir }: { e: EntradaPlan | undefined; delDia: EntradaPlan[]; dia: number; momento: Momento; kcal: number | undefined; onElegir: () => void }) {
  const { mapaRecetas } = useDatos()
  const r = e?.recipe_id ? mapaRecetas.get(e.recipe_id) : undefined
  if (e?.origen === 'libre') return <button className="titulo-plato libre" onClick={onElegir}>🚶 Fuera de casa{e.nota ? ` · ${e.nota}` : ''}</button>
  if (!r) {
    if (e?.extras?.length) return null
    return (
      <button className="titulo-plato vacio-plato" onClick={onElegir}>
        {e?.recipe_id ? 'Receta borrada · elegir otra' : momento === 'desayuno' ? '+ Elegir desayuno' : '+ Elegir plato'}
      </button>
    )
  }
  const g = etiquetaGrupo(r.grupo_proteico)
  const problemas = problemasEntrada(e!, delDia, r, dia)
  return (
    <div className="plato-linea">
      <Link to={`/receta/${r.id}`} className="titulo-plato">{r.titulo}</Link>
      <div className="chips">
        {kcal != null && <span className="chip">🔥 {fmt(kcal)} kcal/rac.</span>}
        {g && <span className={`chip g-${g.valor}`}>{g.emoji} {g.etiqueta}</span>}
        {!(momento === 'desayuno' && e!.origen === 'fresco') && <span className="chip">{ORIGENES[e!.origen].emoji} {ORIGENES[e!.origen].etiqueta}</span>}
        {problemas.map((p) => (
          <span key={p} className="chip problema">⚠️ {p}</span>
        ))}
      </div>
    </div>
  )
}

/** Lo que falta o sobra a cada uno ese día */
function ResumenDia({ comensales, dias, detalle }: { comensales: Comensal[]; dias: Map<string, DiaPersona>; detalle: boolean }) {
  return (
    <div className="resumen-dia">
      {comensales.map((c) => {
        const d = dias.get(c.id)!
        const b = balance(d.macros, c)
        const mal = b.filter((x) => x.estado !== 'ok')
        if (!detalle && (!d.completo || !mal.length)) return null
        return (
          <div key={c.id} className="resumen-persona">
            <b>{c.nombre}</b>{' '}
            {detalle ? (
              <span className="suave">
                {fmt(d.macros.kcal)} / {fmt(c.kcal)} kcal · P {fmt(d.macros.proteina)} g ({c.protMin}-{c.protMax}) · HC {fmt(d.macros.hidratos)} g ({c.hcMin}-{c.hcMax}) · G {fmt(d.macros.grasa)} g ({c.grasaMin}-{c.grasaMax})
              </span>
            ) : null}
            {d.completo ? (
              mal.length ? (
                <span className="chips">
                  {mal.map((x) => (
                    <span key={x.clave} className={`chip ${x.estado === 'falta' ? 'falta' : 'sobra'}`}>{x.estado === 'falta' ? '⬇️' : '⬆️'} {x.texto}</span>
                  ))}
                </span>
              ) : (
                <span className="chip ok">✓ Día ajustado</span>
              )
            ) : (
              <span className="suave"> · día sin completar: falta algún hueco o coméis fuera</span>
            )}
            {d.sinDatos > 0 && <span className="suave"> · {d.sinDatos} receta{d.sinDatos === 1 ? '' : 's'} sin kcal</span>}
          </div>
        )
      })}
    </div>
  )
}
