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
