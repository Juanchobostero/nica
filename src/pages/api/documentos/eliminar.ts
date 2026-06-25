import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return new Response(JSON.stringify({ ok: false }), { status: 401 })

  const db = getSupabase(token)
  const form = await request.formData()
  const docId = form.get('documento_id') as string
  if (!docId) return new Response(JSON.stringify({ ok: false }), { status: 400 })

  const { data: docRow } = await db.from('documentos_generados').select('storage_path').eq('id', docId).maybeSingle()
  if (docRow?.storage_path) {
    await db.storage.from('documentos').remove([docRow.storage_path])
  }
  await db.from('documentos_generados').delete().eq('id', docId)

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}
