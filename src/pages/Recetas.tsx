import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { normalizar } from '../../shared/parser.js'
import { useDatos } from '../lib/datos'
import TarjetaReceta from '../components/TarjetaReceta'
import { papelDe, tiempoTotal, type Receta } from '../lib/tipos'
import { useMenu } from '../lib/menu'
import { INFO_TIPOS, TIPOS_ALIMENTO, tipoReceta, type TipoAlimento } from '../lib/frecuencias'

type Orden = 'titulo' | 'reciente' | 'valoracion' | 'tiempo'
type Apartado = 'todas' | 'desayuno' | 'comida' | 'cena' | 'guarnicion' | 'base'

const APARTADOS: { valor: Apartado; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'desayuno', etiqueta: '☕ Desayunos' },
  { valor: 'comida', etiqueta: '🍽️ Comidas' },
  { valor: 'cena', etiqueta: '🌙 Cenas' },
  { valor: 'guarnicion', etiqueta: '🥗 Guarniciones' },
  { valor: 'base', etiqueta: '🥣 Bases' },
]

/** En qué apartado sale cada receta (las de «comida o cena» salen en los dos; las bases y las guarniciones, aparte) */
const enApartado = (r: Receta, a: Apartado) => {
  if (a === 'todas') return true
  if (a === 'base') return r.es_base
  if (r.es_base) return false
  const guarn = r.tipo_comida !== 'desayuno' && papelDe(r) === 'guarnicion'
  if (a === 'guarnicion') return guarn
  return !guarn && (r.tipo_comida === a || (r.tipo_comida === 'ambas' && (a === 'comida' || a === 'cena')))
}

const CLAVE_APARTADO = 'comidas-recetas-apartado'

