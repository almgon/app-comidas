import { useSearchParams } from 'react-router-dom'
import { deIso, lunesDe, semanaPorDefecto } from './semana'

/** Semana elegida (?semana=AAAA-MM-DD), compartida entre Menú, Domingo y Compra */
export function useSemanaElegida(): [string, (lunes: string) => void] {
  const [params, setParams] = useSearchParams()
  const p = params.get('semana')
  const lunes = p && /^\d{4}-\d{2}-\d{2}$/.test(p) ? lunesDe(deIso(p)) : semanaPorDefecto()
  return [lunes, (l: string) => setParams({ semana: l }, { replace: true })]
}
