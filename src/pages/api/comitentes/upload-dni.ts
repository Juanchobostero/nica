import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const isAjax = request.headers.get('X-Requested-With') === 'fetch'
  const fail = (status: number, warn: string, expedienteId: string) =>
    isAjax
      ? new Response(JSON.stringify({ ok: false, warn }), { status, headers: { 'Content-Type': 'application/json' } })
      : redirect(`/expedientes/${expedienteId}?tab=comitente&warn=${warn}`)

  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return isAjax ? new Response(JSON.stringify({ ok: false, warn: 'no_auth' }), { status: 401 }) : redirect('/login')

  const db = getSupabase(token)
  const form = await request.formData()
  const comitenteId  = form.get('comitente_id') as string
  const expedienteId = form.get('expediente_id') as string
  const file         = form.get('archivo') as File
  const lado         = (form.get('lado') as string) === 'dorso' ? 'dorso' : 'frente'

  if (!file || file.size === 0 || !comitenteId) {
    return fail(400, 'archivo_requerido', expedienteId)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  if (!['jpg','jpeg','png','pdf'].includes(ext)) {
    return fail(400, 'formato_invalido', expedienteId)
  }

  const storagePath = `dni/${comitenteId}/dni_${lado}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await db.storage
    .from('documentos')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (uploadError) {
    return fail(500, 'error_storage', expedienteId)
  }

  const columna = lado === 'dorso' ? 'dni_scan_path_dorso' : 'dni_scan_path'
  await db.from('comitentes').update({ [columna]: storagePath }).eq('id', comitenteId)

  if (isAjax) {
    return new Response(JSON.stringify({ ok: true, path: storagePath }), { headers: { 'Content-Type': 'application/json' } })
  }
  return redirect(`/expedientes/${expedienteId}?tab=comitente&ok=1`)
}
