import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'
import { calcularPoligonal } from '../../../lib/poligonal'
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DOC_LABELS: Record<string, string> = {
  // Contenido básico
  caratula:                 'Carátula',
  nota_elevacion:           'Nota de Elevación a la Directora',
  documento_identidad:      'Fotocopia del DNI del/los Comitente/s',
  capitulo_ubicacion:       'Capítulo de Extensión, Límites e Inscripciones',
  citacion_linderos:        'Notificación a Linderos y Autoridades',
  acta_mensura:             'Acta de Mensura y Amojonamiento',
  acta_ausencia_linderos:   'Acta de Ausencia de Linderos y Autoridades',
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

const UNIDADES_LETRAS = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS',
  'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const DECENAS_LETRAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS_LETRAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function menorMilALetras(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  let r = ''
  if (n >= 100) { r = CENTENAS_LETRAS[Math.floor(n / 100)]; n %= 100 }
  if (n >= 30) {
    r += (r ? ' ' : '') + DECENAS_LETRAS[Math.floor(n / 10)]
    if (n % 10) r += ' Y ' + UNIDADES_LETRAS[n % 10]
  } else if (n > 0) {
    r += (r ? ' ' : '') + UNIDADES_LETRAS[n]
  }
  return r
}

function numeroALetras(n: number): string {
  if (n === 0) return 'CERO'
  if (n >= 1000) {
    const miles = Math.floor(n / 1000)
    let r = miles === 1 ? 'MIL' : menorMilALetras(miles) + ' MIL'
    const resto = n % 1000
    if (resto) r += ' ' + menorMilALetras(resto)
    return r
  }
  return menorMilALetras(n)
}

