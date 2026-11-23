import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { GrupoPlato, Hogar, Ingrediente, Perfil, Receta, RecetaBorrador } from './tipos'
import { esUnidadBase } from './nutricion'

interface Datos {
  cargando: boolean
  sesion: Session | null
  perfil: Perfil | null
  hogar: Hogar | null
  miembros: Perfil[]
  recetas: Receta[]
  ingredientes: Ingrediente[]
  etiquetas: string[]
  mapaRecetas: Map<string, Receta>
  mapaIngredientes: Map<string, Ingrediente>
  enLinea: boolean
  recargar: () => Promise<void>
  guardarReceta: (r: RecetaBorrador) => Promise<string>
  borrarReceta: (id: string) => Promise<void>
  actualizarReceta: (id: string, cambios: Partial<Pick<Receta, 'favorita' | 'valoracion' | 'papel'>>) => Promise<void>
  guardarIngrediente: (i: Partial<Ingrediente> & { nombre: string }) => Promise<Ingrediente>
  borrarIngrediente: (id: string) => Promise<void>
  /** grupo del método del plato elegido a mano (null = el que deduce la app) */
  guardarGrupoPlato: (ingredientId: string, grupo: GrupoPlato | null) => Promise<void>
  guardarPerfil: (cambios: Partial<Pick<Perfil, 'nombre' | 'peso_kg' | 'factor_racion' | 'kcal_objetivo'>>) => Promise<void>
  renombrarHogar: (nombre: string) => Promise<void>
}

const Ctx = createContext<Datos | null>(null)
export const useDatos = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDatos fuera de DatosProvider')
  return c
}

const CACHE = 'comidas-cache-v1'

const SELECT_RECETAS =
  '*, recipe_ingredients!recipe_ingredients_recipe_id_fkey(id, orden, ingredient_id, sub_recipe_id, cantidad, unidad, texto_original), recipe_steps(orden, texto), recipe_tags(tags(nombre))'

function aReceta(row: any): Receta {
  const { recipe_ingredients, recipe_steps, recipe_tags, ...r } = row
  return {
    ...r,
    raciones: Number(r.raciones),
    proteina_racion_manual: r.proteina_racion_manual == null ? null : Number(r.proteina_racion_manual),
    peso_total_g: r.peso_total_g == null ? null : Number(r.peso_total_g),
    ingredientes: [...(recipe_ingredients ?? [])]
      .sort((a: any, b: any) => a.orden - b.orden)
      .map((l: any) => ({ ...l, cantidad: l.cantidad == null ? null : Number(l.cantidad) })),
    pasos: [...(recipe_steps ?? [])].sort((a: any, b: any) => a.orden - b.orden).map((p: any) => p.texto),
    etiquetas: (recipe_tags ?? []).map((t: any) => t.tags?.nombre).filter(Boolean).sort(),
  }
}

const num = (v: any) => (v == null ? null : Number(v))
function aIngrediente(i: any): Ingrediente {
  return {
    ...i,
    peso_unidad_g: num(i.peso_unidad_g),
    kcal_100: num(i.kcal_100),
    proteina_100: num(i.proteina_100),
    hidratos_100: num(i.hidratos_100),
    grasa_100: num(i.grasa_100),
    envase_cantidad: num(i.envase_cantidad),
  }
}

