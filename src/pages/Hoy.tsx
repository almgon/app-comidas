// Hoy y mañana: qué se come, qué hay que cocinar (y cuánto de más) y qué sacar del congelador
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useMenu, useSemana, useComensales } from '../lib/menu'
import { useContextoMenu } from '../lib/contexto'
import { sesionDomingo } from '../lib/batch'
import { MOMENTOS_DIA, cenaAnterior, comidaConSobras, ordenDe } from '../lib/generador'
import { repartoEntradas } from '../lib/reparto'
import { aIso, DIAS, deIso, fechaCorta, indiceDia, lunesDe, sumarDias } from '../lib/semana'
import { fmt } from '../lib/nutricion'
import { racionesHogar, tiempoTotal, type EntradaPlan, type Momento } from '../lib/tipos'
import { BarraReparto } from '../components/Reparto'

const NOMBRE_MOMENTO: Record<Momento, string> = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena' }

export default function Hoy() {
  const hoy = aIso(new Date())
  const manana = sumarDias(hoy, 1)
  const semanas = [...new Set([lunesDe(deIso(hoy)), lunesDe(deIso(manana))])]
  const [descongelar, setDescongelar] = useState<Record<string, string[]>>({})
  const alAvisar = useCallback((lunes: string, nombres: string[]) => {
    setDescongelar((d) => (JSON.stringify(d[lunes] ?? []) === JSON.stringify(nombres) ? d : { ...d, [lunes]: nombres }))
  }, [])
  const paraManana = semanas.flatMap((l) => descongelar[l] ?? [])
  const esDomingo = deIso(hoy).getDay() === 0

  return (
    <div className="hoy">
      <header className="cabecera">
        <h1>Hoy y mañana</h1>
        <Link className="boton" to={`/menu?semana=${lunesDe(deIso(hoy))}`}>🗓️ Semana</Link>
      </header>
      {paraManana.length > 0 && (
        <section className="aviso aviso-descongelar">
          ❄️ <b>Esta noche saca del congelador</b> para mañana: {[...new Set(paraManana)].join(', ')}.
        </section>
      )}
      {esDomingo && (
        <p className="nota-base">
          🍲 Hoy es domingo de cocina. <Link to={`/domingo?semana=${manana}`}>Ver la sesión del domingo</Link>
        </p>
      )}
      {semanas.map((l) => (
        <DiasDeSemana key={l} lunes={l} fechas={[hoy, manana].filter((f) => lunesDe(deIso(f)) === l)} hoy={hoy} manana={manana} onDescongelar={alAvisar} />
      ))}
    </div>
  )
}

