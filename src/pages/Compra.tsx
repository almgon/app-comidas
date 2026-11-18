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
import { comparar, euros } from '../lib/precios'
import { TIENDAS, type Tienda } from '../lib/tipos'

export default function Compra() {
  const [lunes, setLunes] = useSemanaElegida()
  const { mapaRecetas, mapaIngredientes, miembros, sesion, hogar } = useDatos()
  const { desayunos, congelados, envases, guardarEnvase, enlaces } = useMenu()
  const comensales = useComensales()
  const semana = useSemana(lunes)
  const [ocultar, setOcultar] = useState(false)
  const [verDespensa, setVerDespensa] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [generando, setGenerando] = useState(false)
  const [envaseDe, setEnvaseDe] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preciosDe, setPreciosDe] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'todo' | Tienda>('todo')

  const necesidades = useMemo(() => {
    const batch = sesionDomingo(lunes, semana.entradas, mapaRecetas, semana.plan?.batch ?? {}, congelados)
    return calcularCompra({ lunes, entradas: semana.entradas, recetas: mapaRecetas, ingredientes: mapaIngredientes, batch, desayunos, comensales, envases })
  }, [lunes, semana.entradas, semana.plan, mapaRecetas, mapaIngredientes, congelados, desayunos, comensales, envases])

  // ¿La lista guardada coincide con lo que pide el menú ahora?
  const desfasada = useMemo(() => {
    if (!semana.lista) return false
    const firma = (xs: { clave: string; cantidad: number | null; detalle: string | null }[]) => xs.map((x) => `${x.clave}=${x.cantidad ?? ''}|${x.detalle ?? ''}`).sort().join(';')
    const guardados = semana.articulos.filter((a) => !a.manual).map((a) => ({ clave: claveArticulo(a), cantidad: a.cantidad, detalle: a.detalle }))
    return firma(guardados) !== firma(necesidades)
  }, [semana.lista, semana.articulos, necesidades])

  const umbral = Number(hogar?.umbral_ahorro ?? 3)
  const cmp = useMemo(() => comparar(semana.articulos, mapaIngredientes, enlaces, umbral), [semana.articulos, mapaIngredientes, enlaces, umbral])
  const hayPrecios = cmp.totalMercadona > 0 || cmp.totalDia > 0
  const nombre = (uid: string | null) => miembros.find((m) => m.id === uid)?.nombre
  const articulos = semana.articulos
  const normales = articulos.filter((a) => !a.es_despensa)
  const despensa = articulos.filter((a) => a.es_despensa)
  const pendientes = normales.filter((a) => !a.comprado).length
  const grupos = useMemo(() => {
    const m = new Map<string, ArticuloCompra[]>()
    for (const a of normales) if ((!ocultar || !a.comprado) && (pestana === 'todo' || (cmp.asignacion.get(a.id) ?? pestana) === pestana)) m.set(a.categoria, [...(m.get(a.categoria) ?? []), a])
    return [...m].sort((a, b) => ordenPasillo(a[0]) - ordenPasillo(b[0]))
  }, [normales, ocultar, pestana, cmp])

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

  const fila = (a: ArticuloCompra) => {
    const ing = a.ingredient_id ? mapaIngredientes.get(a.ingredient_id) : undefined
    const quien = a.comprado && a.comprado_por !== sesion?.user.id ? nombre(a.comprado_por) : null
    return (
      <li key={a.id} className={a.comprado ? 'comprado' : ''}>
        <label className="articulo">
          <input type="checkbox" checked={a.comprado} onChange={(e) => semana.marcar(a, e.target.checked)} />
          <span className="texto">
            <span className="nombre">
              {a.texto} {a.cantidad != null && <b>{textoCantidad(a.cantidad, a.unidad)}</b>}
            </span>
            {a.detalle && <span className="detalle">{a.detalle}</span>}
            {a.origen && <span className="origen">{a.origen}</span>}
            {quien && <span className="origen">✓ {quien}</span>}
            {hayPrecios && a.ingredient_id && (
              <span className="precios-art">
                {TIENDAS.map((t) => {
                  const p = cmp.precios.get(a.id)?.[t.valor]
                  if (!p) return null
                  const elegida = cmp.asignacion.get(a.id) === t.valor
                  return (
                    <span key={t.valor} className={`chip t-${t.valor} ${elegida ? 'elegida' : ''}`}>
                      {t.nombre} {p.envases > 1 ? `${p.envases}× ` : ''}{euros(p.coste)}
                    </span>
                  )
                })}
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
              <p>Saca la lista de la compra del menú de esta semana: desayunos, platos, sesión del domingo y fruta, sin lo que hay en el congelador.</p>
              <button className="boton primario" onClick={generar} disabled={generando}>{generando ? 'Calculando…' : '🛒 Crear lista desde el menú'}</button>
            </>
          ) : (
            <p>
              Todavía no hay menú para esta semana. <Link to={`/?semana=${lunes}`}>Prepara el menú</Link> y vuelve aquí.
            </p>
          )}
        </div>
      ) : (
        <>
          {desfasada && (
            <div className="aviso fila espacio">
              <span>El menú ha cambiado desde que se hizo la lista.</span>
              <button className="boton" onClick={generar} disabled={generando}>{generando ? '…' : 'Actualizar'}</button>
            </div>
          )}
          {hayPrecios ? (
            <section className="tarjeta comparador">
              <div className="totales">
                <div className={cmp.mejor === 'mercadona' && !cmp.dividir ? 'mejor' : ''}><span>Todo en Mercadona</span><b>{euros(cmp.totalMercadona)}</b></div>
                <div className={cmp.mejor === 'dia' && !cmp.dividir ? 'mejor' : ''}><span>Todo en Dia</span><b>{euros(cmp.totalDia)}</b></div>
                <div className={cmp.dividir ? 'mejor' : ''}><span>Mixto</span><b>{cmp.comparables ? euros(cmp.mixtoComparable + (cmp.totalMercadona - cmp.mercadonaComparable) + (cmp.totalDia - cmp.diaComparable)) : '–'}</b></div>
              </div>
              <p>
                {cmp.comparables === 0
                  ? 'Para comparar, enlaza productos de las dos tiendas (💶).'
                  : cmp.dividir
                    ? `Dividir la compra ahorra ${euros(cmp.ahorro)} (con ${cmp.comparables} productos con precio en las dos): mira las pestañas de cada tienda.`
                    : `Dividir solo ahorraría ${euros(cmp.ahorro)} (menos de ${euros(umbral)}): mejor todo en ${cmp.mejor === 'dia' ? 'Dia' : 'Mercadona'}.`}
              </p>
              <p className="suave">
                {cmp.comparables} productos comparables · {cmp.sinPrecio} sin precio
                {cmp.antiguos > 0 && <span className="aviso-mini"> · {cmp.antiguos} precios de hace más de 14 días</span>}
              </p>
              {cmp.dividir && (
                <div className="segmentado">
                  <button className={pestana === 'todo' ? 'on' : ''} onClick={() => setPestana('todo')}>Todo</button>
                  {TIENDAS.map((t) => (
                    <button key={t.valor} className={pestana === t.valor ? 'on' : ''} onClick={() => setPestana(t.valor)}>
                      {t.nombre} ({normales.filter((a) => cmp.asignacion.get(a.id) === t.valor && !a.comprado).length})
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <p className="suave margen-arriba">💶 Toca el euro de un producto para enlazarlo con Mercadona y Dia y ver cuánto cuesta la compra en cada una.</p>
          )}
          <div className="fila espacio margen-arriba">
            <label className="check">
              <input type="checkbox" checked={ocultar} onChange={(e) => setOcultar(e.target.checked)} /> Ocultar lo comprado
            </label>
            {!desfasada && <button className="enlace" onClick={generar} disabled={generando}>Recalcular</button>}
          </div>
          <form
            className="fila margen-arriba"
            onSubmit={async (e) => {
              e.preventDefault()
              await semana.anadirArticulo(nuevo)
              setNuevo('')
            }}
          >
            <input placeholder="Añadir algo (papel de cocina…)" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
            <button className="boton" disabled={!nuevo.trim()}>Añadir</button>
          </form>

          {pestana !== 'todo' && cmp.dividir && <p className="suave">Los productos sin precio en ninguna tienda salen en las dos pestañas.</p>}
          {grupos.map(([cat, xs]) => (
            <section key={cat}>
              <h2 className="pasillo">{cat}</h2>
              <ul className="lista-compra">{xs.map(fila)}</ul>
            </section>
          ))}
          {pendientes === 0 && normales.length > 0 && <p className="ok">🎉 Todo comprado.</p>}

          {despensa.length > 0 && (
            <section>
              <button className="enlace" onClick={() => setVerDespensa(!verDespensa)}>
                🧂 Despensa: comprueba que tienes ({despensa.length}) {verDespensa ? '▲' : '▼'}
              </button>
              {verDespensa && <ul className="lista-compra">{despensa.map(fila)}</ul>}
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
