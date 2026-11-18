import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useDatos } from '../lib/datos'

export default function Hogar() {
  const { recargar, perfil } = useDatos()
  const [nombre, setNombre] = useState('Casa')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function ejecutar(fn: () => PromiseLike<{ error: any }>) {
    setError(null)
    setEnviando(true)
    const { error } = await fn()
    setEnviando(false)
    if (error) setError(error.message.includes('no válido') ? 'Ese código no existe. Revísalo.' : error.message)
    else await recargar()
  }

  return (
    <div className="pantalla-centro">
      <div className="tarjeta login">
        <h1>Hola{perfil?.nombre ? `, ${perfil.nombre}` : ''} 👋</h1>
        <p>Las recetas se comparten dentro de un <b>hogar</b>. Uno de los dos lo crea y el otro se une con el código.</p>

        <h2>Crear un hogar</h2>
        <div className="fila">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del hogar" />
          <button className="boton primario" disabled={enviando} onClick={() => ejecutar(() => supabase.rpc('crear_hogar', { p_nombre: nombre }))}>
            Crear
          </button>
        </div>

        <h2>Unirme con un código</h2>
        <div className="fila">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ej. 4F7A2C" maxLength={6} />
          <button className="boton" disabled={enviando || codigo.length < 6} onClick={() => ejecutar(() => supabase.rpc('unirse_hogar', { p_codigo: codigo }))}>
            Unirme
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="enlace" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
