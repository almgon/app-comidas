import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useComensales, useSemana } from '../lib/menu'
import { useContextoMenu } from '../lib/contexto'
import { useSemanaElegida } from '../lib/useSemanaElegida'
import { MOMENTOS_DIA, avisosMenu, avisosRecetario, comidaConSobras, generarMenu, indicadores, objetivos, ordenDe, otraAnadida, problemasEntrada } from '../lib/generador'
import { balance, diaPersona, type Balance, type DiaPersona } from '../lib/objetivos'
import { DIAS, fechaCorta, fechasSemana } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import { ORIGENES, etiquetaGrupo, papelDe, racionesHogar, type Comensal, type EntradaPlan, type Momento } from '../lib/tipos'
import SelectorSemana, { EnlacesSemana } from '../components/SelectorSemana'
import SelectorPlato from '../components/SelectorPlato'
import TartaPlato, { Tarta } from '../components/TartaPlato'
import { repartoHueco, tipoRangos } from '../lib/plato'
import { evaluarDia, evaluarFrutosSecos, porcionesPersona, type Porciones } from '../lib/grupos'
import { EstadoRaciones } from '../components/Raciones'

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
    const a = avisosRecetario(recetas, ctx.porciones)
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
  // Raciones de cada grupo (verdura, hidratos, lácteos…) de cada persona, cada día
  const porcDias = useMemo(
    () => fechas.map((f) => new Map<string, Porciones>(comensales.map((c) => [c.id, porcionesPersona(semana.entradas.filter((e) => e.fecha === f), c.factor, ctx.porciones ?? new Map(), mapaIngredientes, factorHogar)]))),
    [fechas, comensales, semana.entradas, ctx.porciones, mapaIngredientes, factorHogar],
  )
  const resumenRaciones = (c: Comensal) => {
    const dias = nutDias.map((m, d) => ({ completo: m.get(c.id)!.completo, p: porcDias[d].get(c.id)! })).filter((x) => x.completo)
    if (!dias.length) return null
    const bien = (g: 'verdura' | 'hidratos' | 'lacteos') => dias.filter((x) => evaluarDia(x.p).find((e) => e.grupo === g)!.estado === 'verde').length
    const frutos = evaluarFrutosSecos(dias.reduce((t, x) => t + x.p.frutos_secos, 0), dias.length)
    return { dias: dias.length, verdura: bien('verdura'), hidratos: bien('hidratos'), lacteos: bien('lacteos'), frutos }
  }
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
      const delHuecoNuevo = entradas.filter((x) => x.fecha === fecha && x.momento === momento)
      if (!delHuecoNuevo.some((x) => ordenDe(x) === 0)) return
      // las guarniciones que había (sin fijar) se cambian por las del nuevo plato
      const nuevas = new Set(delHuecoNuevo.map(clave))
      const sobran = delHueco(fecha, momento).filter((x) => ordenDe(x) > 0 && !nuevas.has(clave(x)))
      await semana.guardarEntradas(delHuecoNuevo, sobran)
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
        <div className="semaforos">
          {comensales.map((c) => {
            const r = resumenRaciones(c)
            if (!r) return null
            const estado = r.verdura === r.dias && r.hidratos === r.dias ? 'verde' : r.verdura >= r.dias - 2 && r.hidratos >= r.dias - 2 ? 'ambar' : 'rojo'
            return (
              <div key={c.id} className={`semaforo ${estado}`}>
                <span>🥦 Raciones · {c.nombre} <small>(días completos que cumplen)</small></span>
                <b>Verdura {r.verdura}/{r.dias} · Hidratos {r.hidratos}/{r.dias} · Lácteos {r.lacteos}/{r.dias}</b>
                <small>Al día: verdura ≥3, hidratos 3-6, lácteos ≤3 · Frutos secos en la semana: {r.frutos.texto} · La fruta va en la lista de la compra (3 al día)</small>
              </div>
            )
          })}
        </div>
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
            {comensales[0] && nutDias[dia].get(comensales[0].id)!.completo && (
              <button className="sin-boton raciones-dia" onClick={() => setDetalleDia(detalleDia === fecha ? null : fecha)} title="Raciones del día (por persona)">
                <EstadoRaciones p={porcDias[dia].get(comensales[0].id)!} compacto />
              </button>
            )}
            {(detalleDia === fecha || comensales.some((c) => nutDias[dia].get(c.id)!.completo && colorDia(balance(nutDias[dia].get(c.id)!.macros, c)) !== 'verde')) && (
              <ResumenDia comensales={comensales} dias={nutDias[dia]} porciones={porcDias[dia]} detalle={detalleDia === fecha} />
            )}
            {MOMENTOS_DIA.map((momento) => {
              const lista = delHueco(fecha, momento)
              const principal = lista.find((e) => ordenDe(e) === 0)
              const anadidas = lista.filter((e) => ordenDe(e) > 0)
              const siguiente = Math.max(0, ...lista.map(ordenDe)) + 1
              const puedeAnadir = principal && principal.origen !== 'libre' && (principal.recipe_id || principal.extras?.length)
              const reparto = platoHueco(fecha, momento)
              const kPlato = `${fecha}|${momento}`
              const rPrincipal = principal?.recipe_id ? mapaRecetas.get(principal.recipe_id) : undefined
              const conGuarnicion = momento !== 'desayuno' && !!rPrincipal && papelDe(rPrincipal) === 'principal'
              return (
                <div key={momento} className={`hueco ${principal?.fijado ? 'fijado' : ''}`}>
                  <span className="momento momento-col">
                    {NOMBRE_MOMENTO[momento]}
                    {reparto && (
                      <button className="boton-tarta" onClick={() => setVerPlato(verPlato === kPlato ? null : kPlato)} title="Cómo queda el plato (solo informativo)" aria-label="Ver cómo queda el plato">
                        <Tarta reparto={reparto} size={26} mini />
                      </button>
                    )}
                  </span>
                  <div className="plato">
                    <Plato
                      e={principal}
                      delDia={delDia}
                      todas={semana.entradas}
                      lunes={lunes}
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
                        <Plato e={e} delDia={delDia} todas={semana.entradas} lunes={lunes} dia={dia} momento={momento} anadida kcal={e.recipe_id ? ctx.macros?.get(e.recipe_id)?.kcal : undefined} onElegir={() => setEligiendo({ fecha, momento, orden: ordenDe(e) })} />
                        <div className="acciones-hueco">
                          <button className={`icono ${e.fijado ? 'on' : ''}`} title={e.fijado ? 'Fijada: no cambia al proponer' : 'Fijar'} onClick={() => cambiar({ ...e, fijado: !e.fijado })}>📌</button>
                          <button className="icono" title="Otra receta" onClick={() => otraReceta(e, fecha, momento)} disabled={e.fijado}>🎲</button>
                          <button className="icono" title="Quitar esta receta" onClick={() => quitar(e)}>✕</button>
                        </div>
                      </div>
                    ))}
                    {verPlato === kPlato && reparto && (
                      <div className="detalle-plato-hueco">
                        <TartaPlato reparto={reparto} tipo={tipoRangos(momento)} titulo={`Cómo queda el plato · ${NOMBRE_MOMENTO[momento].toLowerCase()}${lista.filter((e) => e.recipe_id).length > 1 ? ` (${lista.filter((e) => e.recipe_id).length} recetas)` : ''}`} />
                        <p className="suave pequeno">Solo es orientativo: el equilibrio se mira en el día entero (raciones de verdura, hidratos y lácteos).</p>
                      </div>
                    )}
                    {puedeAnadir && (
                      <button className="enlace anadir-receta" onClick={() => setEligiendo({ fecha, momento, orden: siguiente })}>
                        {conGuarnicion ? '+ Añadir guarnición' : '+ Añadir otra receta'}
                      </button>
                    )}
                  </div>
                  <div className="acciones-hueco">
                    {principal && (principal.recipe_id || principal.origen === 'libre') && (
                      <button className={`icono ${principal.fijado ? 'on' : ''}`} title={principal.fijado ? 'Fijado: no cambia al proponer' : 'Fijar'} onClick={() => cambiar({ ...principal, fijado: !principal.fijado })}>📌</button>
                    )}
                    <button className="icono" title={anadidas.length ? 'Otro plato (y sus guarniciones)' : 'Otro plato'} onClick={() => otraReceta(principal, fecha, momento)} disabled={principal?.fijado}>🎲</button>
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

function Plato({
  e, delDia, todas, lunes, dia, momento, kcal, anadida = false, onElegir,
}: { e: EntradaPlan | undefined; delDia: EntradaPlan[]; todas: EntradaPlan[]; lunes: string; dia: number; momento: Momento; kcal: number | undefined; anadida?: boolean; onElegir: () => void }) {
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
  const g = papelDe(r) === 'guarnicion' ? null : etiquetaGrupo(r.grupo_proteico)
  const problemas = problemasEntrada(e!, delDia, r, dia, todas, lunes)
  const sobrasManana = !anadida && comidaConSobras(todas, e!, lunes)
  const extra = e!.cocinar_extra ?? 0
  const verOrigen = !(momento === 'desayuno' && e!.origen === 'fresco') && !(anadida && e!.origen === 'fresco')
  return (
    <div className="plato-linea">
      <Link to={`/receta/${r.id}`} className="titulo-plato">{anadida && momento !== 'desayuno' ? <span className="suave">con </span> : null}{r.titulo}</Link>
      <div className="chips">
        {kcal != null && <span className="chip">🔥 {fmt(kcal)} kcal/rac.</span>}
        {g && <span className={`chip g-${g.valor}`}>{g.emoji} {g.etiqueta}</span>}
        {verOrigen && <span className="chip">{ORIGENES[e!.origen].emoji} {ORIGENES[e!.origen].etiqueta}</span>}
        {sobrasManana && <span className="chip cocina">🥡 Haz el doble: mañana a mediodía</span>}
        {extra > 0 && (
          <span className={`chip cocina ${e!.extra_congelado ? 'ok' : ''}`}>
            ❄️ {e!.extra_congelado ? `${fmt(extra, 2)} rac. ya congeladas` : `Haz ${fmt(extra, 2)} rac. de más para congelar`}
          </span>
        )}
        {problemas.map((p) => (
          <span key={p} className="chip problema">⚠️ {p}</span>
        ))}
      </div>
    </div>
  )
}

/** Lo que falta o sobra a cada uno ese día */
function ResumenDia({ comensales, dias, porciones, detalle }: { comensales: Comensal[]; dias: Map<string, DiaPersona>; porciones: Map<string, Porciones>; detalle: boolean }) {
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
            {detalle && d.completo && <div><EstadoRaciones p={porciones.get(c.id)!} /></div>}
          </div>
        )
      })}
    </div>
  )
}
