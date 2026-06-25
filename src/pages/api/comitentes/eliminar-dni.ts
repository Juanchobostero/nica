import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return new Response(JSON.stringify({ ok: false }), { status: 401 })

  const db = getSupabase(token)
  const form = await request.formData()
  const comitenteId = form.get('comitente_id') as string
  const lado = (form.get('lado') as string) === 'dorso' ? 'dorso' : 'frente'

  if (!comitenteId) {
    return new Response(JSON.stringify({ ok: false }), { status: 400 })
  }

  const columna = lado === 'dorso' ? 'dni_scan_path_dorso' : 'dni_scan_path'

  const { data: comitente } = await db.from('comitentes').select(columna).eq('id', comitenteId).single()
  const path = (comitente as any)?.[columna] as string | undefined

  if (path) {
    await db.storage.from('documentos').remove([path])
  }
  await db.from('comitentes').update({ [columna]: null }).eq('id', comitenteId)

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}
