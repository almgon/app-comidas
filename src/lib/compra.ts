// Lista de la compra a partir del menú: desayunos + platos frescos + sesión del domingo − congelador − despensa
import { normalizar } from '../../shared/parser.js'
import type { ItemBatch } from './batch'
import { aUnidadBase, cantidadCompra, enEnvases, fmtBase } from './cantidades'
import { racionesDeBase } from './nutricion'
import type { Comensal, EntradaPlan, Envase, Ingrediente, Receta } from './tipos'

/** Orden de los pasillos (más o menos el recorrido de Mercadona) */
export const PASILLOS = [
  'Fruta', 'Verdura', 'Panadería', 'Carne', 'Charcutería', 'Pescado', 'Huevos', 'Lácteos', 'Refrigerados',
  'Desayuno', 'Pasta y arroz', 'Legumbres', 'Conservas', 'Frutos secos', 'Despensa', 'Congelados', 'Bebidas', 'Otros',
]
export const ordenPasillo = (c: string) => {
  const i = PASILLOS.indexOf(c)
  return i < 0 ? PASILLOS.length : i
}

export const RACIONES_FRUTA_DIA = 3

export interface Necesidad {
  /** clave estable para conservar lo marcado al regenerar */
  clave: string
  ingredient_id: string | null
  texto: string
  categoria: string
  cantidad: number | null
  unidad: string | null
  detalle: string | null
  origen: string
  es_despensa: boolean
}

interface Acumulado {
  ing: Ingrediente | null
  texto: string
  cantidad: number
  sinCantidad: boolean
  origenes: Set<string>
}

export interface DatosCompra {
  lunes: string
  entradas: EntradaPlan[]
  recetas: Map<string, Receta>
  ingredientes: Map<string, Ingrediente>
  batch: ItemBatch[]
  comensales: Comensal[]
  envases: Map<string, Envase>
  /** incluir fruta de temporada (3 raciones/día por persona) */
  fruta?: boolean
}

export function calcularCompra(d: DatosCompra): Necesidad[] {
  const acc = new Map<string, Acumulado>()
  const enBatch = new Set(d.batch.map((b) => b.receta.id))

  const sumar = (ing: Ingrediente | null, texto: string, cantidad: number | null, origen: string) => {
    const clave = ing ? `i:${ing.id}` : `t:${normalizar(texto)}`
    const a = acc.get(clave) ?? { ing, texto: ing?.nombre ?? texto, cantidad: 0, sinCantidad: false, origenes: new Set<string>() }
    if (cantidad == null) a.sinCantidad = true
    else a.cantidad += cantidad
    a.origenes.add(origen)
    acc.set(clave, a)
  }

  // Ingredientes de una receta para N raciones. Las bases que se cocinan el domingo no se cuentan aquí.
  const expandir = (r: Receta, raciones: number, origen: string, visitadas: Set<string>) => {
    if (visitadas.has(r.id)) return
    const mult = raciones / (r.raciones || 1)
    for (const l of r.ingredientes) {
      if (l.sub_recipe_id) {
        const sub = d.recetas.get(l.sub_recipe_id)
        if (!sub || enBatch.has(sub.id)) continue
        expandir(sub, (racionesDeBase(l, sub, d.ingredientes, d.recetas) ?? 1) * mult, origen, new Set([...visitadas, r.id]))
        continue
      }
      const ing = l.ingredient_id ? d.ingredientes.get(l.ingredient_id) ?? null : null
      if (!ing) {
        if (l.texto_original.trim()) sumar(null, l.texto_original.trim(), null, origen)
        continue
      }
      const q = aUnidadBase(l.cantidad, l.unidad, ing)
      sumar(ing, ing.nombre, q == null ? null : q * mult, origen)
    }
  }

  // Alimentos sueltos añadidos a un desayuno, comida o cena
  for (const e of d.entradas) {
    if (e.origen === 'libre') continue
    for (const x of e.extras ?? []) {
      const ing = d.ingredientes.get(x.ingredient_id)
      if (ing) sumar(ing, ing.nombre, x.cantidad, e.momento === 'desayuno' ? 'Desayunos' : 'Añadido al menú')
    }
  }

  // Platos que se cocinan ese mismo día
  for (const e of d.entradas) {
    if (e.origen !== 'fresco' || !e.recipe_id) continue
    const r = d.recetas.get(e.recipe_id)
    if (r) expandir(r, e.raciones, r.titulo, new Set())
  }
  // Sesión del domingo (platos y bases, con lo que va al congelador)
  for (const b of d.batch) {
    if (b.cocinar > 0) expandir(b.receta, b.cocinar, `${b.receta.titulo} (domingo)`, new Set())
  }

  const res: Necesidad[] = []
  for (const [clave, a] of acc) {
    const origen = [...a.origenes].join(', ')
    if (!a.ing) {
      res.push({ clave, ingredient_id: null, texto: a.texto, categoria: 'Otros', cantidad: null, unidad: null, detalle: null, origen, es_despensa: false })
      continue
    }
    const u = a.ing.unidad_base
    const tiene = a.cantidad > 0
    const env = d.envases.get(a.ing.id) ?? (a.ing.envase_cantidad ? { cantidad: Number(a.ing.envase_cantidad), nombre: a.ing.envase_nombre ?? 'envase' } : null)
    const envs = tiene ? enEnvases(a.cantidad, u, env) : null
    const detalle = [envs?.texto, a.sinCantidad ? (tiene ? '+ algo más «al gusto»' : 'al gusto') : null].filter(Boolean).join(' · ') || null
    res.push({
      clave,
      ingredient_id: a.ing.id,
      texto: a.ing.nombre,
      categoria: a.ing.categoria || 'Otros',
      cantidad: tiene ? cantidadCompra(a.cantidad, u) : null,
      unidad: tiene ? u : null,
      detalle,
      origen,
      es_despensa: a.ing.es_despensa,
    })
  }

  if (d.fruta !== false && d.comensales.length) {
    const piezas = RACIONES_FRUTA_DIA * 7 * d.comensales.length
    res.push({
      clave: 'fruta-temporada', ingredient_id: null, texto: 'Fruta de temporada', categoria: 'Fruta', cantidad: piezas, unidad: 'ud',
      detalle: `${RACIONES_FRUTA_DIA} piezas al día por persona`, origen: 'Recomendación AESAN', es_despensa: false,
    })
  }

  return res.sort((a, b) => ordenPasillo(a.categoria) - ordenPasillo(b.categoria) || a.texto.localeCompare(b.texto, 'es'))
}

export const textoCantidad = (cantidad: number | null, unidad: string | null) =>
  cantidad == null ? '' : unidad === 'g' || unidad === 'ml' || unidad === 'ud' ? fmtBase(cantidad, unidad) : `${cantidad} ${unidad ?? ''}`.trim()

/** Clave de un artículo ya guardado (para conservar lo marcado como comprado al regenerar) */
export const claveArticulo = (a: { ingredient_id: string | null; texto: string }) =>
  a.ingredient_id ? `i:${a.ingredient_id}` : a.texto === 'Fruta de temporada' ? 'fruta-temporada' : `t:${normalizar(a.texto)}`
