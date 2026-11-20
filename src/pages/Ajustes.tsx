import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDatos } from '../lib/datos'
import { fmt } from '../lib/nutricion'
import { KCAL_POR_KG, objetivosPersona } from '../lib/tipos'

export default function Ajustes() {
  const { perfil, hogar, miembros, sesion, guardarPerfil, renombrarHogar, recetas } = useDatos()
  const [nombre, setNombre] = useState(perfil?.nombre ?? '')
  const [peso, setPeso] = useState(perfil?.peso_kg?.toString() ?? '')
  const [factor, setFactor] = useState(perfil?.factor_racion?.toString() ?? '1')
  const [kcal, setKcal] = useState(perfil?.kcal_objetivo?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [nombreHogar, setNombreHogar] = useState(hogar?.nombre ?? '')
  const [ok, setOk] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const origen = window.location.origin

  async function guardar() {
    setError(null)
    const k = Math.round(Number(kcal.replace(',', '.')))
    const cambios = {
      nombre: nombre.trim(),
      peso_kg: peso ? Number(peso.replace(',', '.')) : null,
      factor_racion: Number(factor.replace(',', '.')) || 1,
      ...(kcal.trim() || perfil?.kcal_objetivo != null ? { kcal_objetivo: kcal.trim() && k >= 800 && k <= 6000 ? k : null } : {}),
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
        <p className="suave">El factor escala tu ración: 1 = una ración normal, 1,25 = un 25 % más.</p>
        <label>
          Objetivo de kcal al día (opcional)
          <input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder={peso ? `Estimado: ${fmt(objetivosPersona(Number(peso.replace(',', '.'))).kcal)} kcal` : 'kcal'} />
        </label>
        {peso && (() => {
          const o = objetivosPersona(Number(peso.replace(',', '.')), kcal.trim() ? Number(kcal) : null)
          return (
            <p className="suave">
              Objetivos diarios: <b>{fmt(o.kcal)} kcal</b> · proteína {o.protMin}-{o.protMax} g (1,2-1,6 g/kg) · hidratos {o.hcMin}-{o.hcMax} g (45-60 %) · grasa {o.grasaMin}-{o.grasaMax} g (20-35 %).
              {!kcal.trim() && ` Las kcal se estiman con ${KCAL_POR_KG} kcal por kg (adulto que entrena 3-4 días por semana); si sabes las tuyas, ponlas arriba.`}
            </p>
          )
        })()}
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
