import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDatos } from '../lib/datos'
import { fmt } from '../lib/nutricion'
import { FRECUENCIAS_POR_DEFECTO, INFO_TIPOS, TIPOS_ALIMENTO, frecuenciasDe, type Frecuencias, type TipoAlimento } from '../lib/frecuencias'

/** Veces por semana que queréis comer cada tipo de alimento (las usa «Proponer semana») */
function SeccionFrecuencias() {
  const { hogar, guardarFrecuencias } = useDatos()
  const guardadas = frecuenciasDe(hogar)
  const [f, setF] = useState<Frecuencias>(guardadas)
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({})
  const clave = JSON.stringify(guardadas)
  useEffect(() => setF(JSON.parse(clave)), [clave])
  const cambiado = JSON.stringify(f) !== clave
  const total = TIPOS_ALIMENTO.reduce((t, x) => t + (f[x] ?? 0), 0)
  const poner = (t: TipoAlimento, v: number | null) => setF((x) => ({ ...x, [t]: v == null ? null : Math.max(0, Math.min(14, v)) }))

  async function guardar() {
    setEstado({})
    try {
      await guardarFrecuencias(f)
      setEstado({ ok: 'Guardado' })
      setTimeout(() => setEstado({}), 2000)
    } catch (e: any) {
      setEstado({ error: e.message })
    }
  }

  return (
    <section className="tarjeta formulario" id="frecuencias">
      <h2>Veces por semana de cada alimento</h2>
      <p className="suave">
        Cuántas comidas y cenas a la semana queréis de cada cosa. «Proponer semana» intenta acercarse a estas veces. El tipo de cada receta sale de sus ingredientes (el que más pesa); el desayuno no cuenta.
      </p>
      <div className="frecuencias">
        {TIPOS_ALIMENTO.map((t) => {
          const v = f[t]
          return (
            <div key={t} className="frecuencia">
              <div>
                {INFO_TIPOS[t].emoji} {INFO_TIPOS[t].etiqueta}
                <small>{INFO_TIPOS[t].ejemplos}</small>
              </div>
              <div className="contador">
                <button type="button" onClick={() => poner(t, (v ?? 0) - 1)} disabled={v == null || v <= 0} aria-label={`Menos ${INFO_TIPOS[t].etiqueta}`}>−</button>
                <button type="button" className="sin-boton" onClick={() => poner(t, v == null ? FRECUENCIAS_POR_DEFECTO[t] ?? 1 : null)} title={v == null ? 'Elegir un número' : 'Pasar a «da igual»'}>
                  {v == null ? <span className="suave">da igual</span> : <b>{v}</b>}
                </button>
                <button type="button" onClick={() => poner(t, (v ?? 0) + 1)} aria-label={`Más ${INFO_TIPOS[t].etiqueta}`}>+</button>
              </div>
            </div>
          )
        })}
      </div>
      <p className={total > 14 ? 'aviso' : 'suave'}>
        Suman {total} de 14 comidas y cenas{total > 14 ? ': no caben todas, el menú se quedará corto en alguna.' : total < 14 ? `; las otras ${14 - total} quedan libres (pasta, cremas, verduras…).` : '.'} Toca el número para dejarlo en «da igual».
      </p>
      <div className="fila">
        <button className="boton primario" onClick={guardar} disabled={!cambiado}>Guardar veces</button>
        <button className="enlace" onClick={() => setF({ ...FRECUENCIAS_POR_DEFECTO })}>Valores por defecto</button>
        {estado.ok && <span className="ok">{estado.ok}</span>}
        {estado.error && <span className="error">{estado.error}</span>}
      </div>
    </section>
  )
}

