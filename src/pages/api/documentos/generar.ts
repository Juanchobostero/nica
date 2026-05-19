import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const DOC_LABELS: Record<string, string> = {
  nota_elevacion:    'Nota de Elevación',
  capitulo_ubicacion: 'Capítulo Ubicación / Extensión / Límites',
  acta_mensura:      'Acta de Mensura y Amojonamiento',
  citacion_linderos: 'Citación a Linderos',
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return redirect('/login')

  const db = getSupabase(token)
  const form = await request.formData()
  const expedienteId = form.get('expediente_id') as string
  const tipos = form.getAll('tipos[]') as string[]

  if (!tipos.length) {
    return redirect(`/expedientes/${expedienteId}?tab=documentos&warn=sin_seleccion`)
  }

  const { data: exp } = await db
    .from('expedientes')
    .select('numero_expediente, tipo_mensura')
    .eq('id', expedienteId)
    .single()

  for (const tipo of tipos) {
    const pdfDoc  = await PDFDocument.create()
    const page    = pdfDoc.addPage([595.28, 841.89]) // A4
    const font    = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const { width, height } = page.getSize()

    const azul   = rgb(0.106, 0.180, 0.369)
    const gris   = rgb(0.42, 0.45, 0.50)
    const negro  = rgb(0.10, 0.10, 0.10)

    // Franja superior
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: azul })

    page.drawText('NICA', {
      x: 40, y: height - 48, size: 28, font: bold, color: rgb(1,1,1),
    })
    page.drawText('Sistema de Gestión de Mensuras', {
      x: 40, y: height - 68, size: 9, font, color: rgb(0.8,0.85,0.95),
    })

    // Título del documento
    const label = DOC_LABELS[tipo] ?? tipo.replace(/_/g, ' ')
    page.drawText(label.toUpperCase(), {
      x: 40, y: height - 130, size: 16, font: bold, color: azul,
    })

    // Línea separadora
    page.drawLine({
      start: { x: 40, y: height - 145 },
      end:   { x: width - 40, y: height - 145 },
      thickness: 1, color: rgb(0.88, 0.91, 0.95),
    })

    // Datos del expediente
    const datos = [
      ['Expediente Nº',  exp?.numero_expediente ?? '—'],
      ['Tipo de mensura', exp?.tipo_mensura ?? '—'],
      ['Fecha',          new Date().toLocaleDateString('es-AR')],
    ]
    datos.forEach(([clave, valor], i) => {
      const y = height - 185 - i * 30
      page.drawText(clave + ':', { x: 40, y, size: 10, font: bold, color: gris })
      page.drawText(valor,       { x: 180, y, size: 10, font, color: negro })
    })

    // Cuerpo placeholder
    page.drawText(
      'Este documento se encuentra en proceso de elaboración.',
      { x: 40, y: height - 320, size: 11, font, color: negro }
    )
    page.drawText(
      'El contenido definitivo se completará con los datos del expediente.',
      { x: 40, y: height - 340, size: 11, font, color: negro }
    )

    // Pie de página
    page.drawLine({
      start: { x: 40, y: 60 }, end: { x: width - 40, y: 60 },
      thickness: 1, color: rgb(0.88, 0.91, 0.95),
    })
    page.drawText(
      `Generado por NICA · ${new Date().toLocaleString('es-AR')}`,
      { x: 40, y: 42, size: 8, font, color: gris }
    )

    const pdfBytes = await pdfDoc.save()
    const storagePath = `${expedienteId}/${tipo}_${Date.now()}.pdf`

    const { error: uploadError } = await db.storage
      .from('documentos')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })

    // Registrar en BD aunque falle el storage (para no perder el intento)
    await db.from('documentos_generados').insert({
      expediente_id: expedienteId,
      tipo_documento: tipo,
      storage_path: uploadError ? null : storagePath,
      estado: uploadError ? 'error_storage' : 'generado',
      generado_at: new Date().toISOString(),
    })
  }

  return redirect(`/expedientes/${expedienteId}?tab=documentos&ok=1`)
}