function DiasDeSemana({ lunes, fechas, hoy, manana, onDescongelar }: { lunes: string; fechas: string[]; hoy: string; manana: string; onDescongelar: (lunes: string, nombres: string[]) => void }) {
  const { mapaRecetas, mapaIngredientes } = useDatos()
  const { congelados } = useMenu()
  const comensales = useComensales()
  const semana = useSemana(lunes)
  const ctx = useContextoMenu(lunes)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  const batch = useMemo(
    () => sesionDomingo(lunes, semana.entradas, mapaRecetas, semana.plan?.batch ?? {}, congelados, mapaIngredientes),
    [lunes, semana.entradas, mapaRecetas, semana.plan, congelados, mapaIngredientes],
  )
  /** Lo cocinado el domingo que se guardó en el congelador para ese día */
  const delDomingoCongelado = useCallback(
    (fecha: string) => batch.flatMap((b) => b.usos.filter((u) => u.fecha === fecha && u.destino === 'congelador').map((u) => (u.plato ? `${b.receta.titulo} (para ${u.plato})` : b.receta.titulo))),
    [batch],
  )

  // Qué hay que sacar esta noche para mañana
  useEffect(() => {
    if (!fechas.includes(manana)) return
    const delCongelador = semana.entradas
      .filter((e) => e.fecha === manana && e.origen === 'congelador' && e.recipe_id)
      .map((e) => mapaRecetas.get(e.recipe_id!)?.titulo ?? 'plato congelado')
    onDescongelar(lunes, [...delCongelador, ...delDomingoCongelado(manana)])
  }, [fechas, manana, semana.entradas, mapaRecetas, delDomingoCongelado, lunes, onDescongelar])

  const factorHogar = racionesHogar(comensales)

  async function congelar(e: EntradaPlan) {
    const r = e.recipe_id ? mapaRecetas.get(e.recipe_id) : undefined
    if (!r) return
    setGuardando(`${e.fecha}|${e.momento}`)
    setError(null)
    try {
      await semana.congelarExtra(e, r.titulo)
    } catch (x: any) {
      setError(x.message)
    } finally {
      setGuardando(null)
    }
  }

  return (
    <>
      {semana.error && <p className="aviso">{semana.error}</p>}
      {error && <p className="error">{error}</p>}
      {fechas.map((fecha) => {
        const delDia = semana.entradas.filter((e) => e.fecha === fecha)
        const dia = indiceDia(lunes, fecha)
        const vacio = !delDia.some((e) => e.recipe_id || e.extras?.length || e.origen === 'libre')
        return (
          <section key={fecha} className="tarjeta dia-hoy">
            <div className="fila espacio">
              <h2>
                {fecha === hoy ? 'Hoy' : 'Mañana'} <span className="suave">{DIAS[dia]} {fechaCorta(fecha)}</span>
              </h2>
            </div>
            {!vacio && <BarraReparto reparto={repartoEntradas(delDia, ctx.repartos ?? new Map(), mapaIngredientes, factorHogar).reparto} compacta />}
            {vacio && (
              <p className="suave">
                No hay nada planificado. <Link to={`/menu?semana=${lunes}`}>Prepara el menú</Link>
              </p>
            )}
            {!vacio &&
              MOMENTOS_DIA.map((m) => {
                const lista = delDia.filter((e) => e.momento === m).sort((a, b) => ordenDe(a) - ordenDe(b))
                const p = lista.find((e) => ordenDe(e) === 0)
                if (!p) return null
                if (p.origen === 'libre')
                  return (
                    <div key={m} className="hueco-hoy">
                      <span className="momento">{NOMBRE_MOMENTO[m]}</span>
                      <div>🚶 Fuera de casa{p.nota ? ` · ${p.nota}` : ''}</div>
                    </div>
                  )
                const r = p.recipe_id ? mapaRecetas.get(p.recipe_id) : undefined
                const guarn = lista.filter((e) => ordenDe(e) > 0 && e.recipe_id).map((e) => mapaRecetas.get(e.recipe_id!)).filter(Boolean)
                const sueltos = (p.extras ?? []).map((x) => mapaIngredientes.get(x.ingredient_id)?.nombre).filter(Boolean)
                const sobrasManana = comidaConSobras(semana.entradas, p, lunes)
                const extra = p.cocinar_extra ?? 0
                const t = r ? tiempoTotal(r) : null
                const cena = p.origen === 'sobras' ? cenaAnterior(semana.entradas, fecha, lunes) : undefined
                const congeladoDomingo = p.origen === 'batch' && r && batch.some((b) => b.receta.id === r.id && b.usos.some((u) => u.fecha === fecha && u.momento === m && u.destino === 'congelador'))
                return (
                  <div key={m} className="hueco-hoy">
                    <span className="momento">{NOMBRE_MOMENTO[m]}</span>
                    <div className="plato">
                      {r ? (
                        <Link to={`/receta/${r.id}`} className="titulo-plato">{r.titulo}</Link>
                      ) : (
                        !sueltos.length && <span className="suave">Sin plato</span>
                      )}
                      {guarn.length > 0 && (
                        <div className="suave">
                          con{' '}
                          {guarn.map((g, i) => (
                            <span key={g!.id}>
                              {i > 0 ? (i === guarn.length - 1 ? ' y ' : ', ') : ''}
                              <Link to={`/receta/${g!.id}`}>{g!.titulo.toLowerCase()}</Link>
                            </span>
                          ))}
                        </div>
                      )}
                      {sueltos.length > 0 && <div className="suave">➕ {sueltos.join(', ')}</div>}
                      {r && m !== 'desayuno' && (
                        <div className="chips">
                          {p.origen === 'fresco' && <span className="chip cocina">🔥 Cocinar{t ? ` · ${t} min` : ''}</span>}
                          {p.origen === 'batch' && <span className="chip">{congeladoDomingo ? '❄️ Hecho el domingo y congelado: descongelar y calentar' : '🍲 Hecho el domingo: está en la nevera'}</span>}
                          {p.origen === 'sobras' && <span className="chip">🥡 Sobras de la cena de ayer{cena?.recipe_id === p.recipe_id ? '' : ' (¡ojo! ayer se cenó otra cosa)'}</span>}
                          {p.origen === 'congelador' && <span className="chip">❄️ Del congelador: calentar</span>}
                          {sobrasManana && <span className="chip cocina">🥡 Haz el doble: mañana se come a mediodía</span>}
                          {extra > 0 && p.origen === 'batch' && <span className="chip">❄️ Las {fmt(extra, 2)} rac. de más se congelan en la sesión del domingo</span>}
                        </div>
                      )}
                      {extra > 0 && p.origen === 'fresco' && (
                        <div className="congelar-hoy">
                          {p.extra_congelado ? (
                            <span className="chip ok">❄️ {fmt(extra, 2)} rac. ya en el congelador</span>
                          ) : (
                            <>
                              <span>
                                ❄️ Haz <b>{fmt(p.raciones * (sobrasManana ? 2 : 1) + extra, 2)}</b> raciones: {fmt(p.raciones, 2)} para ahora,{sobrasManana ? ` ${fmt(p.raciones, 2)} para mañana` : ''} y {fmt(extra, 2)} para congelar.
                              </span>
                              <button className="boton" onClick={() => congelar(p)} disabled={guardando === `${p.fecha}|${p.momento}`}>
                                {guardando === `${p.fecha}|${p.momento}` ? 'Guardando…' : '✓ Hecho: al congelador'}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </section>
        )
      })}
    </>
  )
}
