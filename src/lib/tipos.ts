export type TipoComida = 'comida' | 'cena' | 'ambas' | 'desayuno'
export type GrupoProteico = 'legumbre' | 'pescado_blanco' | 'pescado_azul' | 'carne_blanca' | 'carne_roja' | 'huevo' | 'vegetal'
export type FuenteTipo = 'web' | 'instagram' | 'tiktok' | 'texto' | 'manual'

export const TIPOS_COMIDA: { valor: TipoComida; etiqueta: string }[] = [
  { valor: 'ambas', etiqueta: 'Comida o cena' },
  { valor: 'comida', etiqueta: 'Comida' },
  { valor: 'cena', etiqueta: 'Cena' },
  { valor: 'desayuno', etiqueta: 'Desayuno' },
]

export const GRUPOS_PROTEICOS: { valor: GrupoProteico; etiqueta: string; emoji: string }[] = [
  { valor: 'legumbre', etiqueta: 'Legumbre', emoji: '🫘' },
  { valor: 'pescado_blanco', etiqueta: 'Pescado blanco', emoji: '🐟' },
  { valor: 'pescado_azul', etiqueta: 'Pescado azul', emoji: '🐠' },
  { valor: 'carne_blanca', etiqueta: 'Carne blanca', emoji: '🍗' },
  { valor: 'carne_roja', etiqueta: 'Carne roja', emoji: '🥩' },
  { valor: 'huevo', etiqueta: 'Huevo', emoji: '🥚' },
  { valor: 'vegetal', etiqueta: 'Vegetal', emoji: '🥦' },
]

export const etiquetaGrupo = (g: GrupoProteico | null | undefined) => GRUPOS_PROTEICOS.find((x) => x.valor === g)
export const etiquetaTipo = (t: TipoComida) => TIPOS_COMIDA.find((x) => x.valor === t)?.etiqueta ?? t

export interface Hogar {
  id: string
  nombre: string
  codigo_invitacion: string
  desayunos_iniciados?: boolean
  umbral_ahorro?: number
}

export interface Perfil {
  id: string
  household_id: string | null
  nombre: string
  peso_kg: number | null
  factor_racion: number
}

export interface Ingrediente {
  id: string
  household_id: string | null
  nombre: string
  categoria: string
  unidad_base: 'g' | 'ml' | 'ud'
  peso_unidad_g: number | null
  kcal_100: number | null
  proteina_100: number | null
  hidratos_100: number | null
  grasa_100: number | null
  es_despensa: boolean
  codigo_off?: string | null
  envase_cantidad?: number | null
  envase_nombre?: string | null
}

export interface LineaIngrediente {
  id?: string
  orden: number
  ingredient_id: string | null
  sub_recipe_id: string | null
  cantidad: number | null
  unidad: string | null
  /** Nombre tal y como se muestra en la receta */
  texto_original: string
}

export interface Receta {
  id: string
  household_id: string
  titulo: string
  foto_url: string | null
  raciones: number
  t_prep_min: number | null
  t_coccion_min: number | null
  tipo_comida: TipoComida
  grupo_proteico: GrupoProteico | null
  es_base: boolean
  congelable: boolean
  dias_nevera: number | null
  valoracion: number | null
  favorita: boolean
  proteina_racion_manual: number | null
  fuente_url: string | null
  fuente_tipo: FuenteTipo
  notas: string | null
  creado_en: string
  actualizado_en: string
  ingredientes: LineaIngrediente[]
  pasos: string[]
  etiquetas: string[]
}

export type RecetaBorrador = Omit<Receta, 'id' | 'household_id' | 'creado_en' | 'actualizado_en'> & { id?: string }

export const tiempoTotal = (r: Pick<Receta, 't_prep_min' | 't_coccion_min'>) =>
  (r.t_prep_min ?? 0) + (r.t_coccion_min ?? 0) || null

