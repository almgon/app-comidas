import { GRUPOS_RACION, INFO_GRUPOS, evaluarDia, medias, type EstadoGrupo, type Porciones } from '../lib/grupos'

const fmt = (n: number) => medias(n).toLocaleString('es-ES', { maximumFractionDigits: 1 })

/** Raciones de cada grupo de una receta o un hueco: «🥦 1,5 · 🍚 1» (solo lo que aporta algo) */
export function ChipsRaciones({ p, minimo = 0.25 }: { p: Porciones | null | undefined; minimo?: number }) {
  if (!p) return null
  const hay = GRUPOS_RACION.filter((g) => p[g] >= minimo)
  if (!hay.length) return null
  return (
    <span className="chip raciones" title="Raciones de cada grupo por persona">
      {hay.map((g) => `${INFO_GRUPOS[g].emoji} ${fmt(p[g])}`).join(' · ')}
    </span>
  )
}

/** Cómo va el día de una persona: verdura, hidratos y lácteos con su semáforo */
export function EstadoRaciones({ p, compacto = false }: { p: Porciones; compacto?: boolean }) {
  return (
    <span className="chips">
      {evaluarDia(p).map((x: EstadoGrupo) => (
        <span key={x.grupo} className={`chip racion-${x.estado}`} title={`${INFO_GRUPOS[x.grupo].etiqueta}: 1 ración = ${INFO_GRUPOS[x.grupo].racion}`}>
          {INFO_GRUPOS[x.grupo].emoji} {compacto ? fmt(x.valor) : `${INFO_GRUPOS[x.grupo].etiqueta} ${x.texto}`}
        </span>
      ))}
    </span>
  )
}
