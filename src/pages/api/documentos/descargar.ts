import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return redirect('/login')

  const storagePath = url.searchParams.get('path') ?? ''
  if (!storagePath) return new Response('Path requerido', { status: 400 })

  const db = getSupabase(token)
  const { data, error } = await db.storage
    .from('documentos')
    .createSignedUrl(storagePath, 120) // válida 2 minutos

  if (error || !data?.signedUrl) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:2rem">
        <h2>Archivo no disponible</h2>
        <p>El PDF todavia no fue generado o no se pudo subir al storage.</p>
        <p><a href="javascript:history.back()">&larr; Volver</a></p>
      </body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  return redirect(data.signedUrl)
}
