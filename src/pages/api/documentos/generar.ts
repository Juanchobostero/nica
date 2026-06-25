import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib'

const DOC_LABELS: Record<string, string> = {
  // Contenido básico
  caratula:                 'Carátula',
  nota_elevacion:           'Nota de Elevación a la Directora',
  documento_identidad:      'Fotocopia del DNI del/los Comitente/s',
  capitulo_ubicacion:       'Capítulo de Extensión, Límites e Inscripciones',
  citacion_linderos:        'Notificación a Linderos y Autoridades',
  acta_mensura:             'Acta de Mensura y Amojonamiento',
  acta_ausencia_linderos:   'Acta de Ausencia de Linderos y Autoridades',
  acta_ausencia_judicial:   'Acta de Ausencia de Autoridad Judicial',
  memoria_mensura:          'Memoria de Mensura',
  planilla_calculos:        'Planilla de Cálculos',
  // Declaraciones juradas
  formulario_u:             'Formulario "U" — Declaración Jurada (Urbano)',
  formulario_sor:           'Formulario "SOR" — Declaración Jurada (Suburbano/Rural)',
  formulario_e1:            'Formulario "E1" — Declaración Jurada (Con Construcciones)',
}

// Centra una línea de texto horizontalmente dentro del ancho de página
function dibujarCentrado(page: PDFPage, texto: string, y: number, size: number, font: PDFFont, color: any, pageWidth: number) {
  const w = font.widthOfTextAtSize(texto, size)
  page.drawText(texto, { x: (pageWidth - w) / 2, y, size, font, color })
}

