import { useEffect, useState } from 'react'
import { useMenu } from '../lib/menu'
import { DIAS_PRECIO_ANTIGUO, euros, precioArticulo } from '../lib/precios'
import { fmtBase } from '../lib/cantidades'
import type { ArticuloCompra, Ingrediente, ProductoTienda, Tienda } from '../lib/tipos'

const antiguedad = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

/** Enlazar un ingrediente con su producto de Mercadona y corregir el precio a mano si hace falta */
export default function EditorPrecios({ articulo, ing, onCerrar }: { articulo: ArticuloCompra; ing: Ingrediente; onCerrar: () => void }) {
  const { enlaces } = useMenu()
  const actuales = enlaces.get(ing.id) ?? {}
  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" onClick={(e) => e.stopPropagation()}>
        <div className="fila espacio">
          <h2>💶 {ing.nombre}</h2>
          <button className="enlace" onClick={onCerrar}>Cerrar</button>
        </div>
        {articulo.cantidad != null && <p className="suave">Hace falta: {fmtBase(articulo.cantidad, (articulo.unidad as 'g' | 'ml' | 'ud') ?? ing.unidad_base)}</p>}
        <TiendaProducto tienda="mercadona" nombreTienda="Mercadona" articulo={articulo} ing={ing} actual={actuales.mercadona} />
      </div>
    </div>
  )
}

