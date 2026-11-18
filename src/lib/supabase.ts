import { createClient } from '@supabase/supabase-js'

// Se queda solo con https://xxxx.supabase.co aunque se pegue con /rest/v1/ u otra ruta al final
function soloOrigen(u: string | undefined): string | undefined {
  if (!u) return undefined
  try {
    return new URL(u.trim()).origin
  } catch {
    return undefined
  }
}

const url = soloOrigen(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const supabaseConfigurado = Boolean(url && anon)

export const supabase = createClient(url ?? 'https://sin-configurar.supabase.co', anon ?? 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
