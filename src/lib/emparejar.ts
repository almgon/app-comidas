import { normalizar } from '../../shared/parser.js'
import type { Ingrediente, Receta } from './tipos'

const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'con', 'a', 'al', 'para', 'un', 'una',
  'fresco', 'fresca', 'frescos', 'frescas', 'picado', 'picada', 'picados', 'picadas', 'cortado', 'cortada',
  'troceado', 'troceada', 'grande', 'grandes', 'mediano', 'mediana', 'pequeno', 'pequena', 'gusto',
  'opcional', 'aprox', 'aproximadamente', 'bien', 'muy', 'maduro', 'madura', 'pelado', 'pelada', 'rallado',
  'cocido', 'cocida', 'entero', 'entera', 'tipo', 'cantidad', 'necesaria', 'unos', 'unas', 'g', 'kg',
])

function singular(p: string) {
  if (p.length > 4 && p.endsWith('es') && !p.endsWith('ces')) return p.slice(0, -2)
  if (p.length > 3 && p.endsWith('ces')) return p.slice(0, -3) + 'z'
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1)
  return p
}

export function tokens(s: string): string[] {
  return normalizar(s.replace(/\(.*?\)/g, ' '))
    .split(' ')
    .filter((p) => p && !VACIAS.has(p) && !/^\d/.test(p))
    .map(singular)
}

export type Candidato =
  | { tipo: 'ingrediente'; id: string; nombre: string; puntos: number }
  | { tipo: 'base'; id: string; nombre: string; puntos: number }

function puntuar(texto: string[], nombre: string[]): number {
  if (!texto.length || !nombre.length) return 0
  const setT = new Set(texto)
  const comunes = nombre.filter((t) => setT.has(t)).length
  if (!comunes) return 0
  // Prima que coincida la primera palabra del catálogo (normalmente la principal)
  const primera = setT.has(nombre[0]) ? 0.25 : 0
  return comunes / Math.max(nombre.length, 1) * 0.6 + comunes / Math.max(texto.length, 1) * 0.4 + primera
}

/** Sugerencias del catálogo y de las preparaciones base para un texto de ingrediente */
export function sugerencias(texto: string, ingredientes: Ingrediente[], bases: Receta[], max = 4): Candidato[] {
  const t = tokens(texto)
  const res: Candidato[] = []
  for (const i of ingredientes) {
    const p = puntuar(t, tokens(i.nombre))
    if (p > 0.3) res.push({ tipo: 'ingrediente', id: i.id, nombre: i.nombre, puntos: p })
  }
  for (const b of bases) {
    const p = puntuar(t, tokens(b.titulo))
    if (p > 0.3) res.push({ tipo: 'base', id: b.id, nombre: b.titulo, puntos: p + 0.05 })
  }
  return res.sort((a, b) => b.puntos - a.puntos).slice(0, max)
}

export function mejorSugerencia(texto: string, ingredientes: Ingrediente[], bases: Receta[]): Candidato | null {
  const s = sugerencias(texto, ingredientes, bases, 1)[0]
  return s && s.puntos >= 0.6 ? s : null
}
