import type { APIRoute } from 'astro'
import { supabase, getSupabase } from '../../../lib/supabase'
import { calcularPoligonal } from '../../../lib/poligonal'
import { CATEGORIAS_E1, INCISOS_E1, DESTINOS_E1 } from '../../../lib/edificacionE1'
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
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

// Lee un asset estático de /public/images — primero de disco (dev), con fallback a fetch (Vercel/
// producción, donde el filesystem del lambda no tiene el repo). Mismo patrón que ya usaban por
// separado el logo de la carátula y el del membrete — unificado acá para no repetirlo.
async function cargarLogoBytes(nombreArchivo: string, request: Request): Promise<Uint8Array | null> {
  try {
    const logoDisk = await readFile(join(process.cwd(), 'public', 'images', nombreArchivo))
    return new Uint8Array(logoDisk)
  } catch {
    try {
      const logoRes = await fetch(new URL(`/images/${nombreArchivo}`, request.url).toString())
      if (logoRes.ok) return new Uint8Array(await logoRes.arrayBuffer())
    } catch {}
  }
  return null
}

// Encabezado: caja negra a todo el ancho con Objeto/Comitente/Ubicación/Profesional (con wrap automático) + línea de contacto
function dibujarEncabezado(
  page: PDFPage, width: number, height: number,
  fonts: { font: PDFFont; bold: PDFFont },
  datos: { objeto: string; comitente: string; ubicacion: string; profesional: string; email?: string; telefono?: string },
  logo?: PDFImage | null,
) {
  const { font, bold } = fonts
  const negroFondo = rgb(0.08, 0.08, 0.1)
  const blanco = rgb(1, 1, 1)
  const gris   = rgb(0.42, 0.45, 0.50)
  const negro  = rgb(0.10, 0.10, 0.10)

  // Márgenes e ítems medidos contra el membrete real (Word → PDF) que usa Franco en
  // EXP_PRUEBA.pdf: la franja mide 442.25 de ancho arrancando en x=83.05 (página de 595.28 de
  // ancho) — no son los 30/30 simétricos que traía esta función antes de tener el logo.
  const margenIzq = 83
  const margenDer = 70
  const cajaX = margenIzq
  const cajaW = width - margenIzq - margenDer
  const padX = 10
  const sizeFila = 7.5
  const lhFila = 10.5

  // El logo ocupa la franja izquierda de la caja (igual que en la referencia, donde el logo
  // convive con el fondo negro de la franja); el texto arranca después, con un margen chico.
  const logoAlto = 36
  const logoAncho = logo ? logoAlto * (logo.width / logo.height) : 0
  const logoGap = logo ? 14 : 0
  const textoX = cajaX + padX + logoAncho + logoGap

  const filasTexto = [
    `OBJETO: ${datos.objeto}`,
    `COMITENTE: ${datos.comitente}`,
    `UBICACIÓN: ${datos.ubicacion}`,
    `PROFESIONAL: ${datos.profesional}`,
  ].map(t => t.toUpperCase())

  const anchoDisponible = cajaX + cajaW - padX - textoX
  const filasWrapped = filasTexto.map(t => partirEnLineas(t, anchoDisponible, sizeFila, bold))
  const totalLineas = filasWrapped.reduce((acc, l) => acc + l.length, 0)
  const barH = Math.max(52, totalLineas * lhFila + 14)

  const yTop = height - 14
  const cajaY = yTop - barH
  page.drawRectangle({ x: cajaX, y: cajaY, width: cajaW, height: barH, color: negroFondo })

  if (logo) {
    page.drawImage(logo, { x: cajaX + padX, y: cajaY + (barH - logoAlto) / 2, width: logoAncho, height: logoAlto })
  }

  let cursorY = yTop - 16
  filasWrapped.forEach(lineas => {
    lineas.forEach(linea => {
      page.drawText(linea, { x: textoX, y: cursorY, size: sizeFila, font: bold, color: blanco })
      cursorY -= lhFila
    })
  })

  // Línea separadora debajo de todo el encabezado — mismo ancho que la franja, no de margen a margen
  page.drawLine({ start: { x: cajaX, y: cajaY - 10 }, end: { x: cajaX + cajaW, y: cajaY - 10 }, thickness: 1, color: negro })

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
  logo?: PDFImage | null,
) {
  const page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const yEncabezadoFin = dibujarEncabezado(page, width, height, fonts, datosEncabezado, logo)
  return { page, width, height, yEncabezadoFin }
}

