// Sesión de batch cooking del domingo: qué cocinar, cuánto y dónde guardarlo
import type { Congelado, EntradaPlan, EstadoBatch, Momento, Receta } from './tipos'
import { aguantaNevera, NEVERA_POR_DEFECTO } from './generador'
import { indiceDia } from './semana'

export interface UsoBatch {
  fecha: string
  momento: Momento
  raciones: number
  destino: 'nevera' | 'congelador'
  /** para las bases: en qué plato se usa */
  plato?: string
}

export interface ItemBatch {
  receta: Receta
  esBase: boolean
  usos: UsoBatch[]
  /** raciones que pide el menú */
  necesarias: number
  /** raciones que ya hay en el congelador y se usan (solo bases) */
  delCongelador: number
  congeladosUsados: { id: string; raciones: number }[]
  extraSugerida: number
  extra: number
  /** raciones a cocinar = necesarias - delCongelador + extra */
  cocinar: number
  nevera: number
  congelador: number
  avisos: string[]
  hecho: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function sesionDomingo(
  lunes: string,
  entradas: EntradaPlan[],
  recetas: Map<string, Receta>,
  estado: Record<string, EstadoBatch>,
  congelados: Congelado[],
): ItemBatch[] {
  const usos = new Map<string, UsoBatch[]>()
  const destino = (r: Receta, fecha: string): UsoBatch['destino'] => (aguantaNevera(r, indiceDia(lunes, fecha)) || !r.congelable ? 'nevera' : 'congelador')
  const anadir = (r: Receta, u: Omit<UsoBatch, 'destino'>) => {
    const l = usos.get(r.id) ?? []
    l.push({ ...u, destino: destino(r, u.fecha) })
    usos.set(r.id, l)
  }
  const bases = (r: Receta, raciones: number, e: EntradaPlan, visitadas: Set<string>) => {
    if (visitadas.has(r.id)) return
    const mult = raciones / (r.raciones || 1)
    for (const l of r.ingredientes) {
      const sub = l.sub_recipe_id ? recetas.get(l.sub_recipe_id) : undefined
      if (!sub) continue
      const rac = (l.cantidad ?? 1) * mult
      anadir(sub, { fecha: e.fecha, momento: e.momento, raciones: rac, plato: r.titulo })
      bases(sub, rac, e, new Set([...visitadas, r.id]))
    }
  }

  for (const e of entradas) {
    const r = e.recipe_id ? recetas.get(e.recipe_id) : undefined
    if (!r || e.origen === 'libre' || e.origen === 'congelador') continue
    if (e.origen === 'batch') anadir(r, { fecha: e.fecha, momento: e.momento, raciones: e.raciones })
    bases(r, e.raciones, e, new Set())
  }

  const items: ItemBatch[] = []
  for (const [id, us] of usos) {
    const r = recetas.get(id)!
    const necesarias = r2(us.reduce((s, u) => s + u.raciones, 0))
    // Bases que ya están congeladas: se usan primero (las más antiguas)
    let delCongelador = 0
    const congeladosUsados: ItemBatch['congeladosUsados'] = []
    if (r.es_base) {
      for (const c of [...congelados].filter((c) => c.recipe_id === id && c.raciones > 0).sort((a, b) => a.congelado_en.localeCompare(b.congelado_en))) {
        const usar = Math.min(c.raciones, necesarias - delCongelador)
        if (usar <= 0) break
        delCongelador += usar
        congeladosUsados.push({ id: c.id, raciones: r2(usar) })
      }
    }
    const netas = Math.max(0, necesarias - delCongelador)
    // Si es congelable, se cocina la receta entera (o múltiplos) y lo que sobra va al congelador
    const rendimiento = r.raciones || 1
    const extraSugerida = r.congelable && netas > 0 ? r2(Math.ceil(netas / rendimiento - 0.05) * rendimiento - netas) : 0
    const est = estado[id] ?? {}
    const extra = Math.max(0, est.extra ?? (extraSugerida >= 0.5 ? extraSugerida : 0))
    const paraCongelar = Math.min(netas, us.filter((u) => u.destino === 'congelador').reduce((s, u) => s + u.raciones, 0))
    const nevera = netas - paraCongelar
    const congelador = paraCongelar + extra
    const avisos: string[] = []
    const dias = r.dias_nevera ?? NEVERA_POR_DEFECTO
    const tarde = us.filter((u) => u.destino === 'nevera' && !aguantaNevera(r, indiceDia(lunes, u.fecha)))
    if (tarde.length) avisos.push(`Aguanta ${dias} días en nevera y no es congelable: ojo con lo del ${tarde.map((u) => u.fecha.slice(8)).join(', ')}.`)
    items.push({
      receta: r,
      esBase: r.es_base,
      usos: us.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.momento.localeCompare(b.momento)),
      necesarias,
      delCongelador: r2(delCongelador),
      congeladosUsados,
      extraSugerida,
      extra: r2(extra),
      cocinar: r2(netas + extra),
      nevera: r2(nevera),
      congelador: r2(congelador),
      avisos,
      hecho: !!est.hecho,
    })
  }
  // Orden sugerido: primero las bases (se usan en otros platos), luego lo que más tarda (horno, guisos)
  const t = (r: Receta) => (r.t_coccion_min ?? 0) * 2 + (r.t_prep_min ?? 0)
  return items.sort((a, b) => Number(b.esBase) - Number(a.esBase) || t(b.receta) - t(a.receta) || a.receta.titulo.localeCompare(b.receta.titulo, 'es'))
}
