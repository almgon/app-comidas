import type { VercelRequest } from '@vercel/node'

/** Comprueba que la petición trae la sesión de un usuario de Supabase */
export async function usuarioValido(req: VercelRequest): Promise<boolean> {
  const baseRaw = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const base = baseRaw ? new URL(baseRaw.trim()).origin : undefined
  const anon = (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY)?.trim()
  if (!base || !anon) return true // sin configurar: no se comprueba (desarrollo local)
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` } })
  return r.ok
}
