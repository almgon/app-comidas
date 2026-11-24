import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../lib/datos'
import { useComensales, useMenu, useSemana } from '../lib/menu'
import { useSemanaElegida } from '../lib/useSemanaElegida'
import { sesionDomingo } from '../lib/batch'
import { calcularCompra, claveArticulo, ordenPasillo, textoCantidad } from '../lib/compra'
import { fmtBase } from '../lib/cantidades'
import type { ArticuloCompra } from '../lib/tipos'
import SelectorSemana from '../components/SelectorSemana'
import EditorPrecios from '../components/EditorPrecios'
import { euros, totalCompra } from '../lib/precios'

export default function Compra() {
  const [lunes, setLunes] = useSemanaElegida()
  const { mapaRecetas, mapaIngredientes, miembros, sesion } = useDatos()
  const { congelados, envases, guardarEnvase, enlaces } = useMenu()
  const comensales = useComensales()
  const semana = useSemana(lunes)
  const [ocultar, setOcultar] = useState(false)
  const [verDespensa, setVerDespensa] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [generando, setGenerando] = useState(false)
  const [envaseDe, setEnvaseDe] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preciosDe, setPreciosDe] = useState<string | null>(null)
  const [repaso, setRepaso] = useState(false)
  const [verTengo, setVerTengo] = useState(false)

  const necesidades = useMemo(() => {
    const batch = sesionDomingo(lunes, semana.entradas, mapaRecetas, semana.plan?.batch ?? {}, congelados, mapaIngredientes)
    return calcularCompra({ lunes, entradas: semana.entradas, recetas: mapaRecetas, ingredientes: mapaIngredientes, batch, comensales, envases })
  }, [lunes, semana.entradas, semana.plan, mapaRecetas, mapaIngredientes, congelados, comensales, envases])

  // ¿La lista guardada coincide con lo que pide el menú ahora?
  const desfasada = useMemo(() => {
    if (!semana.lista) return false
    const firma = (xs: { clave: string; cantidad: number | null; detalle: string | null }[]) => xs.map((x) => `${x.clave}=${x.cantidad ?? ''}|${x.detalle ?? ''}`).sort().join(';')
    const guardados = semana.articulos.filter((a) => !a.manual).map((a) => ({ clave: claveArticulo(a), cantidad: a.cantidad, detalle: a.detalle }))
    return firma(guardados) !== firma(necesidades)
  }, [semana.lista, semana.articulos, necesidades])

  const precios = useMemo(() => totalCompra(semana.articulos.filter((a) => !a.tengo), mapaIngredientes, enlaces), [semana.articulos, mapaIngredientes, enlaces])
  const hayPrecios = precios.conPrecio > 0
  const nombre = (uid: string | null) => miembros.find((m) => m.id === uid)?.nombre
  const articulos = semana.articulos
  const normales = articulos.filter((a) => !a.es_despensa && !a.tengo)
  const despensa = articulos.filter((a) => a.es_despensa && !a.tengo)
  const enCasa = articulos.filter((a) => a.tengo)
  const pendientes = normales.filter((a) => !a.comprado).length
  const grupos = useMemo(() => {
    const m = new Map<string, ArticuloCompra[]>()
    for (const a of normales) if (repaso || !ocultar || !a.comprado) m.set(a.categoria, [...(m.get(a.categoria) ?? []), a])
    return [...m].sort((a, b) => ordenPasillo(a[0]) - ordenPasillo(b[0]))
  }, [normales, ocultar, repaso])
  const tengo = (a: ArticuloCompra, v: boolean) => semana.marcarTengo(a, v).catch((e) => setError(e.message))

  async function generar() {
    setGenerando(true)
    setError(null)
    try {
      await semana.generarLista(necesidades)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerando(false)
    }
  }

  async function vaciar() {
    if (!confirm('Se borrará la lista entera, también lo añadido a mano y lo marcado. ¿Seguir?')) return
    setGenerando(true)
    setError(null)
    try {
      await semana.vaciarLista()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerando(false)
    }
  }

  const fila = (a: ArticuloCompra) => {
    const ing = a.ingredient_id ? mapaIngredientes.get(a.ingredient_id) : undefined
    const quien = a.comprado && a.comprado_por !== sesion?.user.id ? nombre(a.comprado_por) : null
    return (
      <li key={a.id} className={a.tengo ? 'en-casa' : a.comprado && !repaso ? 'comprado' : ''}>
        <label className="articulo">
          {repaso || a.tengo ? (
            <input type="checkbox" checked={!!a.tengo} onChange={(e) => tengo(a, e.target.checked)} aria-label="Ya lo tengo" />
          ) : (
            <input type="checkbox" checked={a.comprado} onChange={(e) => semana.marcar(a, e.target.checked)} />
          )}
          <span className="texto">
            <span className="nombre">
              {a.texto} {a.cantidad != null && <b>{textoCantidad(a.cantidad, a.unidad)}</b>}
            </span>
            {a.detalle && <span className="detalle">{a.detalle}</span>}
            {a.origen && <span className="origen">{a.origen}</span>}
            {quien && <span className="origen">✓ {quien}</span>}
            {precios.precios.has(a.id) && (
              <span className="precios-art">
                <span className="chip t-mercadona">
                  {precios.precios.get(a.id)!.envases > 1 ? `${precios.precios.get(a.id)!.envases}× ` : ''}{euros(precios.precios.get(a.id)!.coste)}
                </span>
              </span>
            )}
          </span>
        </label>
        {a.manual ? (
          <button className="enlace peligro" onClick={() => semana.borrarArticulo(a.id)} aria-label="Quitar">✕</button>
        ) : ing ? (
          <span className="fila">
            <button className="icono" title="Precios" onClick={() => setPreciosDe(a.id)}>💶</button>
            {a.unidad && <button className="icono" title="Envase" onClick={() => setEnvaseDe(envaseDe === ing.id ? null : ing.id)}>📦</button>}
          </span>
        ) : null}
        {envaseDe && envaseDe === ing?.id && (
          <EditorEnvase
            unidad={ing.unidad_base}
            actual={envases.get(ing.id) ?? (ing.envase_cantidad ? { cantidad: Number(ing.envase_cantidad), nombre: ing.envase_nombre ?? 'envase' } : null)}
            onGuardar={async (e) => {
              await guardarEnvase(ing.id, e)
              setEnvaseDe(null)
            }}
          />
        )}
      </li>
    )
  }

  return (
    <div className="compra">
      <header className="cabecera">
        <h1>Compra</h1>
        {semana.lista && <span className="suave">{pendientes} por comprar</span>}
      </header>
      <SelectorSemana lunes={lunes} onCambiar={setLunes} />
      {semana.error && <p className="aviso">{semana.error}</p>}
      {error && <p className="error">{error}</p>}

      {!semana.lista ? (
        <div className="vacio">
          {semana.entradas.some((e) => e.recipe_id) ? (
            <>
              <p>Saca la lista de la compra del menú de esta semana: desayunos, comidas, cenas, sesión del domingo, alimentos sueltos y fruta, sin lo que hay en el congelador.</p>
              <button className="boton primario" onClick={generar} disabled={generando}>{generando ? 'Calculando…' : '🛒 Crear lista desde el menú'}</button>
            </>
          ) : (
            <p>
              Todavía no hay menú para esta semana. <Link to={`/menu?semana=${lunes}`}>Prepara el menú</Link> y vuelve aquí.
            </p>
          )}
        </div>
      ) : (
        <>
          {desfasada && <p className="aviso">El menú ha cambiado desde que se hizo la lista: toca «Actualizar con el menú».</p>}
          <div className="fila margen-arriba">
            <button className={`boton ${desfasada ? 'primario' : ''}`} onClick={generar} disabled={generando}>
              {generando ? 'Calculando…' : '🔄 Actualizar con el menú'}
            </button>
            <button className="boton peligro" onClick={vaciar} disabled={generando}>🗑 Vaciar lista</button>
          </div>
          <p className="suave pequeno">Actualizar recalcula las cantidades con el menú de la semana y conserva lo marcado y lo añadido a mano. Vaciar la borra entera.</p>
          {hayPrecios ? (
            <section className="tarjeta comparador">
              <div className="totales">
                <div className="mejor"><span>Total en Mercadona</span><b>{euros(precios.total)}</b></div>
              </div>
              <p className="suave">
                {precios.conPrecio} productos con precio{precios.sinPrecio > 0 ? ` · ${precios.sinPrecio} sin precio (toca 💶 para enlazarlos)` : ''}
                {precios.antiguos > 0 && <span className="aviso-mini"> · {precios.antiguos} precios de hace más de 14 días</span>}
              </p>
            </section>
          ) : (
            <p className="suave margen-arriba">💶 Toca el euro de un producto para enlazarlo con Mercadona y ver cuánto cuesta la compra.</p>
          )}
          <button className={`boton ancho margen-arriba ${repaso ? 'primario' : ''}`} onClick={() => setRepaso(!repaso)}>
            {repaso ? '✓ Terminar el repaso' : '🏠 Repasar lo que ya hay en casa'}
          </button>
          {repaso && <p className="suave">Marca lo que ya tenéis: sale de la lista (y no vuelve al recalcularla). Cuando acabéis, toca «Terminar el repaso».</p>}
          <div className="fila espacio margen-arriba">
            <label className="check">
              <input type="checkbox" checked={ocultar} onChange={(e) => setOcultar(e.target.checked)} disabled={repaso} /> Ocultar lo comprado
            </label>
          </div>
          <form
            className="fila margen-arriba"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await semana.anadirArticulo(nuevo)
                setNuevo('')
              } catch (x: any) {
                setError(x.message)
              }
            }}
          >
            <input placeholder="Añadir algo (papel de cocina…)" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
            <button className="boton" disabled={!nuevo.trim()}>Añadir</button>
          </form>

          {grupos.map(([cat, xs]) => (
            <section key={cat}>
              <h2 className="pasillo">{cat}</h2>
              <ul className="lista-compra">{xs.map(fila)}</ul>
            </section>
          ))}
          {pendientes === 0 && normales.length > 0 && <p className="ok">🎉 Todo comprado.</p>}

          {enCasa.length > 0 && (
            <section>
              <button className="enlace" onClick={() => setVerTengo(!verTengo)}>
                🏠 Ya lo tenéis en casa ({enCasa.length}) {verTengo ? '▲' : '▼'}
              </button>
              {verTengo && (
                <>
                  <p className="suave pequeno">Desmarca lo que al final sí haya que comprar.</p>
                  <ul className="lista-compra">{enCasa.map(fila)}</ul>
                </>
              )}
            </section>
          )}

          {despensa.length > 0 && (
            <section>
              <button className="enlace" onClick={() => setVerDespensa(!verDespensa)}>
                🧂 Despensa: comprueba que tienes ({despensa.length}) {verDespensa ? '▲' : '▼'}
              </button>
              {(verDespensa || repaso) && <ul className="lista-compra">{despensa.map(fila)}</ul>}
            </section>
          )}
          <p className="suave margen-arriba">
            Las cantidades suman todos los platos y se redondean al envase. Toca 📦 para cambiar el envase de un producto. Lo que sale del congelador y los huecos «fuera de casa» no cuentan.
          </p>
        </>
      )}
      {preciosDe && (() => {
        const a = articulos.find((x) => x.id === preciosDe)
        const ing = a?.ingredient_id ? mapaIngredientes.get(a.ingredient_id) : undefined
        return a && ing ? <EditorPrecios articulo={a} ing={ing} onCerrar={() => setPreciosDe(null)} /> : null
      })()}
    </div>
  )
}

function EditorEnvase({ unidad, actual, onGuardar }: { unidad: 'g' | 'ml' | 'ud'; actual: { cantidad: number; nombre: string } | null; onGuardar: (e: { cantidad: number; nombre: string } | null) => Promise<void> }) {
  const [cantidad, setCantidad] = useState(actual?.cantidad?.toString() ?? '')
  const [nombre, setNombre] = useState(actual?.nombre ?? 'paquete')
  const n = Number(cantidad.replace(',', '.'))
  return (
    <div className="editor-envase">
      <span className="suave">Se vende en</span>
      <input className="mini-num" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="400" />
      <span>{unidad}</span>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="bandeja" />
      <button className="boton" disabled={!(n > 0)} onClick={() => onGuardar({ cantidad: n, nombre: nombre.trim() || 'envase' })}>Guardar</button>
      {actual && <span className="suave">Ahora: {fmtBase(actual.cantidad, unidad)}</span>}
    </div>
  )
}
