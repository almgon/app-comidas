import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { parsearTextoReceta, tipoDeUrl, type RecetaImportada } from '../../shared/parser.js'
import { supabase } from '../lib/supabase'
import { useDatos } from '../lib/datos'

export default function Importar() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const loc = useLocation()
  // Enlace recibido del Atajo de iOS: /importar#<enlace>, /importar?url=<enlace> o ?text=<texto con enlace>
  const entrante = useMemo(() => {
    let hash = loc.hash.replace(/^#/, '')
    try {
      hash = decodeURIComponent(hash)
    } catch {
      /* se usa tal cual */
    }
    for (const c of [hash, params.get('url'), params.get('text'), decodeURIComponent(loc.search)]) {
      const m = c?.match(/https?:\/\/\S+/)
      if (m) return m[0]
    }
    return ''
  }, [loc.hash, loc.search, params])
  const { recetas } = useDatos()
  const [modo, setModo] = useState<'link' | 'texto'>('link')
  const [url, setUrl] = useState(entrante)
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const auto = useRef(false)

  const revisar = (importada: RecetaImportada) => nav('/receta/nueva', { state: { importada } })

  async function importarLink(enlace = url) {
    const limpio = enlace.trim().match(/https?:\/\/\S+/)?.[0]
    if (!limpio) return setError('Pega un enlace que empiece por https://')
    const repetida = recetas.find((r) => r.fuente_url && r.fuente_url.split('?')[0] === limpio.split('?')[0])
    if (repetida && !confirm(`Ya tienes «${repetida.titulo}» importada desde este enlace. ¿Importarla otra vez?`)) return
    setError(null)
    setCargando(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const r = await fetch(`/api/importar?url=${encodeURIComponent(limpio)}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
      const j = await r.json().catch(() => ({ error: 'Respuesta no válida del servidor' }))
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`)
      revisar(j as RecetaImportada)
    } catch (e: any) {
      setError(e.message ?? String(e))
      // En redes sociales la alternativa natural es pegar el texto
      if (tipoDeUrl(limpio) !== 'web') setModo('texto')
    } finally {
      setCargando(false)
    }
  }

  // Desde el Atajo de iOS: /importar?url=...
  useEffect(() => {
    if (!auto.current && entrante) {
      auto.current = true
      importarLink(entrante)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pegarDelPortapapeles(dest: 'link' | 'texto') {
    try {
      const t = await navigator.clipboard.readText()
      if (dest === 'link') setUrl(t)
      else setTexto(t)
    } catch {
      setError('No se ha podido leer el portapapeles. Mantén pulsado el campo y elige «Pegar».')
    }
  }

  function importarTexto() {
    if (texto.trim().length < 10) return setError('Pega el texto de la receta')
    const enlace = url.trim().match(/https?:\/\/\S+/)?.[0] ?? null
    revisar(parsearTextoReceta(texto, { fuente_url: enlace, fuente_tipo: enlace ? tipoDeUrl(enlace) : 'texto' }))
  }

  return (
    <div>
      <header className="cabecera">
        <h1>Importar receta</h1>
      </header>
      <div className="segmentado ancho">
        <button className={modo === 'link' ? 'on' : ''} onClick={() => setModo('link')}>Desde un enlace</button>
        <button className={modo === 'texto' ? 'on' : ''} onClick={() => setModo('texto')}>Pegar texto</button>
      </div>

      {modo === 'link' ? (
        <section className="tarjeta formulario">
          <label>
            Enlace de la receta (web, Instagram o TikTok)
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </label>
          <div className="fila">
            <button className="boton" onClick={() => pegarDelPortapapeles('link')}>📋 Pegar</button>
            <button className="boton primario" disabled={cargando} onClick={() => importarLink()}>
              {cargando ? 'Leyendo…' : 'Importar'}
            </button>
          </div>
          <p className="suave">
            Webs de recetas: se leen título, ingredientes, pasos, tiempos y foto. Instagram y TikTok: se lee el texto de la publicación; si no se puede, copia el texto y usa «Pegar texto».
          </p>
        </section>
      ) : (
        <section className="tarjeta formulario">
          <label>
            Texto de la receta o descripción de la publicación
            <textarea rows={12} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'Lentejas exprés (4 raciones)\nIngredientes:\n- 400 g de lentejas cocidas\n- 1 cebolla\nPreparación:\n1. Sofríe la cebolla…'} />
          </label>
          <label>
            Enlace de origen (opcional)
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/…" />
          </label>
          <div className="fila">
            <button className="boton" onClick={() => pegarDelPortapapeles('texto')}>📋 Pegar</button>
            <button className="boton primario" onClick={importarTexto}>Analizar texto</button>
          </div>
          <p className="suave">Separo los ingredientes (cantidad, unidad y nombre) de los pasos. Después podrás revisarlo todo.</p>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
