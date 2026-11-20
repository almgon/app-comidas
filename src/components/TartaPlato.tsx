import type { ReactNode } from 'react'
import { fmt } from '../lib/nutricion'
import {
  GRUPOS_CUENTAN, OBJETIVO_PLATO, RANGOS_PLATO, TEXTO_ESTADO, etiquetaGrupoPlato, evaluarPlato, pesoPlato,
  type EstadoPlato, type GrupoCuenta, type Reparto,
} from '../lib/plato'

type Tipo = 'principal' | 'desayuno'

/** Porción de tarta (en grados, desde arriba y en el sentido de las agujas del reloj) */
function porcion(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)]
  if (a1 - a0 >= 359.99) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1} Z`
}

/** Tarta con el reparto del plato. Si `mini`, solo la tarta pequeña (sin leyenda). */
export function Tarta({ reparto, size = 120, mini = false }: { reparto: Reparto; size?: number; mini?: boolean }) {
  const total = pesoPlato(reparto)
  const c = size / 2
  const r = c - 1
  let a = 0
  const porciones = GRUPOS_CUENTAN.map((g) => {
    const ang = total ? (360 * reparto[g]) / total : 0
    const res = { g, a0: a, a1: a + ang, pct: total ? (100 * reparto[g]) / total : 0 }
    a += ang
    return res
  }).filter((x) => x.a1 - x.a0 > 0.5)
  return (
    <svg className={`tarta ${mini ? 'mini' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={porciones.map((x) => `${etiquetaGrupoPlato(x.g).corta} ${fmt(x.pct)} %`).join(', ')}>
      {total === 0 && <circle cx={c} cy={c} r={r} className="tarta-vacia" />}
      {porciones.map((x) => (
        <path key={x.g} d={porcion(c, c, r, x.a0, x.a1)} className={`porcion p-${x.g}`} strokeWidth={mini ? 1 : 2}>
          <title>{`${etiquetaGrupoPlato(x.g).etiqueta}: ${fmt(x.pct)} % (${fmt(reparto[x.g])} g)`}</title>
        </path>
      ))}
      {/* el objetivo: la mitad verdura (línea vertical) y un cuarto proteína */}
      {!mini && total > 0 && <path d={`M ${c} 1 L ${c} ${size - 1} M ${c} ${c} L 1 ${c}`} className="tarta-guia" />}
    </svg>
  )
}

const ICONO: Record<EstadoPlato, string> = { cumple: '✓', casi: '≈', no: '✗', sin_datos: '?' }

/** Chip con el estado: «🍽️ ✓ Plato» */
export function ChipPlato({ reparto, tipo = 'principal', texto }: { reparto: Reparto | null; tipo?: Tipo; texto?: boolean }) {
  const ev = evaluarPlato(reparto, tipo)
  if (ev.estado === 'sin_datos') return null
  const corto = { cumple: 'Método del plato', casi: 'Casi método del plato', no: 'No cumple el plato', sin_datos: '' }[ev.estado]
  return (
    <span className={`chip plato-${ev.estado}`} title={[TEXTO_ESTADO[ev.estado], ...ev.consejos].join(' · ')}>
      🍽️ {ICONO[ev.estado]}{texto !== false ? ` ${corto}` : ''}
    </span>
  )
}

/** Tarta grande con leyenda, estado y consejos */
export default function TartaPlato({ reparto, tipo = 'principal', titulo, pie }: { reparto: Reparto | null; tipo?: Tipo; titulo?: string; pie?: ReactNode }) {
  const ev = evaluarPlato(reparto, tipo)
  const rangos = RANGOS_PLATO[tipo]
  return (
    <div className="plato-metodo">
      {titulo && <h3>{titulo}</h3>}
      {ev.estado === 'sin_datos' || !reparto ? (
        <p className="suave">No hay datos para el método del plato: vincula los ingredientes con el catálogo y pon sus cantidades.</p>
      ) : (
        <>
          <div className="plato-fila">
            <Tarta reparto={reparto} />
            <ul className="leyenda-plato">
              {GRUPOS_CUENTAN.map((g: GrupoCuenta) => {
                const e = etiquetaGrupoPlato(g)
                const v = ev.porcentajes![g]
                const [a, b] = rangos[g]
                const ok = v >= a && v <= b
                return (
                  <li key={g}>
                    <span className={`muestra p-${g}`} aria-hidden />
                    <span className="nombre">{e.emoji} {e.corta}</span>
                    <b>{fmt(v)} %</b>
                    <small className={ok ? 'suave' : 'fuera'}>
                      {ok ? '' : '⚠️ '}
                      {g === 'grasa' ? `poca (≤${b} %)` : `obj. ${OBJETIVO_PLATO[g]} % (${a}-${b})`}
                    </small>
                  </li>
                )
              })}
            </ul>
          </div>
          <p className={`estado-plato plato-${ev.estado}`}>
            {ICONO[ev.estado]} {TEXTO_ESTADO[ev.estado]}
            {tipo === 'desayuno' ? ' (desayuno: más flexible)' : ''}
            {ev.consejos.length > 0 ? `: ${ev.consejos.join(', ').toLowerCase()}.` : '.'}
          </p>
          <p className="suave pequeno">Por peso en el plato, ya cocinado ({fmt(pesoPlato(reparto))} g por ración). Especias, caldos, bebidas y salsas no cuentan.</p>
        </>
      )}
      {pie}
    </div>
  )
}
