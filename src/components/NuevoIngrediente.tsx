import { useMemo, useState } from 'react'
import { normalizar } from '../../shared/parser.js'
import { nombreConMarca, type AlimentoExterno } from '../../shared/alimentos.js'
import { supabase } from '../lib/supabase'
import { useDatos } from '../lib/datos'
import { fmt } from '../lib/nutricion'
import type { Ingrediente } from '../lib/tipos'

const CATEGORIAS = ['Carne', 'Pescado', 'Huevos', 'Legumbres', 'Verdura', 'Fruta', 'Lácteos', 'Pasta y arroz', 'Panadería', 'Conservas', 'Congelados', 'Charcutería', 'Frutos secos', 'Despensa', 'Desayuno', 'Refrigerados', 'Bebidas', 'Otros']

const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const numero = (s: string): number | null => {
  const v = parseFloat(s.replace(',', '.'))
  return isFinite(v) ? v : null
}

export default function NuevoIngrediente({
  nombre: nombreInicial,
  inicial,
  onGuardar,
  onCancelar,
  onUsarExistente,
}: {
  nombre?: string
  inicial?: Ingrediente
  onGuardar: (i: Partial<Ingrediente> & { nombre: string }) => Promise<void>
  onCancelar: () => void
  /** Si se pasa, cuando ya existe un ingrediente igual se ofrece usarlo en vez de crear otro */
  onUsarExistente?: (id: string) => void
}) {
  const { ingredientes } = useDatos()
  const [nombre, setNombre] = useState(inicial?.nombre ?? nombreInicial ?? '')
  const [categoria, setCategoria] = useState(inicial?.categoria ?? 'Otros')
  const [unidad, setUnidad] = useState<'g' | 'ml' | 'ud'>(inicial?.unidad_base ?? 'g')
  const [peso, setPeso] = useState(str(inicial?.peso_unidad_aprox ? null : inicial?.peso_unidad_g))
  const [prot, setProt] = useState(str(inicial?.proteina_100))
  const [kcal, setKcal] = useState(str(inicial?.kcal_100))
  const [hc, setHc] = useState(str(inicial?.hidratos_100))
  const [grasa, setGrasa] = useState(str(inicial?.grasa_100))
  const [desp, setDesp] = useState(inicial?.es_despensa ?? false)
  const [codigoOff, setCodigoOff] = useState<string | null>(inicial?.codigo_off ?? null)
  const [error, setError] = useState<string | null>(null)

  // Búsqueda en Open Food Facts
  const [q, setQ] = useState(inicial ? '' : nombreInicial ?? '')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<AlimentoExterno[] | null>(null)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)

  const porNombre = useMemo(() => new Map(ingredientes.map((i) => [normalizar(i.nombre), i])), [ingredientes])
  const porCodigo = useMemo(() => new Map(ingredientes.filter((i) => i.codigo_off).map((i) => [i.codigo_off!, i])), [ingredientes])
  const igual = (() => {
    const i = porNombre.get(normalizar(nombre)) ?? (codigoOff ? porCodigo.get(codigoOff) : undefined)
    return i && i.id !== inicial?.id ? i : undefined
  })()

  async function buscar() {
    if (q.trim().length < 2) return
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch(`/api/alimentos?q=${encodeURIComponent(q.trim())}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
      const j = await r.json().catch(() => ({ error: 'Respuesta no válida' }))
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`)
      setResultados(j)
    } catch (e: any) {
      setErrorBusqueda(e.message ?? String(e))
    } finally {
      setBuscando(false)
    }
  }

  function elegir(a: AlimentoExterno) {
    setNombre(nombreConMarca(a))
    setUnidad(a.unidad_base)
    setProt(str(a.proteina_100))
    setKcal(str(a.kcal_100))
    setHc(str(a.hidratos_100))
    setGrasa(str(a.grasa_100))
    setCodigoOff(a.codigo_off)
    setResultados(null)
  }

  async function guardar() {
    if (!nombre.trim()) return setError('Falta el nombre')
    if (igual) return setError(`Ya existe «${igual.nombre}» en el catálogo`)
    try {
      await onGuardar({
        ...(inicial ? { id: inicial.id } : {}),
        nombre: nombre.trim(),
        categoria,
        unidad_base: unidad,
        peso_unidad_g: numero(peso),
        proteina_100: numero(prot),
        kcal_100: numero(kcal),
        hidratos_100: numero(hc),
        grasa_100: numero(grasa),
        es_despensa: desp,
        codigo_off: codigoOff,
      })
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }

  return (
    <div className="nuevo-ingrediente">
      {!inicial && (
        <div className="buscar-off">
          <label>
            Buscar en Open Food Facts (rellena los macros solo)
            <div className="fila">
              <input
                type="search"
                value={q}
                placeholder="Ej. queso batido Hacendado"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    buscar()
                  }
                }}
              />
              <button type="button" className="boton" disabled={buscando} onClick={buscar}>
                {buscando ? '…' : 'Buscar'}
              </button>
            </div>
          </label>
          {errorBusqueda && <p className="error">{errorBusqueda}</p>}
          {resultados && (
            <ul className="resultados-off">
              {resultados.length === 0 && <li className="suave">Sin resultados. Prueba con otras palabras o rellena a mano.</li>}
              {resultados.map((a) => {
                const ya = porCodigo.get(a.codigo_off) ?? porNombre.get(normalizar(nombreConMarca(a)))
                return (
                  <li key={a.codigo_off}>
                    <button
                      type="button"
                      onClick={() => (ya && onUsarExistente ? onUsarExistente(ya.id) : elegir(a))}
                      disabled={!!ya && !onUsarExistente}
                    >
                      <b>{a.nombre}</b>
                      <span className="suave">
                        {[a.marca, a.formato].filter(Boolean).join(' · ')}
                        {' · '}💪 {fmt(a.proteina_100, 1)} g · {fmt(a.kcal_100)} kcal /100 {a.unidad_base}
                      </span>
                      {ya && <span className="chip">{onUsarExistente ? 'ya en el catálogo: usar' : 'ya en el catálogo'}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <div className="rejilla-2">
        <label>
          Nombre
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value)
              setError(null)
            }}
          />
        </label>
        <label>
          Sección
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Proteína (g/100)
          <input inputMode="decimal" value={prot} onChange={(e) => setProt(e.target.value)} />
        </label>
        <label>
          Kcal (/100)
          <input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <label>
          Hidratos (g/100)
          <input inputMode="decimal" value={hc} onChange={(e) => setHc(e.target.value)} />
        </label>
        <label>
          Grasa (g/100)
          <input inputMode="decimal" value={grasa} onChange={(e) => setGrasa(e.target.value)} />
        </label>
        <label>
          Se mide en
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as 'g' | 'ml' | 'ud')}>
            <option value="g">gramos</option>
            <option value="ml">mililitros</option>
            <option value="ud">unidades</option>
          </select>
        </label>
        <label>
          Peso de 1 unidad (g)
          <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder={inicial?.peso_unidad_aprox ? `≈ ${inicial.peso_unidad_g} (pieza mediana)` : 'ej. huevo 60'} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={desp} onChange={(e) => setDesp(e.target.checked)} /> Siempre en casa (despensa)
      </label>
      {igual && (
        <p className="aviso">
          Ya existe «{igual.nombre}» ({fmt(igual.proteina_100, 1)} g de proteína/100).{' '}
          {onUsarExistente && (
            <button type="button" className="enlace" onClick={() => onUsarExistente(igual.id)}>
              Usar ese
            </button>
          )}
        </p>
      )}
      {error && !igual && <p className="error">{error}</p>}
      <div className="fila">
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="boton primario" disabled={!!igual} onClick={guardar}>
          Guardar ingrediente
        </button>
      </div>
    </div>
  )
}
