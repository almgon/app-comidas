import { useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { normalizar, UNIDADES_DISPONIBLES, type RecetaImportada } from '../../shared/parser.js'
import { useDatos } from '../lib/datos'
import { mejorSugerencia, sugerencias } from '../lib/emparejar'
import { subirFoto } from '../lib/fotos'
import { UNIDADES_BASE, esUnidadBase, fmt, gramosDe, nutricionPorRacion, pesoReceta, proteinaSupuesta } from '../lib/nutricion'
import { PROTEINA_POR_RACION_G, esProteinaPlato } from '../lib/pesos'
import { useMenu } from '../lib/menu'
import { useUsarProducto } from '../lib/usarProducto'
import { euros } from '../lib/precios'
import SelectorProducto from '../components/SelectorProducto'
import NuevoIngrediente from '../components/NuevoIngrediente'
import {
  GRUPOS_PROTEICOS,
  PAPELES,
  TIPOS_COMIDA,
  etiquetaGrupo,
  type FuenteTipo,
  type GrupoProteico,
  type Ingrediente,
  type Papel,
  type Receta,
  type RecetaBorrador,
  type TipoComida,
} from '../lib/tipos'

interface Fila {
  key: string
  cantidad: string
  unidad: string
  nombre: string
  ingredient_id: string | null
  sub_recipe_id: string | null
}

interface Formulario {
  titulo: string
  foto_url: string | null
  raciones: string
  t_prep_min: string
  t_coccion_min: string
  tipo_comida: TipoComida
  grupo_proteico: GrupoProteico | ''
  es_base: boolean
  papel: Papel
  congelable: boolean
  dias_nevera: string
  valoracion: number | null
  favorita: boolean
  proteina_racion_manual: string
  peso_total_g: string
  fuente_url: string | null
  fuente_tipo: FuenteTipo
  notas: string
  etiquetas: string[]
  pasos: string
  filas: Fila[]
}

const clave = () => Math.random().toString(36).slice(2)
const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const numero = (s: string): number | null => {
  const v = parseFloat(s.replace(',', '.'))
  return isFinite(v) ? v : null
}
const entero = (s: string): number | null => {
  const v = numero(s)
  return v == null ? null : Math.round(v)
}

const VACIO: Formulario = {
  titulo: '',
  foto_url: null,
  raciones: '2',
  t_prep_min: '',
  t_coccion_min: '',
  tipo_comida: 'ambas',
  grupo_proteico: '',
  es_base: false,
  papel: 'completo',
  congelable: false,
  dias_nevera: '3',
  valoracion: null,
  favorita: false,
  proteina_racion_manual: '',
  peso_total_g: '',
  fuente_url: null,
  fuente_tipo: 'manual',
  notas: '',
  etiquetas: [],
  pasos: '',
  filas: [],
}

function desdeReceta(r: Receta): Formulario {
  return {
    titulo: r.titulo,
    foto_url: r.foto_url,
    raciones: str(r.raciones),
    t_prep_min: str(r.t_prep_min),
    t_coccion_min: str(r.t_coccion_min),
    tipo_comida: r.tipo_comida,
    grupo_proteico: r.grupo_proteico ?? '',
    es_base: r.es_base,
    papel: r.papel ?? 'completo',
    congelable: r.congelable,
    dias_nevera: str(r.dias_nevera),
    valoracion: r.valoracion,
    favorita: r.favorita,
    proteina_racion_manual: str(r.proteina_racion_manual),
    peso_total_g: str(r.peso_total_g),
    fuente_url: r.fuente_url,
    fuente_tipo: r.fuente_tipo,
    notas: r.notas ?? '',
    etiquetas: r.etiquetas,
    pasos: r.pasos.join('\n'),
    filas: r.ingredientes.map((l) => ({
      key: clave(),
      cantidad: str(l.cantidad),
      unidad: l.unidad ?? '',
      nombre: l.texto_original,
      ingredient_id: l.ingredient_id,
      sub_recipe_id: l.sub_recipe_id,
    })),
  }
}

function desdeImportada(r: RecetaImportada, ingredientes: Ingrediente[], bases: Receta[]): Formulario {
  return {
    ...VACIO,
    titulo: r.titulo,
    foto_url: r.foto_url,
    raciones: str(r.raciones ?? 2),
    t_prep_min: str(r.t_prep_min),
    t_coccion_min: str(r.t_coccion_min),
    fuente_url: r.fuente_url,
    fuente_tipo: r.fuente_tipo,
    notas: r.notas ?? '',
    etiquetas: r.etiquetas,
    pasos: r.pasos.join('\n'),
    filas: r.ingredientes.map((i) => {
      const s = mejorSugerencia(i.nombre, ingredientes, bases)
      return {
        key: clave(),
        cantidad: str(i.cantidad),
        unidad: s?.tipo === 'base' ? (esUnidadBase(i.unidad) ? i.unidad! : 'racion') : i.unidad ?? '',
        nombre: i.nombre,
        ingredient_id: s?.tipo === 'ingrediente' ? s.id : null,
        sub_recipe_id: s?.tipo === 'base' ? s.id : null,
      }
    }),
  }
}

// Palabras clave para sugerir el grupo proteico principal
const PISTAS_GRUPO: [GrupoProteico, RegExp][] = [
  ['pescado_azul', /salm[oó]n|at[uú]n|sardina|caballa|bonito|boquer[oó]n|anchoa|trucha|jurel|emperador|pez espada/],
  ['pescado_blanco', /merluza|bacalao|dorada|lubina|rape|gallo|lenguado|abadejo|panga|gamba|langostino|calamar|sepia|pulpo|mejill[oó]n|almeja|marisco|pescado/],
  ['carne_roja', /ternera|vacuno|buey|cerdo|lomo|solomillo de cerdo|cordero|chorizo|bacon|beicon|panceta|jam[oó]n|salchich|morcilla|costilla|picada/],
  ['carne_blanca', /pollo|pavo|conejo|pechuga|muslo|contramuslo/],
  ['legumbre', /lenteja|garbanzo|alubia|jud[ií]a blanca|jud[ií]a pinta|fabe|frijol|soja|tofu|tempeh|guisante|edamame|hummus/],
  ['huevo', /huevo|tortilla/],
]

function inferirGrupo(filas: Fila[], mapa: Map<string, Ingrediente>, recetas: Map<string, Receta>): GrupoProteico | null {
  const puntos = new Map<GrupoProteico, number>()
  for (const f of filas) {
    const sub = f.sub_recipe_id ? recetas.get(f.sub_recipe_id) : undefined
    if (sub?.grupo_proteico) {
      puntos.set(sub.grupo_proteico, (puntos.get(sub.grupo_proteico) ?? 0) + 50)
      continue
    }
    const ing = f.ingredient_id ? mapa.get(f.ingredient_id) : undefined
    const texto = normalizar(`${f.nombre} ${ing?.nombre ?? ''}`)
    const g = ing ? gramosDe({ cantidad: numero(f.cantidad), unidad: f.unidad || null }, ing) : null
    const peso = g != null && ing?.proteina_100 != null ? (g * ing.proteina_100) / 100 : 5
    for (const [grupo, re] of PISTAS_GRUPO) {
      if (re.test(texto)) {
        puntos.set(grupo, (puntos.get(grupo) ?? 0) + peso)
        break
      }
    }
  }
  let mejor: GrupoProteico | null = null
  let max = 0
  for (const [g, p] of puntos) if (p > max) [mejor, max] = [g, p]
  return mejor ?? (filas.length ? 'vegetal' : null)
}

export default function EditarReceta() {
  const { id } = useParams()
  const loc = useLocation()
  const nav = useNavigate()
  const { mapaRecetas, mapaIngredientes, recetas, ingredientes, etiquetas: todasEtiquetas, hogar, guardarReceta, guardarIngrediente } = useDatos()
  const existente = id ? mapaRecetas.get(id) : undefined
  const bases = useMemo(() => recetas.filter((r) => r.es_base && r.id !== id), [recetas, id])
  const importada = (loc.state as { importada?: RecetaImportada } | null)?.importada

  const [f, setF] = useState<Formulario>(() =>
    existente ? desdeReceta(existente) : importada ? desdeImportada(importada, ingredientes, bases) : { ...VACIO, filas: [] },
  )
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creandoEn, setCreandoEn] = useState<string | null>(null)
  const [productoPara, setProductoPara] = useState<string | null>(null)
  const [eligiendoBase, setEligiendoBase] = useState(false)
  const [editandoIng, setEditandoIng] = useState<string | null>(null)
  const { enlaces } = useMenu()
  const usarProducto = useUsarProducto()

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((x) => ({ ...x, [k]: v }))
  const setFila = (key: string, cambios: Partial<Fila>) => setF((x) => ({ ...x, filas: x.filas.map((r) => (r.key === key ? { ...r, ...cambios } : r)) }))

  const porNombre = useMemo(() => {
    const m = new Map<string, { tipo: 'ingrediente' | 'base'; id: string }>()
    for (const i of ingredientes) m.set(normalizar(i.nombre), { tipo: 'ingrediente', id: i.id })
    for (const b of bases) m.set(normalizar(b.titulo), { tipo: 'base', id: b.id })
    return m
  }, [ingredientes, bases])

  function cambiarNombre(fila: Fila, nombre: string) {
    const exacto = porNombre.get(normalizar(nombre))
    if (exacto) vincular(fila.key, exacto.tipo, exacto.id, nombre)
    else setFila(fila.key, { nombre, ...(fila.ingredient_id || fila.sub_recipe_id ? { ingredient_id: null, sub_recipe_id: null, unidad: fila.sub_recipe_id ? '' : fila.unidad } : {}) })
  }

  function vincular(key: string, tipo: 'ingrediente' | 'base', idv: string, nombre?: string) {
    setF((x) => ({
      ...x,
      filas: x.filas.map((r) =>
        r.key !== key
          ? r
          : tipo === 'base'
            ? { ...r, ...(nombre != null ? { nombre } : {}), ingredient_id: null, sub_recipe_id: idv, unidad: r.cantidad && esUnidadBase(r.unidad) ? r.unidad! : 'racion', cantidad: r.cantidad || '1' }
            : { ...r, ...(nombre != null ? { nombre } : {}), ingredient_id: idv, sub_recipe_id: null, unidad: r.unidad === 'racion' || r.unidad === 'receta' ? 'g' : r.unidad },
      ),
    }))
  }

  // Receta provisional para calcular la proteína en vivo
  const vistaPrevia: Receta = {
    id: id ?? '__nueva__',
    household_id: '',
    creado_en: '',
    actualizado_en: '',
    titulo: f.titulo,
    foto_url: f.foto_url,
    raciones: numero(f.raciones) || 1,
    t_prep_min: entero(f.t_prep_min),
    t_coccion_min: entero(f.t_coccion_min),
    tipo_comida: f.tipo_comida,
    grupo_proteico: f.grupo_proteico || null,
    es_base: f.es_base,
    papel: f.es_base || f.tipo_comida === 'desayuno' ? 'completo' : f.papel,
    congelable: f.congelable,
    dias_nevera: entero(f.dias_nevera),
    valoracion: f.valoracion,
    favorita: f.favorita,
    proteina_racion_manual: numero(f.proteina_racion_manual),
    peso_total_g: f.es_base ? numero(f.peso_total_g) : null,
    fuente_url: f.fuente_url,
    fuente_tipo: f.fuente_tipo,
    notas: f.notas || null,
    etiquetas: f.etiquetas,
    pasos: f.pasos.split('\n'),
    ingredientes: f.filas.map((r, i) => ({
      orden: i,
      ingredient_id: r.ingredient_id,
      sub_recipe_id: r.sub_recipe_id,
      cantidad: numero(r.cantidad),
      unidad: r.unidad || null,
      texto_original: r.nombre,
    })),
  }
  const nut = nutricionPorRacion({ ...vistaPrevia, proteina_racion_manual: null }, mapaIngredientes, mapaRecetas)
  const grupoSugerido = inferirGrupo(f.filas, mapaIngredientes, mapaRecetas)
  const total = (entero(f.t_prep_min) ?? 0) + (entero(f.t_coccion_min) ?? 0)

  async function alElegirFoto(archivo: File | undefined) {
    if (!archivo || !hogar) return
    setSubiendo(true)
    setError(null)
    try {
      set('foto_url', await subirFoto(archivo, hogar.id))
    } catch (e: any) {
      setError(`No se pudo subir la foto: ${e.message ?? e}`)
    } finally {
      setSubiendo(false)
    }
  }

  function anadirEtiqueta(t: string) {
    const v = t.trim().toLowerCase().replace(/^#/, '')
    if (v && !f.etiquetas.includes(v)) set('etiquetas', [...f.etiquetas, v])
    setNuevaEtiqueta('')
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!f.titulo.trim()) return setError('Ponle un título a la receta')
    if (!f.es_base && !f.grupo_proteico && !(f.papel === 'guarnicion' && f.tipo_comida !== 'desayuno')) return setError('Elige el grupo proteico principal (lo usa el planificador)')
    setError(null)
    setGuardando(true)
    try {
      const borrador: RecetaBorrador = { ...vistaPrevia, id: existente?.id, pasos: f.pasos.split('\n') }
      delete (borrador as any).household_id
      delete (borrador as any).creado_en
      delete (borrador as any).actualizado_en
      if (!existente) delete borrador.id
      borrador.ingredientes = borrador.ingredientes.filter((l) => l.texto_original.trim() || l.sub_recipe_id)
      const rid = await guardarReceta(borrador)
      nav(`/receta/${rid}`, { replace: true })
    } catch (err: any) {
      setError(`No se pudo guardar: ${err.message ?? err}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className="editor" onSubmit={enviar}>
      <header className="cabecera">
        <button type="button" className="volver" onClick={() => nav(-1)} aria-label="Volver">‹</button>
        <h1>{existente ? 'Editar receta' : importada ? 'Revisar importación' : 'Nueva receta'}</h1>
      </header>
      {importada && (
        <p className="aviso">
          {importada.estructurada ? 'Receta leída de la web.' : 'Receta sacada del texto de la publicación: revisa ingredientes y pasos.'} Comprueba que todo está bien antes de guardar.
        </p>
      )}

      <section className="tarjeta formulario">
        <label>
          Título
          <input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} required />
        </label>

        <div className="foto-editor">
          {f.foto_url ? (
            <div className="foto-previa" style={{ backgroundImage: `url("${f.foto_url}")` }}>
              <button type="button" className="quitar" onClick={() => set('foto_url', null)}>×</button>
            </div>
          ) : (
            <div className="foto-previa vacia">Sin foto</div>
          )}
          <label className="boton">
            {subiendo ? 'Subiendo…' : f.foto_url ? 'Cambiar foto' : 'Añadir foto'}
            <input type="file" accept="image/*" hidden onChange={(e) => alElegirFoto(e.target.files?.[0])} />
          </label>
        </div>

        <div className="rejilla-3">
          <label>
            Raciones
            <input inputMode="decimal" value={f.raciones} onChange={(e) => set('raciones', e.target.value)} />
          </label>
          <label>
            Prep. (min)
            <input inputMode="numeric" value={f.t_prep_min} onChange={(e) => set('t_prep_min', e.target.value)} />
          </label>
          <label>
            Cocción (min)
            <input inputMode="numeric" value={f.t_coccion_min} onChange={(e) => set('t_coccion_min', e.target.value)} />
          </label>
        </div>
        {total > 0 && <p className="suave">Total {total} min</p>}
      </section>

      <section className="tarjeta formulario">
        <h2>Clasificación</h2>
        <label>
          Para
          <div className="segmentado">
            {TIPOS_COMIDA.map((t) => (
              <button type="button" key={t.valor} className={f.tipo_comida === t.valor ? 'on' : ''} onClick={() => set('tipo_comida', t.valor)}>
                {t.etiqueta}
              </button>
            ))}
          </div>
        </label>
        {!f.es_base && f.tipo_comida !== 'desayuno' && (
          <label>
            En el menú
            <div className="segmentado">
              {PAPELES.map((p) => (
                <button type="button" key={p.valor} className={f.papel === p.valor ? 'on' : ''} onClick={() => set('papel', p.valor)}>
                  {p.emoji} {p.etiqueta}
                </button>
              ))}
            </div>
            <span className="suave pequeno">{PAPELES.find((p) => p.valor === f.papel)!.ayuda}</span>
            {f.papel === 'guarnicion' && (
              <span className="suave pequeno">
                Para una guarnición sencilla basta con el ingrediente y los gramos de 1 ración (por ejemplo, 1 ración: 70 g de arroz). Los pasos son opcionales.
              </span>
            )}
          </label>
        )}
        <label>
          Grupo proteico principal {f.es_base ? '(opcional en bases)' : f.papel === 'guarnicion' && f.tipo_comida !== 'desayuno' ? '(opcional en guarniciones)' : ''}
          <div className="opciones-grupo">
            {GRUPOS_PROTEICOS.map((g) => (
              <button type="button" key={g.valor} className={`chip g-${g.valor} ${f.grupo_proteico === g.valor ? 'on' : ''}`} onClick={() => set('grupo_proteico', f.grupo_proteico === g.valor ? '' : g.valor)}>
                {g.emoji} {g.etiqueta}
              </button>
            ))}
          </div>
        </label>
        {grupoSugerido && grupoSugerido !== f.grupo_proteico && (
          <button type="button" className="enlace" onClick={() => set('grupo_proteico', grupoSugerido)}>
            Sugerido por los ingredientes: {etiquetaGrupo(grupoSugerido)?.emoji} {etiquetaGrupo(grupoSugerido)?.etiqueta}
          </button>
        )}
        <label className="check">
          <input type="checkbox" checked={f.es_base} onChange={(e) => set('es_base', e.target.checked)} />
          Es una preparación base (boloñesa, sofrito, legumbre cocida…) que se usa en otras recetas
        </label>
        <div className="rejilla-2">
          <label className="check">
            <input type="checkbox" checked={f.congelable} onChange={(e) => set('congelable', e.target.checked)} /> Se puede congelar
          </label>
          <label>
            Días en nevera
            <input inputMode="numeric" value={f.dias_nevera} onChange={(e) => set('dias_nevera', e.target.value)} />
          </label>
        </div>
        <label>
          Etiquetas
          <div className="chips editables">
            {f.etiquetas.map((t) => (
              <button type="button" key={t} className="chip etiqueta" onClick={() => set('etiquetas', f.etiquetas.filter((x) => x !== t))}>
                #{t} ×
              </button>
            ))}
          </div>
          <div className="fila">
            <input
              list="lista-etiquetas"
              value={nuevaEtiqueta}
              placeholder="Añadir etiqueta (ej. batch, verano, rápida)"
              onChange={(e) => setNuevaEtiqueta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  anadirEtiqueta(nuevaEtiqueta)
                }
              }}
            />
            <button type="button" className="boton" onClick={() => anadirEtiqueta(nuevaEtiqueta)}>Añadir</button>
          </div>
          <datalist id="lista-etiquetas">
            {todasEtiquetas.map((t) => <option key={t} value={t} />)}
          </datalist>
        </label>
      </section>

      <section className="tarjeta">
        <div className="fila espacio">
          <h2>Ingredientes</h2>
          <span className="suave">por ración</span>
        </div>
        <div className="macros">
          <span className="chip">🔥 {fmt(nut.kcal)} kcal</span>
          <span className="chip">P {fmt(nut.proteina)} g</span>
          <span className="chip">HC {fmt(nut.hidratos)} g</span>
          <span className="chip">G {fmt(nut.grasa)} g</span>
        </div>
        <datalist id="lista-ingredientes">
          {bases.map((b) => <option key={b.id} value={b.titulo}>Preparación base</option>)}
          {ingredientes.map((i) => <option key={i.id} value={i.nombre} />)}
        </datalist>
        <div className="filas-ingredientes">
          {f.filas.map((fila, idx) => {
            const ing = fila.ingredient_id ? mapaIngredientes.get(fila.ingredient_id) : undefined
            const sub = fila.sub_recipe_id ? mapaRecetas.get(fila.sub_recipe_id) : undefined
            const sug = !ing && !sub && fila.nombre.trim() ? sugerencias(fila.nombre, ingredientes, bases, 3) : []
            return (
              <div className="fila-ingrediente" key={fila.key}>
                <div className="fila">
                  <input className="cant" inputMode="decimal" placeholder="Cant." value={fila.cantidad} onChange={(e) => setFila(fila.key, { cantidad: e.target.value })} />
                  <select className="uni" value={fila.unidad} onChange={(e) => setFila(fila.key, { unidad: e.target.value })}>
                    {sub ? (
                      UNIDADES_BASE.map((u) => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)
                    ) : (
                      <>
                        <option value="">—</option>
                        {UNIDADES_DISPONIBLES.map((u) => <option key={u} value={u}>{u === 'pellizco' ? 'pizca' : u}</option>)}
                      </>
                    )}
                  </select>
                  <input className="nombre" list="lista-ingredientes" placeholder="Ingrediente" value={fila.nombre} onChange={(e) => cambiarNombre(fila, e.target.value)} />
                  <div className="mover">
                    <button type="button" disabled={idx === 0} onClick={() => setF((x) => {
                      const filas = [...x.filas]
                      ;[filas[idx - 1], filas[idx]] = [filas[idx], filas[idx - 1]]
                      return { ...x, filas }
                    })} aria-label="Subir">↑</button>
                    <button type="button" onClick={() => setF((x) => ({ ...x, filas: x.filas.filter((r) => r.key !== fila.key) }))} aria-label="Quitar">×</button>
                  </div>
                </div>
                <div className="vinculo">
                  {sub ? (
                    <span className="ok">
                      ↳ Preparación base: {sub.titulo}
                      {(() => {
                        const ns = nutricionPorRacion(sub, mapaIngredientes, mapaRecetas)
                        const peso = pesoReceta(sub, mapaIngredientes, mapaRecetas)
                        return (
                          <span className="suave">
                            {' '}· {fmt(ns.kcal)} kcal/ración{peso ? ` · ración ≈ ${fmt(peso / (sub.raciones || 1))} g · receta entera ${fmt(sub.raciones, 1)} rac.` : ''}
                            {fila.unidad === 'g' && !peso && <em className="aviso-mini"> · la base no tiene peso: pon su peso final o usa raciones</em>}
                          </span>
                        )
                      })()}
                    </span>
                  ) : ing ? (
                    <span className="ok">
                      ✓ {ing.nombre} · {ing.kcal_100 != null ? `${fmt(ing.kcal_100)} kcal · ` : ''}{fmt(ing.proteina_100, 1)} g prot/100 {ing.unidad_base === 'ml' ? 'ml' : 'g'}
                      {ing.kcal_100 == null && ing.proteina_100 == null && <em className="aviso-mini"> · sin datos nutricionales</em>}
                      {esProteinaPlato(ing) && proteinaSupuesta({ cantidad: numero(fila.cantidad), unidad: fila.unidad || null }, ing, 1) != null ? (
                        <em className="suave"> · sin peso: se cuentan {PROTEINA_POR_RACION_G} g por ración</em>
                      ) : (
                        fila.unidad && ['ud', 'lata', 'bote', 'sobre', 'paquete'].includes(fila.unidad) && !ing.peso_unidad_g && <em className="aviso-mini"> · falta el peso por unidad</em>
                      )}
                      {ing.peso_unidad_aprox && (!fila.unidad || fila.unidad === 'ud') && <em className="suave"> · pieza mediana ≈ {fmt(ing.peso_unidad_g)} g</em>}
                      <button type="button" className="enlace" onClick={() => setEditandoIng(editandoIng === fila.key ? null : fila.key)}>datos</button>
                      <button type="button" className="enlace" onClick={() => setFila(fila.key, { ingredient_id: null })}>cambiar</button>
                      <br />
                      {enlaces.get(ing.id)?.mercadona ? (
                        <button type="button" className="chip mercadona" onClick={() => setProductoPara(fila.key)} title="Cambiar producto">
                          🛒 {enlaces.get(ing.id)!.mercadona!.nombre} · {euros(enlaces.get(ing.id)!.mercadona!.precio)}
                        </button>
                      ) : (
                        <button type="button" className="chip sugerencia" onClick={() => setProductoPara(fila.key)}>🛒 Elegir producto de Mercadona</button>
                      )}
                    </span>
                  ) : fila.nombre.trim() ? (
                    <span>
                      <span className="aviso-mini">Sin vincular</span>
                      {sug.map((s) => (
                        <button type="button" key={s.id} className="chip sugerencia" onClick={() => vincular(fila.key, s.tipo, s.id)}>
                          {s.tipo === 'base' ? '↳ ' : ''}{s.nombre}
                        </button>
                      ))}
                      <button type="button" className="chip mercadona" onClick={() => setProductoPara(fila.key)}>🛒 Buscar en Mercadona</button>
                      <button type="button" className="enlace" onClick={() => setCreandoEn(creandoEn === fila.key ? null : fila.key)}>
                        + crear en el catálogo
                      </button>
                    </span>
                  ) : null}
                </div>
                {editandoIng === fila.key && ing && (
                  <NuevoIngrediente
                    inicial={ing}
                    onCancelar={() => setEditandoIng(null)}
                    onGuardar={async (datos) => {
                      await guardarIngrediente({ ...datos, id: ing.id })
                      setEditandoIng(null)
                    }}
                  />
                )}
                {productoPara === fila.key && (
                  <SelectorProducto
                    inicial={ing && !enlaces.get(ing.id)?.mercadona ? ing.nombre : fila.nombre}
                    titulo={fila.nombre || 'Producto de Mercadona'}
                    nota={
                      ing && !enlaces.get(ing.id)?.mercadona
                        ? `Se enlaza a «${ing.nombre}» y se usará en todas las recetas que lo llevan.`
                        : 'Si el producto es nuevo, se añade al catálogo con las kcal y macros del alimento más parecido (las puedes corregir en «datos»).'
                    }
                    onCerrar={() => setProductoPara(null)}
                    onElegir={async (p) => {
                      const { ingId } = await usarProducto(p, fila.ingredient_id)
                      setF((x) => ({ ...x, filas: x.filas.map((r) => (r.key === fila.key ? { ...r, nombre: r.nombre.trim() || p.nombre, ingredient_id: ingId, sub_recipe_id: null } : r)) }))
                      setProductoPara(null)
                    }}
                  />
                )}
                {creandoEn === fila.key && (
                  <NuevoIngrediente
                    nombre={fila.nombre}
                    onCancelar={() => setCreandoEn(null)}
                    onGuardar={async (datos) => {
                      const nuevo = await guardarIngrediente(datos)
                      vincular(fila.key, 'ingrediente', nuevo.id)
                      setCreandoEn(null)
                    }}
                    onUsarExistente={(idExistente) => {
                      vincular(fila.key, 'ingrediente', idExistente)
                      setCreandoEn(null)
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
        <div className="fila" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="boton" onClick={() => set('filas', [...f.filas, { key: clave(), cantidad: '', unidad: 'g', nombre: '', ingredient_id: null, sub_recipe_id: null }])}>
            + Añadir ingrediente
          </button>
          {bases.length > 0 && (
            <button type="button" className="boton" onClick={() => setEligiendoBase(!eligiendoBase)}>
              + Añadir preparación base
            </button>
          )}
        </div>
        {eligiendoBase && (
          <div className="chips margen-arriba">
            {bases.map((b) => (
              <button
                type="button"
                key={b.id}
                className="chip sugerencia"
                onClick={() => {
                  set('filas', [...f.filas, { key: clave(), cantidad: '1', unidad: 'racion', nombre: b.titulo, ingredient_id: null, sub_recipe_id: b.id }])
                  setEligiendoBase(false)
                }}
              >
                🥣 {b.titulo}
              </button>
            ))}
          </div>
        )}
        {f.es_base && (
          <label className="margen-arriba">
            Peso de la receta terminada en g (opcional)
            <input
              inputMode="decimal"
              placeholder={(() => {
                const p = pesoReceta({ ...vistaPrevia, peso_total_g: null }, mapaIngredientes, mapaRecetas)
                return p ? `Suma de ingredientes: ${fmt(p)} g` : 'g'
              })()}
              value={f.peso_total_g}
              onChange={(e) => set('peso_total_g', e.target.value)}
            />
            <span className="suave">Sirve para usar esta base en gramos en otras recetas («200 g de boloñesa»). Si la dejas vacía se usa la suma de los ingredientes.</span>
          </label>
        )}
        <label className="margen-arriba">
          Proteína por ración a mano (opcional, sustituye al cálculo)
          <input inputMode="decimal" placeholder={nut.proteina != null ? `Calculada: ${fmt(nut.proteina)} g` : 'g'} value={f.proteina_racion_manual} onChange={(e) => set('proteina_racion_manual', e.target.value)} />
        </label>
      </section>

      <section className="tarjeta formulario">
        <h2>Preparación</h2>
        <label>
          Un paso por línea
          <textarea rows={Math.max(5, f.pasos.split('\n').length + 1)} value={f.pasos} onChange={(e) => set('pasos', e.target.value)} />
        </label>
        <label>
          Notas
          <textarea rows={3} value={f.notas} onChange={(e) => set('notas', e.target.value)} />
        </label>
        <label>
          Enlace de origen
          <input type="url" value={f.fuente_url ?? ''} onChange={(e) => set('fuente_url', e.target.value || null)} placeholder="https://…" />
        </label>
      </section>

      {error && <p className="error">{error}</p>}
      <div className="barra-guardar">
        <button type="button" className="boton" onClick={() => nav(-1)}>Cancelar</button>
        <button className="boton primario" disabled={guardando || subiendo}>{guardando ? 'Guardando…' : 'Guardar receta'}</button>
      </div>
    </form>
  )
}