// Página "mini-carátula" divisoria — se usa solo al generar el expediente completo en un solo
// PDF, entre grupos de documentos (ej. "ACTAS" antes de Acta de Mensura + Acta de Ausencia).
// Mismo formato que ya usa la Carátula: membrete chico arriba, título centrado grande, logo
// circular grande al pie — tomado de EXP_PRUEBA.pdf, donde cada sección arranca con una página así.
async function crearPaginaDivisoria(
  pdfDoc: PDFDocument,
  fonts: { font: PDFFont; bold: PDFFont; boldItalic: PDFFont },
  datosEncabezado: { objeto: string; comitente: string; ubicacion: string; profesional: string; email?: string; telefono?: string },
  logoMembrete: PDFImage | null,
  logoCaratulaBytes: Uint8Array | null,
  titulo: string,
) {
  const { page, width, yEncabezadoFin } = crearPaginaConEncabezado(pdfDoc, fonts, datosEncabezado, logoMembrete)
  const negro = rgb(0.10, 0.10, 0.10)

  const tituloLineas = titulo.split('\n')
  let yTitulo = yEncabezadoFin - 150
  tituloLineas.forEach(linea => {
    dibujarCentrado(page, linea, yTitulo, 26, fonts.boldItalic, negro, width)
    yTitulo -= 32
  })

  if (logoCaratulaBytes) {
    const logoImg = await pdfDoc.embedPng(logoCaratulaBytes)
    const maxLogoW = 360, maxLogoH = 180
    const scale = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height)
    const lw = logoImg.width * scale, lh = logoImg.height * scale
    page.drawImage(logoImg, { x: (width - lw) / 2, y: 55, width: lw, height: lh })
  }

  return page
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

type PalabraConEstilo = { texto: string; font: PDFFont }

function dibujarLineaJustificadaMixta(page: PDFPage, palabras: PalabraConEstilo[], x: number, y: number, anchoLinea: number, size: number, color: any) {
  if (palabras.length === 1) {
    page.drawText(palabras[0].texto, { x, y, size, font: palabras[0].font, color })
    return
  }
  const anchoPalabras = palabras.reduce((acc, p) => acc + p.font.widthOfTextAtSize(p.texto, size), 0)
  const numGaps = palabras.length - 1
  const espacioNormal = palabras[0].font.widthOfTextAtSize(' ', size)
  const espacioExtra = Math.max(0, (anchoLinea - anchoPalabras - espacioNormal * numGaps) / numGaps)
  let cursorX = x
  palabras.forEach(p => {
    page.drawText(p.texto, { x: cursorX, y, size, font: p.font, color })
    cursorX += p.font.widthOfTextAtSize(p.texto, size) + espacioNormal + espacioExtra
  })
}

