// Datos del menú: desayunos, congelador y envases (de todo el hogar) y la semana que se está viendo
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useDatos } from './datos'
import type { ArticuloCompra, Congelado, EntradaPlan, Envase, EstadoBatch, LineaDesayuno, ListaCompra, Momento, PlanSemana, ProductoTienda, Tienda } from './tipos'
import { comensalesDe } from './tipos'
import type { Necesidad } from './compra'
import { claveArticulo } from './compra'
import type { ItemBatch } from './batch'

function chk<T>(r: { data: T; error: any }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}
const num = (v: any) => (v == null ? null : Number(v))
const leer = <T,>(k: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null')
  } catch {
    return null
  }
}

// =========================================================
// Hogar: desayunos, congelador, envases
// =========================================================
interface DatosMenu {
  desayunos: LineaDesayuno[]
  congelados: Congelado[]
  envases: Map<string, Envase>
  guardarDesayuno: (l: Partial<LineaDesayuno> & Pick<LineaDesayuno, 'dias' | 'ingredient_id'>) => Promise<void>
  borrarDesayuno: (id: string) => Promise<void>
  guardarCongelado: (c: Partial<Congelado> & { nombre: string }) => Promise<void>
  borrarCongelado: (id: string) => Promise<void>
  guardarEnvase: (ingredientId: string, e: Envase | null) => Promise<void>
  /** producto enlazado a cada ingrediente en cada tienda */
  enlaces: Map<string, Partial<Record<Tienda, ProductoTienda>>>
  enlazar: (ingredientId: string, tienda: Tienda, productoId: string | null) => Promise<void>
  guardarProducto: (p: Partial<ProductoTienda> & { tienda: Tienda; nombre: string }) => Promise<string>
  buscarProductos: (tienda: Tienda, q: string) => Promise<ProductoTienda[]>
  recargarMenu: () => Promise<void>
}

const Ctx = createContext<DatosMenu | null>(null)
export const useMenu = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMenu fuera de MenuProvider')
  return c
}

const aCongelado = (c: any): Congelado => ({ ...c, raciones: Number(c.raciones) })
export const aProducto = (p: any): ProductoTienda => ({
  ...p, envase_cantidad: num(p.envase_cantidad), precio: num(p.precio), precio_referencia: num(p.precio_referencia),
})