function TiendaProducto({ tienda, nombreTienda, articulo, ing, actual }: { tienda: Tienda; nombreTienda: string; articulo: ArticuloCompra; ing: Ingrediente; actual?: ProductoTienda }) {
  const { enlazar, guardarProducto, buscarProductos } = useMenu()
  const [modo, setModo] = useState<'ver' | 'buscar' | 'manual'>(actual ? 'ver' : 'buscar')
  const [q, setQ] = useState(ing.nombre)
  const [res, setRes] = useState<ProductoTienda[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [precioNuevo, setPrecioNuevo] = useState('')

  useEffect(() => {
    if (modo !== 'buscar' || q.trim().length < 2) return
    const t = window.setTimeout(() => {
      buscarProductos(tienda, q)
        .then((r) => {
          setRes(r)
          setError(null)
        })
        .catch((e) => setError(e.message))
    }, 350)
    return () => window.clearTimeout(t)
  }, [modo, q, tienda, buscarProductos])

  const p = actual ? precioArticulo(articulo, ing, actual) : null
  const dias = actual ? antiguedad(actual.actualizado_en) : 0

  async function elegir(prod: ProductoTienda) {
    try {
      await enlazar(ing.id, tienda, prod.id)
      setModo('ver')
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <section className={`tienda-producto t-${tienda}`}>
      <h3>{nombreTienda}</h3>
      {error && <p className="error">{error}</p>}
      {modo === 'ver' && actual && (
        <>
          <p>
            <b>{actual.nombre}</b>
            <br />
            <span className="suave">
              {actual.envase_texto || (actual.envase_cantidad ? fmtBase(actual.envase_cantidad, actual.envase_unidad) : 'envase sin tamaño')} · {euros(actual.precio)}
              {actual.precio_referencia ? ` (${euros(actual.precio_referencia)}/${actual.formato_referencia ?? actual.envase_unidad})` : ''}
            </span>
          </p>
          {p && <p>Para esta semana: {p.envases} × {euros(actual.precio)} = <b>{euros(p.coste)}</b></p>}
          <p className={dias > DIAS_PRECIO_ANTIGUO ? 'aviso' : 'suave'}>
            Precio {actual.origen === 'auto' ? 'automático' : 'puesto a mano'} de hace {dias} día{dias === 1 ? '' : 's'}
            {dias > DIAS_PRECIO_ANTIGUO ? ': puede haber cambiado' : ''}.
          </p>
          <div className="fila">
            <input inputMode="decimal" placeholder="Precio nuevo €" value={precioNuevo} onChange={(e) => setPrecioNuevo(e.target.value)} />
            <button
              className="boton"
              disabled={!(Number(precioNuevo.replace(',', '.')) > 0)}
              onClick={async () => {
                const precio = Number(precioNuevo.replace(',', '.'))
                try {
                  if (actual.household_id) await guardarProducto({ id: actual.id, tienda, nombre: actual.nombre, precio })
                  else {
                    // Producto del catálogo automático: se crea una copia propia con el precio corregido
                    const id = await guardarProducto({ ...sinId(actual), tienda, nombre: actual.nombre, precio })
                    await enlazar(ing.id, tienda, id)
                  }
                  setPrecioNuevo('')
                } catch (e: any) {
                  setError(e.message)
                }
              }}
            >
              Corregir
            </button>
          </div>
          <div className="fila">
            <button className="enlace" onClick={() => setModo('buscar')}>Cambiar producto</button>
            <button className="enlace peligro" onClick={() => enlazar(ing.id, tienda, null)}>Quitar</button>
          </div>
        </>
      )}
      {modo === 'buscar' && (
        <>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${nombreTienda}…`} />
          {res && res.length === 0 && (
            <p className="suave">
              No hay resultados. Si todavía no se ha ejecutado la actualización de precios de Mercadona, añádelo a mano.
            </p>
          )}
          <ul className="resultados-off">
            {(res ?? []).map((r) => (
              <li key={r.id}>
                <button onClick={() => elegir(r)}>
                  <b>{r.nombre}</b>
                  <span className="suave">
                    {r.envase_texto || (r.envase_cantidad ? fmtBase(r.envase_cantidad, r.envase_unidad) : '')} · {euros(r.precio)}
                    {r.precio_referencia ? ` · ${euros(r.precio_referencia)}/${r.formato_referencia ?? ''}` : ''}
                    {r.household_id ? ' · a mano' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="fila">
            <button className="enlace" onClick={() => setModo('manual')}>+ Añadir producto a mano</button>
            {actual && <button className="enlace" onClick={() => setModo('ver')}>Cancelar</button>}
          </div>
        </>
      )}
      {modo === 'manual' && (
        <ProductoManual
          tienda={tienda}
          ing={ing}
          onGuardado={async (id) => {
            await enlazar(ing.id, tienda, id)
            setModo('ver')
          }}
          onCancelar={() => setModo('buscar')}
        />
      )}
    </section>
  )
}

const sinId = ({ id: _i, id_externo: _e, household_id: _h, actualizado_en: _a, origen: _o, ...resto }: ProductoTienda) => resto

function ProductoManual({ tienda, ing, onGuardado, onCancelar }: { tienda: Tienda; ing: Ingrediente; onGuardado: (id: string) => Promise<void>; onCancelar: () => void }) {
  const { guardarProducto } = useMenu()
  const [nombre, setNombre] = useState(ing.nombre)
  const [cantidad, setCantidad] = useState(ing.envase_cantidad?.toString() ?? '')
  const [unidad, setUnidad] = useState<'g' | 'ml' | 'ud'>(ing.unidad_base)
  const [precio, setPrecio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const n = (s: string) => Number(s.replace(',', '.'))
  return (
    <div className="formulario">
      <label>
        Nombre del producto
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div className="rejilla-3">
        <label>
          Envase
          <input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="500" />
        </label>
        <label>
          Unidad
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as 'g' | 'ml' | 'ud')}>
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="ud">ud</option>
          </select>
        </label>
        <label>
          Precio €
          <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="2,35" />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="fila">
        <button
          className="boton primario"
          disabled={!nombre.trim() || !(n(precio) > 0)}
          onClick={async () => {
            try {
              const id = await guardarProducto({
                tienda, nombre: nombre.trim(), envase_cantidad: n(cantidad) > 0 ? n(cantidad) : null, envase_unidad: unidad, precio: n(precio),
                url: null, envase_texto: n(cantidad) > 0 ? fmtBase(n(cantidad), unidad) : null,
              })
              await onGuardado(id)
            } catch (e: any) {
              setError(e.message)
            }
          }}
        >
          Guardar
        </button>
        <button className="enlace" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