// Como dibujarParrafo, pero acepta varios segmentos con su propia fuente (ej. una oración fija
// en regular con un tramo puntual en negrita en el medio) — se explota todo a nivel de palabra
// para que el ajuste de línea y la justificación funcionen igual que en un párrafo normal.
function dibujarParrafoMixto(page: PDFPage, segmentos: PalabraConEstilo[], x: number, y: number, maxWidth: number, size: number, color: any, lineHeight?: number, sangria = 18): number {
  const lh = lineHeight ?? size * 1.55
  const palabras: PalabraConEstilo[] = []
  segmentos.forEach(seg => {
    seg.texto.replace(/\r?\n/g, ' ').split(' ').filter(Boolean).forEach(w => palabras.push({ texto: w, font: seg.font }))
  })

  const lineas: PalabraConEstilo[][] = []
  let actual: PalabraConEstilo[] = []
  let anchoActual = 0
  for (const palabra of palabras) {
    const anchoDisponible = lineas.length === 0 ? maxWidth - sangria : maxWidth
    const anchoPalabra = palabra.font.widthOfTextAtSize(palabra.texto, size)
    const espacio = actual.length ? palabra.font.widthOfTextAtSize(' ', size) : 0
    const anchoPrueba = anchoActual + espacio + anchoPalabra
    if (anchoPrueba > anchoDisponible && actual.length) {
      lineas.push(actual)
      actual = [palabra]
      anchoActual = anchoPalabra
    } else {
      actual.push(palabra)
      anchoActual = anchoPrueba
    }
  }
  if (actual.length) lineas.push(actual)

  lineas.forEach((linea, i) => {
    const esPrimera = i === 0
    const esUltima = i === lineas.length - 1
    const xLinea = x + (esPrimera ? sangria : 0)
    const anchoLinea = maxWidth - (esPrimera ? sangria : 0)
    const yLinea = y - i * lh
    if (esUltima) {
      let cursorX = xLinea
      linea.forEach(p => {
        page.drawText(p.texto, { x: cursorX, y: yLinea, size, font: p.font, color })
        cursorX += p.font.widthOfTextAtSize(p.texto, size) + p.font.widthOfTextAtSize(' ', size)
      })
    } else {
      dibujarLineaJustificadaMixta(page, linea, xLinea, yLinea, anchoLinea, size, color)
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

// Resta horas a un "HH:MM" — usado para citar a los linderos 1 hora antes de la hora real de
// mensura (Acta de Mensura y Acta de Ausencia de Linderos siguen mostrando la hora real).
function restarHora(horaStr: string | null | undefined, horas: number): string | null {
  if (!horaStr) return null
  const [h, m] = horaStr.split(':').map(n => parseInt(n) || 0)
  const totalMin = ((h * 60 + m - horas * 60) % 1440 + 1440) % 1440
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
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
  let tipos = form.getAll('tipos[]') as string[]
  const esBundle = tipos.includes('expediente_completo')

  if (!tipos.length) {
    return isAjax
      ? new Response(JSON.stringify({ ok: false, warn: 'sin_seleccion' }), { status: 400 })
      : redirect(`/expedientes/${expedienteId}?tab=documentos&warn=sin_seleccion`)
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

  // Formulario SOR es el espejo de U para inmuebles rurales — misma validación, sentido inverso.
  if (tipos.includes('formulario_sor')) {
    if (!inmueble) {
      return isAjax
        ? new Response(JSON.stringify({ ok: false, warn: 'ddjj_falta_inmueble' }), { status: 400 })
        : redirect(`/expedientes/${expedienteId}?tab=documentos&warn=ddjj_falta_inmueble`)
    }
    if ((inmueble as any).tipo_inmueble !== 'rural') {
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

  const { data: edificacion } = await db
    .from('edificacion').select('*').eq('expediente_id', expedienteId).maybeSingle()

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

  // Logos leídos una sola vez de disco acá (el chico del membrete y el grande de la carátula/
  // divisorias) — como cada tipo de documento arma su propio PDFDocument, se embeben de nuevo
  // (embedJpg/embedPng son baratos, no vuelven a leer el archivo) dentro del loop.
  const logoMembreteBytes = await cargarLogoBytes('nica-logo-membrete.jpg', request)
  const logoCaratulaBytes = await cargarLogoBytes('nica-logo-caratula.png', request)

  // "Generar expediente completo": no es un tipo de documento real, es un marcador — el
  // servidor arma su propia lista ordenada (no se confía en lo que mande el cliente) siguiendo
  // el mismo orden y las mismas divisorias que trae EXP_PRUEBA.pdf (el expediente de referencia
  // de Franco). "Notificación a Linderos" queda afuera a propósito: es un trámite previo a la
  // mensura, no forma parte del expediente final que se presenta a Catastro.
  const tipoDDJJPrincipal = (inmueble as any)?.tipo_inmueble === 'rural' ? 'formulario_sor' : 'formulario_u'
  const incluirE1 = !!edificacion
  const DIVISORIAS_BUNDLE: Record<string, string> = {
    capitulo_ubicacion: 'DESCRIPCIÓN Y DOMINIO\nDEL INMUEBLE',
    acta_mensura: 'ACTAS',
    memoria_mensura: 'MEMORIA DE OPERACIONES',
    planilla_calculos: 'PLANILLAS DE CÁLCULO',
    [tipoDDJJPrincipal]: `DECLARACIONES JURADAS\nFORMULARIOS "${tipoDDJJPrincipal === 'formulario_sor' ? 'SOR' : 'U'}${incluirE1 ? ' – E1' : ''}"`,
  }
  if (esBundle) {
    tipos = [
      'caratula', 'nota_elevacion', 'documento_identidad',
      'capitulo_ubicacion',
      'acta_mensura', 'acta_ausencia_linderos',
      'memoria_mensura',
      'planilla_calculos',
      tipoDDJJPrincipal,
      ...(incluirE1 ? ['formulario_e1'] : []),
    ]
  }

  const documentosParaSubir: { tipo: string; pdfBytes: Uint8Array }[] = []

  for (const tipo of tipos) {
    const esDDJJ = tipo === 'formulario_u' || tipo === 'formulario_sor' || tipo === 'formulario_e1'

    let pdfDoc: PDFDocument
    let page: PDFPage
    let font: PDFFont
    let bold: PDFFont
    let boldItalic: PDFFont
    let width: number, height: number
    let yEncabezadoFin = 0
    let logoMembrete: PDFImage | null = null

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
      logoMembrete = logoMembreteBytes ? await pdfDoc.embedJpg(logoMembreteBytes) : null
      yEncabezadoFin = dibujarEncabezado(page, width, height, { font, bold }, {
        objeto: tipoMensuraTexto,
        comitente: nombreComitente,
        ubicacion: ubicacionCompleta,
        profesional: `Agrimensor ${nombreProfesional}`,
        email: profile?.email,
        telefono: profile?.telefono,
      }, logoMembrete)
    }

    if (tipo === 'formulario_u') {
      // ── Formulario U — Declaración Jurada (Inmueble Urbano) ─────────────
      // Coordenadas medidas contra public/pdf-templates/formulario_u.pdf (612x1008pt), que es
      // la plantilla original de Catastro tal cual la entregó Franco. Esa plantilla traía, en
      // rojo, números de referencia ("2.3", "3.6", etc.) que Franco había marcado al analizar el
      // mapeo de campos — no van en el documento final. Se limpiaron una sola vez, a nivel de
      // archivo, cambiando el color de relleno de esos textos de rojo a blanco directamente en el
      // content stream del PDF (mismo texto, mismas coordenadas, ahora invisible) — no se editó a
      // mano ni se tapó con rectángulos, que en un intento anterior dejó tramos de línea borrados.
      // El párrafo de ejemplo de otro contribuyente en la página de la declaración es negro (no
      // rojo) y sí se tapa con un rectángulo puntual más abajo, junto a donde se escribe el real.
      // La plantilla trae 3 páginas, pero la del medio no tiene contenido propio (sin texto,
      // solo una línea suelta) — se descarta acá para no entregar una hoja vacía suelta.
      // OJO: pdf-lib cachea el array de getPages() y removePage() no invalida ese caché (ver
      // node_modules/pdf-lib/cjs/api/PDFDocument.js — insertPage sí llama pageCache.invalidate(),
      // removePage no). Como más arriba ya se llamó pdfDoc.getPages()[0] para la variable `page`,
      // cualquier getPages() posterior devuelve el array viejo de 3 páginas (con la del medio
      // todavía en el índice 1, aunque ya esté desconectada del árbol real del PDF). Por eso acá
      // se guarda la referencia a la página de RUBRO 4 (índice 2 en el array original) ANTES de
      // remover, en vez de volver a pedir getPages() después y asumir que se reindexó.
      const paginaDeclaracion = pdfDoc.getPages()[2]
      pdfDoc.removePage(1)
      const f = 8
      const blanco = rgb(1, 1, 1)
      // Marca la opción correspondiente (Sí/No) con una X en negrita sobre su casillero.
      const marcar = (valor: boolean | null | undefined, xSi: number, xNo: number, y: number, size = f) => {
        page.drawText('X', { x: valor ? xSi : xNo, y, size, font: bold, color: negro })
      }
      // En negrita: para que los datos cargados desde el expediente se distingan de un
      // vistazo del texto impreso de la plantilla (que va en fuente regular).
      const campo = (valor: string, x: number, y: number) => {
        page.drawText(valor, { x, y, size: f, font: bold, color: negro })
      }
      // La plantilla ya trae su propio renglón en blanco arriba de la etiqueta "LOCALIDAD" —
      // el valor va ahí directamente, apoyado sobre esa línea y un toque más grande, igual que
      // en el resto de la plantilla original.
      page.drawText(inmueble?.localidad ?? '', { x: 315, y: 841, size: 9, font: bold, color: negro })

      // Inc. a) Designación según título — "UBICACIÓN: Calle" es la fila de encabezado (con
      // NUMERO/CHACRA/FRAC/MANZANA/LOTE/P.HORIZONT como títulos de columna); los valores van
      // en la fila de abajo, dentro del recuadro.
      campo(inmueble?.calle_frente ?? '', 158, 764)
      campo(inmueble?.fraccion ?? '', 366, 764)
      campo(inmueble?.manzana ?? '', 396, 764)
      campo(inmueble?.parcela ?? '', 443, 764)

      // Inc. c) Registro de la Propiedad
      campo((inmueble as any)?.registro_tomo ?? '', 100, 690)
      // El casillero de FOLIO es angosto y la etiqueta "FOLIO" se parte en "FOLI" / "O" —
      // x=228 ubica el valor dentro de ese casillero, sin pisar la "O" partida.
      campo((inmueble as any)?.registro_folio ?? '', 228, 690)
      campo((inmueble as any)?.registro_anio ?? '', 275, 690)

      // Inc. e) Superficie del terreno (según plano de mensura, ya autocalculada)
      campo(poligono?.superficie_m2 != null ? Number(poligono.superficie_m2).toFixed(2) : '', 228, 639)

      // Inc. f) Otras informaciones adicionales — X moderada: marca el casillero sin tapar la
      // letra (S/I o N/O) que queda atrás.
      marcar((inmueble as any)?.agua_corriente, 150, 161, 559, 9)
      marcar((inmueble as any)?.cloacas, 270, 282, 559, 9)
      campo((inmueble as any)?.personas_habitan != null ? String((inmueble as any).personas_habitan) : '', 270, 544)
      // El casillero de año es de un dígito por celda (4 celditas) — se reparte el año dígito
      // por dígito en vez de escribirlo como un solo texto corrido.
      ;(String((inmueble as any)?.ultimo_anio_pago_impuesto ?? '').padStart(4, ' ')).split('').forEach((digito, i) => {
        if (digito.trim()) campo(digito, 249 + i * 11, 523)
      })
      // x=200 en vez de 235: para que el texto no se meta en el casillero reservado que trae la
      // plantilla al final de la línea.
      campo((inmueble as any)?.receptoria ?? '', 200, 487)

      // Rubro 3 — Datos del propietario (hasta 2 filas, a y b — el formulario no admite más sin Anexo A)
      const filasY = [436, 378]
      // La plantilla trae impreso en negro, a modo de ejemplo, "100" (fila a) y "DNI" (ambas
      // filas). Intentar hacerlos coincidir pixel a pixel con un rectángulo o un corrimiento de
      // posición terminaba cortando líneas de la grilla o mostrando el dato duplicado. Como
      // "100 % / DNI" es además el caso más común (dueño único, documento DNI), directamente no
      // se escribe nada encima cuando el dato real coincide con ese valor — se deja el impreso de
      // la plantilla tal cual. Solo se escribe cuando el dato real es distinto (otro % de
      // condominio, o LE/LC en vez de DNI).
      ;(expComitentes ?? []).slice(0, 2).forEach((ec: any, i: number) => {
        const c = ec.comitentes
        const y = filasY[i]
        const porcentaje = ec.porcentaje_condominio ?? 100
        const tipoDoc = c?.tipo_documento ?? 'DNI'
        campo(`${c?.apellido ?? ''}, ${c?.nombre ?? ''}`.toUpperCase(), 182, y)
        if (porcentaje !== 100) campo(String(porcentaje), 386, y)
        if (tipoDoc !== 'DNI') campo(tipoDoc, 429, y)
        campo(c?.dni ?? '', 460, y)
        campo(c?.domicilio_calle ?? '', 152, y - 29)
        campo(c?.domicilio_numero ?? '', 242, y - 29)
        campo(c?.domicilio_localidad ?? '', 303, y - 29)
        campo(c?.domicilio_provincia ?? '', 459, y - 29)
        marcar(ec.ausente_pais, 517, 529, y - 31, 9)
      })

      campo(inmueble?.propietario_anterior ?? '', 260, 316)

      // Última página (RUBRO 4 + declaración jurada). El párrafo original de la plantilla trae
      // una oración de ejemplo completa con nombre y DNI de otro contribuyente — se tapa con un
      // rectángulo blanco (sin tocar el borde de la caja) y se escribe encima el texto real.
      if (paginaDeclaracion) {
        const p3 = paginaDeclaracion
        p3.drawRectangle({ x: 61, y: 795, width: 475, height: 48, color: rgb(1, 1, 1) })

        // El declarante de esta página es el profesional (agrimensor), no el comitente —
        // confirmado contra el ejemplo real de Franco ("El que suscribe FRANCO ARTURO NIGRO
        // CARRIERE... en su carácter de AGRIMENSOR"). `profiles` no tiene columna de
        // nacionalidad ni tipo de documento — se asume Argentina/DNI, que en la práctica es
        // siempre así para un agrimensor matriculado acá (no amerita una columna nueva).
        const declarante = profile as any
        const nombreDeclarante = declarante ? `${declarante.nombre ?? ''} ${declarante.apellido ?? ''}`.toUpperCase() : ''
        const parrafo = `El que suscribe ${nombreDeclarante} nacionalidad Argentina documento de identidad DNI Nº ${declarante?.dni ?? ''} en su carácter de AGRIMENSOR declara bajo juramento que es verdad toda información suministrada por el y transcripta en el presente formulario y que tiene conocimiento de las penalidades establecidas por omision, falsedad y toda transgresión a las disposiciones legales.`

        // El recuadro de la declaración va de x≈55 a x≈539 (medido en el content stream del PDF)
        // — con ancho 500 el párrafo se pasaba del borde derecho de la caja en las líneas largas.
        const lineasParrafo = partirEnLineas(parrafo, 465, f, font)
        lineasParrafo.slice(0, 4).forEach((linea, i) => {
          p3.drawText(linea, { x: 62, y: 825 - i * 12.5, size: f, font, color: negro })
        })

        // La plantilla trae su propio "___ de ___     ___.-" con tres huecos separados
        // (día / mes / año) — antes se pisaban todos poniendo la fecha entera en el primer
        // hueco, quedando duplicada contra el "de" impreso. Se reparte acá, uno por hueco.
        const hoy = new Date()
        p3.drawText(String(hoy.getDate()), { x: 65, y: 745, size: f, font, color: negro })
        p3.drawText(MESES[hoy.getMonth()], { x: 162, y: 745, size: f, font, color: negro })
        p3.drawText(String(hoy.getFullYear()), { x: 270, y: 745, size: f, font, color: negro })
        if (declarante) {
          p3.drawText(nombreDeclarante, { x: 390, y: 683, size: f, font: bold, color: negro })
        }
      }

    } else if (tipo === 'formulario_sor') {
      // ── Formulario SOR — Declaración Jurada (Inmueble Suburbano/Rural) ──
      // Misma lógica que Formulario U: plantilla original de Catastro, con sus referencias en
      // rojo (y un resaltado amarillo de ejemplo en el casillero "NO") ya neutralizadas a nivel
      // de archivo (public/pdf-templates/formulario_sor.pdf). Una sola página, sin Rubro 4 ni
      // página de declaración jurada aparte — a diferencia de Formulario U.
      const fSor = 8
      const campoSor = (valor: string, x: number, y: number) => {
        page.drawText(valor, { x, y, size: fSor, font: bold, color: negro })
      }
      const marcarSor = (valor: boolean | null | undefined, xSi: number, xNo: number, y: number, size = fSor) => {
        page.drawText('X', { x: valor ? xSi : xNo, y, size, font: bold, color: negro })
      }

      campoSor(inmueble?.departamento ?? '', 345, 878)
      campoSor(inmueble?.localidad ?? '', 345, 869)

      // Inciso a) Designación según títulos — Corrientes distingue Chacra/Quinta como
      // subdivisiones propias que hoy no tienen columna en `inmuebles` (solo Paraje, Sección y
      // Lote tienen datos cargados); esos dos casilleros quedan en blanco por ahora.
      campoSor(inmueble?.fraccion ?? '', 125, 827)
      campoSor((inmueble as any)?.seccion ?? '', 305, 827)
      campoSor(inmueble?.parcela ?? '', 443, 827)

      // Inciso c) Inscripción en el Registro de la Propiedad
      campoSor((inmueble as any)?.registro_tomo ?? '', 120, 764)
      campoSor((inmueble as any)?.registro_folio ?? '', 245, 764)
      campoSor((inmueble as any)?.registro_anio ?? '', 445, 764)

      // Informaciones adicionales
      campoSor((inmueble as any)?.personas_habitan != null ? String((inmueble as any).personas_habitan) : '', 228, 730)
      ;(String((inmueble as any)?.ultimo_anio_pago_impuesto ?? '').padStart(4, ' ')).split('').forEach((digito, i) => {
        if (digito.trim()) campoSor(digito, 505 + i * 11, 730)
      })

      // Rubro 2 — hasta 3 filas de propietario (a, b, c)
      const filasYSor = [698, 656, 614]
      ;(expComitentes ?? []).slice(0, 3).forEach((ec: any, i: number) => {
        const c = ec.comitentes
        const y = filasYSor[i]
        const porcentaje = ec.porcentaje_condominio ?? 100
        campoSor(`${c?.apellido ?? ''}, ${c?.nombre ?? ''}`.toUpperCase(), 118, y)
        // La plantilla trae "100" impreso como ejemplo en la fila a) — si el dato real coincide,
        // no se escribe nada encima (mismo criterio que en Formulario U).
        if (porcentaje !== 100) campoSor(String(porcentaje), 378, y)
        campoSor(c?.tipo_documento ?? 'DNI', 402, y)
        campoSor(c?.dni ?? '', 430, y)
        campoSor(c?.domicilio_calle ?? '', 118, y - 20)
        campoSor(c?.domicilio_numero ?? '', 245, y - 20)
        campoSor(c?.domicilio_localidad ?? '', 290, y - 20)
        campoSor(c?.domicilio_provincia ?? '', 430, y - 20)
        marcarSor(ec.ausente_pais, 505, 520, y - 20)
      })

      campoSor((inmueble as any)?.receptoria ?? '', 200, 568)

    } else if (tipo === 'formulario_e1') {
      // ── Formulario E1 — Características constructivas (solo si hay edificación) ──
      // Misma lógica que U/SOR: plantilla original de Catastro con sus 7 referencias en rojo
      // ya neutralizadas a nivel de archivo (public/pdf-templates/formulario_e1.pdf). Una sola
      // página. Coordenadas de primer calibrado (grilla de referencia) — la grilla de Rubro 1
      // (13 categorías × 5 incisos) es la parte más sensible a un desfasaje de Franco, así que
      // conviene avisar en la revisión si algo no calza para ajustar en una segunda pasada.
      const fE1 = 7.5
      const campoE1 = (valor: string, x: number, y: number, size = fE1) => {
        page.drawText(valor, { x, y, size, font: bold, color: negro })
      }
      const marcarE1 = (x: number, y: number, size = fE1) => {
        page.drawText('X', { x, y, size, font: bold, color: negro })
      }

      campoE1(inmueble?.departamento ?? '', 290, 935)
      campoE1(inmueble?.localidad ?? '', 290, 918)
      const declaranteE1 = (expComitentes?.[0] as any)?.comitentes
      campoE1(declaranteE1 ? `${declaranteE1.apellido ?? ''}, ${declaranteE1.nombre ?? ''}`.toUpperCase() : '', 290, 901)

      // Destino del edificio — 9 opciones en dos columnas (5 izquierda, 4 derecha). Coordenadas
      // medidas contra un ejemplo real de Franco (EXP_PRUEBA.pdf, casillero por casillero con
      // grilla fina) en vez de la plantilla vacía — mucho más preciso que el primer calibrado.
      // OJO: la plantilla trae "Casa de Familia" pre-tildado de fábrica (ejemplo impreso, mismo
      // criterio que el "100"/"DNI" de Formulario U) — si el destino real es ese, no se dibuja
      // nada encima; para cualquier otro destino si se marca el casillero real.
      const destinoSeleccionado = (edificacion as any)?.destino_edificio
      const DESTINO_XY: Record<string, [number, number]> = {
        casa_familia: [308, 889],
        casa_departamentos: [308, 870],
        hotel: [308, 851],
        sanatorio: [308, 832],
        oficina: [308, 813],
        asociaciones: [538, 889],
        negocios: [538, 870],
        espectaculos: [538, 851],
        otros: [538, 832],
      }
      if (destinoSeleccionado && destinoSeleccionado !== 'casa_familia' && DESTINO_XY[destinoSeleccionado]) {
        const [dx, dy] = DESTINO_XY[destinoSeleccionado]
        marcarE1(dx, dy)
      }
      if (destinoSeleccionado === 'otros') {
        campoE1((edificacion as any)?.destino_otros_detalle ?? '', 460, 826, 7)
      }

      // Rubro 1 — Características: 13 categorías × 5 incisos (a-e). Límites de fila/columna
      // medidos contra el mismo ejemplo real (no son parejos: el inciso a) es bien más ancho que
      // el resto, y la fila "Techos" más baja que las demás). El casillero elegido se sombrea en
      // gris (no una X) — así lo marca Franco a mano.
      const grisClaroE1 = rgb(0.85, 0.85, 0.85)
      const COL_BOUNDS_E1 = [55, 198, 300, 408, 500, 600]
      const ROW_BOUNDS_E1 = [800, 763, 726, 702, 665, 630, 596, 562, 528, 495, 462, 428, 395, 355, 322]
      const caracteristicas = (edificacion as any)?.caracteristicas ?? {}
      CATEGORIAS_E1.forEach((cat, i) => {
        const inciso = caracteristicas[cat.key]
        if (!inciso) return
        const colIdx = INCISOS_E1.indexOf(inciso)
        if (colIdx === -1) return
        const xIni = COL_BOUNDS_E1[colIdx] + 1
        const xFin = COL_BOUNDS_E1[colIdx + 1] - 1
        const yIni = ROW_BOUNDS_E1[i + 1] + 1
        const yFin = ROW_BOUNDS_E1[i] - 1
        page.drawRectangle({ x: xIni, y: yIni, width: xFin - xIni, height: yFin - yIni, color: grisClaroE1 })
      })

      // Fila "14) Tipo del edificio" — cantidad de categorías (de las 13) que eligieron cada
      // inciso A-E. Catastro lo usa para clasificar el edificio; hoy Franco lo cuenta a mano —
      // acá sale solo de los datos ya cargados (aproximación a nivel de categoría, no de cada
      // sub-frase individual dentro del casillero, que no guardamos).
      const conteoPorInciso: Record<string, number> = { a: 0, b: 0, c: 0, d: 0, e: 0 }
      CATEGORIAS_E1.forEach(cat => {
        const inciso = caracteristicas[cat.key]
        if (inciso && conteoPorInciso[inciso] != null) conteoPorInciso[inciso]++
      })
      const yFila14 = (ROW_BOUNDS_E1[13] + ROW_BOUNDS_E1[14]) / 2 - 3
      INCISOS_E1.forEach((inciso, idx) => {
        const xCentro = COL_BOUNDS_E1[idx] + (COL_BOUNDS_E1[idx + 1] - COL_BOUNDS_E1[idx]) * 0.4
        campoE1(String(conteoPorInciso[inciso]), xCentro, yFila14)
      })

      // Rubro 2 — Otros datos (12 renglones, de "a" a "l"), espaciados parejo entre y=275 y y=88.
      // (No y=258: en un render de prueba la marca de "Estado de conservación" caía una fila
      // más abajo, sobre "Edad del edificio" — con 275 como ancla de la fila "a" quedó alineado.)
      const rubro2Y = (idx: number) => 275 - idx * ((275 - 88) / 11)
      const ESTADO_XY: Record<string, number> = { bueno: 371, regular: 434, malo: 504 }
      const estadoX = ESTADO_XY[(edificacion as any)?.estado_conservacion ?? '']
      if (estadoX) marcarE1(estadoX, rubro2Y(0))
      campoE1((edificacion as any)?.edad_edificio != null ? String((edificacion as any).edad_edificio) : '', 540, rubro2Y(1))
      campoE1((edificacion as any)?.superficie_cubierta != null ? Number((edificacion as any).superficie_cubierta).toFixed(2) : '', 540, rubro2Y(2))
      campoE1((edificacion as any)?.superficie_semicubierta != null ? Number((edificacion as any).superficie_semicubierta).toFixed(2) : '', 540, rubro2Y(3))
      campoE1((edificacion as any)?.superficie_negocios != null ? Number((edificacion as any).superficie_negocios).toFixed(2) : '', 540, rubro2Y(4))
      campoE1((edificacion as any)?.banos_principales != null ? String((edificacion as any).banos_principales) : '', 540, rubro2Y(5))
      campoE1((edificacion as any)?.toilettes != null ? String((edificacion as any).toilettes) : '', 540, rubro2Y(6))
      campoE1((edificacion as any)?.pileta_natacion != null ? Number((edificacion as any).pileta_natacion).toFixed(2) : '', 540, rubro2Y(7))
      campoE1((edificacion as any)?.agua_caliente_central != null ? String((edificacion as any).agua_caliente_central) : '', 540, rubro2Y(8))
      campoE1((edificacion as any)?.ascensores != null ? String((edificacion as any).ascensores) : '', 540, rubro2Y(9))
      campoE1((edificacion as any)?.instalaciones_incendio != null ? String((edificacion as any).instalaciones_incendio) : '', 540, rubro2Y(10))
      campoE1((edificacion as any)?.cantidad_habitaciones != null ? String((edificacion as any).cantidad_habitaciones) : '', 540, rubro2Y(11))

      // Lugar y fecha / Aclaración de firma (la declaración jurada en sí ya viene impresa en la
      // plantilla, sin datos de ejemplo que reemplazar).
      const hoyE1 = new Date()
      const lugarFechaE1 = `${inmueble?.localidad ?? ''}, ${hoyE1.getDate()} de ${MESES[hoyE1.getMonth()]} de ${hoyE1.getFullYear()}`
      campoE1(lugarFechaE1, 110, 45, 8)
      if (declaranteE1) {
        campoE1(`${declaranteE1.nombre ?? ''} ${declaranteE1.apellido ?? ''}`.toUpperCase(), 150, 20, 8)
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
        if (logoCaratulaBytes) {
          const logoImg = await pdfDoc.embedPng(logoCaratulaBytes)
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
          : crearPaginaConEncabezado(pdfDoc, { font, bold }, datosEncabezado, logoMembrete)

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

      // El campo "Antecedentes Técnicos" (Tab 2 Inmueble) solo pide los códigos de duplicados
      // de mensura (ej. "3072-K, 3052-K, 3056-K, 3144-K") — la oración fija de alrededor la arma
      // el generador, con los códigos en negrita, igual que en los ejemplos reales de Franco.
      const antecedentesTecnicos = (inmueble as any)?.antecedentes_tecnicos
      if (antecedentesTecnicos) {
        page.drawText('ANTECEDENTES TÉCNICOS:', { x: margenX, y, size: 11, font: bold, color: negro })
        y -= 20
        dibujarParrafoMixto(page, [
          { texto: 'En el sistema GEOSIT de la Dirección General de Catastro se hallan los duplicados de Mensura ', font },
          { texto: antecedentesTecnicos, font: bold },
          { texto: ' relacionadas a las presentes operaciones.', font },
        ], margenX, y, anchoTexto, 11, negro)
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
      // La citación a linderos se hace 1 hora antes de la hora real de mensura (que sí se
      // muestra tal cual en Acta de Mensura y Acta de Ausencia de Linderos) — es el margen que
      // pide Franco para que los linderos lleguen antes de que arranquen las operaciones.
      const horaTexto = restarHora((exp as any)?.hora_mensura, 1) ?? '—'
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
          : crearPaginaConEncabezado(pdfDoc, { font, bold }, datosEncabezadoComun, logoMembrete)

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
          const yFin2 = dibujarEncabezado(nuevaPagina, w2, h2, { font, bold }, datosEncabezadoComun, logoMembrete)
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
    documentosParaSubir.push({ tipo, pdfBytes })
  }

  if (esBundle) {
    // Un solo PDF: se pegan las páginas de cada documento ya generado (mismo código de arriba,
    // sin tocarlo) en un único PDFDocument, con una página divisoria entre cada grupo — mismo
    // criterio que EXP_PRUEBA.pdf. copyPages() es la forma estándar de pdf-lib de mezclar PDFs.
    const bundleDoc = await PDFDocument.create()
    const fontsBundle = {
      font: await bundleDoc.embedFont(StandardFonts.Helvetica),
      bold: await bundleDoc.embedFont(StandardFonts.HelveticaBold),
      boldItalic: await bundleDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    }
    const datosEncabezadoBundle = {
      objeto: tipoMensuraTexto, comitente: nombreComitente, ubicacion: ubicacionCompleta,
      profesional: `Agrimensor ${nombreProfesional}`, email: profile?.email, telefono: profile?.telefono,
    }
    // Se embebe una sola vez por documento combinado y se reusa en cada divisoria — embedJpg
    // repetido en el mismo PDFDocument no rompe nada, pero infla el archivo sin necesidad.
    const logoMembreteBundle = logoMembreteBytes ? await bundleDoc.embedJpg(logoMembreteBytes) : null

    for (const { tipo, pdfBytes } of documentosParaSubir) {
      const tituloDivisoria = DIVISORIAS_BUNDLE[tipo]
      if (tituloDivisoria) {
        await crearPaginaDivisoria(bundleDoc, fontsBundle, datosEncabezadoBundle, logoMembreteBundle, logoCaratulaBytes, tituloDivisoria)
      }
      const docCargado = await PDFDocument.load(pdfBytes)
      const paginasCopiadas = await bundleDoc.copyPages(docCargado, docCargado.getPageIndices())
      paginasCopiadas.forEach(p => bundleDoc.addPage(p))
    }

    // Divisoria final — Franco adjunta el plano de mensura (CAD) aparte, fuera del alcance de
    // la app; esta página solo marca dónde va.
    await crearPaginaDivisoria(bundleDoc, fontsBundle, datosEncabezadoBundle, logoMembreteBundle, logoCaratulaBytes, 'PLANO DE MENSURA')

    const bundleBytes = await bundleDoc.save()
    const storagePath = `${expedienteId}/expediente_completo_${Date.now()}.pdf`
    const { error: uploadError } = await db.storage
      .from('documentos')
      .upload(storagePath, bundleBytes, { contentType: 'application/pdf', upsert: true })

    const { data: docInsertado } = await db.from('documentos_generados').insert({
      expediente_id: expedienteId,
      tipo_documento: 'expediente_completo',
      storage_path: uploadError ? null : storagePath,
      estado: uploadError ? 'error_storage' : 'generado',
      generado_at: new Date().toISOString(),
    }).select('id, tipo_documento, storage_path, estado, generado_at').single()

    if (docInsertado) documentosCreados.push(docInsertado as any)
  } else {
    for (const { tipo, pdfBytes } of documentosParaSubir) {
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
  }

  if (isAjax) {
    return new Response(JSON.stringify({ ok: true, documentos: documentosCreados }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return redirect(`/expedientes/${expedienteId}?tab=documentos&ok=1`)
}
