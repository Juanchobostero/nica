import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.PUBLIC_SUPABASE_URL
const ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(URL, ANON_KEY)

// Cliente autenticado: envía el JWT del usuario en cada request → activa RLS correctamente
export function getSupabase(accessToken: string) {
  return createClient(URL, ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}
