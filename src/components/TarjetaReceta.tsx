import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { nutricionPorRacion, fmt } from '../lib/nutricion'
import { etiquetaGrupo, tiempoTotal, type Receta } from '../lib/tipos'

export default function TarjetaReceta({ receta }: { receta: Receta }) {
  const { mapaIngredientes, mapaRecetas } = useDatos()
  const n = nutricionPorRacion(receta, mapaIngredientes, mapaRecetas)
  const g = etiquetaGrupo(receta.grupo_proteico)
  const t = tiempoTotal(receta)
  return (
    <Link to={`/receta/${receta.id}`} className="tarjeta-receta">
      <div className="miniatura" style={receta.foto_url ? { backgroundImage: `url("${receta.foto_url}")` } : undefined}>
        {!receta.foto_url && <span>{g?.emoji ?? '🍽️'}</span>}
      </div>
      <div className="info">
        <div className="titulo">
          {receta.favorita && <span title="Favorita">★ </span>}
          {receta.titulo}
        </div>
        <div className="chips">
          {receta.es_base && <span className="chip base">Base</span>}
          {g && <span className={`chip g-${g.valor}`}>{g.emoji} {g.etiqueta}</span>}
          {t != null && <span className={`chip ${t <= 30 ? 'rapida' : ''}`}>⏱ {t} min</span>}
          {n.proteina != null && <span className="chip">💪 {fmt(n.proteina)} g/ración</span>}
          {receta.congelable && <span className="chip">❄️</span>}
        </div>
      </div>
    </Link>
  )
}
