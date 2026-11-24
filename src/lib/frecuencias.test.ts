import { describe, expect, it } from 'vitest'
import { FRECUENCIAS_POR_DEFECTO, contarTipos, desajusteFrecuencias, evaluarFrecuencias, frecuenciasDe, tipoIngrediente, tipoReceta, CONTEO_CERO } from './frecuencias'
import type { Ingrediente, LineaIngrediente, Receta } from './tipos'

const ing = (id: string, nombre: string, categoria: string, extra: Partial<Ingrediente> = {}): Ingrediente => ({
  id, household_id: null, nombre, categoria, unidad_base: 'g', peso_unidad_g: null, kcal_100: 100, proteina_100: 10, hidratos_100: 10, grasa_100: 2, es_despensa: false, ...extra,
})
const linea = (ingredient_id: string, cantidad: number | null, unidad: string | null = 'g'): LineaIngrediente => ({ orden: 0, ingredient_id, sub_recipe_id: null, cantidad, unidad, texto_original: ingredient_id })
let n = 0
const receta = (ingredientes: LineaIngrediente[], raciones = 2): Receta => ({
  id: `f${++n}`, household_id: 'h', titulo: 'x', foto_url: null, raciones, t_prep_min: 10, t_coccion_min: 10, tipo_comida: 'ambas', es_base: false,
  congelable: false, dias_nevera: 3, valoracion: null, favorita: false, proteina_racion_manual: null, fuente_url: null, fuente_tipo: 'manual', notas: null,
  creado_en: '', actualizado_en: '', ingredientes, pasos: [], etiquetas: [],
})

describe('tipo de alimento de cada ingrediente', () => {
  it('lo deduce del nombre y la sección', () => {
    const t = (nombre: string, cat: string) => tipoIngrediente({ nombre, categoria: cat })
    expect(t('Lentejas secas', 'Legumbres')).toBe('legumbre')
    expect(t('Garbanzos cocidos (bote)', 'Legumbres')).toBe('legumbre')
    expect(t('Tofu', 'Legumbres')).toBe('vegetal')
    expect(t('Salmón', 'Pescado')).toBe('pescado_azul')
    expect(t('Atún en lata al natural', 'Conservas')).toBe('pescado_azul')
    expect(t('Merluza', 'Pescado')).toBe('pescado_blanco')
    expect(t('Gambas', 'Pescado')).toBe('pescado_blanco')
    expect(t('Pechuga de pollo', 'Carne')).toBe('carne_blanca')
    expect(t('Pavo (pechuga)', 'Carne')).toBe('carne_blanca')
    expect(t('Lomo de cerdo', 'Carne')).toBe('carne_roja')
    expect(t('Carne picada mixta (cerdo y ternera)', 'Carne')).toBe('carne_roja')
    expect(t('Chorizo', 'Charcutería')).toBe('carne_roja')
    expect(t('Huevo', 'Huevos')).toBe('huevo')
    expect(t('Caldo de pollo', 'Conservas')).toBeNull()
    expect(t('Tomate corazón de buey', 'Verdura')).toBeNull()
    expect(t('Fideos al huevo', 'Pasta y arroz')).toBeNull()
    expect(t('Yogur natural', 'Lácteos')).toBeNull()
  })
})

describe('tipo de cada receta', () => {
  const cat = [
    ing('lentejas', 'Lentejas secas', 'Legumbres'),
    ing('chorizo', 'Chorizo', 'Charcutería'),
    ing('jamon', 'Jamón serrano', 'Charcutería'),
    ing('pollo', 'Pechuga de pollo', 'Carne'),
    ing('cebolla', 'Cebolla', 'Verdura'),
    ing('pasta', 'Macarrones', 'Pasta y arroz'),
    ing('tomate', 'Tomate triturado', 'Conservas'),
  ]
  const mapa = new Map(cat.map((i) => [i.id, i]))
  it('es el que más pesa; un poco de jamón no cuenta', () => {
    expect(tipoReceta(receta([linea('lentejas', 160), linea('chorizo', 100), linea('cebolla', 100)]), mapa, new Map())).toBe('legumbre')
    expect(tipoReceta(receta([linea('pasta', 160), linea('tomate', 300), linea('jamon', 40)]), mapa, new Map())).toBeNull() // 20 g por ración
    expect(tipoReceta(receta([linea('pasta', 160), linea('tomate', 300)]), mapa, new Map())).toBeNull()
  })
  it('la proteína sin peso cuenta 150 g por ración', () => {
    expect(tipoReceta(receta([linea('pollo', null, null), linea('cebolla', 100)]), mapa, new Map())).toBe('carne_blanca')
  })
})

describe('veces por semana', () => {
  it('usa las de Ajustes y, si faltan, las de por defecto', () => {
    expect(frecuenciasDe(null)).toEqual(FRECUENCIAS_POR_DEFECTO)
    const f = frecuenciasDe({ frecuencias: { legumbre: 2, huevo: null } })
    expect(f.legumbre).toBe(2)
    expect(f.huevo).toBeNull()
    expect(f.pescado_azul).toBe(FRECUENCIAS_POR_DEFECTO.pescado_azul)
  })

  it('cuenta una vez por comida o cena (no el desayuno) y evalúa', () => {
    const tipos = new Map([['a', 'carne_blanca' as const], ['b', null], ['c', 'huevo' as const]])
    const c = contarTipos(
      [
        { fecha: '1', momento: 'comida', recipe_id: 'a', origen: 'fresco' },
        { fecha: '1', momento: 'comida', recipe_id: 'b', origen: 'fresco' },
        { fecha: '1', momento: 'cena', recipe_id: 'a', origen: 'fresco' },
        { fecha: '1', momento: 'desayuno', recipe_id: 'c', origen: 'fresco' },
      ],
      tipos,
    )
    expect(c.carne_blanca).toBe(2)
    expect(c.huevo).toBe(0)
    const f = { ...FRECUENCIAS_POR_DEFECTO, huevo: null }
    const ev = evaluarFrecuencias({ ...CONTEO_CERO(), legumbre: 4, carne_blanca: 5 }, f)
    expect(ev.find((x) => x.tipo === 'legumbre')!.estado).toBe('verde')
    expect(ev.find((x) => x.tipo === 'carne_blanca')!.estado).toBe('rojo')
    expect(ev.some((x) => x.tipo === 'huevo')).toBe(false) // «da igual»
    expect(desajusteFrecuencias({ ...CONTEO_CERO(), legumbre: 4, pescado_blanco: 2, pescado_azul: 1, carne_blanca: 3, carne_roja: 1, huevo: 2 }, FRECUENCIAS_POR_DEFECTO)).toBe(0)
  })
})
