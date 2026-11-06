import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase autenticado. La publishable/anon key sólo identifica la
 * aplicación; RLS y los RPC del backend autorizan cada operación con la sesión
 * activa. La sesión se persiste y refresca automáticamente en el navegador.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