export default function Ajustes() {
  const { perfil, hogar, miembros, sesion, guardarPerfil, renombrarHogar, recetas } = useDatos()
  const [nombre, setNombre] = useState(perfil?.nombre ?? '')
  const [peso, setPeso] = useState(perfil?.peso_kg?.toString() ?? '')
  const [factor, setFactor] = useState(perfil?.factor_racion?.toString() ?? '1')
  const [error, setError] = useState<string | null>(null)
  const [nombreHogar, setNombreHogar] = useState(hogar?.nombre ?? '')
  const [ok, setOk] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const origen = window.location.origin
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  async function guardar() {
    setError(null)
    const cambios = {
      nombre: nombre.trim(),
      peso_kg: peso ? Number(peso.replace(',', '.')) : null,
      factor_racion: Number(factor.replace(',', '.')) || 1,
    }
    try {
      await guardarPerfil(cambios)
    } catch (e: any) {
      setError(e.message)
      return
    }
    if (hogar && nombreHogar.trim() && nombreHogar !== hogar.nombre) await renombrarHogar(nombreHogar.trim())
    setOk('Guardado')
    setTimeout(() => setOk(null), 2000)
  }

  return (
    <div>
      <header className="cabecera">
        <h1>Ajustes</h1>
      </header>

      <section className="tarjeta formulario">
        <h2>Tu perfil</h2>
        <p className="suave">{sesion?.user.email}</p>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <div className="rejilla-2">
          <label>
            Peso (kg)
            <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
          </label>
          <label>
            Factor de ración
            <input inputMode="decimal" value={factor} onChange={(e) => setFactor(e.target.value)} />
          </label>
        </div>
        <p className="suave">El factor escala tu ración: 1 = una ración normal, 1,25 = un 25 % más. El peso solo se usa como referencia de proteína.</p>
      </section>

      <section className="tarjeta formulario">
        <h2>Hogar</h2>
        <label>
          Nombre
          <input value={nombreHogar} onChange={(e) => setNombreHogar(e.target.value)} />
        </label>
        <p>
          Miembros: {miembros.map((m) => `${m.nombre} (×${fmt(m.factor_racion, 2)})`).join(', ')}
        </p>
        <div className="codigo">
          <span className="suave">Código para que tu pareja se una</span>
          <b>{hogar?.codigo_invitacion}</b>
          <button
            className="boton"
            onClick={() => {
              navigator.clipboard?.writeText(hogar?.codigo_invitacion ?? '')
              setCopiado(true)
            }}
          >
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="suave">{recetas.length} recetas compartidas. Los cambios se ven al instante en los dos móviles.</p>
      </section>

      <div className="fila">
        <button className="boton primario" onClick={guardar}>Guardar cambios</button>
        {ok && <span className="ok">{ok}</span>}
        {error && <span className="error">{error}</span>}
      </div>

      <SeccionFrecuencias />

      <section className="tarjeta">
        <h2>Catálogo de ingredientes</h2>
        <p className="suave">Kcal, proteína, hidratos y grasa de cada ingrediente (para las kcal y macros de cada receta) y su producto de Mercadona (para el precio).</p>
        <div className="fila">
          <Link className="boton" to="/ingredientes">Ver y editar ingredientes</Link>
          <Link className="boton" to="/mercadona">🛒 Productos de Mercadona</Link>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Instalar en el iPhone</h2>
        <ol>
          <li>Abre esta web en <b>Safari</b>.</li>
          <li>Pulsa el botón Compartir (cuadrado con flecha).</li>
          <li>Elige «Añadir a pantalla de inicio».</li>
        </ol>
      </section>

      <section className="tarjeta">
        <h2>Importar desde el menú Compartir (Atajo de iOS)</h2>
        <p className="suave">Safari no deja que una web aparezca en «Compartir», pero un Atajo sí:</p>
        <ol>
          <li>Abre la app Atajos y crea un atajo nuevo.</li>
          <li>En sus detalles (ⓘ) activa «Mostrar en hoja de compartir» y, arriba, deja solo «URL» y «Texto».</li>
          <li>Añade solo la acción «Abrir URL». En su campo escribe esta dirección (con la # al final) y, pegada detrás, la variable «Entrada del atajo»:</li>
        </ol>
        <code className="bloque">{origen}/importar#</code>
        <p className="suave">
          Llámalo «Guardar receta». Desde Instagram, TikTok o Safari: Compartir → Guardar receta. Se abre en Safari, así que inicia sesión allí también la primera vez. Alternativa sin atajo: copia el enlace y pulsa «Pegar» en Importar.
        </p>
      </section>

      <button className="boton peligro" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </div>
  )
}
