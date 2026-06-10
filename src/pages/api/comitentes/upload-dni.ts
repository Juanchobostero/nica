import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return redirect('/login')

  const db = getSupabase(token)
  const form = await request.formData()
  const comitenteId  = form.get('comitente_id') as string
  const expedienteId = form.get('expediente_id') as string
  const file         = form.get('archivo') as File

  if (!file || file.size === 0 || !comitenteId) {
    return redirect(`/expedientes/${expedienteId}?tab=comitente&warn=archivo_requerido`)
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  if (!['jpg','jpeg','png','pdf'].includes(ext)) {
    return redirect(`/expedientes/${expedienteId}?tab=comitente&warn=formato_invalido`)
  }

  const storagePath = `dni/${comitenteId}/dni.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await db.storage
    .from('documentos')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true })

  if (!uploadError) {
    await db.from('comitentes')
      .update({ dni_scan_path: storagePath })
      .eq('id', comitenteId)
  }

  return redirect(`/expedientes/${expedienteId}?tab=comitente&ok=1`)
}
