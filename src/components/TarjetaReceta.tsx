import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { nutricionPorRacion, fmt } from '../lib/nutricion'
import { ChipsRaciones } from './Raciones'
import { porcionesPorRacion } from '../lib/grupos'
import { etiquetaGrupo, etiquetaPapel, papelDe, tiempoTotal, type Receta } from '../lib/tipos'

export default function TarjetaReceta({ receta }: { receta: Receta }) {
  const { mapaIngredientes, mapaRecetas } = useDatos()
  const n = nutricionPorRacion(receta, mapaIngredientes, mapaRecetas)
  const g = etiquetaGrupo(receta.grupo_proteico)
  const porciones = porcionesPorRacion(receta, mapaIngredientes, mapaRecetas).porciones
  const papel = !receta.es_base && receta.tipo_comida !== 'desayuno' && papelDe(receta) !== 'completo' ? etiquetaPapel(receta.papel) : null
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
          {papel && <span className="chip">{papel.emoji} {papel.etiqueta}</span>}
          {g && <span className={`chip g-${g.valor}`}>{g.emoji} {g.etiqueta}</span>}
          {t != null && <span className={`chip ${t <= 30 ? 'rapida' : ''}`}>⏱ {t} min</span>}
          {n.kcal != null && <span className="chip">🔥 {fmt(n.kcal)} kcal</span>}
          {n.proteina != null && <span className="chip">P {fmt(n.proteina)} g</span>}
          {n.hidratos != null && <span className="chip">HC {fmt(n.hidratos)} g</span>}
          {n.grasa != null && <span className="chip">G {fmt(n.grasa)} g</span>}
          <ChipsRaciones p={porciones} />
          {receta.congelable && <span className="chip">❄️</span>}
        </div>
      </div>
    </Link>
  )
}
