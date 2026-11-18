import { describe, it, expect } from 'vitest'
import { parsearIngrediente, duracionAMinutos, parsearTextoReceta, recetaDesdeHtml, tipoDeUrl } from './parser.js'

describe('parsearIngrediente', () => {
  it.each([
    ['200 g de harina', 200, 'g', 'Harina'],
    ['200g harina de trigo', 200, 'g', 'Harina de trigo'],
    ['1/2 cebolla', 0.5, 'ud', 'Cebolla'],
    ['1 1/2 tazas de leche', 1.5, 'taza', 'Leche'],
    ['2 cucharadas de aceite de oliva', 2, 'cda', 'Aceite de oliva'],
    ['3 dientes de ajo', 3, 'diente', 'Ajo'],
    ['Una pizca de sal', 1, 'pellizco', 'Sal'],
    ['- 1,5 kg de patatas', 1.5, 'kg', 'Patatas'],
    ['½ l de caldo', 0.5, 'l', 'Caldo'],
    ['2 huevos', 2, 'ud', 'Huevos'],
    ['media docena de huevos', 6, 'ud', 'Huevos'],
    ['Sal y pimienta al gusto', null, null, 'Sal y pimienta al gusto'],
  ])('%s', (linea, cant, uni, nombre) => {
    const r = parsearIngrediente(linea)
    expect(r.cantidad).toBe(cant)
    expect(r.unidad).toBe(uni)
    expect(r.nombre).toBe(nombre)
  })
})

describe('duracionAMinutos', () => {
  it('ISO 8601', () => {
    expect(duracionAMinutos('PT1H30M')).toBe(90)
    expect(duracionAMinutos('PT20M')).toBe(20)
    expect(duracionAMinutos('P0DT0H45M')).toBe(45)
  })
  it('texto', () => {
    expect(duracionAMinutos('45 min')).toBe(45)
    expect(duracionAMinutos('1 hora 15 minutos')).toBe(75)
  })
})

describe('parsearTextoReceta', () => {
  it('descripción con secciones', () => {
    const t = `Lentejas exprés 🍲 para 4 personas
Ingredientes:
- 400 g de lentejas cocidas
- 1 cebolla
- 2 zanahorias
- 1 cdta de pimentón
Preparación:
1. Sofríe la cebolla y la zanahoria picadas.
2. Añade el pimentón y las lentejas y cuece 10 minutos.
#lentejas #recetasfaciles #batchcooking`
    const r = parsearTextoReceta(t)
    expect(r.titulo).toBe('Lentejas exprés para 4 personas')
    expect(r.raciones).toBe(4)
    expect(r.ingredientes).toHaveLength(4)
    expect(r.ingredientes[0]).toMatchObject({ cantidad: 400, unidad: 'g', nombre: 'Lentejas cocidas' })
    expect(r.pasos).toHaveLength(2)
    expect(r.pasos[0]).toBe('Sofríe la cebolla y la zanahoria picadas.')
    expect(r.etiquetas).toContain('batchcooking')
  })
  it('texto sin cabeceras', () => {
    const r = parsearTextoReceta(`Tortilla de patatas
4 huevos
500 g de patatas
1 cebolla
Pela y corta las patatas y la cebolla y fríelas a fuego lento durante 20 minutos.
Bate los huevos, mezcla y cuaja la tortilla por ambos lados.`)
    expect(r.titulo).toBe('Tortilla de patatas')
    expect(r.ingredientes).toHaveLength(3)
    expect(r.pasos).toHaveLength(2)
  })
})

describe('recetaDesdeHtml', () => {
  it('lee schema.org/Recipe dentro de @graph', () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Pollo al curry","image":["https://x.com/a.jpg"],"recipeYield":"4 raciones","prepTime":"PT15M","cookTime":"PT25M","recipeIngredient":["600 g de pechuga de pollo","1 cebolla","200 ml de leche de coco"],"recipeInstructions":[{"@type":"HowToStep","text":"Corta el pollo."},{"@type":"HowToStep","text":"Cocina con el curry."}],"recipeCategory":"Plato principal","keywords":"pollo, curry"}]}</script></head></html>`
    const r = recetaDesdeHtml(html, 'https://x.com/r')!
    expect(r.estructurada).toBe(true)
    expect(r.titulo).toBe('Pollo al curry')
    expect(r.raciones).toBe(4)
    expect(r.t_prep_min).toBe(15)
    expect(r.t_coccion_min).toBe(25)
    expect(r.ingredientes).toHaveLength(3)
    expect(r.pasos).toEqual(['Corta el pollo.', 'Cocina con el curry.'])
    expect(r.foto_url).toBe('https://x.com/a.jpg')
    expect(r.etiquetas).toContain('curry')
  })
  it('sin JSON-LD usa og:description', () => {
    const html = `<meta property="og:title" content="Ensalada"><meta property="og:description" content="Ingredientes: 1 lechuga, 2 tomates&#10;Preparación: Mezcla todo.">`
    const r = recetaDesdeHtml(html, null)!
    expect(r.titulo).toBe('Ensalada')
    expect(r.ingredientes).toHaveLength(2)
    expect(r.pasos).toEqual(['Mezcla todo.'])
  })
})

it('tipoDeUrl', () => {
  expect(tipoDeUrl('https://www.instagram.com/p/abc/')).toBe('instagram')
  expect(tipoDeUrl('https://vm.tiktok.com/xyz')).toBe('tiktok')
  expect(tipoDeUrl('https://www.directoalpaladar.com/x')).toBe('web')
})
