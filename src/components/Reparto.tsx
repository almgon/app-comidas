import { fmt } from '../lib/nutricion'
import { GRUPOS_CUENTAN, etiquetaGrupoPlato, pesoPlato, porcentajes, type Reparto } from '../lib/reparto'
import { INFO_TIPOS, type TipoAlimento } from '../lib/frecuencias'

/** «🥦 45 % · 🍗 25 % · 🍚 25 % · 🫒 5 %» (por peso en el plato) */
export const textoReparto = (r: Reparto | null | undefined) => {
  const pc = porcentajes(r)
  if (!pc) return null
  return GRUPOS_CUENTAN.map((g) => `${etiquetaGrupoPlato(g).emoji} ${fmt(pc[g])} %`).join(' · ')
}

/** Chip pequeño con los porcentajes de una receta */
export function ChipReparto({ reparto }: { reparto: Reparto | null | undefined }) {
  const t = textoReparto(reparto)
  if (!t) return null
  return (
    <span className="chip reparto" title="Verduras · proteínas · hidratos · grasas, en % del peso">
      {t}
    </span>
  )
}

/** Chip con el tipo de alimento de una receta (deducido de sus ingredientes) */
export function ChipTipo({ tipo }: { tipo: TipoAlimento | null | undefined }) {
  if (!tipo) return null
  const i = INFO_TIPOS[tipo]
  return (
    <span className={`chip g-${tipo}`} title="Tipo de alimento, según sus ingredientes">
      {i.emoji} {i.etiqueta}
    </span>
  )
}

/**
 * Barra con el % de verduras, proteínas, hidratos y grasas (por peso en el plato, ya cocinado) y su leyenda.
 * Sin objetivos: es solo para ver cómo queda.
 */
export function BarraReparto({ reparto, compacta = false, gramos = false, dia = false }: { reparto: Reparto | null | undefined; compacta?: boolean; gramos?: boolean; dia?: boolean }) {
  const pc = porcentajes(reparto)
  if (!pc || !reparto) return null
  return (
    <div className={`reparto-barra ${compacta ? 'compacta' : ''}`}>
      <div className="barra" role="img" aria-label={GRUPOS_CUENTAN.map((g) => `${etiquetaGrupoPlato(g).corta} ${fmt(pc[g])} %`).join(', ')}>
        {GRUPOS_CUENTAN.map((g) => (pc[g] > 0.5 ? <span key={g} className={`p-${g}`} style={{ width: `${pc[g]}%` }} title={`${etiquetaGrupoPlato(g).corta}: ${fmt(pc[g])} %`} /> : null))}
      </div>
      <ul className="leyenda-reparto">
        {GRUPOS_CUENTAN.map((g) => (
          <li key={g}>
            <span className={`muestra p-${g}`} aria-hidden />
            <span>{compacta ? etiquetaGrupoPlato(g).emoji : etiquetaGrupoPlato(g).corta}</span>
            <b>{fmt(pc[g])} %</b>
            {gramos && <small className="suave">{fmt(reparto[g])} g</small>}
          </li>
        ))}
      </ul>
      {!compacta && <p className="suave pequeno">Por peso en el plato, ya cocinado ({fmt(pesoPlato(reparto))} g por ración{dia ? ' al día' : ''}). Especias, caldos, bebidas y salsas no cuentan.</p>}
    </div>
  )
}
