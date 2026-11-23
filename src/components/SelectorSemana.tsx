import { Link } from 'react-router-dom'
import { nombreSemana, semanaPorDefecto, sumarDias } from '../lib/semana'

export default function SelectorSemana({ lunes, onCambiar }: { lunes: string; onCambiar: (l: string) => void }) {
  const hoy = semanaPorDefecto()
  return (
    <div className="selector-semana">
      <button className="boton" onClick={() => onCambiar(sumarDias(lunes, -7))} aria-label="Semana anterior">‹</button>
      <div className="centro-semana">
        <b>{nombreSemana(lunes)}</b>
        {lunes !== hoy && (
          <button className="enlace" onClick={() => onCambiar(hoy)}>Ir a la semana actual</button>
        )}
      </div>
      <button className="boton" onClick={() => onCambiar(sumarDias(lunes, 7))} aria-label="Semana siguiente">›</button>
    </div>
  )
}

/** Enlaces entre las pantallas de la semana, conservando la semana elegida */
export function EnlacesSemana({ lunes, actual }: { lunes: string; actual: 'menu' | 'domingo' | 'compra' | 'congelador' }) {
  const q = `?semana=${lunes}`
  const enlaces = [
    { k: 'menu', to: `/menu${q}`, t: '🗓️ Menú' },
    { k: 'domingo', to: `/domingo${q}`, t: '🍲 Domingo' },
    { k: 'congelador', to: `/congelador${q}`, t: '❄️ Congelador' },
  ]
  return (
    <div className="enlaces-semana">
      {enlaces.map((e) => (
        <Link key={e.k} to={e.to} className={`chip ${e.k === actual ? 'on' : ''}`}>{e.t}</Link>
      ))}
    </div>
  )
}
