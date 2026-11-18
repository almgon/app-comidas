import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { normalizar } from '../../shared/parser.js'
import { useDatos } from '../lib/datos'
import TarjetaReceta from '../components/TarjetaReceta'
import { GRUPOS_PROTEICOS, TIPOS_COMIDA, tiempoTotal, type GrupoProteico, type TipoComida } from '../lib/tipos'

type Orden = 'titulo' | 'reciente' | 'valoracion' | 'tiempo'

export default function Recetas() {
  const { recetas, etiquetas, mapaIngredientes } = useDatos()
  const [q, setQ] = useState('')
  const [verFiltros, setVerFiltros] = useState(false)
  const [tipo, setTipo] = useState<TipoComida | ''>('')
  const [grupo, setGrupo] = useState<GrupoProteico | ''>('')
  const [tag, setTag] = useState('')
  const [maxMin, setMaxMin] = useState<number | ''>('')
  const [soloFav, setSoloFav] = useState(false)
  const [bases, setBases] = useState<'todas' | 'si' | 'no'>('todas')
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
      if (tipo && !(r.tipo_comida === tipo || (r.tipo_comida === 'ambas' && (tipo === 'comida' || tipo === 'cena')))) return false
      if (grupo && r.grupo_proteico !== grupo) return false
      if (tag && !r.etiquetas.includes(tag)) return false
      if (maxMin !== '') {
        const t = tiempoTotal(r)
        if (t == null || t > maxMin) return false
      }
      if (soloFav && !r.favorita) return false
      if (bases === 'si' && !r.es_base) return false
      if (bases === 'no' && r.es_base) return false
      return true
    })
    const cmp: Record<Orden, (a: (typeof res)[0], b: (typeof res)[0]) => number> = {
      titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
      reciente: (a, b) => b.creado_en.localeCompare(a.creado_en),
      valoracion: (a, b) => (b.valoracion ?? 0) - (a.valoracion ?? 0) || Number(b.favorita) - Number(a.favorita),
      tiempo: (a, b) => (tiempoTotal(a) ?? 999) - (tiempoTotal(b) ?? 999),
    }
    return res.sort(cmp[orden])
  }, [recetas, q, tipo, grupo, tag, maxMin, soloFav, bases, orden, mapaIngredientes])

  const nFiltros = [tipo, grupo, tag, maxMin, soloFav || '', bases !== 'todas' ? bases : ''].filter((x) => x !== '' && x !== false).length

  return (
    <div>
      <header className="cabecera">
        <h1>Recetas</h1>
        <span className="suave">{filtradas.length} de {recetas.length}</span>
      </header>
      <div className="buscador">
        <input type="search" placeholder="Buscar por nombre, ingrediente o etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`boton ${nFiltros ? 'activo' : ''}`} onClick={() => setVerFiltros(!verFiltros)}>
          Filtros{nFiltros ? ` (${nFiltros})` : ''}
        </button>
      </div>
      {verFiltros && (
        <div className="filtros tarjeta">
          <label>
            Momento
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoComida | '')}>
              <option value="">Todos</option>
              {TIPOS_COMIDA.filter((t) => t.valor !== 'ambas').map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </label>
          <label>
            Proteína principal
            <select value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoProteico | '')}>
              <option value="">Todas</option>
              {GRUPOS_PROTEICOS.map((g) => (
                <option key={g.valor} value={g.valor}>{g.emoji} {g.etiqueta}</option>
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
              <option value="30">30 min (cena rápida)</option>
              <option value="45">45 min</option>
              <option value="60">1 hora</option>
            </select>
          </label>
          <label>
            Preparaciones base
            <select value={bases} onChange={(e) => setBases(e.target.value as 'todas' | 'si' | 'no')}>
              <option value="todas">Incluir</option>
              <option value="si">Solo bases</option>
              <option value="no">Sin bases</option>
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
                setTipo('')
                setGrupo('')
                setTag('')
                setMaxMin('')
                setSoloFav(false)
                setBases('todas')
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
          {filtradas.map((r) => (
            <TarjetaReceta key={r.id} receta={r} />
          ))}
          {filtradas.length === 0 && <p className="vacio">Ninguna receta cumple los filtros.</p>}
        </div>
      )}
    </div>
  )
}
