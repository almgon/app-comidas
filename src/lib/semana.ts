// Fechas de la semana en hora local, como texto AAAA-MM-DD (lo que guarda Postgres en columnas date)

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function aIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

export function deIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function sumarDias(iso: string, n: number): string {
  const d = deIso(iso)
  d.setDate(d.getDate() + n)
  return aIso(d)
}

/** Lunes de la semana de una fecha */
export function lunesDe(d: Date): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)
  const dow = (c.getDay() + 6) % 7 // 0 = lunes
  c.setDate(c.getDate() - dow)
  return aIso(c)
}

/** Semana que se muestra por defecto: la actual de lunes a viernes; desde el sábado, la siguiente (la que se prepara el domingo) */
export function semanaPorDefecto(hoy = new Date()): string {
  const dow = (hoy.getDay() + 6) % 7
  const lunes = lunesDe(hoy)
  return dow >= 5 ? sumarDias(lunes, 7) : lunes
}

export const fechasSemana = (lunes: string) => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))

/** 0 = lunes ... 6 = domingo */
export const indiceDia = (lunes: string, fecha: string) =>
  Math.round((deIso(fecha).getTime() - deIso(lunes).getTime()) / 86400000)

export function fechaCorta(iso: string): string {
  const d = deIso(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

export function nombreSemana(lunes: string): string {
  return `${fechaCorta(lunes)} – ${fechaCorta(sumarDias(lunes, 6))}`
}

export const diasEntre = (desde: string, hasta: string) =>
  Math.round((deIso(hasta).getTime() - deIso(desde).getTime()) / 86400000)