function capitalizarPrimera(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// "19:00" → "Diecinueve horas, cero minutos"
function horaALetras(horaStr: string | null | undefined): string {
  if (!horaStr) return '—'
  const [h, m] = horaStr.split(':').map(n => parseInt(n) || 0)
  const horaTxt = numeroALetras(h) + (h === 1 ? ' HORA' : ' HORAS')
  const minTxt = numeroALetras(m) + (m === 1 ? ' MINUTO' : ' MINUTOS')
  return capitalizarPrimera(`${horaTxt}, ${minTxt}`)
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

// "90°00’ (NOVENTA GRADOS, CERO MINUTOS)." — formato con coma, distinto al usado en el Tab 3
function anguloALetrasConComa(grados: number, minutos: number, segundos: number): string {
  let texto = numeroALetras(grados) + (grados === 1 ? ' GRADO' : ' GRADOS')
  texto += ', ' + numeroALetras(minutos) + (minutos === 1 ? ' MINUTO' : ' MINUTOS')
  if (segundos > 0) texto += ', ' + numeroALetras(segundos) + (segundos === 1 ? ' SEGUNDO' : ' SEGUNDOS')
  return texto
}

function formatearDMS(grados: number, minutos: number, segundos: number): string {
  const base = `${grados}°${String(minutos).padStart(2, '0')}’`
  return segundos > 0 ? `${base}${String(Math.round(segundos)).padStart(2, '0')}”` : base
}

// Genera etiquetas de lado AB, BC, CD, ... a partir de vértices A, B, C, ...
function generarEtiquetasLados(n: number): string[] {
  const vertices: string[] = []
  for (let i = 0; i < n; i++) vertices.push(String.fromCharCode(65 + (i % 26)))
  return vertices.map((v, i) => v + vertices[(i + 1) % n])
}

// Dibuja una tabla con grilla: encabezado en negrita + filas de datos
function dibujarTabla(
  page: PDFPage, x0: number, yTop: number,
  anchos: number[], encabezados: string[], filas: string[][],
  fonts: { font: PDFFont; bold: PDFFont }, color: any, rowHeight = 14, fontSize = 7,
): number {
  const { font, bold } = fonts
  const totalWidth = anchos.reduce((a, w) => a + w, 0)
  let y = yTop

  const dibujarFila = (valores: string[], esEncabezado: boolean) => {
    page.drawRectangle({ x: x0, y: y - rowHeight, width: totalWidth, height: rowHeight, borderColor: color, borderWidth: 0.6 })
    let cx = x0
    valores.forEach((valor, i) => {
      if (i > 0) page.drawLine({ start: { x: cx, y }, end: { x: cx, y: y - rowHeight }, thickness: 0.5, color })
      const fnt = esEncabezado ? bold : font
      const w = fnt.widthOfTextAtSize(valor, fontSize)
      page.drawText(valor, { x: cx + (anchos[i] - w) / 2, y: y - rowHeight + 4, size: fontSize, font: fnt, color })
      cx += anchos[i]
    })
    y -= rowHeight
  }

  dibujarFila(encabezados, true)
  filas.forEach(fila => dibujarFila(fila, false))
  return y
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function formatearFechaLarga(fechaISO: string | null | undefined): string {
  if (!fechaISO) return '—'
  const d = new Date(fechaISO + 'T00:00:00')
  const mes = MESES[d.getMonth()]
  return `${d.getDate()} de ${mes.charAt(0).toUpperCase() + mes.slice(1)} del ${d.getFullYear()}`
}

function formatearFechaCorta(fechaISO: string | null | undefined): string {
  if (!fechaISO) return '—'
  const d = new Date(fechaISO + 'T00:00:00')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())} / ${pad(d.getMonth() + 1)} / ${d.getFullYear()}`
}

// La citación se carga primero (Tab Inmueble) y es la fuente para los documentos de esa
// etapa; si un expediente viejo no tiene citación cargada, cae al valor de mensura.
function valorLindero(linderos: any, lado: 'norte' | 'sur' | 'este' | 'oeste'): string {
  const citacion = linderos?.[`${lado}_citacion`]
  const mensura = linderos?.[`${lado}_mensura`]
  return citacion ?? mensura ?? '—'
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

  // Formulario SOR y E1 todavía no tienen su propio dibujo en el generador (ver formulario_u
  // más abajo) — sin este freno caerían en la rama placeholder genérica y saldrían con texto
  // invisible. La UI de la Tab Documentos ya no ofrece tildarlos, pero se valida también acá
  // por si llega una petición directa.
  const DDJJ_NO_IMPLEMENTADAS = new Set(['formulario_sor', 'formulario_e1'])
  if (tipos.some(t => DDJJ_NO_IMPLEMENTADAS.has(t))) {
    return isAjax
      ? new Response(JSON.stringify({ ok: false, warn: 'ddjj_no_implementada' }), { status: 400 })
      : redirect(`/expedientes/${expedienteId}?tab=documentos&warn=ddjj_no_implementada`)
  }

  const documentosCreados: { id: string; tipo_documento: string; storage_path: string | null; estado: string; generado_at: string }[] = []

  const { data: exp } = await db
    .from('expedientes')
    .select('numero_expediente, tipo_mensura, fecha_inicio, hora_mensura')
    .eq('id', expedienteId)
    .single()

  const { data: inmueble } = await db
    .from('inmuebles').select('*').eq('expediente_id', expedienteId).maybeSingle()

  // El Formulario U es solo para inmuebles urbanos y necesita que la Tab 2 Inmueble ya
  // esté cargada (usa localidad, calle, registro, etc.) — sin esto el PDF sale con
  // casilleros vacíos sin ninguna pista de por qué.
  if (tipos.includes('formulario_u')) {
    if (!inmueble) {
      return isAjax
        ? new Response(JSON.stringify({ ok: false, warn: 'ddjj_falta_inmueble' }), { status: 400 })
        : redirect(`/expedientes/${expedienteId}?tab=documentos&warn=ddjj_falta_inmueble`)
    }
    if ((inmueble as any).tipo_inmueble === 'rural') {
      return isAjax
        ? new Response(JSON.stringify({ ok: false, warn: 'ddjj_tipo_incorrecto' }), { status: 400 })
        : redirect(`/expedientes/${expedienteId}?tab=documentos&warn=ddjj_tipo_incorrecto`)
    }
  }

  // Un expediente puede tener varios polígonos (división en parcelas). Memoria de
  // Mensura y Planilla de Cálculos iteran todos; el resto de los documentos (Carátula,
  // Nota de Elevación, Acta, Capítulo, Formularios U/SOR/E1) todavía usan solo el primero
  // — pendiente de confirmar con Franco cómo deben tratar la superficie con más de uno
  // (ver ESTADO_PROYECTO.md, sección "Ítem 11").
  const { data: poligonosRaw } = await db
    .from('poligono')
    .select('parcela_desde, parcela_hasta, superficie_m2, superficie_letras, lados(orden, valor_m, valor_letras), angulos(orden, grados, minutos, segundos)')
    .eq('expediente_id', expedienteId)
    .order('parcela_desde', { ascending: true, nullsFirst: true })

  const poligonos = poligonosRaw ?? []
  const poligono = poligonos[0] ?? null

  function labelParcela(pol: any, idx: number): string {
    const desde = pol?.parcela_desde ?? (idx + 1)
    const hasta = pol?.parcela_hasta ?? desde
    return desde === hasta ? `PARCELA ${desde}` : `PARCELAS ${desde} A ${hasta}`
  }

  const { data: linderos } = await db
    .from('linderos')
    .select('norte_mensura, sur_mensura, este_mensura, oeste_mensura, norte_citacion, sur_citacion, este_citacion, oeste_citacion, linderos_iguales')
    .eq('expediente_id', expedienteId).maybeSingle()

  const { data: expComitentes } = await db
    .from('exp_comitentes').select('orden, rol, porcentaje_condominio, ausente_pais, comitentes(nombre, apellido, dni, telefono, email, domicilio, dni_scan_path, dni_scan_path_dorso, nacionalidad, tipo_documento, domicilio_calle, domicilio_numero, domicilio_localidad, domicilio_provincia)')
    .eq('expediente_id', expedienteId).order('orden')

  const { data: expTestigos } = await db
    .from('exp_testigos').select('testigos(nombre, apellido, dni)')
    .eq('expediente_id', expedienteId)

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
  const tipoMensuraTexto = (exp?.tipo_mensura ?? '—').toUpperCase()
  const ubicacionCompleta = `${construirUbicacion(inmueble)}${inmueble?.departamento ? ', ' + inmueble.departamento : ''}`

  for (const tipo of tipos) {
    const esDDJJ = tipo === 'formulario_u' || tipo === 'formulario_sor' || tipo === 'formulario_e1'

    let pdfDoc: PDFDocument
    let page: PDFPage
    let font: PDFFont
    let bold: PDFFont
    let boldItalic: PDFFont
    let width: number, height: number
    let yEncabezadoFin = 0

    const azul   = rgb(0.106, 0.180, 0.369)
    const gris   = rgb(0.42, 0.45, 0.50)
    const negro  = rgb(0.10, 0.10, 0.10)

    if (esDDJJ) {
      // ── Declaraciones Juradas: PDF oficial de Catastro, sin membrete propio ──
      const plantillaBytes = await readFile(join(process.cwd(), 'public', 'pdf-templates', `${tipo}.pdf`))
      pdfDoc = await PDFDocument.load(plantillaBytes)
      page = pdfDoc.getPages()[0]
      font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      boldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)
      ;({ width, height } = page.getSize())
    } else {
      pdfDoc = await PDFDocument.create()
      const esApaisado = tipo === 'planilla_calculos'
      page = pdfDoc.addPage(esApaisado ? [841.89, 595.28] : [595.28, 841.89]) // A4 (apaisado para la planilla, tabla ancha)
      font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      boldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique)
      ;({ width, height } = page.getSize())

      // Encabezado tipo membrete (logo + datos del expediente)
      yEncabezadoFin = dibujarEncabezado(page, width, height, { font, bold }, {
        objeto: tipoMensuraTexto,
        comitente: nombreComitente,
        ubicacion: ubicacionCompleta,
        profesional: `Agrimensor ${nombreProfesional}`,
        email: profile?.email,
        telefono: profile?.telefono,
      })
    }

    if (tipo === 'formulario_u') {
      // ── Formulario U — Declaración Jurada (Inmueble Urbano) ─────────────
      // Coordenadas medidas contra public/pdf-templates/formulario_u.pdf (612x1008pt).
      // La plantilla ya viene limpiada (ver .tmp_clean_template.cjs / historial): las marcas de
      // referencia y el texto de ejemplo que traía originalmente el PDF de Catastro se taparon
      // una sola vez, a nivel de archivo — acá simplemente se escribe encima, igual que en el
      // resto de los documentos.
      const f = 8
      const marcar = (valor: boolean | null | undefined, xSi: number, xNo: number, y: number, size = f) => {
        page.drawText('X', { x: valor ? xSi : xNo, y, size, font: bold, color: negro })
      }
      const campo = (valor: string, x: number, y: number) => {
        page.drawText(valor, { x, y, size: f, font, color: negro })
      }

      campo(inmueble?.localidad ?? '', 430, 830)

      // Inc. a) Designación según título
      campo(inmueble?.calle_frente ?? '', 225, 776)
      campo(inmueble?.fraccion ?? '', 366, 765)
      campo(inmueble?.manzana ?? '', 396, 765)
      campo(inmueble?.parcela ?? '', 443, 765)

      // Inc. c) Registro de la Propiedad
      campo((inmueble as any)?.registro_tomo ?? '', 100, 694)
      campo((inmueble as any)?.registro_folio ?? '', 155, 694)
      campo((inmueble as any)?.registro_anio ?? '', 275, 694)

      // Inc. e) Superficie del terreno (según plano de mensura, ya autocalculada)
      campo(poligono?.superficie_m2 != null ? Number(poligono.superficie_m2).toFixed(2) : '', 290, 637)

      // Inc. f) Otras informaciones adicionales
      marcar((inmueble as any)?.agua_corriente, 149, 160, 563, 6)
      marcar((inmueble as any)?.cloacas, 269, 281, 563, 6)
      campo((inmueble as any)?.personas_habitan != null ? String((inmueble as any).personas_habitan) : '', 270, 544)
      campo((inmueble as any)?.ultimo_anio_pago_impuesto ?? '', 258, 523)
      campo((inmueble as any)?.receptoria ?? '', 235, 487)

      // Rubro 3 — Datos del propietario (hasta 2 filas, a y b — el formulario no admite más sin Anexo A)
      const filasY = [435, 377]
      ;(expComitentes ?? []).slice(0, 2).forEach((ec: any, i: number) => {
        const c = ec.comitentes
        const y = filasY[i]
        campo(`${c?.apellido ?? ''}, ${c?.nombre ?? ''}`.toUpperCase(), 182, y)
        campo(ec.porcentaje_condominio != null ? String(ec.porcentaje_condominio) : '', 386, y)
        campo(c?.tipo_documento ?? 'DNI', 429, y)
        campo(c?.dni ?? '', 460, y)
        campo(c?.domicilio_calle ?? '', 152, y - 29)
        campo(c?.domicilio_numero ?? '', 242, y - 29)
        campo(c?.domicilio_localidad ?? '', 303, y - 29)
        campo(c?.domicilio_provincia ?? '', 459, y - 29)
        marcar(ec.ausente_pais, 517, 529, y - 29)
      })

      campo(inmueble?.propietario_anterior ?? '', 260, 316)

      // Página 3: declaración jurada (comitente principal). El párrafo original de la plantilla
      // (que traía una oración de ejemplo completa con nombre y DNI de otra persona) se borró
      // al limpiar el archivo — acá se escribe directamente el texto real, en el mismo lugar.
      const paginas = pdfDoc.getPages()
      if (paginas[2]) {
        const p3 = paginas[2]
        const declarante = expComitentes?.[0]?.comitentes as any
        const nombreDeclarante = declarante ? `${declarante.nombre ?? ''} ${declarante.apellido ?? ''}`.toUpperCase() : ''
        const parrafo = `El que suscribe ${nombreDeclarante} nacionalidad ${declarante?.nacionalidad ?? ''} documento de identidad ${declarante?.tipo_documento ?? 'DNI'} Nº ${declarante?.dni ?? ''} en su carácter de ${(rolComitente ?? '').toUpperCase()} declara bajo juramento que es verdad toda información suministrada por el y transcripta en el presente formulario y que tiene conocimiento de las penalidades establecidas por omision, falsedad y toda transgresión a las disposiciones legales.`

        const lineasParrafo = partirEnLineas(parrafo, 500, f, font)
        lineasParrafo.slice(0, 4).forEach((linea, i) => {
          p3.drawText(linea, { x: 59, y: 825 - i * 12.5, size: f, font, color: negro })
        })

        const fechaHoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
        p3.drawText(fechaHoy, { x: 60, y: 745, size: f, font, color: negro })
        if (declarante) {
          p3.drawText(nombreDeclarante, { x: 390, y: 683, size: f, font, color: negro })
        }
      }

    } else if (tipo === 'caratula') {
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
        const lineasValor = partirEnLineas(`${clave}${valor}`, width - 145, 15, boldItalic)
        lineasValor.forEach((linea, i) => {
          page.drawText(linea, { x: 90, y: yCampos - i * 20, size: 15, font: boldItalic, color: negro })
        })
        yCampos -= lineasValor.length * 20 + 14
      })

      // Logo PNG — ocupa todo el pie (incluye sello, nombre y contacto)
      try {
        let logoBytes: Uint8Array | null = null
        try {
          const logoDisk = await readFile(join(process.cwd(), 'public', 'images', 'nica-logo-caratula.png'))
          logoBytes = new Uint8Array(logoDisk)
        } catch {
          const logoRes = await fetch(new URL('/images/nica-logo-caratula.png', request.url).toString())
          if (logoRes.ok) logoBytes = new Uint8Array(await logoRes.arrayBuffer())
        }
        if (logoBytes) {
          const logoImg = await pdfDoc.embedPng(logoBytes)
          const maxLogoW = 360, maxLogoH = 180
          const scale = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height)
          const lw = logoImg.width * scale, lh = logoImg.height * scale
          page.drawImage(logoImg, { x: (width - lw) / 2, y: 55, width: lw, height: lh })
        } else {
          // Fallback si no hay PNG: texto mínimo
          const yFirma = 165
          page.drawLine({ start: { x: 55, y: yFirma + 30 }, end: { x: width - 55, y: yFirma + 30 }, thickness: 1, color: rgb(0.88,0.91,0.95) })
          dibujarCentrado(page, `Ing. Agrimensor ${nombreProfesional}`, yFirma, 12, boldItalic, negro, width)
        }
      } catch {
        // Fallback si hay error: texto mínimo
        const yFirma = 165
        page.drawLine({ start: { x: 55, y: yFirma + 30 }, end: { x: width - 55, y: yFirma + 30 }, thickness: 1, color: rgb(0.88,0.91,0.95) })
        dibujarCentrado(page, `Ing. Agrimensor ${nombreProfesional}`, yFirma, 12, boldItalic, negro, width)
      }

    } else if (tipo === 'nota_elevacion') {
      // ── Nota de Elevación a la Directora ──────────────────────────────
      const margenX = 55
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
      const margenX = 55
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

      const tipoInscripcion = (inmueble as any)?.tipo_inscripcion_registro ?? 'matricula'
      const mayorExtension  = (inmueble as any)?.inscripcion_mayor_extension ? ' en mayor extensión' : ''
      let inscripcionTexto: string
      if (tipoInscripcion === 'tomo') {
        const tomo  = (inmueble as any)?.registro_tomo  ?? '—'
        const folio = (inmueble as any)?.registro_folio ?? '—'
        const finca = (inmueble as any)?.registro_finca ?? '—'
        const anio  = (inmueble as any)?.registro_anio  ?? '—'
        inscripcionTexto = `inscripto${mayorExtension} al Tomo ${tomo}, Folio ${folio}, Finca ${finca}, Año ${anio} del Departamento de ${inmueble?.departamento ?? '—'}`
      } else {
        const matricula = inmueble?.matricula_registro
        inscripcionTexto = matricula
          ? `inscripto${mayorExtension} bajo Matrícula ${matricula}`
          : 'sin antecedentes de inscripción registrados'
      }
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

    } else if (tipo === 'citacion_linderos') {
      // ── Notificación a Linderos y Autoridades ──────────────────────────
      const margenX = 55
      const anchoTexto = width - margenX * 2

      dibujarCentrado(page, 'NOTIFICACIÓN A LINDEROS Y AUTORIDADES', yEncabezadoFin - 30, 13, bold, azul, width)

      const fechaTexto = formatearFechaLarga(exp?.fecha_inicio)
      const wFecha = font.widthOfTextAtSize(fechaTexto, 11)
      page.drawText(fechaTexto, { x: width - margenX - wFecha, y: yEncabezadoFin - 55, size: 11, font, color: negro })

      let y = yEncabezadoFin - 90
      page.drawText('Sres. LINDEROS Y AUTORIDADES:', { x: margenX, y, size: 11, font: bold, color: negro })
      y -= 24

      const tipoMensuraMinuscula = (exp?.tipo_mensura ?? '—')
      const propietarioAnterior = (inmueble as any)?.propietario_anterior
      const calleFrente = (inmueble as any)?.calle_frente
      const calleEntre1 = (inmueble as any)?.calle_entre1
      const calleEntre2 = (inmueble as any)?.calle_entre2

      const parrafoComision =
        `El Ing. Agrimensor que suscribe, habiendo recibido comisión de ${nombreComitente.toUpperCase()} ` +
        `(DNI: ${comitentePrincipal?.dni ?? '—'}); en carácter de ${rolComitente} - para realizar las operaciones de ` +
        `${tipoMensuraMinuscula} en un inmueble ubicado en la localidad de ${inmueble?.localidad ?? '—'}, ` +
        `Partida Inmobiliaria de Referencia ${inmueble?.matricula_catastral ?? '—'}` +
        `${propietarioAnterior ? ` a nombre de ${propietarioAnterior}` : ''} – ${construirUbicacion(inmueble)}` +
        `${calleFrente ? `, frente a la calle ${calleFrente}` : ''}` +
        `${(calleEntre1 || calleEntre2) ? `, entre las calles ${calleEntre1 ?? '—'} y ${calleEntre2 ?? '—'}` : ''}` +
        `. Cuyos linderos son los siguientes:`
      y = dibujarParrafo(page, parrafoComision, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      const lindLista: [string, string][] = [
        ['NORTE: ', valorLindero(linderos, 'norte')],
        ['SUR: ',   valorLindero(linderos, 'sur')],
        ['ESTE: ',  valorLindero(linderos, 'este')],
        ['OESTE: ', valorLindero(linderos, 'oeste')],
      ]
      lindLista.forEach(([label, valor]) => {
        page.drawText('- ', { x: margenX, y, size: 11, font: bold, color: negro })
        page.drawText(label, { x: margenX + 10, y, size: 11, font: bold, color: negro })
        const wLabel = bold.widthOfTextAtSize(label, 11)
        const textoValor = `${valor} ......................................`
        page.drawText(textoValor, { x: margenX + 10 + wLabel, y, size: 11, font, color: negro })
        y -= 18
      })
      y -= 12

      const fechaCorta = formatearFechaCorta(exp?.fecha_inicio)
      const horaTexto = (exp as any)?.hora_mensura ?? '—'
      const parrafoPreviene =
        `Previene a Uds. que dará principio a las operaciones el día ${fechaCorta}, a las ${horaTexto}hs. ` +
        `en el lugar del inmueble citado, para que puedan concurrir a reconocer si se sobrepasan los límites de su propiedad.`
      y = dibujarParrafo(page, parrafoPreviene, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      const parrafoInvitados = 'A este fin están Uds. invitados a asistir al citado punto, por sí o por apoderados y con sus respectivos títulos.'
      y = dibujarParrafo(page, parrafoInvitados, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      const parrafoNotificado = 'Debiendo hacer constar haber practicado esta citación se servirá darse por NOTIFICADO, firmando al pie de la presente y devolvérmela.'
      y = dibujarParrafo(page, parrafoNotificado, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      dibujarParrafo(page, 'Saluda a Uds. muy atentamente.', margenX, y, anchoTexto, 11, font, negro, undefined, 0)

      // Firma del profesional al pie
      const yFirmaProf = 140
      dibujarCentrado(page, nombreProfesional.toUpperCase(), yFirmaProf, 11, bold, negro, width)
      dibujarCentrado(page, 'Ingeniero Agrimensor', yFirmaProf - 14, 10, font, negro, width)
      const matriculaTexto = [
        profile?.matricula ? `MP: ${profile.matricula}` : '',
        (profile as any)?.matricula_catastro ? `DGC: ${(profile as any).matricula_catastro}` : '',
      ].filter(Boolean).join(' – ')
      if (matriculaTexto) dibujarCentrado(page, matriculaTexto, yFirmaProf - 28, 10, font, negro, width)

    } else if (tipo === 'acta_mensura') {
      // ── Acta de Mensura y Amojonamiento ─────────────────────────────────
      const margenX = 55
      const anchoTexto = width - margenX * 2

      dibujarCentrado(page, 'ACTA DE MENSURA Y AMOJONAMIENTO', yEncabezadoFin - 30, 13, bold, azul, width)

      let y = yEncabezadoFin - 60

      const profesionalDni       = (profile as any)?.dni
      const profesionalMatricula = profile?.matricula
      const profesionalCatastro  = (profile as any)?.matricula_catastro
      const horaTexto = (exp as any)?.hora_mensura ?? '—'

      const parrafoActa =
        `En el Departamento de ${inmueble?.departamento ?? '—'}, Localidad de ${inmueble?.localidad ?? '—'} – ` +
        `${construirUbicacion(inmueble)} - Provincia de Corrientes. República Argentina. El Ing. Agrimensor ` +
        `que suscribe, ${nombreProfesional.toUpperCase()}` +
        `${profesionalDni ? ` - DNI: ${profesionalDni}` : ''}` +
        `${profesionalMatricula ? ` - MATRICULA PROFESIONAL DEL CONSEJO: ${profesionalMatricula}.` : ''}` +
        `${profesionalCatastro ? ` MATRICULA PROFESIONAL DE CATASTRO: ${profesionalCatastro};` : ''}` +
        ` - siendo ${horaTexto} hs. (${horaALetras(horaTexto)}) del día ${formatearFechaLarga(exp?.fecha_inicio)}, ` +
        `se deja constancia mediante la presente, que se han medido los límites de la posesión ejercida por el ` +
        `Sr. ${nombreComitente.toUpperCase()} (DNI: ${comitentePrincipal?.dni ?? '—'}). Habiendo materializado todos ` +
        `los vértices con mojones de madera dura, determinando una superficie TOTAL de ${poligono?.superficie_m2 ?? '—'} ` +
        `metros cuadrados${poligono?.superficie_letras ? ` (${poligono.superficie_letras.toUpperCase()})` : ''}.`
      y = dibujarParrafo(page, parrafoActa, margenX, y, anchoTexto, 11, font, negro)
      y -= 16

      page.drawText('Sus linderos son:', { x: margenX, y, size: 11, font, color: negro })
      y -= 22

      const lindActa: [string, string][] = [
        ['NORTE: ', linderos?.norte_mensura ?? '—'],
        ['ESTE: ',  linderos?.este_mensura ?? '—'],
        ['SUR: ',   linderos?.sur_mensura ?? '—'],
        ['OESTE: ', linderos?.oeste_mensura ?? '—'],
      ]
      lindActa.forEach(([label, valor]) => {
        page.drawText(label, { x: margenX, y, size: 11, font: bold, color: negro })
        const wLabel = bold.widthOfTextAtSize(label, 11)
        page.drawText(valor, { x: margenX + wLabel, y, size: 11, font, color: negro })
        y -= 16
      })
      y -= 14

      dibujarParrafo(
        page,
        'Sin más, se da por finalizadas las presentes operaciones, firmando los profesionales actuantes, el comitente que encargó el trabajo y los testigos invitados para tal efecto.',
        margenX, y, anchoTexto, 11, font, negro,
      )

      // Firmas: testigos + comitente, en columnas iguales
      const firmantes = [
        ...((expTestigos ?? []) as any[]).map((et, idx) => ({
          nombre: `${et.testigos?.nombre ?? ''} ${et.testigos?.apellido ?? ''}`.trim() || '—',
          rol: `Testigo ${idx + 1}`,
          dni: et.testigos?.dni,
        })),
        { nombre: nombreComitenteDirecto, rol: 'Comitente', dni: comitentePrincipal?.dni },
      ]
      const yFirmas = 145
      const colW = (width - margenX * 2) / firmantes.length
      firmantes.forEach((f, i) => {
        const colX = margenX + colW * i
        const centrarEnCol = (texto: string, yPos: number, size: number, fnt: PDFFont) => {
          const w = fnt.widthOfTextAtSize(texto, size)
          page.drawText(texto, { x: colX + (colW - w) / 2, y: yPos, size, font: fnt, color: negro })
        }
        centrarEnCol(f.nombre, yFirmas, 10, bold)
        centrarEnCol(f.rol, yFirmas - 14, 9, font)
        if (f.dni) centrarEnCol(`DNI: ${f.dni}`, yFirmas - 28, 9, font)
      })

    } else if (tipo === 'acta_ausencia_linderos') {
      // ── Acta de Ausencia de Linderos y Autoridades ──────────────────────
      const margenX = 55
      const anchoTexto = width - margenX * 2

      dibujarCentrado(page, 'ACTA DE AUSENCIA DE LINDEROS Y AUTORIDADES', yEncabezadoFin - 30, 13, bold, azul, width)

      let y = yEncabezadoFin - 60

      const profesionalDni       = (profile as any)?.dni
      const profesionalMatricula = profile?.matricula
      const profesionalCatastro  = (profile as any)?.matricula_catastro
      const horaTexto = (exp as any)?.hora_mensura ?? '—'

      const parrafoAusencia =
        `En el Departamento de ${inmueble?.departamento ?? '—'}, Localidad de ${inmueble?.localidad ?? '—'} – ` +
        `${construirUbicacion(inmueble)} - Provincia de Corrientes. República Argentina. El Ing. Agrimensor ` +
        `que suscribe, ${nombreProfesional.toUpperCase()}` +
        `${profesionalDni ? ` - DNI: ${profesionalDni}` : ''}` +
        `${profesionalMatricula ? ` - MATRICULA PROFESIONAL DEL CONSEJO: ${profesionalMatricula}.` : ''}` +
        `${profesionalCatastro ? ` MATRICULA PROFESIONAL DE CATASTRO: ${profesionalCatastro};` : ''}` +
        ` - siendo ${horaTexto} hs. (${horaALetras(horaTexto)}) del día ${formatearFechaLarga(exp?.fecha_inicio)}, ` +
        `se deja constancia mediante la presente, que no han podido ser notificados los linderos que se detallan ` +
        `a continuación por no encontrarse en los respectivos inmuebles linderos en reiteradas oportunidades.`
      y = dibujarParrafo(page, parrafoAusencia, margenX, y, anchoTexto, 11, font, negro)
      y -= 16

      page.drawText('Los linderos son:', { x: margenX, y, size: 11, font, color: negro })
      y -= 22

      const lindAusencia: [string, string][] = [
        ['NORTE: ', valorLindero(linderos, 'norte')],
        ['ESTE: ',  valorLindero(linderos, 'este')],
        ['SUR: ',   valorLindero(linderos, 'sur')],
        ['OESTE: ', valorLindero(linderos, 'oeste')],
      ]
      lindAusencia.forEach(([label, valor]) => {
        page.drawText(label, { x: margenX, y, size: 11, font: bold, color: negro })
        const wLabel = bold.widthOfTextAtSize(label, 11)
        page.drawText(valor, { x: margenX + wLabel, y, size: 11, font, color: negro })
        y -= 16
      })

      // Firmas: solo testigos, en columnas iguales
      const testigosFirmantes = ((expTestigos ?? []) as any[]).map((et, idx) => ({
        nombre: `${et.testigos?.nombre ?? ''} ${et.testigos?.apellido ?? ''}`.trim() || '—',
        rol: `Testigo ${idx + 1}`,
        dni: et.testigos?.dni,
      }))
      if (testigosFirmantes.length) {
        const yFirmasTest = 160
        const colWTest = (width - margenX * 2) / testigosFirmantes.length
        testigosFirmantes.forEach((f, i) => {
          const colX = margenX + colWTest * i
          const centrarEnCol = (texto: string, yPos: number, size: number, fnt: PDFFont) => {
            const w = fnt.widthOfTextAtSize(texto, size)
            page.drawText(texto, { x: colX + (colWTest - w) / 2, y: yPos, size, font: fnt, color: negro })
          }
          centrarEnCol(f.nombre, yFirmasTest, 10, bold)
          centrarEnCol(f.rol, yFirmasTest - 14, 9, font)
          if (f.dni) centrarEnCol(`DNI: ${f.dni}`, yFirmasTest - 28, 9, font)
        })
      }

    } else if (tipo === 'memoria_mensura') {
      // ── Memoria de Mensura ──────────────────────────────────────────────
      // Con un solo polígono se mantiene el formato original ("POLIGONO GENERAL", una
      // sola página). Con varios, cada uno va en su propia página titulada con su
      // parcela/rango ("PARCELA N" o "PARCELAS N A M").
      const margenX = 55
      const anchoTexto = width - margenX * 2
      const listaPoligonos = poligonos.length > 0 ? poligonos : [null as any]
      const datosEncabezadoComun = {
        objeto: tipoMensuraTexto, comitente: nombreComitente, ubicacion: ubicacionCompleta,
        profesional: `Agrimensor ${nombreProfesional}`, email: profile?.email, telefono: profile?.telefono,
      }

      page.drawText('MEMORIA DE LAS OPERACIONES:', { x: margenX, y: yEncabezadoFin - 30, size: 13, font: bold, color: azul })

      listaPoligonos.forEach((pol: any, idx: number) => {
        const pag = idx === 0
          ? { page, yEncabezadoFin }
          : crearPaginaConEncabezado(pdfDoc, { font, bold }, datosEncabezadoComun)

        const ladosPol = (pol?.lados ?? []).slice().sort((a: any, b: any) => a.orden - b.orden)
        const angulosPol = (pol?.angulos ?? []).slice().sort((a: any, b: any) => a.orden - b.orden)

        let y = pag.yEncabezadoFin - (idx === 0 ? 55 : 30)
        if (idx > 0) {
          pag.page.drawText('MEMORIA DE LAS OPERACIONES (continuación):', { x: margenX, y, size: 13, font: bold, color: azul })
          y -= 25
        }
        const tituloPoligono = listaPoligonos.length > 1 ? labelParcela(pol, idx) : 'POLIGONO GENERAL'
        pag.page.drawText(tituloPoligono, { x: margenX, y, size: 11, font: bold, color: negro })
        y -= 26

        pag.page.drawText('LADOS:', { x: margenX, y, size: 11, font: bold, color: negro })
        y -= 20
        if (!ladosPol.length) {
          pag.page.drawText('—', { x: margenX, y, size: 11, font, color: negro })
          y -= 18
        }
        ladosPol.forEach((lado: any) => {
          const valorM = lado.valor_m != null ? Number(lado.valor_m).toFixed(2).replace('.', ',') : '—'
          const texto = `${valorM} m = ${lado.valor_letras ?? '—'}`
          y = dibujarParrafo(pag.page, texto, margenX, y, anchoTexto, 11, font, negro, undefined, 0)
          y -= 4
        })
        y -= 16

        pag.page.drawText('ANGULOS:', { x: margenX, y, size: 11, font: bold, color: negro })
        y -= 20
        if (!angulosPol.length) {
          pag.page.drawText('—', { x: margenX, y, size: 11, font, color: negro })
          y -= 18
        }
        angulosPol.forEach((ang: any) => {
          const g = ang.grados ?? 0, m = ang.minutos ?? 0, s = ang.segundos ?? 0
          const texto = `${formatearDMS(g, m, s)} (${anguloALetrasConComa(g, m, s)}).`
          pag.page.drawText(texto, { x: margenX, y, size: 11, font, color: negro })
          y -= 18
        })
        y -= 20

        const superficieTexto = pol?.superficie_m2
          ? `${pol.superficie_m2} metros cuadrados${pol.superficie_letras ? ` (${pol.superficie_letras.toUpperCase()})` : ''}`
          : '—'
        const labelSup = 'SUPERFICIE TOTAL: '
        pag.page.drawText(labelSup, { x: margenX, y, size: 11, font: bold, color: negro })
        const wLabelSup = bold.widthOfTextAtSize(labelSup, 11)
        dibujarParrafo(pag.page, superficieTexto, margenX + wLabelSup, y, anchoTexto - wLabelSup, 11, font, negro, undefined, 0)
      })

    } else if (tipo === 'planilla_calculos') {
      // ── Planilla de Cálculo de Coordenadas y Superficie ─────────────────
      // Igual que la Memoria: un solo polígono mantiene el formato original de una
      // sola página; con varios, cada uno va en su propia página apaisada.
      const margenX = 25
      const listaPoligonos = poligonos.length > 0 ? poligonos : [null as any]
      const datosEncabezadoComun = {
        objeto: tipoMensuraTexto, comitente: nombreComitente, ubicacion: ubicacionCompleta,
        profesional: `Agrimensor ${nombreProfesional}`, email: profile?.email, telefono: profile?.telefono,
      }

      listaPoligonos.forEach((pol: any, idx: number) => {
        let pag: { page: PDFPage; width: number; yEncabezadoFin: number }
        if (idx === 0) {
          pag = { page, width, yEncabezadoFin }
        } else {
          const nuevaPagina = pdfDoc.addPage([841.89, 595.28])
          const { width: w2, height: h2 } = nuevaPagina.getSize()
          const yFin2 = dibujarEncabezado(nuevaPagina, w2, h2, { font, bold }, datosEncabezadoComun)
          pag = { page: nuevaPagina, width: w2, yEncabezadoFin: yFin2 }
        }

        const ladosPol = (pol?.lados ?? []).slice().sort((a: any, b: any) => a.orden - b.orden)
        const angulosPol = (pol?.angulos ?? []).slice().sort((a: any, b: any) => a.orden - b.orden)
        const calc = calcularPoligonal(ladosPol, angulosPol)

        const tituloPlanilla = listaPoligonos.length > 1
          ? `PLANILLA DE CALCULO DE COORDENADAS Y SUPERFICIE — ${labelParcela(pol, idx)}`
          : 'PLANILLA DE CALCULO DE COORDENADAS Y SUPERFICIE'
        pag.page.drawText(tituloPlanilla, {
          x: margenX, y: pag.yEncabezadoFin - 22, size: 12, font: bold, color: azul,
        })

        if (!calc) {
          pag.page.drawText('Cargá los lados y ángulos del polígono en la pestaña Mensura para generar esta planilla.', {
            x: margenX, y: pag.yEncabezadoFin - 50, size: 10, font, color: negro,
          })
          return
        }

        const { n, azimuts, dx, dy, x, y: yCoord, dxc, dyc, xc, yc, sumDX, sumDY, error } = calc
        const etiquetas = generarEtiquetasLados(n)
        const fmt = (v: number) => v.toFixed(2)
        const fmtAng = (g: number, m: number, s: number) => [String(g), String(m), String(Math.round(s))]

        // Anchos: N° | °,',"(ángulo) | LADO | °,',"(calc) | DX DY X Y DXC DYC XC YC
        const anchos = [34, 26, 24, 26, 52, 26, 24, 26, 58, 58, 58, 58, 58, 58, 58, 58]
        const encabezados = ['N°', '°', "'", '"', 'LADO', '°', "'", '"', 'DX', 'DY', 'X', 'Y', 'DXC', 'DYC', 'XC', 'YC']

        // Subtítulos de grupo (sin grilla) sobre las columnas de ángulos
        const xAngulo = margenX + anchos[0]
        const wAngulo = anchos[1] + anchos[2] + anchos[3]
        pag.page.drawText('ANGULO', { x: xAngulo + (wAngulo - bold.widthOfTextAtSize('ANGULO', 7)) / 2, y: pag.yEncabezadoFin - 38, size: 7, font: bold, color: negro })
        const xCalc = margenX + anchos.slice(0, 5).reduce((a, w) => a + w, 0)
        const wCalc = anchos[5] + anchos[6] + anchos[7]
        pag.page.drawText('ANG. DE CALCULO', { x: xCalc + (wCalc - bold.widthOfTextAtSize('ANG. DE CALCULO', 7)) / 2, y: pag.yEncabezadoFin - 38, size: 7, font: bold, color: negro })

        const filas: string[][] = []
        for (let i = 0; i < n; i++) {
          const ang = angulosPol[i] ?? {}
          const [ag, am, as_] = fmtAng(ang.grados ?? 0, ang.minutos ?? 0, ang.segundos ?? 0)
          const azRad = azimuts[i]
          const azGrados = Math.floor(azRad)
          const azMinutos = Math.round((azRad - azGrados) * 60)
          filas.push([
            etiquetas[i], ag, am, as_,
            fmt(Number(ladosPol[i]?.valor_m ?? 0)),
            String(azGrados), String(azMinutos), '0',
            fmt(dx[i]), fmt(dy[i]), fmt(x[i]), fmt(yCoord[i]),
            fmt(dxc[i]), fmt(dyc[i]), fmt(xc[i]), fmt(yc[i]),
          ])
        }
        // Fila de totales
        const sumLado = ladosPol.reduce((a: number, l: any) => a + Number(l?.valor_m ?? 0), 0)
        const sumGrados = angulosPol.reduce((a: number, an: any) => a + (an.grados ?? 0), 0)
        filas.push(['', String(sumGrados), '0', '0', fmt(sumLado), '', '', '', fmt(sumDX), fmt(sumDY), '', '', fmt(0), fmt(0), '', ''])

        const yDespuesTabla = dibujarTabla(pag.page, margenX, pag.yEncabezadoFin - 42, anchos, encabezados, filas, { font, bold }, negro, 13, 7)

        let yPie = yDespuesTabla - 16
        pag.page.drawText('ERROR TOTAL: ', { x: margenX + 300, y: yPie, size: 9, font: bold, color: negro })
        pag.page.drawText(error.toFixed(2), { x: margenX + 380, y: yPie, size: 9, font, color: negro })
        yPie -= 14
        pag.page.drawText('TOLERANCIA: ', { x: margenX + 300, y: yPie, size: 9, font: bold, color: negro })
        pag.page.drawText('0.10', { x: margenX + 380, y: yPie, size: 9, font, color: negro })
        yPie -= 20

        const superficieValor = pol?.superficie_m2 ? Number(pol.superficie_m2).toFixed(2) : '—'
        pag.page.drawRectangle({ x: margenX, y: yPie - 18, width: pag.width - margenX * 2, height: 22, color: rgb(0.92, 0.92, 0.92) })
        pag.page.drawText('SUPERFICIE:', { x: margenX + 300, y: yPie - 12, size: 10, font: bold, color: negro })
        pag.page.drawText(`${superficieValor}   m2`, { x: margenX + 390, y: yPie - 12, size: 10, font, color: negro })
      })

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

    // Pie de página (en todas las páginas del documento, por si es multipágina).
    // No aplica a las DDJJ: son el PDF oficial de Catastro tal cual, sin nada de NICA encima.
    if (!esDDJJ) {
      pdfDoc.getPages().forEach(p => {
        const { width: pw } = p.getSize()
        p.drawLine({
          start: { x: 40, y: 60 }, end: { x: pw - 40, y: 60 },
          thickness: 1, color: rgb(0.88, 0.91, 0.95),
        })
      })
    }

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
