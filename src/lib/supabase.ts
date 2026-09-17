import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.PUBLIC_SUPABASE_URL
const ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

// Ya no hay un cliente único a nivel de módulo (`export const supabase = ...`) — apagar
// autoRefreshToken/persistSession no alcanzaba. El SDK sigue serializando con un lock interno
// las operaciones de auth (getUser, signInWithPassword) hechas sobre UN MISMO cliente: con
// varios usuarios/pestañas pegándole al mismo singleton compartido en el servidor, cada
// operación se ponía en fila detrás de la anterior en vez de correr en paralelo — eso era lo que
// causaba logueos que tardaban 30-90 segundos en vez de ser instantáneos (confirmado con los
// logs de Vercel: el POST a /login sí devolvía 302 enseguida en algunos casos, pero el GET a
// /dashboard que le seguía tardaba casi un minuto y medio en resolver).
// Cada request crea ahora su propio cliente, sin nada compartido entre ellos — mismo criterio
// que ya usaba getSupabase() de acá abajo, aplicado también al cliente "sin autenticar" que usa
// el login y cada página protegida para validar el token de la cookie.
export function getSupabaseAnon() {
  return createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Cliente autenticado: envía el JWT del usuario en cada request → activa RLS correctamente.
export function getSupabase(accessToken: string) {
  return createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

// Cliente con la service role key — SOLO se usa en el módulo de administración (`/admin`), para
// las operaciones de `auth.admin.*` (crear/listar/banear usuarios) que la anon key no puede hacer.
// La key vive en `SUPABASE_SERVICE_ROLE_KEY` (sin prefijo PUBLIC_, nunca llega al cliente) — cada
// llamada crea su propio cliente, mismo criterio que los de arriba, sin nada compartido entre requests.
export function getSupabaseAdmin() {
  const SERVICE_ROLE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  return createClient(URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