export function MenuProvider({ children }: { children: ReactNode }) {
  const { hogar } = useDatos()
  const hogarId = hogar?.id
  const clave = `comidas-menu-${hogarId}`
  const cache = useMemo(() => (hogarId ? leer<any>(clave) : null), [hogarId, clave])
  const [desayunos, setDesayunos] = useState<LineaDesayuno[]>(cache?.desayunos ?? [])
  const [congelados, setCongelados] = useState<Congelado[]>(cache?.congelados ?? [])
  const [envasesL, setEnvasesL] = useState<{ ingredient_id: string; cantidad: number; nombre: string }[]>(cache?.envases ?? [])
  const [enlacesL, setEnlacesL] = useState<{ ingredient_id: string; tienda: Tienda; producto: ProductoTienda }[]>(cache?.enlaces ?? [])

  const recargarMenu = useCallback(async () => {
    if (!hogarId) return
    try {
      const [d, c, e] = await Promise.all([
        supabase.from('desayunos').select('*').order('orden'),
        supabase.from('freezer_items').select('*').order('congelado_en'),
        supabase.from('envases_hogar').select('ingredient_id, cantidad, nombre'),
      ])
      const datos = {
        desayunos: (chk(d) as any[]).map((x) => ({ ...x, cantidades: x.cantidades ?? {} })),
        congelados: (chk(c) as any[]).map(aCongelado),
        envases: (chk(e) as any[]).map((x) => ({ ...x, cantidad: Number(x.cantidad) })),
      }
      setDesayunos(datos.desayunos)
      setCongelados(datos.congelados)
      setEnvasesL(datos.envases)
      // Precios (migración 005): si aún no existe la tabla, se sigue sin precios
      const ip = await supabase.from('ingredient_products').select('ingredient_id, tienda, store_products(*)')
      const enlaces = ip.error ? [] : (ip.data as any[]).filter((x) => x.store_products && x.tienda === 'mercadona').map((x) => ({ ingredient_id: x.ingredient_id, tienda: x.tienda, producto: aProducto(x.store_products) }))
      setEnlacesL(enlaces)
      localStorage.setItem(clave, JSON.stringify({ ...datos, enlaces }))
    } catch (err) {
      console.warn('No se pudo cargar el menú (¿sin conexión o falta la migración 004?)', err)
    }
  }, [hogarId, clave])

  useEffect(() => {
    recargarMenu()
  }, [recargarMenu])

  // Tiempo real
  const temporizador = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!hogarId) return
    const programar = () => {
      window.clearTimeout(temporizador.current)
      temporizador.current = window.setTimeout(recargarMenu, 300)
    }
    const canal = supabase
      .channel(`menu-${hogarId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'desayunos' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'freezer_items' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'envases_hogar' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredient_products' }, programar)
      .subscribe()
    const alVolver = () => document.visibilityState === 'visible' && recargarMenu()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [hogarId, recargarMenu])

  const guardarDesayuno = useCallback(
    async (l: Partial<LineaDesayuno> & Pick<LineaDesayuno, 'dias' | 'ingredient_id'>) => {
      const { id, ...campos } = l
      if (id) chk(await supabase.from('desayunos').update(campos).eq('id', id))
      else chk(await supabase.from('desayunos').insert({ orden: desayunos.length, ...campos }))
      await recargarMenu()
    },
    [desayunos.length, recargarMenu],
  )
  const borrarDesayuno = useCallback(
    async (id: string) => {
      setDesayunos((d) => d.filter((x) => x.id !== id))
      chk(await supabase.from('desayunos').delete().eq('id', id))
      await recargarMenu()
    },
    [recargarMenu],
  )
  const guardarCongelado = useCallback(
    async (c: Partial<Congelado> & { nombre: string }) => {
      const { id, ...campos } = c
      if (id) chk(await supabase.from('freezer_items').update(campos).eq('id', id))
      else chk(await supabase.from('freezer_items').insert(campos))
      await recargarMenu()
    },
    [recargarMenu],
  )
  const borrarCongelado = useCallback(
    async (id: string) => {
      setCongelados((c) => c.filter((x) => x.id !== id))
      chk(await supabase.from('freezer_items').delete().eq('id', id))
      await recargarMenu()
    },
    [recargarMenu],
  )
  const guardarEnvase = useCallback(
    async (ingredientId: string, e: Envase | null) => {
      if (e) chk(await supabase.from('envases_hogar').upsert({ ingredient_id: ingredientId, cantidad: e.cantidad, nombre: e.nombre }, { onConflict: 'household_id,ingredient_id' }))
      else chk(await supabase.from('envases_hogar').delete().eq('ingredient_id', ingredientId))
      await recargarMenu()
    },
    [recargarMenu],
  )

  const enlazar = useCallback(
    async (ingredientId: string, tienda: Tienda, productoId: string | null) => {
      if (productoId) chk(await supabase.from('ingredient_products').upsert({ ingredient_id: ingredientId, tienda, store_product_id: productoId }, { onConflict: 'household_id,ingredient_id,tienda' }))
      else chk(await supabase.from('ingredient_products').delete().eq('ingredient_id', ingredientId).eq('tienda', tienda))
      await recargarMenu()
    },
    [recargarMenu],
  )
  const guardarProducto = useCallback(
    async (p: Partial<ProductoTienda> & { tienda: Tienda; nombre: string }) => {
      const { id, ...campos } = p
      const fila = { ...campos, actualizado_en: new Date().toISOString() }
      if (id) {
        chk(await supabase.from('store_products').update({ ...fila, origen: 'manual' }).eq('id', id))
        await recargarMenu()
        return id
      }
      const r = chk(
        await supabase.from('store_products').insert({ ...fila, household_id: hogarId, origen: 'manual', id_externo: `m-${crypto.randomUUID()}` }).select('id').single(),
      ) as any
      return r.id as string
    },
    [hogarId, recargarMenu],
  )
  const buscarProductos = useCallback(async (tienda: Tienda, q: string) => {
    const r = await supabase.rpc('buscar_productos', { p_tienda: tienda, p_q: q })
    if (r.error) throw new Error(/function|relation|schema cache/i.test(r.error.message) ? 'Falta ejecutar la migración 005 en Supabase.' : r.error.message)
    return (r.data as any[]).map(aProducto)
  }, [])

  const envases = useMemo(() => new Map(envasesL.map((e) => [e.ingredient_id, { cantidad: e.cantidad, nombre: e.nombre }])), [envasesL])
  const enlaces = useMemo(() => {
    const m = new Map<string, Partial<Record<Tienda, ProductoTienda>>>()
    for (const e of enlacesL) m.set(e.ingredient_id, { ...(m.get(e.ingredient_id) ?? {}), [e.tienda]: e.producto })
    return m
  }, [enlacesL])

  return (
    <Ctx.Provider value={{ desayunos, congelados, envases, guardarDesayuno, borrarDesayuno, guardarCongelado, borrarCongelado, guardarEnvase, enlaces, enlazar, guardarProducto, buscarProductos, recargarMenu }}>
      {children}
    </Ctx.Provider>
  )
}

export function useComensales() {
  const { miembros } = useDatos()
  return useMemo(() => comensalesDe(miembros), [miembros])
}

// =========================================================
// Una semana: menú + lista de la compra
// =========================================================
const aEntrada = (e: any): EntradaPlan => ({
  id: e.id, fecha: e.fecha, momento: e.momento, recipe_id: e.recipe_id, raciones: Number(e.raciones), origen: e.origen,
  freezer_item_id: e.freezer_item_id, fijado: e.fijado, nota: e.nota, extras: Array.isArray(e.extras) ? e.extras : [],
})
const aArticulo = (a: any): ArticuloCompra => ({ ...a, cantidad: num(a.cantidad) })
const PENDIENTES = 'comidas-compra-pendiente'

export function useSemana(lunes: string) {
  const { hogar, sesion } = useDatos()
  const { recargarMenu } = useMenu()
  const hogarId = hogar?.id
  const clave = `comidas-semana-${hogarId}-${lunes}`
  const [estado, setEstado] = useState<{ plan: PlanSemana | null; entradas: EntradaPlan[]; lista: ListaCompra | null; articulos: ArticuloCompra[] }>(
    () => leer(clave) ?? { plan: null, entradas: [], lista: null, articulos: [] },
  )
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEstado(leer(clave) ?? { plan: null, entradas: [], lista: null, articulos: [] })
    setCargando(true)
  }, [clave])

  const recargar = useCallback(async () => {
    if (!hogarId) return
    try {
      let plan = chk(await supabase.from('meal_plans').select('*').eq('semana_inicio', lunes).maybeSingle()) as any
      if (!plan) {
        chk(await supabase.from('meal_plans').upsert({ semana_inicio: lunes }, { onConflict: 'household_id,semana_inicio', ignoreDuplicates: true }))
        plan = chk(await supabase.from('meal_plans').select('*').eq('semana_inicio', lunes).single())
      }
      const [e, l] = await Promise.all([
        supabase.from('plan_entries').select('*').eq('plan_id', plan.id),
        supabase.from('shopping_lists').select('*').eq('plan_id', plan.id).maybeSingle(),
      ])
      const lista = chk(l) as any
      const articulos = lista ? (chk(await supabase.from('shopping_items').select('*').eq('list_id', lista.id).order('creado_en')) as any[]).map(aArticulo) : []
      const nuevo = {
        plan: { id: plan.id, semana_inicio: plan.semana_inicio, batch: plan.batch ?? {}, batch_cerrado_en: plan.batch_cerrado_en } as PlanSemana,
        entradas: (chk(e) as any[]).map(aEntrada),
        lista: lista ? ({ ...lista, umbral_ahorro: Number(lista.umbral_ahorro) } as ListaCompra) : null,
        articulos,
      }
      setEstado(nuevo)
      setError(null)
      localStorage.setItem(clave, JSON.stringify(nuevo))
    } catch (err: any) {
      setError(/relation|does not exist|schema cache/i.test(err.message) ? 'Falta ejecutar la migración 004 en Supabase (ver la guía).' : err.message)
    } finally {
      setCargando(false)
    }
  }, [hogarId, lunes, clave])

  useEffect(() => {
    recargar()
  }, [recargar])

  // Tiempo real de esta semana
  const planId = estado.plan?.id
  const listaId = estado.lista?.id
  const temporizador = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!planId) return
    const programar = () => {
      window.clearTimeout(temporizador.current)
      temporizador.current = window.setTimeout(recargar, 250)
    }
    let canal = supabase
      .channel(`semana-${planId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_entries', filter: `plan_id=eq.${planId}` }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plans', filter: `id=eq.${planId}` }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_lists', filter: `plan_id=eq.${planId}` }, programar)
    if (listaId) canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `list_id=eq.${listaId}` }, programar)
    canal.subscribe()
    const alVolver = () => document.visibilityState === 'visible' && recargar()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [planId, listaId, recargar])

  // Marcados hechos sin conexión: se envían al volver
  useEffect(() => {
    const enviar = async () => {
      const pend = leer<Record<string, { comprado: boolean; comprado_por: string | null; comprado_en: string | null }>>(PENDIENTES) ?? {}
      const ids = Object.keys(pend)
      if (!ids.length) return
      for (const id of ids) {
        const r = await supabase.from('shopping_items').update(pend[id]).eq('id', id)
        if (!r.error) delete pend[id]
      }
      localStorage.setItem(PENDIENTES, JSON.stringify(pend))
      recargar()
    }
    enviar()
    window.addEventListener('online', enviar)
    return () => window.removeEventListener('online', enviar)
  }, [recargar])

  // ---------- Acciones del menú ----------
  const fila = useCallback(
    (e: EntradaPlan) => ({
      plan_id: planId, fecha: e.fecha, momento: e.momento, recipe_id: e.recipe_id, raciones: e.raciones, origen: e.origen,
      freezer_item_id: e.origen === 'congelador' ? e.freezer_item_id : null, fijado: e.fijado, nota: e.nota, extras: e.extras ?? [],
    }),
    [planId],
  )

  const guardarEntradas = useCallback(
    async (entradas: EntradaPlan[]) => {
      if (!planId) return
      setEstado((s) => {
        const m = new Map(s.entradas.map((e) => [`${e.fecha}|${e.momento}`, e]))
        for (const e of entradas) m.set(`${e.fecha}|${e.momento}`, e)
        return { ...s, entradas: [...m.values()] }
      })
      try {
        if (entradas.length) {
          const r = await supabase.from('plan_entries').upsert(entradas.map(fila), { onConflict: 'plan_id,fecha,momento' })
          if (r.error && /extras|momento_check|schema cache/i.test(r.error.message)) throw new Error('Falta ejecutar la migración 007 en Supabase (desayunos en el menú). Mira la guía.')
          chk(r)
        }
      } finally {
        await Promise.all([recargar(), recargarMenu()])
      }
    },
    [planId, fila, recargar, recargarMenu],
  )

  const borrarEntrada = useCallback(
    async (fecha: string, momento: Momento) => {
      if (!planId) return
      setEstado((s) => ({ ...s, entradas: s.entradas.filter((e) => !(e.fecha === fecha && e.momento === momento)) }))
      chk(await supabase.from('plan_entries').delete().eq('plan_id', planId).eq('fecha', fecha).eq('momento', momento))
      await Promise.all([recargar(), recargarMenu()])
    },
    [planId, recargar, recargarMenu],
  )

  const guardarBatch = useCallback(
    async (batch: Record<string, EstadoBatch>, cerrado?: string | null) => {
      if (!planId) return
      setEstado((s) => (s.plan ? { ...s, plan: { ...s.plan, batch, batch_cerrado_en: cerrado === undefined ? s.plan.batch_cerrado_en : cerrado } } : s))
      chk(await supabase.from('meal_plans').update(cerrado === undefined ? { batch } : { batch, batch_cerrado_en: cerrado }).eq('id', planId))
    },
    [planId],
  )

  /** Termina la sesión del domingo: lo que sobra va al congelador y se descuentan las bases congeladas usadas */
  const cerrarBatch = useCallback(
    async (items: ItemBatch[], domingo: string) => {
      const nuevos = items
        .filter((i) => i.extra > 0.05)
        .map((i) => ({ recipe_id: i.receta.id, nombre: i.receta.titulo, raciones: i.extra, congelado_en: domingo, nota: 'Batch del domingo' }))
      if (nuevos.length) chk(await supabase.from('freezer_items').insert(nuevos))
      for (const i of items)
        for (const u of i.congeladosUsados) {
          const actual = chk(await supabase.from('freezer_items').select('raciones').eq('id', u.id).maybeSingle()) as any
          if (actual) chk(await supabase.from('freezer_items').update({ raciones: Math.max(0, Number(actual.raciones) - u.raciones) }).eq('id', u.id))
        }
      const batch = Object.fromEntries(items.map((i) => [i.receta.id, { ...(estado.plan?.batch[i.receta.id] ?? {}), extra: i.extra, hecho: true }]))
      await guardarBatch(batch, new Date().toISOString())
      await recargarMenu()
    },
    [estado.plan, guardarBatch, recargarMenu],
  )

  // ---------- Lista de la compra ----------
  const generarLista = useCallback(
    async (necesidades: Necesidad[]) => {
      if (!planId) return
      let lista = estado.lista
      if (!lista) {
        chk(await supabase.from('shopping_lists').upsert({ plan_id: planId }, { onConflict: 'plan_id', ignoreDuplicates: true }))
        lista = chk(await supabase.from('shopping_lists').select('*').eq('plan_id', planId).single()) as any
      }
      const lid = lista!.id
      const previos = (chk(await supabase.from('shopping_items').select('*').eq('list_id', lid)) as any[]).map(aArticulo)
      const marcados = new Map(previos.filter((a) => !a.manual && a.comprado).map((a) => [claveArticulo(a), a]))
      chk(await supabase.from('shopping_items').delete().eq('list_id', lid).eq('manual', false))
      if (necesidades.length)
        chk(
          await supabase.from('shopping_items').insert(
            necesidades.map((n) => {
              const m = marcados.get(n.clave)
              return {
                list_id: lid, ingredient_id: n.ingredient_id, texto: n.texto, categoria: n.categoria, cantidad: n.cantidad, unidad: n.unidad,
                detalle: n.detalle, origen: n.origen, es_despensa: n.es_despensa, manual: false,
                comprado: !!m, comprado_por: m?.comprado_por ?? null, comprado_en: m?.comprado_en ?? null,
              }
            }),
          ),
        )
      chk(await supabase.from('shopping_lists').update({ generada_en: new Date().toISOString() }).eq('id', lid))
      await recargar()
    },
    [planId, estado.lista, recargar],
  )

  const marcar = useCallback(
    async (a: ArticuloCompra, comprado: boolean) => {
      const cambios = { comprado, comprado_por: comprado ? sesion?.user.id ?? null : null, comprado_en: comprado ? new Date().toISOString() : null }
      setEstado((s) => {
        const n = { ...s, articulos: s.articulos.map((x) => (x.id === a.id ? { ...x, ...cambios } : x)) }
        localStorage.setItem(clave, JSON.stringify(n))
        return n
      })
      const r = await supabase.from('shopping_items').update(cambios).eq('id', a.id)
      if (r.error) {
        const pend = leer<Record<string, typeof cambios>>(PENDIENTES) ?? {}
        pend[a.id] = cambios
        localStorage.setItem(PENDIENTES, JSON.stringify(pend))
      }
    },
    [sesion, clave],
  )

  const anadirArticulo = useCallback(
    async (texto: string) => {
      if (!planId || !texto.trim()) return
      let lista = estado.lista
      if (!lista) {
        chk(await supabase.from('shopping_lists').upsert({ plan_id: planId }, { onConflict: 'plan_id', ignoreDuplicates: true }))
        lista = chk(await supabase.from('shopping_lists').select('*').eq('plan_id', planId).single()) as any
      }
      chk(await supabase.from('shopping_items').insert({ list_id: lista!.id, texto: texto.trim(), categoria: 'Otros', manual: true }))
      await recargar()
    },
    [planId, estado.lista, recargar],
  )

  const borrarArticulo = useCallback(
    async (id: string) => {
      setEstado((s) => ({ ...s, articulos: s.articulos.filter((a) => a.id !== id) }))
      chk(await supabase.from('shopping_items').delete().eq('id', id))
    },
    [],
  )

  return { ...estado, cargando, error, recargar, guardarEntradas, borrarEntrada, guardarBatch, cerrarBatch, generarLista, marcar, anadirArticulo, borrarArticulo }
}
