import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { fmt, nutricionPorRacion, pesoReceta } from '../lib/nutricion'
import { useMenu } from '../lib/menu'
import { aptaCenaRapida, etiquetaGrupo, etiquetaTipo, tiempoTotal } from '../lib/tipos'

const FUENTES: Record<string, string> = { web: 'Web', instagram: 'Instagram', tiktok: 'TikTok', texto: 'Texto pegado', manual: 'Manual' }

function fmtCantidad(c: number | null, factor: number) {
  if (c == null) return ''
  const v = c * factor
  const enteros = Math.floor(v)
  const resto = v - enteros
  const frac = Math.abs(resto - 0.5) < 0.02 ? '½' : Math.abs(resto - 0.25) < 0.02 ? '¼' : Math.abs(resto - 0.75) < 0.02 ? '¾' : null
  if (frac && v < 10) return `${enteros || ''}${frac}`
  return fmt(v, v < 10 ? 1 : 0)
}

const NOMBRE_UNIDAD: Record<string, string> = { ud: '', racion: 'rac.', receta: 'receta entera de', pellizco: 'pizca', chorrito: 'chorrito', cda: 'cda', cdta: 'cdta' }

export default function RecetaDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const { mapaRecetas, mapaIngredientes, recetas, miembros, actualizarReceta, borrarReceta } = useDatos()
  const receta = id ? mapaRecetas.get(id) : undefined
  const [raciones, setRaciones] = useState<number | null>(null)
  const [hechos, setHechos] = useState<Set<number>>(new Set())
  const { enlaces } = useMenu()

  if (!receta) return <p className="vacio">No encuentro esta receta. <Link to="/recetas">Volver</Link></p>

  const rac = raciones ?? receta.raciones
  const factor = rac / receta.raciones
  const n = nutricionPorRacion(receta, mapaIngredientes, mapaRecetas)
  const g = etiquetaGrupo(receta.grupo_proteico)
  const t = tiempoTotal(receta)
  const pesoBase = pesoReceta(receta, mapaIngredientes, mapaRecetas)
  const usadaEn = recetas.filter((r) => r.ingredientes.some((l) => l.sub_recipe_id === receta.id))

  async function borrar() {
    const aviso = usadaEn.length ? `\n\nOjo: se usa como base en ${usadaEn.map((r) => r.titulo).join(', ')}.` : ''
    if (!confirm(`¿Borrar «${receta!.titulo}»?${aviso}`)) return
    await borrarReceta(receta!.id)
    nav('/recetas', { replace: true })
  }

  return (
    <article className="detalle">
      {receta.foto_url && <img className="foto" src={receta.foto_url} alt="" referrerPolicy="no-referrer" />}
      <header className="cabecera">
        <button className="volver" onClick={() => nav(-1)} aria-label="Volver">‹</button>
        <h1>{receta.titulo}</h1>
        <button className={`estrella ${receta.favorita ? 'on' : ''}`} onClick={() => actualizarReceta(receta.id, { favorita: !receta.favorita })} aria-label="Favorita">
          {receta.favorita ? '★' : '☆'}
        </button>
      </header>

      <div className="chips">
        {receta.es_base && <span className="chip base">Preparación base</span>}
        <span className="chip">{etiquetaTipo(receta.tipo_comida)}</span>
        {g && <span className={`chip g-${g.valor}`}>{g.emoji} {g.etiqueta}</span>}
        {aptaCenaRapida(receta) && <span className="chip rapida">Cena entre semana</span>}
        {receta.congelable && <span className="chip">❄️ Congelable</span>}
        {receta.dias_nevera != null && <span className="chip">🧊 {receta.dias_nevera} días en nevera</span>}
        {receta.etiquetas.map((e) => (
          <span key={e} className="chip etiqueta">#{e}</span>
        ))}
      </div>

      <div className="valoracion">
        {[1, 2, 3, 4, 5].map((v) => (
          <button key={v} className={v <= (receta.valoracion ?? 0) ? 'on' : ''} onClick={() => actualizarReceta(receta.id, { valoracion: receta.valoracion === v ? null : v })}>
            ●
          </button>
        ))}
        <span className="suave">{receta.valoracion ? `${receta.valoracion}/5` : 'Sin valorar'}</span>
      </div>

      <div className="datos-rapidos tarjeta">
        <div>
          <b>{receta.t_prep_min ?? '–'}</b>
          <span>min prep.</span>
        </div>
        <div>
          <b>{receta.t_coccion_min ?? '–'}</b>
          <span>min cocción</span>
        </div>
        <div>
          <b>{t ?? '–'}</b>
          <span>min total</span>
        </div>
      </div>
      <div className="datos-rapidos tarjeta">
        <div>
          <b>{fmt(n.kcal)}</b>
          <span>kcal</span>
        </div>
        <div>
          <b>{fmt(n.proteina)} g</b>
          <span>proteína</span>
        </div>
        <div>
          <b>{fmt(n.hidratos)} g</b>
          <span>hidratos</span>
        </div>
        <div>
          <b>{fmt(n.grasa)} g</b>
          <span>grasa</span>
        </div>
      </div>
      <p className="suave">Por ración{receta.es_base && pesoBase ? ` (${fmt(pesoBase / receta.raciones)} g; la receta entera pesa unos ${fmt(pesoBase)} g)` : ''}.</p>
      {n.kcal != null && miembros.length > 1 && (
        <p className="suave">
          Por persona: {miembros.map((m) => `${m.nombre} ${fmt(n.kcal! * m.factor_racion)} kcal · ${fmt((n.proteina ?? 0) * m.factor_racion)} g prot. (×${fmt(m.factor_racion, 2)})`).join(' · ')}
        </p>
      )}
      {(n.sinContar.length > 0 || n.sinDatos.length > 0) && (
        <p className="aviso">
          Kcal y macros aproximados:{n.sinContar.length > 0 ? ` no se han contado ${n.sinContar.join(', ')}.` : ''}
          {n.sinDatos.length > 0 ? ` Faltan los datos nutricionales de ${n.sinDatos.join(', ')}.` : ''} <Link to={`/receta/${receta.id}/editar`}>Revisar ingredientes</Link>
        </p>
      )}
      {n.manual && <p className="suave">Proteína introducida a mano.</p>}

      <section>
        <div className="fila espacio">
          <h2>Ingredientes</h2>
          <div className="contador">
            <button onClick={() => setRaciones(Math.max(1, rac - 1))}>−</button>
            <span>{fmt(rac, 1)} rac.</span>
            <button onClick={() => setRaciones(rac + 1)}>+</button>
          </div>
        </div>
        <ul className="ingredientes">
          {receta.ingredientes.map((l, i) => {
            const sub = l.sub_recipe_id ? mapaRecetas.get(l.sub_recipe_id) : undefined
            const cant = fmtCantidad(l.cantidad, factor)
            const uni = l.unidad ? NOMBRE_UNIDAD[l.unidad] ?? l.unidad : ''
            return (
              <li key={i}>
                <span className="cantidad">{[cant, uni].filter(Boolean).join(' ')}</span>
                {sub ? (
                  <Link to={`/receta/${sub.id}`}>{l.texto_original || sub.titulo} <span className="chip base">base</span></Link>
                ) : (
                  <span>
                    {l.texto_original}
                    {l.ingredient_id && enlaces.get(l.ingredient_id)?.mercadona && (
                      <span className="producto-linea suave"> · 🛒 {enlaces.get(l.ingredient_id)!.mercadona!.nombre}</span>
                    )}
                  </span>
                )}
              </li>
            )
          })}
          {receta.ingredientes.length === 0 && <li className="suave">Sin ingredientes</li>}
        </ul>
      </section>

      <section>
        <h2>Preparación</h2>
        <ol className="pasos">
          {receta.pasos.map((p, i) =>
            p.startsWith('— ') ? (
              <li key={i} className="seccion">{p.replace(/—/g, '').trim()}</li>
            ) : (
              <li
                key={i}
                className={hechos.has(i) ? 'hecho' : ''}
                onClick={() => setHechos((s) => {
                  const c = new Set(s)
                  if (c.has(i)) c.delete(i)
                  else c.add(i)
                  return c
                })}
              >
                {p}
              </li>
            ),
          )}
          {receta.pasos.length === 0 && <li className="suave">Sin pasos</li>}
        </ol>
      </section>

      {receta.notas && (
        <section>
          <h2>Notas</h2>
          <p className="notas">{receta.notas}</p>
        </section>
      )}

      {usadaEn.length > 0 && (
        <section>
          <h2>Se usa en</h2>
          <ul>
            {usadaEn.map((r) => (
              <li key={r.id}>
                <Link to={`/receta/${r.id}`}>{r.titulo}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {receta.fuente_url && (
        <p className="suave">
          Origen ({FUENTES[receta.fuente_tipo]}):{' '}
          <a href={receta.fuente_url} target="_blank" rel="noreferrer">
            {(() => {
              try {
                return new URL(receta.fuente_url).hostname.replace(/^www\./, '')
              } catch {
                return receta.fuente_url
              }
            })()}
          </a>
        </p>
      )}

      <div className="fila acciones">
        <Link className="boton primario" to={`/receta/${receta.id}/editar`}>Editar</Link>
        <button className="boton peligro" onClick={borrar}>Borrar</button>
      </div>
    </article>
  )
}