// Parte un texto largo en líneas que entren dentro de maxWidth
function partirEnLineas(texto: string, maxWidth: number, size: number, font: PDFFont): string[] {
  const palabras = texto.replace(/\r?\n/g, ' ').split(' ').filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (font.widthOfTextAtSize(prueba, size) > maxWidth && actual) {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

// Encabezado: caja negra a todo el ancho con Objeto/Comitente/Ubicación/Profesional (con wrap automático) + línea de contacto
function dibujarEncabezado(
  page: PDFPage, width: number, height: number,
  fonts: { font: PDFFont; bold: PDFFont },
  datos: { objeto: string; comitente: string; ubicacion: string; profesional: string; email?: string; telefono?: string },
) {
  const { font, bold } = fonts
  const negroFondo = rgb(0.08, 0.08, 0.1)
  const blanco = rgb(1, 1, 1)
  const gris   = rgb(0.42, 0.45, 0.50)
  const negro  = rgb(0.10, 0.10, 0.10)

  const margen = 30
  const cajaX = margen
  const cajaW = width - margen * 2
  const padX = 10
  const sizeFila = 7.5
  const lhFila = 10.5

  const filasTexto = [
    `OBJETO: ${datos.objeto}`,
    `COMITENTE: ${datos.comitente}`,
    `UBICACIÓN: ${datos.ubicacion}`,
    `PROFESIONAL: ${datos.profesional}`,
  ].map(t => t.toUpperCase())

  const anchoDisponible = cajaW - padX * 2
  const filasWrapped = filasTexto.map(t => partirEnLineas(t, anchoDisponible, sizeFila, bold))
  const totalLineas = filasWrapped.reduce((acc, l) => acc + l.length, 0)
  const barH = Math.max(50, totalLineas * lhFila + 14)

  const yTop = height - 14
  const cajaY = yTop - barH
  page.drawRectangle({ x: cajaX, y: cajaY, width: cajaW, height: barH, color: negroFondo })

  let cursorY = yTop - 16
  filasWrapped.forEach(lineas => {
    lineas.forEach(linea => {
      page.drawText(linea, { x: cajaX + padX, y: cursorY, size: sizeFila, font: bold, color: blanco })
      cursorY -= lhFila
    })
  })

  // Línea separadora debajo de todo el encabezado
  page.drawLine({ start: { x: margen, y: cajaY - 10 }, end: { x: width - margen, y: cajaY - 10 }, thickness: 1, color: negro })

  // Línea de contacto debajo de la franja
  const contacto = [datos.telefono ? `Celular: ${datos.telefono}` : '', datos.email ? `Correo: ${datos.email}` : '']
    .filter(Boolean).join(' – ')
  if (contacto) {
    const w = font.widthOfTextAtSize(contacto, 8)
    page.drawText(contacto, { x: (width - w) / 2, y: cajaY - 24, size: 8, font, color: gris })
  }

  return cajaY - 24 // y final del encabezado, para que el cuerpo sepa desde dónde continuar
}

// Crea una página nueva (A4) con el encabezado tipo membrete ya dibujado. Para documentos multipágina.
function crearPaginaConEncabezado(
  pdfDoc: PDFDocument,
  fonts: { font: PDFFont; bold: PDFFont },
  datosEncabezado: { objeto: string; comitente: string; ubicacion: string; profesional: string; email?: string; telefono?: string },
) {
  const page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const yEncabezadoFin = dibujarEncabezado(page, width, height, fonts, datosEncabezado)
  return { page, width, height, yEncabezadoFin }
}

// Descarga un archivo de Storage (imagen o PDF) y lo embebe escalado dentro de un recuadro.
// Si no hay archivo o falla la descarga, dibuja el recuadro vacío con un aviso.
async function dibujarArchivoEnCaja(
  pdfDoc: PDFDocument, page: PDFPage, db: any, path: string | null | undefined,
  x: number, y: number, boxW: number, boxH: number, font: PDFFont, color: any,
) {
  page.drawRectangle({ x, y, width: boxW, height: boxH, borderColor: color, borderWidth: 1 })

  if (!path) {
    const msg = 'Sin escaneado cargado'
    const w = font.widthOfTextAtSize(msg, 9)
    page.drawText(msg, { x: x + (boxW - w) / 2, y: y + boxH / 2 - 4, size: 9, font, color })
    return
  }

  const { data, error } = await db.storage.from('documentos').download(path)
  if (error || !data) {
    const msg = 'No se pudo cargar el archivo'
    const w = font.widthOfTextAtSize(msg, 9)
    page.drawText(msg, { x: x + (boxW - w) / 2, y: y + boxH / 2 - 4, size: 9, font, color })
    return
  }

  const bytes = new Uint8Array(await data.arrayBuffer())
  const ext = path.split('.').pop()?.toLowerCase()

  try {
    if (ext === 'pdf') {
      const [embedded] = await pdfDoc.embedPdf(bytes)
      const escala = Math.min((boxW - 10) / embedded.width, (boxH - 10) / embedded.height)
      const w = embedded.width * escala, h = embedded.height * escala
      page.drawPage(embedded, { x: x + (boxW - w) / 2, y: y + (boxH - h) / 2, width: w, height: h })
    } else {
      const img = ext === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
      const escala = Math.min((boxW - 10) / img.width, (boxH - 10) / img.height)
      const w = img.width * escala, h = img.height * escala
      page.drawImage(img, { x: x + (boxW - w) / 2, y: y + (boxH - h) / 2, width: w, height: h })
    }
  } catch {
    const msg = 'Formato de archivo no compatible'
    const w = font.widthOfTextAtSize(msg, 9)
    page.drawText(msg, { x: x + (boxW - w) / 2, y: y + boxH / 2 - 4, size: 9, font, color })
  }
}

// Sello circular "ESTUDIO DE AGRIMENSURA" con texto curvo, estilo firma de Franco
function dibujarSelloProfesional(page: PDFPage, cx: number, cy: number, fonts: { bold: PDFFont }, color: any) {
  const { bold } = fonts
  const radioTexto = 42
  const texto = 'ESTUDIO DE AGRIMENSURA'
  const size = 7

  // Texto curvo sobre el arco superior del círculo (de izquierda a derecha, en sentido horario)
  const anguloInicio = 200 // grados, en sentido matemático estándar (0=derecha, 90=arriba)
  const anguloFin = -20
  const paso = (anguloFin - anguloInicio) / (texto.length - 1)
  for (let i = 0; i < texto.length; i++) {
    const angulo = anguloInicio + paso * i
    const rad = (angulo * Math.PI) / 180
    const x = cx + radioTexto * Math.cos(rad)
    const y = cy + radioTexto * Math.sin(rad)
    page.drawText(texto[i], {
      x, y, size, font: bold, color,
      rotate: degrees(angulo - 90),
    })
  }

  // Círculo exterior
  page.drawCircle({ x: cx, y: cy, size: radioTexto + 8, borderColor: color, borderWidth: 1 })
  page.drawCircle({ x: cx, y: cy, size: radioTexto - 8, borderColor: color, borderWidth: 0.75 })

  // "N" y "CA" en el centro, simulando el isologo
  const nSize = 20
  const nW = bold.widthOfTextAtSize('N', nSize)
  page.drawText('N', { x: cx - nW / 2, y: cy - 4, size: nSize, font: bold, color })
  const caSize = 9
  const caW = bold.widthOfTextAtSize('CA', caSize)
  page.drawText('CA', { x: cx - caW / 2, y: cy - 18, size: caSize, font: bold, color })
}

// Dibuja una línea con las palabras separadas y distribuidas para ocupar exactamente anchoLinea
function dibujarLineaJustificada(page: PDFPage, palabras: string[], x: number, y: number, anchoLinea: number, size: number, font: PDFFont, color: any) {
  if (palabras.length === 1) {
    page.drawText(palabras[0], { x, y, size, font, color })
    return
  }
  const anchoPalabras = palabras.reduce((acc, p) => acc + font.widthOfTextAtSize(p, size), 0)
  const numGaps = palabras.length - 1
  const espacioNormal = font.widthOfTextAtSize(' ', size)
  const espacioExtra = Math.max(0, (anchoLinea - anchoPalabras - espacioNormal * numGaps) / numGaps)
  let cursorX = x
  palabras.forEach((palabra, i) => {
    page.drawText(palabra, { x: cursorX, y, size, font, color })
    cursorX += font.widthOfTextAtSize(palabra, size) + espacioNormal + espacioExtra
  })
}

// Dibuja un párrafo justificado (ambos márgenes alineados, salvo la última línea) con sangría en la primera línea.
// Devuelve la coordenada Y donde termina (para encadenar el siguiente párrafo).
function dibujarParrafo(page: PDFPage, texto: string, x: number, y: number, maxWidth: number, size: number, font: PDFFont, color: any, lineHeight?: number, sangria = 18): number {
  const lh = lineHeight ?? size * 1.55
  const palabras = texto.replace(/\r?\n/g, ' ').split(' ').filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const anchoDisponible = lineas.length === 0 ? maxWidth - sangria : maxWidth
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (font.widthOfTextAtSize(prueba, size) > anchoDisponible && actual) {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual) lineas.push(actual)

  lineas.forEach((linea, i) => {
    const esPrimera = i === 0
    const esUltima = i === lineas.length - 1
    const xLinea = x + (esPrimera ? sangria : 0)
    const anchoLinea = maxWidth - (esPrimera ? sangria : 0)
    const yLinea = y - i * lh
    if (esUltima) {
      page.drawText(linea, { x: xLinea, y: yLinea, size, font, color })
    } else {
      dibujarLineaJustificada(page, linea.split(' '), xLinea, yLinea, anchoLinea, size, font, color)
    }
  })
  return y - lineas.length * lh
}

function construirUbicacion(inmueble: any): string {
  if (!inmueble) return '—'
  const partes: string[] = []
  if (inmueble.fraccion)        partes.push(`Fracción ${inmueble.fraccion}`)
  if (inmueble.parcela)         partes.push(`Parcela ${inmueble.parcela}`)
  if (inmueble.manzana)         partes.push(`Manzana ${inmueble.manzana}`)
  if (inmueble.subparcela)      partes.push(`Subparcela ${inmueble.subparcela}`)
  if (inmueble.circunscripcion) partes.push(`Circunscripción ${inmueble.circunscripcion}`)
  if (inmueble.seccion)         partes.push(`Sección ${inmueble.seccion}`)
  return partes.length ? partes.join(', ') : '—'
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return redirect('/login')

  const isAjax = request.headers.get('X-Requested-With') === 'fetch'
  const db = getSupabase(token)
  const form = await request.formData()
  const expedienteId = form.get('expediente_id') as string
  const tipos = form.getAll('tipos[]') as string[]

  if (!tipos.length) {
    return isAjax
      ? new Response(JSON.stringify({ ok: false, warn: 'sin_seleccion' }), { status: 400 })
      : redirect(`/expedientes/${expedienteId}?tab=documentos&warn=sin_seleccion`)
  }

  const documentosCreados: { id: string; tipo_documento: string; storage_path: string | null; estado: string; generado_at: string }[] = []

  const { data: exp } = await db
    .from('expedientes')
    .select('numero_expediente, tipo_mensura')
    .eq('id', expedienteId)
    .single()

  const { data: inmueble } = await db
    .from('inmuebles').select('*').eq('expediente_id', expedienteId).maybeSingle()

  const { data: poligono } = await db
    .from('poligono').select('superficie_m2, superficie_letras').eq('expediente_id', expedienteId).maybeSingle()

  const { data: linderos } = await db
    .from('linderos').select('norte_mensura, sur_mensura, este_mensura, oeste_mensura').eq('expediente_id', expedienteId).maybeSingle()

  const { data: expComitentes } = await db
    .from('exp_comitentes').select('orden, rol, comitentes(nombre, apellido, dni, telefono, email, domicilio, dni_scan_path, dni_scan_path_dorso)')
    .eq('expediente_id', expedienteId).order('orden')

  const { data: profile } = await db
    .from('profiles').select('*').eq('id', user.id).maybeSingle()

  const expComitentePrincipal = expComitentes?.[0] as any
  const comitentePrincipal = expComitentePrincipal?.comitentes
  const rolComitente = expComitentePrincipal?.rol ?? 'titular'
  const nombreComitente = comitentePrincipal
    ? `${comitentePrincipal.apellido}, ${comitentePrincipal.nombre}`
    : '—'
  const nombreComitenteDirecto = comitentePrincipal
    ? `${comitentePrincipal.nombre} ${comitentePrincipal.apellido}`
    : '—'
  const nombreProfesional = profile ? `${profile.nombre ?? ''} ${profile.apellido ?? ''}`.trim() : '—'
  const tipoMensuraTexto = `MENSURA PARA ${(exp?.tipo_mensura ?? '—').toUpperCase()}`
  const ubicacionCompleta = `${construirUbicacion(inmueble)}${inmueble?.departamento ? ', ' + inmueble.departamento : ''}`

  for (const tipo of tipos) {
    const pdfDoc  = await PDFDocument.create()
    const page    = pdfDoc.addPage([595.28, 841.89]) // A4
    const font       = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const bold       = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const boldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)
    const { width, height } = page.getSize()

    const azul   = rgb(0.106, 0.180, 0.369)
    const gris   = rgb(0.42, 0.45, 0.50)
    const negro  = rgb(0.10, 0.10, 0.10)

    // Encabezado tipo membrete (logo + datos del expediente)
    const yEncabezadoFin = dibujarEncabezado(page, width, height, { font, bold }, {
      objeto: tipoMensuraTexto,
      comitente: nombreComitente,
      ubicacion: ubicacionCompleta,
      profesional: `Agrimensor ${nombreProfesional}`,
      email: profile?.email,
      telefono: profile?.telefono,
    })

    if (tipo === 'caratula') {
      // ── Carátula con datos reales del expediente ──────────────────────
      const tituloLineas = partirEnLineas(tipoMensuraTexto, width - 100, 22, boldItalic)
      let yTitulo = yEncabezadoFin - 60
      tituloLineas.forEach(linea => {
        dibujarCentrado(page, linea, yTitulo, 22, boldItalic, negro, width)
        yTitulo -= 28
      })

      // Bloque de datos (lo que Franco marcó en rojo en su carátula, a modo de ejemplo de qué completar)
      const camposCaratula: [string, string][] = [
        ['Departamento: ',         inmueble?.departamento ?? '—'],
        ['Ubicación/Sección: ',    construirUbicacion(inmueble)],
        ['Partida Inmobiliaria: ', inmueble?.matricula_catastral ?? '—'],
        ['Comitente: ',            nombreComitente],
      ]
      let yCampos = yTitulo - 45
      camposCaratula.forEach(([clave, valor]) => {
        const lineasValor = partirEnLineas(`${clave}${valor}`, width - 90, 15, boldItalic)
        lineasValor.forEach((linea, i) => {
          page.drawText(linea, { x: 42, y: yCampos - i * 20, size: 15, font: boldItalic, color: negro })
        })
        yCampos -= lineasValor.length * 20 + 14
      })

      // Sello circular + firma / pie profesional
      const yFirma = 160
      dibujarSelloProfesional(page, width / 2, yFirma + 90, { bold }, negro)
      page.drawLine({ start: { x: 40, y: yFirma + 30 }, end: { x: width - 40, y: yFirma + 30 }, thickness: 1, color: rgb(0.88,0.91,0.95) })
      dibujarCentrado(page, `Ing. Agrimensor ${nombreProfesional}`, yFirma, 12, boldItalic, negro, width)

      const contacto = [profile?.email, profile?.telefono].filter(Boolean).join('  –  ')
      if (contacto) {
        const wTexto = font.widthOfTextAtSize(contacto, 9)
        const xTexto = (width - wTexto) / 2
        page.drawCircle({ x: xTexto - 8, y: yFirma - 18 + 3, size: 1.6, color: negro })
        page.drawText(contacto, { x: xTexto, y: yFirma - 18, size: 9, font, color: gris })
      }
      if (profile?.domicilio) {
        const wDom = font.widthOfTextAtSize(profile.domicilio, 9)
        const xDom = (width - wDom) / 2
        page.drawCircle({ x: xDom - 8, y: yFirma - 32 + 3, size: 1.6, color: negro })
        page.drawText(profile.domicilio, { x: xDom, y: yFirma - 32, size: 9, font, color: gris })
      }

    } else if (tipo === 'nota_elevacion') {
      // ── Nota de Elevación a la Directora ──────────────────────────────
      const margenX = 40
      const anchoTexto = width - margenX * 2
      const fechaTexto = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

      // Fecha alineada a la derecha
      const wFecha = font.widthOfTextAtSize(fechaTexto, 11)
      page.drawText(fechaTexto, { x: width - margenX - wFecha, y: yEncabezadoFin - 35, size: 11, font, color: negro })

      let y = yEncabezadoFin - 75
      page.drawText('Directora General de Catastro', { x: margenX, y, size: 11, font: bold, color: negro })
      y -= 16
      page.drawText('Dr. Yenny Contte', { x: margenX, y, size: 11, font: bold, color: negro })
      y -= 16
      page.drawText('S________/_______D:', { x: margenX, y, size: 11, font, color: negro })
      y -= 26

      const profesionalDni        = (profile as any)?.dni
      const profesionalMatricula  = profile?.matricula
      const profesionalCatastro   = (profile as any)?.matricula_catastro
      const datosProfesionalPartes = [
        nombreProfesional.toUpperCase(),
        profesionalDni ? `DNI: ${profesionalDni}` : '',
        profesionalMatricula ? `MATRICULA PROFESIONAL DEL CONSEJO: ${profesionalMatricula}` : '',
        profesionalCatastro ? `MATRICULA PROFESIONAL DE CATASTRO: ${profesionalCatastro}` : '',
        profile?.email ? `CORREO ELECTRONICO: ${profile.email}` : '',
        profile?.telefono ? `CELULAR: ${profile.telefono}` : '',
        profile?.domicilio ? `CON DOMICILIO LEGAL EN ${profile.domicilio.toUpperCase()}.` : '',
      ].filter(Boolean)
      y = dibujarParrafo(page, datosProfesionalPartes.join(' - '), margenX, y, anchoTexto, 10.5, font, negro)
      y -= 14

      const comitenteDni = comitentePrincipal?.dni
      const datosComitentePartes = [
        `COMITENTE: ${nombreComitente.toUpperCase()}`,
        comitenteDni ? `(DNI: ${comitenteDni})` : '',
        `EN CALIDAD DE ${rolComitente.toUpperCase()}`,
        comitentePrincipal?.telefono ? `- TELEFONO CELULAR PARA COMUNICACIONES: ${comitentePrincipal.telefono}` : '',
        comitentePrincipal?.email ? `CORREO ELECTRONICO: ${comitentePrincipal.email}` : '',
        comitentePrincipal?.domicilio ? `CON DOMICILIO EN ${comitentePrincipal.domicilio.toUpperCase()}` : '',
      ].filter(Boolean)
      y = dibujarParrafo(page, datosComitentePartes.join(' '), margenX, y, anchoTexto, 10.5, font, negro)
      y -= 16

      const parrafoSolicitud = `Solicitamos la Registración de las operaciones de ${tipoMensuraTexto} en un inmueble ubicado en ${ubicacionCompleta}.`
      y = dibujarParrafo(page, parrafoSolicitud, margenX, y, anchoTexto, 11, font, negro)
      y -= 16

      const parrafoAdjunto = 'Adjunto la documentación correspondiente para el cotejo y examen de la mensura, con un total de ….. fojas.'
      y = dibujarParrafo(page, parrafoAdjunto, margenX, y, anchoTexto, 11, font, negro)
      y -= 16

      dibujarParrafo(page, 'Sin otro particular, nos despedimos de Ud. Atentamente.', margenX, y, anchoTexto, 11, font, negro, undefined, 0)

      // Firma del comitente al pie
      const yFirmaComitente = 140
      dibujarCentrado(page, nombreComitenteDirecto, yFirmaComitente, 11, bold, negro, width)
      dibujarCentrado(page, 'Comitente', yFirmaComitente - 14, 10, font, negro, width)
      if (comitenteDni) dibujarCentrado(page, `DNI: ${comitenteDni}`, yFirmaComitente - 28, 10, font, negro, width)

    } else if (tipo === 'documento_identidad') {
      // ── Fotocopia DNI: una página por cada comitente, frente y dorso ──
      const datosEncabezado = {
        objeto: tipoMensuraTexto,
        comitente: nombreComitente,
        ubicacion: ubicacionCompleta,
        profesional: `Agrimensor ${nombreProfesional}`,
        email: profile?.email,
        telefono: profile?.telefono,
      }
      const listaComitentes = (expComitentes ?? []) as any[]

      for (let idx = 0; idx < Math.max(listaComitentes.length, 1); idx++) {
        const ec = listaComitentes[idx]
        const c = ec?.comitentes
        // La primera página ya fue creada y tiene el encabezado dibujado arriba del if/else
        const pag = idx === 0
          ? { page, width, height, yEncabezadoFin }
          : crearPaginaConEncabezado(pdfDoc, { font, bold }, datosEncabezado)

        pag.page.drawText('DOCUMENTO DE IDENTIDAD DEL COMITENTE', {
          x: 40, y: pag.yEncabezadoFin - 30, size: 13, font: bold, color: azul,
        })
        const nombreC = c ? `${c.apellido}, ${c.nombre}`.toUpperCase() : 'SIN COMITENTE CARGADO'
        pag.page.drawText(nombreC, { x: 40, y: pag.yEncabezadoFin - 48, size: 10, font, color: gris })

        const cajaW = pag.width - 80
        const cajaH = 200
        let yCursor = pag.yEncabezadoFin - 75

        pag.page.drawText('FRENTE', { x: 40, y: yCursor, size: 10, font: bold, color: negro })
        yCursor -= 14
        await dibujarArchivoEnCaja(pdfDoc, pag.page, db, c?.dni_scan_path, 40, yCursor - cajaH, cajaW, cajaH, font, gris)
        yCursor -= cajaH + 28

        pag.page.drawText('DORSO', { x: 40, y: yCursor, size: 10, font: bold, color: negro })
        yCursor -= 14
        await dibujarArchivoEnCaja(pdfDoc, pag.page, db, c?.dni_scan_path_dorso, 40, yCursor - cajaH, cajaW, cajaH, font, gris)
      }

    } else if (tipo === 'capitulo_ubicacion') {
      // ── Capítulo de Extensión, Límites e Inscripciones ─────────────────
      const margenX = 40
      const anchoTexto = width - margenX * 2

      page.drawText('UBICACIÓN, EXTENSIÓN, LÍMITES E INSCRIPCIONES', {
        x: margenX, y: yEncabezadoFin - 30, size: 13, font: bold, color: azul,
      })
      page.drawLine({
        start: { x: margenX, y: yEncabezadoFin - 42 }, end: { x: width - margenX, y: yEncabezadoFin - 42 },
        thickness: 1, color: rgb(0.88, 0.91, 0.95),
      })

      let y = yEncabezadoFin - 70

      const superficieTexto = poligono?.superficie_m2
        ? `${poligono.superficie_m2} metros cuadrados${poligono.superficie_letras ? ` (${poligono.superficie_letras})` : ''}`
        : '— metros cuadrados'
      const parrafoUbicacion =
        `Las presentes operaciones se realizan en el Departamento de ${inmueble?.departamento ?? '—'}` +
        `${inmueble?.localidad ? `, Localidad de ${inmueble.localidad}` : ''} – ${construirUbicacion(inmueble)}, bajo el objeto de ` +
        `${tipoMensuraTexto}, abarcando una Superficie total de ${superficieTexto}, cuyas medidas y afectación se acompañan en el plano presente en el expediente.`
      y = dibujarParrafo(page, parrafoUbicacion, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      page.drawText('Los linderos son:', { x: margenX, y, size: 11, font, color: negro })
      y -= 22

      const lindLista: [string, string][] = [
        ['NORTE: ', linderos?.norte_mensura ?? '—'],
        ['ESTE: ',  linderos?.este_mensura ?? '—'],
        ['SUR: ',   linderos?.sur_mensura ?? '—'],
        ['OESTE: ', linderos?.oeste_mensura ?? '—'],
      ]
      lindLista.forEach(([label, valor]) => {
        page.drawText(label, { x: margenX + 30, y, size: 11, font: bold, color: negro })
        const wLabel = bold.widthOfTextAtSize(label, 11)
        page.drawText(valor, { x: margenX + 30 + wLabel, y, size: 11, font, color: negro })
        y -= 16
      })
      y -= 14

      page.drawText('ANTECEDENTES DE DOMINIO:', { x: margenX, y, size: 11, font: bold, color: negro })
      y -= 20

      const tomo = (inmueble as any)?.registro_tomo
      const folio = (inmueble as any)?.registro_folio
      const anioRegistro = (inmueble as any)?.registro_anio
      const inscripcionTexto = (tomo || folio || anioRegistro)
        ? `inscripto en mayor extensión al Tomo ${tomo ?? '—'}, Folio ${folio ?? '—'}, Año ${anioRegistro ?? '—'} del Departamento de ${inmueble?.departamento ?? '—'}`
        : 'sin antecedentes de inscripción registrados'
      const parrafoDominio = `Las presentes operaciones afectan un inmueble identificado según catastro como ${construirUbicacion(inmueble)}, del Departamento de ${inmueble?.departamento ?? '—'}. En el Registro de la Propiedad Inmueble de la Provincia está ${inscripcionTexto}.`
      y = dibujarParrafo(page, parrafoDominio, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      const parrafoRentas = `En la Dirección General de Rentas, se identifica con la/las Partidas Inmobiliarias ${inmueble?.matricula_catastral ?? '—'}.`
      y = dibujarParrafo(page, parrafoRentas, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      const matriculaMunicipal = (inmueble as any)?.matricula_municipal
      const parrafoMunicipal = matriculaMunicipal
        ? `En el Registro de la Propiedad Municipal se identifica con la Matrícula Municipal ${matriculaMunicipal}.`
        : 'En el Registro de la Propiedad Municipal no se encontraron inscripciones.'
      y = dibujarParrafo(page, parrafoMunicipal, margenX, y, anchoTexto, 11, font, negro)
      y -= 22

      const antecedentesTecnicos = (inmueble as any)?.antecedentes_tecnicos
      if (antecedentesTecnicos) {
        page.drawText('ANTECEDENTES TÉCNICOS:', { x: margenX, y, size: 11, font: bold, color: negro })
        y -= 20
        dibujarParrafo(page, antecedentesTecnicos, margenX, y, anchoTexto, 11, font, negro)
      }

    } else {
      // Título del documento
      const label = DOC_LABELS[tipo] ?? tipo.replace(/_/g, ' ')
      page.drawText(label.toUpperCase(), {
        x: 40, y: yEncabezadoFin - 30, size: 16, font: bold, color: azul,
      })

      // Línea separadora
      page.drawLine({
        start: { x: 40, y: yEncabezadoFin - 45 },
        end:   { x: width - 40, y: yEncabezadoFin - 45 },
        thickness: 1, color: rgb(0.88, 0.91, 0.95),
      })

      // Datos del expediente
      const datos = [
        ['Expediente Nº',  exp?.numero_expediente ?? '—'],
        ['Tipo de mensura', exp?.tipo_mensura ?? '—'],
        ['Fecha',          new Date().toLocaleDateString('es-AR')],
      ]
      datos.forEach(([clave, valor], i) => {
        const y = yEncabezadoFin - 85 - i * 30
        page.drawText(clave + ':', { x: 40, y, size: 10, font: bold, color: gris })
        page.drawText(valor,       { x: 180, y, size: 10, font, color: negro })
      })

      // Cuerpo placeholder
      page.drawText(
        'Este documento se encuentra en proceso de elaboración.',
        { x: 40, y: yEncabezadoFin - 220, size: 11, font, color: negro }
      )
      page.drawText(
        'El contenido definitivo se completará con los datos del expediente.',
        { x: 40, y: yEncabezadoFin - 240, size: 11, font, color: negro }
      )
    }

    // Pie de página (en todas las páginas del documento, por si es multipágina)
    pdfDoc.getPages().forEach(p => {
      const { width: pw } = p.getSize()
      p.drawLine({
        start: { x: 40, y: 60 }, end: { x: pw - 40, y: 60 },
        thickness: 1, color: rgb(0.88, 0.91, 0.95),
      })
      p.drawText(
        `Generado por NICA · ${new Date().toLocaleString('es-AR')}`,
        { x: 40, y: 42, size: 8, font, color: gris }
      )
    })

    const pdfBytes = await pdfDoc.save()
    const storagePath = `${expedienteId}/${tipo}_${Date.now()}.pdf`

    const { error: uploadError } = await db.storage
      .from('documentos')
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })

    // Registrar en BD aunque falle el storage (para no perder el intento)
    const { data: docInsertado } = await db.from('documentos_generados').insert({
      expediente_id: expedienteId,
      tipo_documento: tipo,
      storage_path: uploadError ? null : storagePath,
      estado: uploadError ? 'error_storage' : 'generado',
      generado_at: new Date().toISOString(),
    }).select('id, tipo_documento, storage_path, estado, generado_at').single()

    if (docInsertado) documentosCreados.push(docInsertado as any)
  }

  if (isAjax) {
    return new Response(JSON.stringify({ ok: true, documentos: documentosCreados }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return redirect(`/expedientes/${expedienteId}?tab=documentos&ok=1`)
}