/** Apta para cena entre semana: tiempo total ≤ 30 min */
export const aptaCenaRapida = (r: Pick<Receta, 't_prep_min' | 't_coccion_min'>) => {
  const t = tiempoTotal(r)
  return t != null && t <= 30
}

// =========================================================
// Fase 2: menú, desayunos, congelador y compra
// =========================================================
export type Momento = 'comida' | 'cena'
export type Origen = 'fresco' | 'batch' | 'congelador' | 'libre'

export const ORIGENES: Record<Origen, { etiqueta: string; emoji: string }> = {
  fresco: { etiqueta: 'Se cocina ese día', emoji: '🔥' },
  batch: { etiqueta: 'Cocinado el domingo', emoji: '🍲' },
  congelador: { etiqueta: 'Del congelador', emoji: '❄️' },
  libre: { etiqueta: 'Hueco libre (fuera de casa)', emoji: '🚶' },
}

export interface EntradaPlan {
  id?: string
  fecha: string
  momento: Momento
  recipe_id: string | null
  raciones: number
  origen: Origen
  freezer_item_id: string | null
  fijado: boolean
  nota: string | null
}

export interface EstadoBatch {
  /** Raciones de más para congelar (para semanas siguientes). Si no está, se usa la sugerencia. */
  extra?: number
  hecho?: boolean
}

export interface PlanSemana {
  id: string
  semana_inicio: string
  batch: Record<string, EstadoBatch>
  batch_cerrado_en: string | null
}

export interface Congelado {
  id: string
  recipe_id: string | null
  nombre: string
  raciones: number
  congelado_en: string
  nota: string | null
}

export interface LineaDesayuno {
  id: string
  dias: 'lv' | 'fd'
  ingredient_id: string
  unidad: string
  /** cantidad por id de perfil */
  cantidades: Record<string, number>
  orden: number
}

export interface Envase {
  cantidad: number
  nombre: string
}

export interface ArticuloCompra {
  id: string
  list_id: string
  ingredient_id: string | null
  texto: string
  categoria: string
  cantidad: number | null
  unidad: string | null
  detalle: string | null
  origen: string | null
  es_despensa: boolean
  manual: boolean
  comprado: boolean
  comprado_por: string | null
  comprado_en: string | null
}

export interface ListaCompra {
  id: string
  plan_id: string
  generada_en: string
  umbral_ahorro: number
}

/** Miembro del hogar con su objetivo de proteína */
export interface Comensal {
  id: string
  nombre: string
  factor: number
  protMin: number
  protMax: number
}

export function comensalesDe(miembros: Perfil[]): Comensal[] {
  return miembros.map((m) => {
    const peso = m.peso_kg ? Number(m.peso_kg) : 70 * (Number(m.factor_racion) || 1)
    return { id: m.id, nombre: m.nombre, factor: Number(m.factor_racion) || 1, protMin: Math.round(peso * 1.2), protMax: Math.round(peso * 1.6) }
  })
}

export const racionesHogar = (c: Comensal[]) => (c.length ? Math.round(c.reduce((s, x) => s + x.factor, 0) * 100) / 100 : 2)

// =========================================================
// Precios
// =========================================================
export type Tienda = 'mercadona' | 'dia'
export const TIENDAS: { valor: Tienda; nombre: string; color: string }[] = [
  { valor: 'mercadona', nombre: 'Mercadona', color: '#0b7a3e' },
  { valor: 'dia', nombre: 'Dia', color: '#d71920' },
]

export interface ProductoTienda {
  id: string
  household_id: string | null
  tienda: Tienda
  id_externo: string
  nombre: string
  categoria: string | null
  envase_cantidad: number | null
  envase_unidad: 'g' | 'ml' | 'ud'
  envase_texto: string | null
  precio: number | null
  precio_referencia: number | null
  formato_referencia: string | null
  url: string | null
  foto_url: string | null
  origen: 'auto' | 'manual'
  actualizado_en: string
}
