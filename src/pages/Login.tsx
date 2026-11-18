import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar')
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setAviso(null)
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: clave })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: clave, options: { data: { nombre } } })
        if (error) throw error
        if (!data.session) {
          setAviso('Te hemos enviado un email para confirmar la cuenta. Ábrelo y después vuelve aquí para entrar.')
          setModo('entrar')
        }
      }
    } catch (err: any) {
      const m = String(err?.message ?? err)
      setError(
        m.includes('Invalid login') ? 'Email o contraseña incorrectos'
        : m.includes('Email not confirmed') ? 'Falta confirmar el email (revisa tu correo)'
        : m.includes('already registered') ? 'Ese email ya tiene cuenta: entra con tu contraseña'
        : m.includes('at least 6') ? 'La contraseña debe tener al menos 6 caracteres'
        : m,
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pantalla-centro">
      <div className="tarjeta login">
        <div className="logo">🥘</div>
        <h1>Comidas</h1>
        <p className="suave">Vuestro recetario y plan de comidas</p>
        <form onSubmit={enviar} className="formulario">
          {modo === 'registro' && (
            <label>
              Tu nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="given-name" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              required
              minLength={6}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            />
          </label>
          {error && <p className="error">{error}</p>}
          {aviso && <p className="ok">{aviso}</p>}
          <button className="boton primario" disabled={enviando}>
            {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
        <button className="enlace" onClick={() => setModo(modo === 'entrar' ? 'registro' : 'entrar')}>
          {modo === 'entrar' ? '¿No tienes cuenta? Créala' : 'Ya tengo cuenta'}
        </button>
      </div>
    </div>
  )
}
