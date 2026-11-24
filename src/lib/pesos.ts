// Pesos aproximados para hacer cuentas cuando la receta no da los gramos:
// - verdura y fruta: lo que pesa una pieza de tamaño mediano («2 cebollas», «1 calabacín»)
// - proteína (carne, pescado, tofu…): 150 g por ración si no se indica el peso
import { normalizar } from '../../shared/parser.js'
import type { Ingrediente } from './tipos'

/** Gramos de proteína por ración cuando la receta no dice cuánto */
export const PROTEINA_POR_RACION_G = 150

/**
 * Gramos de una pieza mediana (tal y como se compra). Lo más concreto va antes («tomate cherry» antes que «tomate»).
 * El nombre del ingrediente tiene que contener la palabra entera (vale el plural: «patatas»).
 */
const PIEZAS: [string, number][] = [
  // Verdura
  ['tomate cherry', 15], ['tomate pera', 100], ['tomate rama', 120], ['tomate', 150],
  ['cebolla morada', 150], ['cebolleta', 80], ['chalota', 30], ['cebolla', 150],
  ['diente de ajo', 5], ['cabeza de ajo', 50], ['ajo', 5],
  ['pimiento italiano', 120], ['pimiento verde', 150], ['pimiento rojo', 200], ['pimiento amarillo', 200], ['pimiento', 170],
  ['patata', 200], ['boniato', 300], ['zanahoria', 80], ['calabacin', 300], ['berenjena', 300], ['pepino', 300],
  ['puerro', 150], ['brocoli', 400], ['coliflor', 800], ['calabaza', 1000], ['alcachofa', 120],
  ['esparrago', 20], ['champiñon', 20], ['seta', 30], ['apio', 40], ['hinojo', 250], ['nabo', 150], ['rabano', 15],
  ['remolacha', 150], ['col de bruselas', 15], ['coles de bruselas', 15], ['col', 1000], ['repollo', 1000], ['lombarda', 1000],
  ['lechuga', 400], ['cogollo', 100], ['escarola', 400], ['endibia', 100], ['maiz en mazorca', 200], ['mazorca', 200],
  ['jengibre', 20],
  // Fruta
  ['aguacate', 200], ['limon', 100], ['lima', 60], ['platano', 120], ['manzana', 180], ['pera', 180], ['naranja', 200],
  ['mandarina', 80], ['pomelo', 300], ['kiwi', 80], ['melocoton', 150], ['nectarina', 150], ['paraguayo', 120],
  ['albaricoque', 40], ['ciruela', 60], ['higo', 50], ['granada', 250], ['caqui', 200], ['mango', 300],
  ['papaya', 500], ['piña', 1500], ['melon', 1500], ['sandia', 4000], ['fresa', 15], ['freson', 25],
]

/** Productos elaborados que no se cuentan por piezas aunque lleven el nombre de una verdura */
const ELABORADO = /\b(triturad|frit|tamizad|concentrad|polvo|sec[oa]s?\b|deshidratad|congelad|zumo|mermelada|salsa|crema|pure|en lata|conserva|almibar|pasas?\b|orejon|confitad|encurtid|chips|piquill)/

const SECCIONES_PIEZA = new Set(['verdura', 'fruta', 'otros', ''])

const plural = (p: string) => `(?:^| )${p.split(' ').map((w) => `${w}(?:s|es)?`).join(' ')}(?: |$)`
const PATRONES: [RegExp, number][] = PIEZAS.map(([p, g]) => [new RegExp(plural(normalizar(p))), g])

/** Peso aproximado de una pieza mediana de una verdura o fruta (o null si no es una pieza que se cuente) */
export function pesoPiezaAprox(nombre: string, categoria?: string | null): number | null {
  const n = normalizar(nombre)
  if (!n || ELABORADO.test(n)) return null
  // solo verdura y fruta («yogur de fresa» no es una fresa)
  if (!SECCIONES_PIEZA.has(normalizar(categoria ?? ''))) return null
  for (const [re, g] of PATRONES) if (re.test(n)) return g
  return null
}

const PROTEINA_NOMBRE = /(?:^| )(tofu|tempeh|seitan|heura|soja texturizada)/
const CATEGORIA_PROTEINA = new Set(['carne', 'pescado'])

/** ¿Es la proteína del plato (carne, pescado, tofu…)? A esta se le suponen 150 g por ración si no se dice el peso */
export function esProteinaPlato(ing: Pick<Ingrediente, 'nombre' | 'categoria'>): boolean {
  return CATEGORIA_PROTEINA.has(normalizar(ing.categoria ?? '')) || PROTEINA_NOMBRE.test(normalizar(ing.nombre))
}