function chk<T>(r: { data: T; error: any }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

export function DatosProvider({ children }: { children: ReactNode }) {
  const cache = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE) ?? 'null')
    } catch {
      return null
    }
  }, [])
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [perfil, setPerfil] = useState<Perfil | null>(cache?.perfil ?? null)
  const [hogar, setHogar] = useState<Hogar | null>(cache?.hogar ?? null)
  const [miembros, setMiembros] = useState<Perfil[]>(cache?.miembros ?? [])
  const [recetas, setRecetas] = useState<Receta[]>(cache?.recetas ?? [])
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>(cache?.ingredientes ?? [])
  const [etiquetas, setEtiquetas] = useState<string[]>(cache?.etiquetas ?? [])
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const recetasRef = useRef(recetas)
  recetasRef.current = recetas

  useEffect(() => {
    const on = () => setEnLinea(true)
    const off = () => setEnLinea(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      if (!data.session) setCargando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSesion(s)
      if (!s) {
        localStorage.removeItem(CACHE)
        setPerfil(null)
        setHogar(null)
        setRecetas([])
        setCargando(false)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const recargar = useCallback(async () => {
    const uid = (await supabase.auth.getSession()).data.session?.user.id
    if (!uid) return
    try {
      const p = chk(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()) as Perfil | null
      setPerfil(p)
      if (!p?.household_id) {
        setHogar(null)
        return
      }
      const [h, m, r, i, t, gp] = await Promise.all([
        supabase.from('households').select('*').eq('id', p.household_id).single(),
        supabase.from('profiles').select('*').eq('household_id', p.household_id),
        supabase.from('recipes').select(SELECT_RECETAS).order('titulo'),
        supabase.from('ingredients').select('*').order('nombre'),
        supabase.from('tags').select('nombre').order('nombre'),
        // llega con la migración 009: si falta, la app deduce los grupos y ya
        supabase.from('ingredient_grupos').select('ingredient_id, grupo'),
      ])
      const grupos = new Map<string, GrupoPlato>(gp.error ? [] : (gp.data as any[]).map((x) => [x.ingredient_id, x.grupo]))
      const datos = {
        perfil: p,
        hogar: chk(h) as Hogar,
        miembros: (chk(m) as Perfil[]).map((x) => ({ ...x, factor_racion: Number(x.factor_racion) })),
        recetas: (chk(r) as any[]).map(aReceta),
        ingredientes: (chk(i) as any[]).map((x) => ({ ...aIngrediente(x), grupo_plato: grupos.get(x.id) ?? null })),
        etiquetas: (chk(t) as any[]).map((x) => x.nombre),
      }
      setHogar(datos.hogar)
      setMiembros(datos.miembros)
      setRecetas(datos.recetas)
      setIngredientes(datos.ingredientes)
      setEtiquetas(datos.etiquetas)
      localStorage.setItem(CACHE, JSON.stringify(datos))
    } catch (e) {
      console.warn('No se pudieron cargar los datos (¿sin conexión?)', e)
    } finally {
      setCargando(false)
    }
  }, [])

  // Carga inicial al iniciar sesión
  const uid = sesion?.user.id
  useEffect(() => {
    if (uid) recargar()
  }, [uid, recargar])

  // Tiempo real: cualquier cambio del hogar recarga (con un pequeño retardo para agrupar)
  const temporizador = useRef<number | undefined>(undefined)
  const hogarId = hogar?.id
  useEffect(() => {
    if (!hogarId) return
    const programar = () => {
      window.clearTimeout(temporizador.current)
      temporizador.current = window.setTimeout(recargar, 400)
    }
    const canal = supabase
      .channel(`hogar-${hogarId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ingredients' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_steps' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_tags' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, programar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredient_grupos' }, programar)
      .subscribe()
    const alVolver = () => document.visibilityState === 'visible' && recargar()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', recargar)
    return () => {
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', recargar)
    }
  }, [hogarId, recargar])

  const guardarReceta = useCallback(
    async (b: RecetaBorrador) => {
      const { ingredientes: lineas, pasos, etiquetas: tags, id, ...campos } = b
      const fila: Record<string, unknown> = { ...campos, titulo: campos.titulo.trim() || 'Receta sin título' }
      // peso_total_g llega con la migración 008: si no se usa, no se manda (así se puede guardar aunque falte la migración)
      if (fila.peso_total_g == null && !(id && recetasRef.current.find((r) => r.id === id)?.peso_total_g != null)) delete fila.peso_total_g
      // papel llega con la migración 010: un plato completo no hace falta mandarlo si la receta aún no lo tiene
      if ((fila.papel ?? 'completo') === 'completo' && !(id && recetasRef.current.find((r) => r.id === id)?.papel)) delete fila.papel
      const resp = id ? await supabase.from('recipes').update(fila).eq('id', id).select('id').single() : await supabase.from('recipes').insert(fila).select('id').single()
      if (resp.error && /peso_total_g/.test(resp.error.message)) throw new Error('Falta ejecutar la migración 008 en Supabase para guardar el peso de la receta terminada (mira la guía).')
      if (resp.error && /papel/.test(resp.error.message)) throw new Error('Falta ejecutar la migración 010 en Supabase para guardar si es plato completo, principal o guarnición (mira la guía).')
      const guardada = chk(resp)
      const rid = (guardada as any).id as string

      // Hijos: se reemplazan enteros (son pocos)
      chk(await supabase.from('recipe_ingredients').delete().eq('recipe_id', rid))
      chk(await supabase.from('recipe_steps').delete().eq('recipe_id', rid))
      chk(await supabase.from('recipe_tags').delete().eq('recipe_id', rid))
      if (lineas.length)
        chk(
          await supabase.from('recipe_ingredients').insert(
            lineas.map((l, i) => ({
              recipe_id: rid,
              orden: i,
              ingredient_id: l.sub_recipe_id ? null : l.ingredient_id,
              sub_recipe_id: l.sub_recipe_id === rid ? null : l.sub_recipe_id,
              cantidad: l.cantidad,
              unidad: l.sub_recipe_id ? (esUnidadBase(l.unidad) ? l.unidad : 'racion') : l.unidad,
              texto_original: l.texto_original,
            })),
          ),
        )
      const pasosLimpios = pasos.map((p) => p.trim()).filter(Boolean)
      if (pasosLimpios.length)
        chk(await supabase.from('recipe_steps').insert(pasosLimpios.map((texto, orden) => ({ recipe_id: rid, orden, texto }))))
      const nombres = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
      if (nombres.length) {
        chk(await supabase.from('tags').upsert(nombres.map((nombre) => ({ nombre })), { onConflict: 'household_id,nombre', ignoreDuplicates: true }))
        const ids = chk(await supabase.from('tags').select('id').in('nombre', nombres)) as { id: string }[]
        chk(await supabase.from('recipe_tags').insert(ids.map((t) => ({ recipe_id: rid, tag_id: t.id }))))
      }
      await recargar()
      return rid
    },
    [recargar],
  )

  const borrarReceta = useCallback(
    async (id: string) => {
      chk(await supabase.from('recipes').delete().eq('id', id))
      setRecetas((rs) => rs.filter((r) => r.id !== id))
      await recargar()
    },
    [recargar],
  )

  const actualizarReceta = useCallback(async (id: string, cambios: Partial<Pick<Receta, 'favorita' | 'valoracion' | 'papel'>>) => {
    const antes = recetasRef.current.find((r) => r.id === id)
    setRecetas((rs) => rs.map((r) => (r.id === id ? { ...r, ...cambios } : r)))
    const r = await supabase.from('recipes').update(cambios).eq('id', id)
    if (r.error) {
      if (antes) setRecetas((rs) => rs.map((x) => (x.id === id ? antes : x)))
      throw new Error(/papel/.test(r.error.message) ? 'Falta ejecutar la migración 010 en Supabase (plato completo, principal o guarnición). Mira la guía.' : r.error.message)
    }
  }, [])

  const guardarIngrediente = useCallback(
    async (i: Partial<Ingrediente> & { nombre: string }) => {
      // el grupo del plato se guarda aparte (guardarGrupoPlato)
      const { id, grupo_plato: _g, ...campos } = i
      const fila = { ...campos, household_id: hogarId }
      const resp = id
        ? await supabase.from('ingredients').update(fila).eq('id', id).select('*').single()
        : await supabase.from('ingredients').insert(fila).select('*').single()
      if (resp.error?.code === '23505') throw new Error(`Ya existe un ingrediente llamado «${i.nombre}» (o ese mismo producto)`)
      const r = chk(resp)
      await recargar()
      return aIngrediente(r)
    },
    [hogarId, recargar],
  )

  const borrarIngrediente = useCallback(
    async (id: string) => {
      chk(await supabase.from('ingredients').delete().eq('id', id))
      await recargar()
    },
    [recargar],
  )

  const guardarGrupoPlato = useCallback(
    async (ingredientId: string, grupo: GrupoPlato | null) => {
      setIngredientes((is) => is.map((i) => (i.id === ingredientId ? { ...i, grupo_plato: grupo } : i)))
      const r = grupo
        ? await supabase.from('ingredient_grupos').upsert({ household_id: hogarId, ingredient_id: ingredientId, grupo })
        : await supabase.from('ingredient_grupos').delete().eq('ingredient_id', ingredientId)
      if (r.error && /ingredient_grupos/.test(r.error.message)) {
        await recargar()
        throw new Error('Falta ejecutar la migración 009 en Supabase para guardar el grupo (mira la guía).')
      }
      chk(r)
      await recargar()
    },
    [hogarId, recargar],
  )

  const guardarPerfil = useCallback(
    async (cambios: Partial<Pick<Perfil, 'nombre' | 'peso_kg' | 'factor_racion' | 'kcal_objetivo'>>) => {
      if (!uid) return
      const r = await supabase.from('profiles').update(cambios).eq('id', uid)
      if (r.error && /kcal_objetivo/.test(r.error.message)) throw new Error('Falta ejecutar la migración 008 en Supabase para guardar el objetivo de kcal (mira la guía).')
      chk(r)
      await recargar()
    },
    [uid, recargar],
  )

  const renombrarHogar = useCallback(
    async (nombre: string) => {
      if (!hogarId) return
      chk(await supabase.from('households').update({ nombre }).eq('id', hogarId))
      await recargar()
    },
    [hogarId, recargar],
  )

  const mapaRecetas = useMemo(() => new Map(recetas.map((r) => [r.id, r])), [recetas])
  const mapaIngredientes = useMemo(() => new Map(ingredientes.map((i) => [i.id, i])), [ingredientes])

  const valor: Datos = {
    cargando,
    sesion,
    perfil,
    hogar,
    miembros,
    recetas,
    ingredientes,
    etiquetas,
    mapaRecetas,
    mapaIngredientes,
    enLinea,
    recargar,
    guardarReceta,
    borrarReceta,
    actualizarReceta,
    guardarIngrediente,
    borrarIngrediente,
    guardarGrupoPlato,
    guardarPerfil,
    renombrarHogar,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
