import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.PUBLIC_SUPABASE_URL
const ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

// autoRefreshToken/persistSession apagados a propósito: este cliente corre en el servidor y es
// un singleton compartido entre requests de usuarios distintos (login.astro lo usa para
// signInWithPassword, y todas las páginas protegidas para validar el token de la cookie). Los
// defaults del SDK están pensados para un solo usuario en un browser — con ellos prendidos,
// cada login exitoso deja una sesión guardada ADENTRO de este cliente compartido y arranca un
// timer de auto-refresh en segundo plano que nunca se apaga (el cliente nunca se destruye).
// Ese timer termina reintentando refrescar un token de otro usuario ya vencido, en loop (los
// "GET /user 403 token expired" repetidos), y como el SDK serializa las operaciones de auth con
// un lock interno, un login nuevo puede quedarse esperando ese lock para siempre — el request
// que nunca resuelve. Acá los tokens ya se manejan a mano (cookies httpOnly + el `token` que se
// pasa explícitamente a cada supabase.auth.getUser(token)), así que el SDK no necesita guardar
// ni refrescar ninguna sesión por su cuenta.
export const supabase = createClient(URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Cliente autenticado: envía el JWT del usuario en cada request → activa RLS correctamente.
// Mismo motivo que arriba: se crea uno nuevo por request, no hace falta que guarde ni refresque
// sesión propia.
export function getSupabase(accessToken: string) {
  return createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}