export default function Recetas() {
  const { recetas, etiquetas, mapaIngredientes, mapaRecetas } = useDatos()
  const { enlaces } = useMenu()
  const sinProducto = useMemo(() => {
    const ids = new Set<string>()
    for (const r of recetas) for (const l of r.ingredientes) if (l.ingredient_id && !enlaces.get(l.ingredient_id)?.mercadona && !mapaIngredientes.get(l.ingredient_id)?.es_despensa) ids.add(l.ingredient_id)
    return ids.size
  }, [recetas, enlaces, mapaIngredientes])
  const [q, setQ] = useState('')
  const [verFiltros, setVerFiltros] = useState(false)
  const [apartado, setApartadoE] = useState<Apartado>(() => (localStorage.getItem(CLAVE_APARTADO) as Apartado) || 'todas')
  const setApartado = (a: Apartado) => {
    setApartadoE(a)
    localStorage.setItem(CLAVE_APARTADO, a)
  }
  const [grupo, setGrupo] = useState<TipoAlimento | ''>('')
  const [tag, setTag] = useState('')
  const [maxMin, setMaxMin] = useState<number | ''>('')
  const [soloFav, setSoloFav] = useState(false)
  const tipos = useMemo(() => new Map(recetas.map((r) => [r.id, tipoReceta(r, mapaIngredientes, mapaRecetas)])), [recetas, mapaIngredientes, mapaRecetas])
  const [orden, setOrden] = useState<Orden>('titulo')

  const filtradas = useMemo(() => {
    const nq = normalizar(q)
    const res = recetas.filter((r) => {
      if (nq) {
        // Texto: título, etiquetas, notas e ingredientes
        const texto = normalizar(
          [r.titulo, r.etiquetas.join(' '), r.notas ?? '', ...r.ingredientes.map((l) => `${l.texto_original} ${l.ingredient_id ? mapaIngredientes.get(l.ingredient_id)?.nombre ?? '' : ''}`)].join(' '),
        )
        if (!nq.split(' ').every((p) => texto.includes(p))) return false
      }
      if (grupo && tipos.get(r.id) !== grupo) return false
      if (tag && !r.etiquetas.includes(tag)) return false
      if (maxMin !== '') {
        const t = tiempoTotal(r)
        if (t == null || t > maxMin) return false
      }
      if (soloFav && !r.favorita) return false
      return true
    })
    const cmp: Record<Orden, (a: (typeof res)[0], b: (typeof res)[0]) => number> = {
      titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
      reciente: (a, b) => b.creado_en.localeCompare(a.creado_en),
      valoracion: (a, b) => (b.valoracion ?? 0) - (a.valoracion ?? 0) || Number(b.favorita) - Number(a.favorita),
      tiempo: (a, b) => (tiempoTotal(a) ?? 999) - (tiempoTotal(b) ?? 999),
    }
    return res.sort(cmp[orden])
  }, [recetas, q, grupo, tag, maxMin, soloFav, tipos, orden, mapaIngredientes])

  const nFiltros = [grupo, tag, maxMin, soloFav ? 'fav' : ''].filter((x) => x !== '').length

  return (
    <div>
      <header className="cabecera">
        <h1>Recetas</h1>
        <span className="suave">{filtradas.length} de {recetas.length}</span>
        <Link className="boton primario" to="/receta/nueva">+ Nueva</Link>
      </header>
      <div className="buscador">
        <input type="search" placeholder="Buscar por nombre, ingrediente o etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`boton ${nFiltros ? 'activo' : ''}`} onClick={() => setVerFiltros(!verFiltros)}>
          Filtros{nFiltros ? ` (${nFiltros})` : ''}
        </button>
      </div>
      <div className="pestanas-recetas" role="tablist">
        {APARTADOS.map((a) => (
          <button key={a.valor} role="tab" className={apartado === a.valor ? 'on' : ''} onClick={() => setApartado(a.valor)}>
            {a.etiqueta}
            <small>{filtradas.filter((r) => enApartado(r, a.valor)).length}</small>
          </button>
        ))}
      </div>
      {sinProducto > 0 && (
        <p className="aviso">
          🛒 {sinProducto} ingrediente{sinProducto === 1 ? '' : 's'} de tus recetas sin producto de Mercadona. <Link to="/mercadona">Elegir productos</Link>
        </p>
      )}
      {verFiltros && (
        <div className="filtros tarjeta">
          <label>
            Tipo de alimento
            <select value={grupo} onChange={(e) => setGrupo(e.target.value as TipoAlimento | '')}>
              <option value="">Todas</option>
              {TIPOS_ALIMENTO.map((t) => (
                <option key={t} value={t}>{INFO_TIPOS[t].emoji} {INFO_TIPOS[t].etiqueta}</option>
              ))}
            </select>
          </label>
          <label>
            Etiqueta
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Todas</option>
              {etiquetas.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Tiempo máximo
            <select value={maxMin} onChange={(e) => setMaxMin(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Sin límite</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">1 hora</option>
            </select>
          </label>
          <label>
            Ordenar
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              <option value="titulo">A-Z</option>
              <option value="reciente">Más recientes</option>
              <option value="valoracion">Mejor valoradas</option>
              <option value="tiempo">Más rápidas</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={soloFav} onChange={(e) => setSoloFav(e.target.checked)} /> Solo favoritas
          </label>
          {nFiltros > 0 && (
            <button
              className="enlace"
              onClick={() => {
                setGrupo('')
                setTag('')
                setMaxMin('')
                setSoloFav(false)
              }}
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}
      {recetas.length === 0 ? (
        <div className="vacio">
          <p>Todavía no hay recetas.</p>
          <div className="fila centro">
            <Link className="boton primario" to="/importar">Importar desde un enlace</Link>
            <Link className="boton" to="/receta/nueva">Crear a mano</Link>
          </div>
        </div>
      ) : (
        <div className="lista">
          {apartado === 'todas'
            ? APARTADOS.filter((a) => a.valor !== 'todas').map((a) => {
                // En «Todas», cada receta una sola vez: comida o cena sale en Comidas
                const deAqui = filtradas.filter((r) => enApartado(r, a.valor) && !(a.valor === 'cena' && r.tipo_comida === 'ambas'))
                if (!deAqui.length) return null
                return (
                  <div key={a.valor}>
                    <h2 className="seccion-recetas">{a.valor === 'comida' ? '🍽️ Comidas (y comida o cena)' : a.etiqueta} <span className="suave">{deAqui.length}</span></h2>
                    {deAqui.map((r) => (
                      <TarjetaReceta key={r.id} receta={r} />
                    ))}
                  </div>
                )
              })
            : filtradas.filter((r) => enApartado(r, apartado)).map((r) => <TarjetaReceta key={r.id} receta={r} />)}
          {filtradas.filter((r) => enApartado(r, apartado)).length === 0 && (
            <p className="vacio">{filtradas.length === 0 ? 'Ninguna receta cumple los filtros.' : 'No hay recetas en este apartado.'}</p>
          )}
        </div>
      )}
    </div>
  )
}
