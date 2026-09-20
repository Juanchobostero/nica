import type { APIRoute } from 'astro'
import { getSupabaseAnon, getSupabase } from '../../../lib/supabase'
import { calcularPoligonal, calcularTolerancia } from '../../../lib/poligonal'
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

// Título centrado que envuelve a varias líneas (y encoge el tamaño si hace falta) — para títulos
// de acta que ahora incluyen el nombre completo del objeto (pedido de Franco, 19/9: "las actas
// tienen que tener de título el nombre del objeto"), que puede ser bastante largo. Devuelve la
// posición Y debajo de la última línea dibujada, para que el resto del contenido siga desde ahí
// en vez de asumir siempre una sola línea.
function dibujarTituloWrap(page: PDFPage, texto: string, yTop: number, sizeMax: number, font: PDFFont, color: any, pageWidth: number, maxWidth: number, lineHeight = 16): number {
  let size = sizeMax
  let lineas = partirEnLineas(texto, maxWidth, size, font)
  while (lineas.length > 3 && size > 9) {
    size -= 0.5
    lineas = partirEnLineas(texto, maxWidth, size, font)
  }
  let y = yTop
  for (const linea of lineas) {
    dibujarCentrado(page, linea, y, size, font, color, pageWidth)
    y -= lineHeight
  }
  return y
}

// Dibuja una fila "ETIQUETA: valor" que envuelve a más de una línea si el valor es largo (pedido
// de Franco, 19/9: linderos con muchos nombres se salían por el borde de la hoja) — usada en
// "Los/Sus linderos son" de capitulo_ubicacion, citacion_linderos, acta_mensura y
// acta_ausencia_linderos. Soporta un prefijo opcional (el "- " que usa citacion_linderos antes
// de la etiqueta) y un sufijo opcional (la línea de puntos de citacion_linderos, que se agrega
// después del valor así queda al final de la última línea, envuelva o no). Devuelve la posición Y
// para la fila siguiente (ya con el espaciado entre filas aplicado).
function dibujarFilaLindero(
  page: PDFPage, label: string, valor: string,
  xLabel: number, y: number, anchoDisponible: number,
  size: number, font: PDFFont, boldFont: PDFFont, color: any,
  opts: { lineHeight?: number; gapEntreFilas?: number; prefijo?: string; sufijo?: string } = {},
): number {
  const { lineHeight = 16, gapEntreFilas = 16, prefijo = '', sufijo = '' } = opts
  let xActual = xLabel
  if (prefijo) {
    page.drawText(prefijo, { x: xActual, y, size, font: boldFont, color })
    xActual += boldFont.widthOfTextAtSize(prefijo, size)
  }
  page.drawText(label, { x: xActual, y, size, font: boldFont, color })
  const wLabel = boldFont.widthOfTextAtSize(label, size)
  const xValor = xActual + wLabel
  const anchoValor = (xLabel + anchoDisponible) - xValor
  const lineas = partirEnLineas(`${valor}${sufijo}`, anchoValor, size, font)
  let yLinea = y
  lineas.forEach((linea, idx) => {
    page.drawText(linea, { x: xValor, y: yLinea, size, font, color })
    if (idx < lineas.length - 1) yLinea -= lineHeight
  })
  return yLinea - gapEntreFilas
}

// "titular" y "propietario" son sinónimos, pero Catastro es exigente con la terminología y pide
// literalmente "propietario" en los documentos (pedido de Franco, 19/9). El valor interno
// guardado en `exp_comitentes.rol` sigue siendo 'titular' (no se toca el default/check de la
// columna ni los <option value="titular"> del formulario — solo cambia el texto impreso). Los
// demás roles (apoderado/heredero/poseedor/intendente) se imprimen tal cual.
function rolLabel(rol: string): string {
  return rol === 'titular' ? 'propietario' : rol
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

// Encabezado: franja blanca a todo el ancho con Objeto/Comitente/Ubicación/Profesional (con wrap
// automático) + línea de contacto. Antes tenía relleno negro con el isologo rectangular incrustado
// — Franco pidió sacar el negro y usar el logo circular real "ESTUDIO DE AGRIMENSURA" (el mismo
// que ya se usa al pie de la carátula, recortado a sólo el círculo — ver
// public/images/nica-logo-icono.png), replicando MEMBRETE_PROPUESTO.pdf. Un primer intento
// redibujaba el sello a mano con formas vectoriales (dibujarSelloProfesional, ya eliminada); no
// quedaba igual al logo real, así que se optó por incrustar la imagen real en vez de reproducirla.
function dibujarEncabezado(
  page: PDFPage, width: number, height: number,
  fonts: { font: PDFFont; bold: PDFFont },
  datos: { objeto: string; comitente: string; comitentePrimero?: string; ubicacion: string; profesional: string; email?: string; telefono?: string },
  logo?: PDFImage | null,
) {
  const { font, bold } = fonts
  const gris   = rgb(0.42, 0.45, 0.50)
  const negro  = rgb(0.10, 0.10, 0.10)

  // Márgenes medidos contra el membrete real (Word → PDF) que usa Franco en EXP_PRUEBA.pdf: la
  // franja mide 442.25 de ancho arrancando en x=83.05 (página de 595.28 de ancho) — no son los
  // 30/30 simétricos que traía esta función antes de tener el logo.
  const margenIzq = 83
  const margenDer = 70
  const cajaX = margenIzq
  const cajaW = width - margenIzq - margenDer
  const padX = 10
  const sizeFila = 7.5
  const lhFila = 10.5

  // El logo ocupa la franja izquierda de la caja — reservado un ancho generoso para el wrap del
  // texto; el diámetro final (más abajo) se estira para ocupar casi todo el alto del bloque de
  // texto, igual que en MEMBRETE_PROPUESTO.pdf (el logo circular es tan alto como las 4 líneas
  // juntas, no un ícono chico).
  const logoReservado = 62
  const logoGap = 14
  const textoX = cajaX + padX + logoReservado + logoGap

  const anchoDisponible = cajaX + cajaW - padX - textoX

  // COMITENTE es distinto a los otros 3 campos: Objeto/Ubicación/Profesional pueden ocupar
  // varias líneas libremente (la caja crece), pero con varios comitentes cargados Franco pidió
  // que el rótulo se mantenga en una sola línea — si el listado completo ("A, B y C") no entra,
  // se acorta al primero + "Y OTROS" en vez de pasar a una 2ª línea.
  const comitenteCompleto = `COMITENTE: ${datos.comitente}`.toUpperCase()
  const comitenteTexto = bold.widthOfTextAtSize(comitenteCompleto, sizeFila) <= anchoDisponible
    ? comitenteCompleto
    : `COMITENTE: ${(datos.comitentePrimero ?? datos.comitente).toUpperCase()} Y OTROS`

  const etiquetas = ['OBJETO', 'COMITENTE', 'UBICACIÓN', 'PROFESIONAL']
  const filasTexto = [
    `OBJETO: ${datos.objeto}`,
    comitenteTexto,
    `UBICACIÓN: ${datos.ubicacion}`,
    `PROFESIONAL: ${datos.profesional}`,
  ].map((t, i) => i === 1 ? t : t.toUpperCase())

  const filasWrapped = filasTexto.map(t => partirEnLineas(t, anchoDisponible, sizeFila, bold))
  const totalLineas = filasWrapped.reduce((acc, l) => acc + l.length, 0)
  const barH = Math.max(52, totalLineas * lhFila + 14)

  const yTop = height - 14
  const cajaY = yTop - barH

  if (logo) {
    const logoDiametro = Math.min(logoReservado, barH - 6)
    const logoAlto = logoDiametro
    const logoAncho = logoAlto * (logo.width / logo.height)
    page.drawImage(logo, {
      x: cajaX + padX + (logoReservado - logoAncho) / 2,
      y: cajaY + (barH - logoAlto) / 2,
      width: logoAncho, height: logoAlto,
    })
  }

  // Cada etiqueta (OBJETO/COMITENTE/UBICACIÓN/PROFESIONAL) va subrayada — igual que en
  // MEMBRETE_PROPUESTO.pdf — sobre la primera línea de cada campo (si el valor es tan largo que
  // el campo se parte en varias líneas, el subrayado va sólo en la primera).
  let cursorY = yTop - 16
  filasWrapped.forEach((lineas, idx) => {
    lineas.forEach((linea, li) => {
      page.drawText(linea, { x: textoX, y: cursorY, size: sizeFila, font: bold, color: negro })
      if (li === 0) {
        const etiquetaTexto = `${etiquetas[idx]}:`
        const wEtiqueta = bold.widthOfTextAtSize(etiquetaTexto, sizeFila)
        page.drawLine({ start: { x: textoX, y: cursorY - 1.5 }, end: { x: textoX + wEtiqueta, y: cursorY - 1.5 }, thickness: 0.6, color: negro })
      }
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
  datosEncabezado: { objeto: string; comitente: string; comitentePrimero?: string; ubicacion: string; profesional: string; email?: string; telefono?: string },
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
  datosEncabezado: { objeto: string; comitente: string; comitentePrimero?: string; ubicacion: string; profesional: string; email?: string; telefono?: string },
  logoMembrete: PDFImage | null,
  logoCaratulaBytes: Uint8Array | null,
  titulo: string,
) {
  const { page, width, yEncabezadoFin } = crearPaginaConEncabezado(pdfDoc, fonts, datosEncabezado, logoMembrete)
  const negro = rgb(0.10, 0.10, 0.10)

  // Títulos con poco texto (ej. "ACTAS") se agrandan para que la página divisoria se vea más
  // representativa — pedido de Franco sobre las carátulas/divisorias con poco contenido.
  const tituloLineas = titulo.split('\n')
  const maxLargoLinea = Math.max(...tituloLineas.map(l => l.length))
  const tituloSize = maxLargoLinea <= 8 ? 40 : maxLargoLinea <= 16 ? 34 : 26
  const lineGap = tituloSize + 6
  let yTitulo = yEncabezadoFin - 150
  tituloLineas.forEach(linea => {
    dibujarCentrado(page, linea, yTitulo, tituloSize, fonts.boldItalic, negro, width)
    yTitulo -= lineGap
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
function dibujarParrafo(page: PDFPage, texto: string, x: number, y: number, maxWidth: number, size: number, font: PDFFont, color: any, lineHeight?: number, sangria = 30): number {
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
function dibujarParrafoMixto(page: PDFPage, segmentos: PalabraConEstilo[], x: number, y: number, maxWidth: number, size: number, color: any, lineHeight?: number, sangria = 30): number {
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
  // "Manzana" o "Chacra" según lo que el usuario eligió al cargar el inmueble (pedido de
  // Franco, 19/9 — algunas zonas de Corrientes numeran por "Chacra" en vez de "Manzana").
  // Default "manzana" si el expediente es de antes de este cambio (columna sin valor todavía).
  if (inmueble.manzana)         partes.push(`${inmueble.manzana_tipo === 'chacra' ? 'Chacra' : 'Manzana'} ${inmueble.manzana}`)
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

// Genera etiquetas de lado "1-2", "2-3", "3-4"... — antes eran letras (AB, BC, CD...), pero con
// solo 26 letras un polígono de más de 26 vértices repetía el ciclo desde "A" (un caso real de
// Franco, polígono de 32 lados, terminaba con dos lados distintos llamados "AB"). Con números no
// hay techo.
function generarEtiquetasLados(n: number): string[] {
  const etiquetas: string[] = []
  for (let i = 0; i < n; i++) etiquetas.push(`${i + 1}-${((i + 1) % n) + 1}`)
  return etiquetas
}

// Dibuja una tabla con grilla: encabezado en negrita + filas de datos
// `paginacion` (opcional) permite que una tabla con muchas filas (ej. un polígono de 32 lados)
// continúe en una página nueva en vez de seguir dibujando filas fuera del borde inferior de la
// hoja (bug real: con pocos lados nunca se notaba, pero con muchos las filas de más abajo
// quedaban directamente invisibles/cortadas). `nuevaPagina()` crea la página siguiente (con su
// propio membrete) y el encabezado de columnas se vuelve a dibujar arriba de cada una.
function dibujarTabla(
  page: PDFPage, x0: number, yTop: number,
  anchos: number[], encabezados: string[], filas: string[][],
  fonts: { font: PDFFont; bold: PDFFont }, color: any, rowHeight = 14, fontSize = 7,
  paginacion?: { yMinimo: number; nuevaPagina: () => { page: PDFPage; yTop: number } },
): { page: PDFPage; y: number } {
  const { font, bold } = fonts
  const totalWidth = anchos.reduce((a, w) => a + w, 0)
  let paginaActual = page
  let y = yTop

  const dibujarFila = (valores: string[], esEncabezado: boolean) => {
    paginaActual.drawRectangle({ x: x0, y: y - rowHeight, width: totalWidth, height: rowHeight, borderColor: color, borderWidth: 0.6 })
    let cx = x0
    valores.forEach((valor, i) => {
      if (i > 0) paginaActual.drawLine({ start: { x: cx, y }, end: { x: cx, y: y - rowHeight }, thickness: 0.5, color })
      const fnt = esEncabezado ? bold : font
      const w = fnt.widthOfTextAtSize(valor, fontSize)
      paginaActual.drawText(valor, { x: cx + (anchos[i] - w) / 2, y: y - rowHeight + 4, size: fontSize, font: fnt, color })
      cx += anchos[i]
    })
    y -= rowHeight
  }

  dibujarFila(encabezados, true)
  filas.forEach(fila => {
    if (paginacion && y - rowHeight < paginacion.yMinimo) {
      const nueva = paginacion.nuevaPagina()
      paginaActual = nueva.page
      y = nueva.yTop
      dibujarFila(encabezados, true)
    }
    dibujarFila(fila, false)
  })
  return { page: paginaActual, y }
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

// ── Formulario SOR — página de dorso (Rubros 5/6/7 + declaración jurada) ──────
// `formulario_sor.pdf` es de una sola página — al frente (Rubros 1-3) le falta esta segunda
// página que sí tiene el formulario real (confirmado contra la hoja "SoR (D)" del Excel de
// referencia de Franco). Los Rubros 5/6/7 son "Reservado para la Dirección" — nuestro sistema
// nunca completa esos valores, así que acá solo se dibuja la GRILLA y las etiquetas impresas
// del formulario (nunca los datos de ejemplo que Franco cargó en su Excel para mostrar dónde
// va cada cosa — eso no se replica). La única parte con datos reales es la declaración jurada
// de abajo, con el mismo criterio que ya corrigió Formulario U: declarante = comitente + rol.
//
// Coordenadas: recalculadas desde cero (14/9, segunda pasada) sumando el ANCHO REAL de cada
// columna de la hoja "SoR (D)" del Excel (librería `xlsx`, script aparte, sin tocar el
// proyecto: lee `ws['!cols'][i].wpx` columna por columna y acumula, en vez de estimar la
// posición de cada grupo a ojo como en el primer calibrado) — coordenadas objetivas, no
// aproximadas. Confirmó además una estructura que el primer calibrado no había capturado: cada
// sub-columna tiene, además de su etiqueta de texto (fila 7-8), un NÚMERO clave propio (fila 10:
// 1, 2, 3...) — así es como Catastro marca la grilla en el formulario real (tilda el número, no
// la palabra) — y la fila "MONTE" (9) no es una franja fusionada como las filas 6-8: son 3
// segmentos propios BUENO / REGULAR / MALO (merges reales R28:Y28, AA28:AK28, AM28:AT28).
const SOR_DORSO_ESCALA_X = 532 / 1474
const sorDorsoX = (excelX: number) => 40 + excelX * SOR_DORSO_ESCALA_X
const sorDorsoYtop = (excelY: number) => 35 + excelY

type SubRubro5 = { n?: number; label: string; x: number }
// `titulo` es el texto completo (sin cortes manuales) — en el Excel real, la mayoría de estos
// títulos están fusionados en 2 filas (AH4:AL4/AH5:AL5, AN4:AU4/AN5:AU5, y también W4:Z5,
// AB4:AF5 como una sola celda de 2 filas con "ajustar texto") para entrar en columnas angostas;
// el envoltorio a 1-2 líneas se calcula solo más abajo con `partirEnLineas`, en vez de cortar
// manualmente solo 2 de los 7 (lo que dejaba a "ESPESOR DE CAPA ARABLE"/"COLOR DE LA TIERRA"
// intentando entrar en una sola línea y desbordando sobre el título vecino).
type GrupoRubro5 = { titulo: string; xIni: number; xFin: number; subs: SubRubro5[] }
const RUBRO5_GRUPOS: GrupoRubro5[] = [
  { titulo: 'RELIEVE', xIni: 424, xFin: 493, subs: [
    { n: 1, label: 'LLANO', x: 424 }, { n: 2, label: 'ONDULADO', x: 447 }, { n: 3, label: 'MUY ONDULADO', x: 470 },
  ] },
  { titulo: 'ESPESOR DE CAPA ARABLE', xIni: 507, xFin: 599, subs: [
    { n: 1, label: 'MAS DE 30 CM', x: 507 }, { n: 2, label: 'DE 29 A 20 CM', x: 530 }, { n: 3, label: 'DE 19 A 10 CM', x: 553 }, { n: 4, label: 'MENOS DE 10 CM', x: 576 },
  ] },
  { titulo: 'COLOR DE LA TIERRA', xIni: 613, xFin: 728, subs: [
    { n: 1, label: 'NEGRO', x: 613 }, { n: 2, label: 'ROJIZO OSCURO', x: 636 }, { n: 3, label: 'ROJIZO CLARO', x: 659 }, { n: 4, label: 'PARDO OSCURO', x: 682 }, { n: 5, label: 'PARDO CLARO', x: 705 },
  ] },
  { titulo: 'AGUA DEL SUBSUELO', xIni: 742, xFin: 857, subs: [
    { n: 1, label: 'BUENAS HASTA 15 MTS', x: 742 }, { n: 2, label: 'BUENAS A MAS DE 15 MTS', x: 765 }, { n: 3, label: 'DEBILMENTE SALINA', x: 788 }, { n: 4, label: 'MEDIANAMENTE SALINA', x: 811 }, { n: 5, label: 'FUERTEMENTE SALINA', x: 834 },
  ] },
  { titulo: 'CAPACIDAD GANADERA (VACUNOS POR ha)', xIni: 871, xFin: 1055, subs: [
    { n: 1, label: 'MAS DE 1 3/4', x: 871 }, { n: 2, label: '1 3/4', x: 894 }, { n: 3, label: '1 1/2', x: 917 }, { n: 4, label: '1 1/4', x: 940 }, { n: 5, label: '1', x: 963 }, { n: 6, label: '3/4', x: 986 }, { n: 7, label: '1/2', x: 1009 }, { n: 8, label: '1/4 O MENOS', x: 1032 },
  ] },
  { titulo: 'PUNTAJE', xIni: 1087, xFin: 1276, subs: [
    { n: 1, label: 'SUBTOTAL', x: 1087 }, { n: 2, label: 'EMPLAZAMIENTO', x: 1147 }, { label: 'COEFICIENTE DE AJUSTE', x: 1207 },
  ] },
  { titulo: 'VALOR OPTIMO', xIni: 1290, xFin: 1474, subs: [] },
]

const APTITUDES_LABELS = [
  'ALTA', 'MED-ALTA', 'BAJA', 'MUY BAJA', 'ANEGADIZA',
  'AFLORAMIENTOS DE TOSCA Y/O PIEDRA', 'LAGUNAS Y OTROS ESPEJOS DE AGUA', 'CARRISALES',
]
// Fila 9 ("MONTE") no es franja fusionada de ancho completo como las filas 6-8: son 3
// segmentos propios con su etiqueta cada uno.
const MONTE_SEGMENTOS = [
  { label: 'BUENO', xIni: 413, xFin: 576 },
  { label: 'REGULAR', xIni: 599, xFin: 834 },
  { label: 'MALO', xIni: 857, xFin: 1032 },
]

// Encoge un título de grupo hasta que entre en maxWidth envolviendo como máximo 2 líneas (mismo
// límite que la fila 4+5 fusionada del Excel real) — si a un tamaño ninguna palabra suelta entra
// ni envolviendo, sigue encogiendo; nunca deja una palabra desbordar sobre la columna vecina
// (el problema que tenía encoger sin envolver: "ESPESOR DE CAPA ARABLE" nunca entraba en una
// sola línea por más que se achicara, y terminaba pisando "COLOR DE LA TIERRA" al lado).
function encogerYEnvolver(texto: string, maxWidth: number, sizeMax: number, fuente: PDFFont): { size: number; lineas: string[] } {
  let size = sizeMax
  while (size > 3.5) {
    const lineas = partirEnLineas(texto, maxWidth, size, fuente)
    const entraAncho = lineas.every(l => fuente.widthOfTextAtSize(l, size) <= maxWidth)
    if (lineas.length <= 2 && entraAncho) return { size, lineas }
    size -= 0.25
  }
  return { size, lineas: partirEnLineas(texto, maxWidth, size, fuente).slice(0, 2) }
}

// Encoge una etiqueta hasta que entre en maxWidth (piso 4pt) — mismo criterio que `campoSor` en
// la página de frente del SOR, para columnas angostas con textos de largo variable.
function encogerHastaEntrar(texto: string, maxWidth: number, sizeMax: number, fuente: PDFFont): number {
  let size = sizeMax
  while (size > 4 && fuente.widthOfTextAtSize(texto, size) > maxWidth) size -= 0.25
  return size
}

function dibujarDorsoSor(pdfDoc: PDFDocument, font: PDFFont, bold: PDFFont, negro: any, comitentePrincipal: any, rolComitente: string) {
  const p = pdfDoc.addPage([612, 1008])
  const Y = (excelY: number) => 1008 - sorDorsoYtop(excelY)
  const linea = (x1: number, y1: number, x2: number, y2: number) =>
    p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color: negro })
  // Etiqueta de columna angosta, girada 90° (se lee de abajo hacia arriba) — mismo recurso que
  // usan los formularios de Catastro reales para encabezados de columnas muy angostas: no entra
  // horizontal sin superponerse con la columna vecina.
  const textoVertical = (texto: string, xCentro: number, yBase: number, size: number) =>
    p.drawText(texto, { x: xCentro, y: yBase, size, font, color: negro, rotate: degrees(90) })

  p.drawText('RUBRO 5: CARACTERISTICAS', { x: sorDorsoX(0), y: Y(20), size: 8, font: bold, color: negro })
  p.drawText('(Reservado para la Dirección)', { x: sorDorsoX(1087), y: Y(35), size: 6.5, font, color: negro })

  // Encabezados de columna: ZONA / SUPERFICIE / ALTIMETRIA (izquierda) + los 7 grupos del Rubro 5.
  // Los títulos de grupo van horizontales (encogidos a su propio ancho de columna, sin invadir la
  // columna vecina); las sub-etiquetas (LLANO/ONDULADO/etc., mucho más angostas) van verticales —
  // confirmado que así es en el Excel real también: esas sub-columnas miden ~8pt de ancho en esta
  // escala de página, un texto de más de 4-5 caracteres no entra horizontal a ningún tamaño
  // legible (se probó). Lo que el Excel SÍ resuelve distinto, y que acá faltaba: cada sub-columna
  // tiene además un número clave (1, 2, 3...) justo debajo de la etiqueta — es lo que Catastro
  // tilda en la fila de cada aptitud, no la palabra completa. Se agrega esa fila de números.
  const IZQ_XINI = 0, IZQ_ZONA_INI = 79, IZQ_ZONA_FIN = 114, IZQ_SUP_INI = 128, IZQ_SUP_FIN = 335, IZQ_ALT_INI = 349, IZQ_ALT_FIN = 413
  const yTituloGrupo = Y(52) // línea base del título dentro de la fila 4 (y=41, alto 15)
  const yTituloGrupoLinea2 = Y(66) // 2ª línea del título, dentro de la fila 5 (y=56, alto 13.5) — solo grupos con 2 líneas
  p.drawText('ZONA', { x: sorDorsoX(IZQ_ZONA_INI), y: yTituloGrupo, size: encogerHastaEntrar('ZONA', (IZQ_ZONA_FIN - IZQ_ZONA_INI) * SOR_DORSO_ESCALA_X - 2, 6, bold), font: bold, color: negro })
  p.drawText('SUPERFICIE (ha-a-ca)', { x: sorDorsoX(IZQ_SUP_INI), y: yTituloGrupo, size: encogerHastaEntrar('SUPERFICIE (ha-a-ca)', (IZQ_SUP_FIN - IZQ_SUP_INI) * SOR_DORSO_ESCALA_X - 4, 6, bold), font: bold, color: negro })
  const yBaseVerticalHeader = Y(184) // el texto vertical crece hacia arriba desde acá, hasta debajo del título de grupo
  textoVertical('ALTIMETRIA', sorDorsoX((IZQ_ALT_INI + IZQ_ALT_FIN) / 2), yBaseVerticalHeader, 5.5)
  // Un solo tamaño para los 7 títulos de grupo (el más chico que hace falta para que TODOS
  // entren en su propia columna, envolviendo a 1-2 líneas si hace falta) — evita que un grupo
  // quede visiblemente más chico que sus vecinos, y evita que alguno desborde sobre el vecino
  // por no poder envolver (lo que pasaba antes con "ESPESOR DE CAPA ARABLE").
  const sizeTituloGrupo = Math.min(
    ...RUBRO5_GRUPOS.map(g => encogerYEnvolver(g.titulo, (g.xFin - g.xIni) * SOR_DORSO_ESCALA_X - 3, 6, bold).size),
  )
  RUBRO5_GRUPOS.forEach(g => {
    const anchoCol = (g.xFin - g.xIni) * SOR_DORSO_ESCALA_X - 3
    const lineasTitulo = partirEnLineas(g.titulo, anchoCol, sizeTituloGrupo, bold).slice(0, 2)
    lineasTitulo.forEach((linea, li) => {
      p.drawText(linea, { x: sorDorsoX(g.xIni) + 1, y: li === 0 ? yTituloGrupo : yTituloGrupoLinea2, size: sizeTituloGrupo, font: bold, color: negro })
    })
    g.subs.forEach((s, si) => {
      const xSiguiente = g.subs[si + 1]?.x ?? g.xFin
      const xCentroSub = sorDorsoX((s.x + xSiguiente) / 2)
      textoVertical(s.label, xCentroSub, yBaseVerticalHeader, 4.5)
      // Número clave (fila 10 del Excel real) — centrado bajo su propia sub-columna.
      if (s.n != null) {
        const numTexto = String(s.n)
        const wNum = bold.widthOfTextAtSize(numTexto, 6)
        p.drawText(numTexto, { x: xCentroSub - wNum / 2, y: Y(198), size: 6, font: bold, color: negro })
      }
    })
  })

  // Filas de aptitudes 1-9 — etiqueta de categoría ("AGRICOLAS GANADERAS" filas 1-5, "OTRAS
  // APTITUDES" filas 6-9) girada 90° en la columna angosta de la izquierda, como en la
  // plantilla real. SIN ningún valor/marca cargado — Reservado para la Dirección.
  const FILA_ALTO = 18
  const primeraFilaY = 216
  const yFinFilas = primeraFilaY + (APTITUDES_LABELS.length + 1) * FILA_ALTO // +1: fila "MONTE" (9), aparte del array
  p.drawText('APTITUDES', { x: sorDorsoX(2), y: Y(primeraFilaY - 4), size: 5.5, font: bold, color: negro })
  // Cada etiqueta ancla cerca del borde INFERIOR de su propio rango de filas y crece hacia
  // arriba (texto girado 90°) — así "AGRICOLAS GANADERAS" queda dentro de las filas 1-5 y "OTRAS
  // APTITUDES" dentro de las filas 6-9, sin pisarse entre sí en el borde que las separa.
  textoVertical('AGRICOLAS GANADERAS', sorDorsoX(36), Y(primeraFilaY + 5 * FILA_ALTO - 3), 5.5)
  textoVertical('OTRAS APTITUDES', sorDorsoX(36), Y(yFinFilas - 3), 5.5)

  const xGrillaIni = sorDorsoX(IZQ_XINI)
  const xGrillaFin = sorDorsoX(1474)
  linea(xGrillaIni, Y(41), xGrillaFin, Y(41)) // borde superior de la grilla
  // Filas 6 a 8 ("Afloramientos"/"Lagunas"/"Carrisales"): en la hoja "SoR (D)" del Excel de
  // referencia, son un renglón descriptivo simple (una sola franja de texto, merge Q:AU), no una
  // grilla de casilleros columna por columna como las filas 1-5 — por eso van con más ancho
  // disponible (arrancan en ALTIMETRIA) y sin líneas verticales cruzándolas por encima (más
  // abajo). La fila 9 ("MONTE") es distinta a su vez: no es una franja única, son 3 segmentos
  // propios BUENO / REGULAR / MALO (merges R28:Y28, AA28:AK28, AM28:AT28) — se dibuja aparte.
  APTITUDES_LABELS.forEach((label, i) => {
    const yFila = primeraFilaY + i * FILA_ALTO
    const esFilaFusionada = i >= 5
    p.drawText(String(i + 1), { x: sorDorsoX(IZQ_ZONA_INI) + 2, y: Y(yFila + 11), size: 6.5, font, color: negro })
    p.drawText(label, { x: sorDorsoX(esFilaFusionada ? IZQ_SUP_FIN : IZQ_ALT_FIN), y: Y(yFila + 11), size: 5.5, font, color: negro })
    linea(xGrillaIni, Y(yFila + FILA_ALTO), xGrillaFin, Y(yFila + FILA_ALTO))
  })
  const yFilaMonte = primeraFilaY + APTITUDES_LABELS.length * FILA_ALTO
  p.drawText('9', { x: sorDorsoX(IZQ_ZONA_INI) + 2, y: Y(yFilaMonte + 11), size: 6.5, font, color: negro })
  p.drawText('MONTE', { x: sorDorsoX(IZQ_SUP_FIN), y: Y(yFilaMonte + 11), size: 5.5, font, color: negro })
  MONTE_SEGMENTOS.forEach(seg => {
    const wLabel = font.widthOfTextAtSize(seg.label, 5.5)
    const xCentro = sorDorsoX((seg.xIni + seg.xFin) / 2)
    p.drawText(seg.label, { x: xCentro - wLabel / 2, y: Y(yFilaMonte + 11), size: 5.5, font, color: negro })
    if (seg.xIni > IZQ_ALT_FIN) linea(sorDorsoX(seg.xIni), Y(yFilaMonte), sorDorsoX(seg.xIni), Y(yFilaMonte + FILA_ALTO))
  })
  linea(xGrillaIni, Y(yFilaMonte + FILA_ALTO), xGrillaFin, Y(yFilaMonte + FILA_ALTO))
  // Línea divisoria entre la fila 5 y 6 (separa "AGRICOLAS GANADERAS" de "OTRAS APTITUDES")
  linea(xGrillaIni, Y(primeraFilaY + 5 * FILA_ALTO), sorDorsoX(IZQ_ZONA_FIN), Y(primeraFilaY + 5 * FILA_ALTO))
  // Líneas verticales: separadores izquierdos (Zona/Superficie/Altimetría) + cada grupo + cada
  // sub-columna — todas cortan en `yLimiteGrid` (pie de la fila 5), no en el pie de toda la
  // tabla: de ahí para abajo (filas 6-9) es la franja fusionada / los 3 segmentos de "MONTE".
  const yTopeGrilla = Y(41), yPieGrilla = Y(yFinFilas)
  const yLimiteGrid = Y(primeraFilaY + 5 * FILA_ALTO)
  ;[IZQ_XINI, IZQ_ZONA_INI, IZQ_ZONA_FIN, IZQ_SUP_INI, IZQ_SUP_FIN].forEach(ex => linea(sorDorsoX(ex), yTopeGrilla, sorDorsoX(ex), yPieGrilla))
  linea(sorDorsoX(IZQ_ALT_FIN), yTopeGrilla, sorDorsoX(IZQ_ALT_FIN), yLimiteGrid)
  RUBRO5_GRUPOS.forEach(g => {
    linea(sorDorsoX(g.xIni), yTopeGrilla, sorDorsoX(g.xIni), yLimiteGrid)
    g.subs.forEach(s => linea(sorDorsoX(s.x), Y(69), sorDorsoX(s.x), yLimiteGrid))
  })
  linea(xGrillaFin, yTopeGrilla, xGrillaFin, yPieGrilla) // borde derecho, altura completa
  // Línea horizontal que separa el encabezado (títulos + sub-etiquetas + números clave) de las
  // filas de datos
  linea(xGrillaIni, Y(primeraFilaY), xGrillaFin, Y(primeraFilaY))

  // Rubro 6 y la pregunta de "Plano de Mensura" — campos simples, no una grilla de casilleros
  // (a diferencia del Rubro 5, la plantilla real los muestra como renglones sueltos).
  let yTexto = yFinFilas + 35
  p.drawText('¿Hay Plano de Mensura?  SI ___  NO ___      N° de Plano: ______________', { x: sorDorsoX(0), y: Y(yTexto), size: 7, font, color: negro })
  yTexto += 20
  p.drawText('RUBRO 6: DISTANCIAS EN KILOMETROS', { x: sorDorsoX(0), y: Y(yTexto), size: 8, font: bold, color: negro })
  yTexto += 16
  ;[
    'A LUGAR DE EMBARQUE: ______     A CAMINO MAS PROXIMO: ______',
    'RUTA NACIONAL N°: ______          RUTA PROVINCIAL N°: ______',
    'A LA POBLACION MAS PROXIMA: ______     NOMBRE DE LA POBLACION: ________________________',
  ].forEach(linea2 => { p.drawText(linea2, { x: sorDorsoX(0), y: Y(yTexto), size: 7, font, color: negro }); yTexto += 15 })

  // Declaración jurada — mismo criterio que ya corrigió Formulario U: declarante = comitente
  // (no el agrimensor), con su rol real (POSEEDOR/APODERADO/TITULAR/etc.).
  yTexto += 15
  const nombreDeclarante = comitentePrincipal ? `${comitentePrincipal.nombre ?? ''} ${comitentePrincipal.apellido ?? ''}`.toUpperCase() : ''
  const parrafo = `El que suscribe ${nombreDeclarante} nacionalidad ${comitentePrincipal?.nacionalidad || 'Argentina'} documento de identidad ${comitentePrincipal?.tipo_documento || 'DNI'} Nº ${comitentePrincipal?.dni ?? ''} en su carácter de ${rolLabel(rolComitente).toUpperCase()} declara bajo juramento que es verdad toda información suministrada por el y transcripta en el presente formulario y que tiene conocimiento de las penalidades establecidas por omision, falsedad y toda transgresión a las disposiciones legales.`
  const lineasParrafo = partirEnLineas(parrafo, 530, 8, font)
  lineasParrafo.forEach((ln, i) => { p.drawText(ln, { x: sorDorsoX(0), y: Y(yTexto + i * 12), size: 8, font, color: negro }) })
  yTexto += lineasParrafo.length * 12 + 40

  const hoy = new Date()
  p.drawText(`Lugar y fecha: ____________________, ${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`, { x: sorDorsoX(0), y: Y(yTexto), size: 8, font, color: negro })
  yTexto += 40
  p.drawText('_____________________________', { x: sorDorsoX(700), y: Y(yTexto), size: 8, font, color: negro })
  yTexto += 12
  p.drawText('Firma', { x: sorDorsoX(760), y: Y(yTexto), size: 7, font, color: negro })
  yTexto += 25
  const wNombre = bold.widthOfTextAtSize(nombreDeclarante, 8)
  p.drawText(nombreDeclarante, { x: sorDorsoX(700) + (280 * SOR_DORSO_ESCALA_X - wNombre) / 2, y: Y(yTexto), size: 8, font: bold, color: negro })
  yTexto += 12
  p.drawText('Aclaración de Firma', { x: sorDorsoX(700), y: Y(yTexto), size: 7, font, color: negro })
}

// ── Formulario E1 — página de dorso (Rubros 3 a 7) ────────────────────────────
// A diferencia de U/SOR, la declaración jurada del E1 ya va en el FRENTE (ya implementado) —
// este dorso es 100% "Reservado para uso de la Dirección" (determinación del valor unitario,
// valuación del edificio, obras accesorias, resumen) — nuestro sistema nunca completa nada acá,
// se agrega solo por consistencia visual con los otros 2 formularios (pedido del usuario).
// Coordenadas extraídas de la hoja "E1 (D)" del Excel de referencia (mismo método que el dorso
// del SOR) — estructuralmente más simple que el Rubro 5 del SOR (columnas más anchas, alcanza
// con texto horizontal partido en líneas, sin necesitar texto girado 90°).
const E1_DORSO_ESCALA_X = 552 / 1673
const e1DorsoX = (excelX: number) => 30 + excelX * E1_DORSO_ESCALA_X
const e1DorsoYtop = (excelY: number) => 30 + excelY

type ColumnaE1 = { label: string; xIni: number; xFin: number }
type FilaE1 = { label: string; y: number; alto: number }

function dibujarTablaE1(
  p: PDFPage, font: PDFFont, bold: PDFFont, negro: any, Y: (n: number) => number,
  columnas: ColumnaE1[], yHeaderIni: number, yHeaderFin: number, filas: FilaE1[],
) {
  const xTablaIni = e1DorsoX(columnas[0].xIni)
  const xTablaFin = e1DorsoX(columnas[columnas.length - 1].xFin)
  const yFinTabla = filas.length ? filas[filas.length - 1].y + filas[filas.length - 1].alto : yHeaderFin
  const yTope = Y(yHeaderIni)
  const yPie = Y(yFinTabla)
  const linea = (x1: number, y1: number, x2: number, y2: number) =>
    p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.6, color: negro })

  linea(xTablaIni, yTope, xTablaFin, yTope)
  linea(xTablaIni, Y(yHeaderFin), xTablaFin, Y(yHeaderFin))
  filas.forEach(f => {
    p.drawText(f.label, { x: xTablaIni + 2, y: Y(f.y + f.alto * 0.65), size: 6, font, color: negro })
    linea(xTablaIni, Y(f.y + f.alto), xTablaFin, Y(f.y + f.alto))
  })
  columnas.forEach(c => {
    linea(e1DorsoX(c.xIni), yTope, e1DorsoX(c.xIni), yPie)
    if (c.label) {
      const anchoCol = (c.xFin - c.xIni) * E1_DORSO_ESCALA_X - 4
      const lineasTitulo = partirEnLineas(c.label, anchoCol, 5.5, bold)
      lineasTitulo.slice(0, 4).forEach((ln, i) => {
        p.drawText(ln, { x: e1DorsoX(c.xIni) + 2, y: Y(yHeaderIni + 10 + i * 7), size: 5.5, font: bold, color: negro })
      })
    }
  })
  linea(xTablaFin, yTope, xTablaFin, yPie)
}

function dibujarDorsoE1(pdfDoc: PDFDocument, font: PDFFont, bold: PDFFont, negro: any) {
  const p = pdfDoc.addPage([612, 1008])
  const Y = (excelY: number) => 1008 - e1DorsoYtop(excelY)

  p.drawText('RESERVADO PARA USO DE LA DIRECCIÓN', { x: e1DorsoX(0), y: Y(15), size: 8, font: bold, color: negro })

  // Rubro 3: Determinación del valor unitario
  p.drawText('Rubro 3: Determinación del valor unitario (sin incluir obras accesorias)', { x: e1DorsoX(0), y: Y(70), size: 7, font: bold, color: negro })
  dibujarTablaE1(p, font, bold, negro, Y, [
    { label: 'Tipo del edificio', xIni: 0, xFin: 94 },
    { label: 'Cant. de cuadros tachados', xIni: 94, xFin: 255 },
    { label: 'Valor básico $/m²', xIni: 255, xFin: 423 },
    { label: 'Cuadros × Valor básico', xIni: 423, xFin: 578 },
    { label: 'VALOR UNITARIO $/m²', xIni: 578, xFin: 750 },
  ], 84, 125, [
    { label: 'A', y: 125, alto: 15 }, { label: 'B', y: 140, alto: 15 }, { label: 'C', y: 155, alto: 14 },
    { label: 'D', y: 169, alto: 15 }, { label: 'E', y: 184, alto: 15 }, { label: 'TOTALES', y: 199, alto: 15 },
  ])

  // Rubro 4 y 5: Valuación del edificio (vivienda / negocio-espectáculos) — misma estructura.
  // OJO: la posición de los títulos "Rubro 4"/"Rubro 7" tomada tal cual de la hoja de Excel
  // quedaba pegada al borde de la tabla anterior (0pt de separación) — se les suma un margen
  // (`GAP_R4`/`GAP_R7`) para que no se superpongan visualmente; el resto de las transiciones ya
  // tenía separación de sobra en el Excel original y no hizo falta tocarlas.
  const GAP_R4 = 16
  const GAP_R7 = GAP_R4 + 16
  const COLUMNAS_R4 = [
    { label: 'Construcción', xIni: 0, xFin: 94 },
    { label: 'Tipo edificio', xIni: 94, xFin: 182 },
    { label: 'Estado conserv.', xIni: 182, xFin: 255 },
    { label: 'Antigüedad', xIni: 255, xFin: 348 },
    { label: 'Coef. ajuste', xIni: 348, xFin: 423 },
    { label: 'Valor unitario', xIni: 423, xFin: 498 },
    { label: 'Sup. cubierta', xIni: 498, xFin: 578 },
    { label: 'VALOR EDIFICIO', xIni: 578, xFin: 750 },
  ]
  const incisosSuperficie = (tituloTotal: string) => [
    { label: 'Inc. a) Sup. Cubierta', alto: 15 },
    { label: 'Inc. b) Sup. Semicubierta', alto: 14 },
    { label: 'Inc. c) Ampliación (E1A)', alto: 15 },
    { label: 'Inc. d) Ampliación (E1A)', alto: 14 },
    { label: 'Inc. e) Total Sup. Cubierta', alto: 15 },
    { label: tituloTotal, alto: 15 },
  ]
  p.drawText('Rubro 4: Valuación del edificio destinado a vivienda o destinos similares', { x: e1DorsoX(0), y: Y(214 + GAP_R4), size: 7, font: bold, color: negro })
  let yCursor = 274 + GAP_R4
  const filasR4 = incisosSuperficie('TOTAL RUBRO 4').map(f => { const fila = { label: f.label, y: yCursor, alto: f.alto }; yCursor += f.alto; return fila })
  dibujarTablaE1(p, font, bold, negro, Y, COLUMNAS_R4, 232 + GAP_R4, 274 + GAP_R4, filasR4)

  p.drawText('Rubro 5: Valuación del edificio destinado a Negocio o Sala de Espectáculos Públicos', { x: e1DorsoX(0), y: Y(381 + GAP_R4), size: 7, font: bold, color: negro })
  yCursor = 437 + GAP_R4
  // La hoja de Excel original repite acá el mismo texto "TOTAL DE RUBRO 4" (copiado de la
  // sección de arriba) — corregido a "TOTAL RUBRO 5", que es lo que corresponde a esta tabla.
  const filasR5 = incisosSuperficie('TOTAL RUBRO 5').map(f => { const fila = { label: f.label, y: yCursor, alto: f.alto }; yCursor += f.alto; return fila })
  dibujarTablaE1(p, font, bold, negro, Y, COLUMNAS_R4, 395 + GAP_R4, 437 + GAP_R4, filasR5)

  // Rubro 6: Obras accesorias del edificio
  p.drawText('Rubro 6: Obras accesorias del edificio', { x: e1DorsoX(0), y: Y(559 + GAP_R4), size: 7, font: bold, color: negro })
  dibujarTablaE1(p, font, bold, negro, Y, [
    { label: 'Obras Accesorias', xIni: 0, xFin: 348 },
    { label: 'Cant. de unidades', xIni: 348, xFin: 423 },
    { label: 'Coef. ajuste', xIni: 423, xFin: 498 },
    { label: 'Valor básico/u.', xIni: 498, xFin: 578 },
    { label: 'VALOR TOTAL', xIni: 578, xFin: 750 },
  ], 573 + GAP_R4, 614 + GAP_R4, [
    { label: 'Inc. f) Baños principales', y: 614 + GAP_R4, alto: 15 },
    { label: 'Inc. g) Toilettes / baños de servicio', y: 629 + GAP_R4, alto: 15 },
    { label: 'Inc. h) Pileta de natación', y: 644 + GAP_R4, alto: 14 },
    { label: 'Inc. i) Agua caliente central', y: 658 + GAP_R4, alto: 15 },
    { label: 'Inc. j) Ascensores +4 personas', y: 673 + GAP_R4, alto: 15 },
    { label: 'Inc. j) Ascensores hasta 4 personas', y: 688 + GAP_R4, alto: 14 },
    { label: 'Inc. k) Instalación contra incendios', y: 702 + GAP_R4, alto: 15 },
    { label: 'Inc. l) Ampliación (E1A)', y: 717 + GAP_R4, alto: 14 },
    { label: 'Inc. m) Ampliación (E1A)', y: 731 + GAP_R4, alto: 15 },
    { label: 'TOTAL RUBRO 6', y: 746 + GAP_R4, alto: 15 },
  ])

  // Rubro 7: Resumen de valuación de los rubros 4, 5 y 6
  p.drawText('Rubro 7: Resumen de valuación de los rubros 4, 5 y 6', { x: e1DorsoX(0), y: Y(761 + GAP_R7), size: 7, font: bold, color: negro })
  dibujarTablaE1(p, font, bold, negro, Y, [
    { label: 'CONCEPTO', xIni: 0, xFin: 578 },
    { label: 'VALOR TOTAL', xIni: 578, xFin: 750 },
  ], 779 + GAP_R7, 820 + GAP_R7, [
    { label: 'Inc. a) Total Rubro 4 — Columna 7', y: 820 + GAP_R7, alto: 15 },
    { label: 'Inc. b) Total Rubro 5 — Columna 7', y: 835 + GAP_R7, alto: 15 },
    { label: 'Inc. c) Total Rubro 6 — Columna 4', y: 850 + GAP_R7, alto: 14 },
    { label: 'TOTAL RUBRO 7', y: 864 + GAP_R7, alto: 15 },
  ])
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const isAjax = request.headers.get('X-Requested-With') === 'fetch'
  const token = cookies.get('sb-access-token')?.value ?? ''
  const { data: { user } } = await getSupabaseAnon().auth.getUser(token)
  // Antes esto redirigía (302) incluso cuando la llamada venía del fetch/AJAX del modal de
  // "generar expediente completo" — el cliente hace fetch(...).then(res => res.json()), pero
  // fetch sigue el redirect a /login y el .json() sobre el HTML de esa página falla, mostrando
  // un alert genérico en vez de un aviso claro de sesión vencida. Mismo patrón ya usado en
  // descargar.ts/upload-dni.ts: JSON 401 para AJAX, redirect normal para navegación directa.
  if (!user) {
    // `warn` (no `error`) para que el cliente lo pueda mostrar con el mismo mecanismo que ya
    // usa para `sin_seleccion`/`ddjj_falta_inmueble`/etc. más abajo en este mismo archivo.
    return isAjax
      ? new Response(JSON.stringify({ ok: false, warn: 'no_autenticado' }), { status: 401 })
      : redirect('/login')
  }

  const db = getSupabase(token)
  const form = await request.formData()
  const expedienteId = form.get('expediente_id') as string
  let tipos = form.getAll('tipos[]') as string[]
  const esBundle = tipos.includes('expediente_completo')
  const esBundleDDJJ = tipos.includes('declaraciones_juradas_completo')

  if (!tipos.length) {
    return isAjax
      ? new Response(JSON.stringify({ ok: false, warn: 'sin_seleccion' }), { status: 400 })
      : redirect(`/expedientes/${expedienteId}?tab=documentos&warn=sin_seleccion`)
  }

  const documentosCreados: { id: string; tipo_documento: string; storage_path: string | null; estado: string; generado_at: string }[] = []

  const { data: exp } = await db
    .from('expedientes')
    .select('numero_expediente, tipo_mensura, fecha_inicio, hora_mensura, observaciones')
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
  // `nombre` (poligono) y `etiqueta` (lados/angulos) faltaban acá — Memoria de Mensura y
  // Planilla de Cálculos ya los usaban más abajo (pol.nombre, lado.etiqueta, ang.etiqueta) pero
  // como no venían en el select, siempre llegaban undefined: el título de la planilla y las
  // designaciones manuales de lado/ángulo salían en blanco aunque estuvieran cargadas en la Tab
  // Mensura (bug reportado por Franco).
  const { data: poligonosRaw } = await db
    .from('poligono')
    .select('nombre, parcela_desde, parcela_hasta, superficie_m2, superficie_letras, lados(orden, valor_m, valor_letras, etiqueta), angulos(orden, grados, minutos, segundos, etiqueta)')
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

  // Inscripciones/partidas ADICIONALES (la 1ª de cada una sigue en `inmueble` mismo, ver más
  // abajo) — usadas para pluralizar los párrafos de "Antecedentes de Dominio" del Capítulo de
  // Extensión, Límites e Inscripciones (pedido de Franco, 19/9). Antes no se leían acá.
  const { data: inscripcionesExtra } = inmueble
    ? await db.from('inmueble_inscripciones_extra').select('*').eq('inmueble_id', (inmueble as any).id).order('orden')
    : { data: [] as any[] }
  const { data: partidasExtra } = inmueble
    ? await db.from('inmueble_partidas_extra').select('*').eq('inmueble_id', (inmueble as any).id).order('orden')
    : { data: [] as any[] }

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
  // Todos los comitentes (no solo el principal) — para las partes del documento donde Franco
  // pidió (19/9) que se transcriban todos: Carátula, 2º párrafo de Nota de Elevación, rótulo de
  // cada hoja, y Notificación a Linderos. El resto del código (DDJJ, cuerpo del Acta de Mensura,
  // firma de Nota de Elevación) sigue usando `nombreComitente`/`comitentePrincipal` (el primero),
  // sin cambios — no estaba pedido para esas partes.
  const listaComitentesConDatos = ((expComitentes ?? []) as any[]).filter(ec => ec.comitentes)
  function listarConY(items: string[]): string {
    const limpios = items.filter(Boolean)
    if (limpios.length === 0) return '—'
    if (limpios.length === 1) return limpios[0]
    return `${limpios.slice(0, -1).join(', ')} y ${limpios[limpios.length - 1]}`
  }
  const nombresComitentesTodos = listarConY(listaComitentesConDatos.map(ec => `${ec.comitentes.apellido}, ${ec.comitentes.nombre}`))
  const nombreProfesional = profile ? `${profile.nombre ?? ''} ${profile.apellido ?? ''}`.trim() : '—'
  const tipoMensuraTexto = (exp?.tipo_mensura ?? '—').toUpperCase()
  const ubicacionCompleta = `${construirUbicacion(inmueble)}${inmueble?.departamento ? ', ' + inmueble.departamento : ''}`

  // Logos leídos una sola vez de disco acá (el ícono chico del membrete y el grande de la
  // carátula/divisorias) — como cada tipo de documento arma su propio PDFDocument, se embeben de
  // nuevo (embedPng es barato, no vuelve a leer el archivo) dentro del loop.
  const logoMembreteBytes = await cargarLogoBytes('nica-logo-icono.png', request)
  const logoCaratulaBytes = await cargarLogoBytes('nica-logo-caratula.png', request)

  // "Generar expediente completo" y "Generar declaraciones juradas": no son tipos de documento
  // reales, son marcadores — el servidor arma su propia lista ordenada (no se confía en lo que
  // mande el cliente). El expediente completo sigue el mismo orden y las mismas divisorias que
  // trae EXP_PRUEBA.pdf (el expediente de referencia de Franco), pero ya NO incluye las DDJJ
  // (Formulario U/SOR/E1) — Franco pidió separarlas en su propio botón/archivo aparte, para no
  // generar un PDF enorme cuando hay muchas parcelas cargadas (cada DDJJ se replica una vez por
  // parcela, ver más abajo en las ramas formulario_u/formulario_sor).
  const tipoDDJJPrincipal = (inmueble as any)?.tipo_inmueble === 'rural' ? 'formulario_sor' : 'formulario_u'
  const incluirE1 = !!edificacion
  // "Notificación a Linderos" y "Acta de Ausencia de Linderos y Autoridades" solo van si el
  // objeto EMPIEZA con la palabra "mensura" (pedido de Franco, 19/9, corregido el mismo día de
  // "contiene" a "comience con") — mismo flag que ya filtra el checklist y la validación del
  // lado del cliente en [id].astro (datosValidacion.llevaCitacionYAusencia).
  const llevaCitacionYAusencia = (exp?.tipo_mensura ?? '').trim().toLowerCase().startsWith('mensura')
  if (esBundle) {
    tipos = [
      'caratula', 'nota_elevacion', 'documento_identidad',
      'capitulo_ubicacion',
      ...(llevaCitacionYAusencia ? ['citacion_linderos'] : []),
      'acta_mensura',
      ...(llevaCitacionYAusencia ? ['acta_ausencia_linderos'] : []),
      'memoria_mensura',
      'planilla_calculos',
    ]
  } else if (esBundleDDJJ) {
    tipos = [tipoDDJJPrincipal, ...(incluirE1 ? ['formulario_e1'] : [])]
  }
  // La divisoria "ACTAS" se dibuja antes del primer documento de ese grupo que efectivamente
  // vaya a generarse — si no lleva "citacion_linderos" (objeto sin "mensura"), el grupo arranca
  // directo en "acta_mensura", que siempre está.
  const DIVISORIAS_BUNDLE: Record<string, string> = {
    capitulo_ubicacion: 'DESCRIPCIÓN Y DOMINIO\nDEL INMUEBLE',
    [tipos.includes('citacion_linderos') ? 'citacion_linderos' : 'acta_mensura']: 'ACTAS',
    memoria_mensura: 'MEMORIA DE OPERACIONES',
    planilla_calculos: 'PLANILLAS DE CÁLCULO',
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
      logoMembrete = logoMembreteBytes ? await pdfDoc.embedPng(logoMembreteBytes) : null
      yEncabezadoFin = dibujarEncabezado(page, width, height, { font, bold }, {
        objeto: tipoMensuraTexto,
        comitente: nombresComitentesTodos,
        comitentePrimero: nombreComitente,
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
      // removePage no). Por eso, adentro de dibujarFormularioU(), se guarda la referencia a la
      // página de RUBRO 4 (índice 2 en el array original) ANTES de remover, en vez de volver a
      // pedir getPages() después y asumir que se reindexó.
      //
      // Si el expediente tiene más de un polígono/parcela cargado, Franco pidió que la
      // declaración jurada se replique una vez por parcela (con la superficie de cada una) en
      // vez de generar sólo la del primer polígono. dibujarFormularioU() dibuja UNA copia
      // completa (2 páginas: datos + declaración) sobre un PDFDocument/página/fuentes ya
      // cargados de la plantilla — se llama una vez por polígono, y las copias extra se pegan
      // al final del documento principal con copyPages() (misma técnica que ya usa el armado
      // del "expediente completo" más abajo en este archivo). Con un solo polígono (el caso
      // común) el resultado es idéntico al de antes: se llama una sola vez, sin loop extra.
      //
      // Si el expediente tiene más de un polígono/parcela cargado, Franco pidió que la
      // declaración jurada se replique una vez por parcela (con la superficie de cada una) en
      // vez de generar sólo la del primer polígono. dibujarFormularioU() dibuja UNA copia
      // completa (2 páginas: datos + declaración) sobre un PDFDocument/página/fuentes ya
      // cargados de la plantilla — se llama una vez por polígono, y las copias extra se pegan
      // al final del documento principal con copyPages() (misma técnica que ya usa el armado
      // del "expediente completo" más abajo en este archivo). Con un solo polígono (el caso
      // común) el resultado es idéntico al de antes: se llama una sola vez, sin loop extra.
      const dibujarFormularioU = (
        pdfDocActual: PDFDocument, pageActual: PDFPage, fontActual: PDFFont, boldActual: PDFFont, poligonoActual: any,
      ) => {
        const paginaDeclaracion = pdfDocActual.getPages()[2]
        pdfDocActual.removePage(1)
        const f = 8
        const blanco = rgb(1, 1, 1)
        // Marca la opción correspondiente (Sí/No) con una X en negrita sobre su casillero.
        const marcar = (valor: boolean | null | undefined, xSi: number, xNo: number, y: number, size = f) => {
          pageActual.drawText('X', { x: valor ? xSi : xNo, y, size, font: boldActual, color: negro })
        }
        // En negrita: para que los datos cargados desde el expediente se distingan de un
        // vistazo del texto impreso de la plantilla (que va en fuente regular).
        const campo = (valor: string, x: number, y: number) => {
          pageActual.drawText(valor, { x, y, size: f, font: boldActual, color: negro })
        }
        // RUBRO 2 (Croquis de la Parcela) — la plantilla original traía 4 marcas de esquina
        // (trazos gruesos en L, tipo "marca de recorte") alrededor del recuadro en blanco donde
        // se dibuja el croquis; Franco pidió sacarlas y dejar el recuadro limpio. Coordenadas
        // medidas primero a ojo sobre el render y confirmadas contra la plantilla real
        // (public/pdf-templates/formulario_u.pdf, página 1) — cada rectángulo cubre una marca
        // sin tocar el borde fino del recuadro real, que queda intacto.
        pageActual.drawRectangle({ x: 370, y: 659, width: 102, height: 26, color: blanco }) // marca superior
        pageActual.drawRectangle({ x: 328, y: 545, width: 34, height: 106, color: blanco }) // marca izquierda
        pageActual.drawRectangle({ x: 478, y: 545, width: 32, height: 106, color: blanco }) // marca derecha
        pageActual.drawRectangle({ x: 368, y: 511, width: 14, height: 31, color: blanco })  // trazo suelto debajo
        // Franco pidió el croquis completamente en blanco, sin ningún cuadrado (lo dibuja él a
        // mano) — además de las 4 marcas de esquina de arriba, el recuadro cuadrado en sí (borde
        // fino) también viene impreso en la plantilla. Confirmado renderizando esta zona con
        // poppler: va de x≈362 a x≈478, y≈542 a y≈659 — se tapa entero con 1pt de margen extra
        // por lado para cubrir el grosor de la línea.
        pageActual.drawRectangle({ x: 361, y: 541, width: 118, height: 119, color: blanco })

        // La plantilla trae dos renglones en blanco para "Departamento" y "Localidad" — el de
        // Departamento es corto (termina en x≈460) y el de Localidad es más largo, con 3
        // casilleros a la derecha (termina en x≈615). Coordenadas confirmadas dibujando una
        // grilla de referencia sobre la plantilla real (public/pdf-templates/formulario_u.pdf):
        // el renglón de Departamento está en y≈845 y el de Localidad en y≈820, no a 11pt de
        // distancia entre sí como se había estimado antes — quedaban los dos valores amontonados
        // arriba, con "Localidad" pisando el renglón de "Departamento" en vez de apoyarse sobre
        // el suyo, mucho más abajo (bug marcado por Franco).
        pageActual.drawText(inmueble?.departamento ?? '', { x: 315, y: 853, size: 9, font: boldActual, color: negro })
        pageActual.drawText(inmueble?.localidad ?? '', { x: 315, y: 828, size: 9, font: boldActual, color: negro })

        // Inc. a) Designación según título — "UBICACIÓN: Calle" es la fila de encabezado (con
        // NUMERO/CHACRA/FRAC/MANZANA/LOTE/P.HORIZONT como títulos de columna); los valores van
        // en la fila de abajo, dentro del recuadro.
        campo(inmueble?.calle_frente ?? '', 158, 764)
        campo(inmueble?.fraccion ?? '', 366, 764)
        // El valor de "Manzana" va en la columna CHACRA (x≈333, medido con pdftotext -bbox
        // sobre la plantilla real) o MANZANA (x=396) según lo que el usuario eligió al cargar
        // el inmueble (pedido de Franco, 19/9) — antes siempre iba en MANZANA, la columna
        // CHACRA de la plantilla quedaba sin usar.
        if ((inmueble as any)?.manzana_tipo === 'chacra') {
          campo(inmueble?.manzana ?? '', 333, 764)
        } else {
          campo(inmueble?.manzana ?? '', 396, 764)
        }
        campo(inmueble?.parcela ?? '', 443, 764)

        // Inc. c) Registro de la Propiedad
        campo((inmueble as any)?.registro_tomo ?? '', 100, 690)
        // El casillero de FOLIO es angosto y la etiqueta "FOLIO" se parte en "FOLI" / "O" en la
        // plantilla — a diferencia de los SI/NO, Franco/Juan prefieren dejarlo tal cual (es un
        // defecto propio de la plantilla, no priorizado para corregir). x=228 ubica el valor
        // dentro de ese casillero, sin pisar la "O" partida.
        campo((inmueble as any)?.registro_folio ?? '', 228, 690)
        campo((inmueble as any)?.registro_anio ?? '', 275, 690)

        // Inc. e) Superficie del terreno (según plano de mensura, ya autocalculada) — la propia
        // de ESTE polígono/parcela, no la del primero del expediente.
        campo(poligonoActual?.superficie_m2 != null ? Number(poligonoActual.superficie_m2).toFixed(2) : '', 228, 639)

        // Inc. f) Otras informaciones adicionales — las etiquetas "SI"/"NO" de estos 3
        // casilleros vienen partidas en dos renglones en la plantilla original (columna
        // exportada desde Google Sheets demasiado angosta para las 2 letras: "S" arriba, "I"
        // abajo, ídem "N"/"O") — Franco pidió corregirlo. Se tapa cada una con un rectángulo
        // blanco y se reescribe en una sola línea, en fuente chica para que entre. El de
        // "CLOACAS: SI" no está partido en la plantilla (esa columna sí era lo bastante ancha)
        // y se deja tal cual.
        // Bordes del casillero punteado medidos a partir de la propia plantilla (pixel a pixel,
        // no a ojo): un primer intento tapaba de más y se comía parte del borde punteado
        // inferior (se veía "borrado con corrector", como marcó Franco) — estos rectángulos son
        // angostos, ajustados 1-1.5pt para adentro del borde real por los cuatro lados.
        pageActual.drawRectangle({ x: 147.2, y: 561, width: 9.3, height: 12.5, color: blanco })
        pageActual.drawText('SI', { x: 149, y: 565.5, size: 6, font: fontActual, color: negro })
        pageActual.drawRectangle({ x: 158.3, y: 561, width: 11, height: 12.5, color: blanco })
        pageActual.drawText('NO', { x: 159.5, y: 565.5, size: 5.5, font: fontActual, color: negro })
        pageActual.drawRectangle({ x: 279.6, y: 561, width: 10.6, height: 12.5, color: blanco })
        pageActual.drawText('NO', { x: 280.5, y: 565.5, size: 5.5, font: fontActual, color: negro })

        // X moderada: marca el casillero sin tapar la letra (S/I o N/O) que queda atrás.
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
          // "Ausente del País" tiene "NO" partido en "N"/"O" en la plantilla (mismo defecto que
          // Agua Corriente/Cloacas) — se probaron varias correcciones (tapar+redibujar, realinear
          // con "SI", separar la X del texto) y ninguna terminó de verse bien; Juan prefirió dejarlo
          // tal cual viene de la plantilla en vez de seguir ajustando, y pedirle a Franco una
          // plantilla nueva con ese casillero corregido de origen.
          marcar(ec.ausente_pais, 517, 529, y - 31, 9)
        })

        campo(inmueble?.propietario_anterior ?? '', 260, 316)

        // Última página (RUBRO 4 + declaración jurada). El párrafo original de la plantilla trae
        // una oración de ejemplo completa con nombre y DNI de otro contribuyente — se tapa con un
        // rectángulo blanco (sin tocar el borde de la caja) y se escribe encima el texto real.
        if (paginaDeclaracion) {
          const p3 = paginaDeclaracion
          // Alto 48 (y=795 a 843) se quedaba corto: la 4ª línea del párrafo de abajo cae en
          // y=787.5, por debajo del borde inferior del rectángulo, y quedaba pisando el texto
          // original de la plantilla sin tapar — es la superposición que marcó Franco. Se agranda
          // hacia abajo para cubrir las 4 líneas completas con margen.
          p3.drawRectangle({ x: 61, y: 780, width: 475, height: 63, color: rgb(1, 1, 1) })

          // El declarante de esta página (dorso) puede ser el comitente, el dueño, o el propio
          // Franco — Franco confirmó por WhatsApp (14/9) que por defecto va con SUS datos (el
          // agrimensor), no los del comitente. `profiles` no tiene columna de nacionalidad ni
          // tipo de documento — se asume Argentina/DNI, que en la práctica es siempre así para
          // un agrimensor matriculado acá.
          const declarante = profile as any
          const nombreDeclarante = declarante ? `${declarante.nombre ?? ''} ${declarante.apellido ?? ''}`.toUpperCase() : ''
          const parrafo = `El que suscribe ${nombreDeclarante} nacionalidad Argentina documento de identidad DNI Nº ${declarante?.dni ?? ''} en su carácter de AGRIMENSOR declara bajo juramento que es verdad toda información suministrada por el y transcripta en el presente formulario y que tiene conocimiento de las penalidades establecidas por omision, falsedad y toda transgresión a las disposiciones legales.`

          // El recuadro de la declaración va de x≈55 a x≈539 (medido en el content stream del PDF)
          // — con ancho 500 el párrafo se pasaba del borde derecho de la caja en las líneas largas.
          const lineasParrafo = partirEnLineas(parrafo, 465, f, fontActual)
          lineasParrafo.slice(0, 4).forEach((linea, i) => {
            p3.drawText(linea, { x: 62, y: 825 - i * 12.5, size: f, font: fontActual, color: negro })
          })

          // La plantilla trae su propio "___ de ___     ___.-" con tres huecos separados
          // (día / mes / año) — antes se pisaban todos poniendo la fecha entera en el primer
          // hueco, quedando duplicada contra el "de" impreso. Se reparte acá, uno por hueco.
          const hoy = new Date()
          p3.drawText(String(hoy.getDate()), { x: 65, y: 745, size: f, font: fontActual, color: negro })
          p3.drawText(MESES[hoy.getMonth()], { x: 162, y: 745, size: f, font: fontActual, color: negro })
          p3.drawText(String(hoy.getFullYear()), { x: 270, y: 745, size: f, font: fontActual, color: negro })
          if (declarante) {
            // Centrado dentro de la caja de "Aclaración de Firma" (x≈380 a 545, estimado — falta
            // verificar contra un render real de la plantilla) en vez del x=390 fijo de antes, que
            // no quedaba centrado con nombres de largo variable.
            const firmaBoxX = 380, firmaBoxW = 165
            const wNombre = boldActual.widthOfTextAtSize(nombreDeclarante, f)
            p3.drawText(nombreDeclarante, { x: firmaBoxX + (firmaBoxW - wNombre) / 2, y: 683, size: f, font: boldActual, color: negro })
          }

          // La plantilla ya trae su propia sección "OBSERVACIONES :" con renglones punteados
          // (medida vía pdftotext -bbox: la etiqueta termina en x≈145, y arranca en y≈624
          // bottom-up; el aviso de "EXTRAVIO DE ESTE TALÓN" empieza en y≈249, así que hay
          // margen de sobra para varias líneas de texto envuelto).
          if (exp?.observaciones) {
            dibujarParrafo(p3, exp.observaciones, 152, 626, 400, 9, fontActual, negro, undefined, 0)
          }
        }
      }

      const listaPoligonosDDJJ = poligonos.length > 0 ? poligonos : [poligono]
      dibujarFormularioU(pdfDoc, page, font, bold, listaPoligonosDDJJ[0])
      for (let i = 1; i < listaPoligonosDDJJ.length; i++) {
        const plantillaBytesExtra = await readFile(join(process.cwd(), 'public', 'pdf-templates', 'formulario_u.pdf'))
        const pdfDocExtra = await PDFDocument.load(plantillaBytesExtra)
        const pageExtra = pdfDocExtra.getPages()[0]
        const fontExtra = await pdfDocExtra.embedFont(StandardFonts.Helvetica)
        const boldExtra = await pdfDocExtra.embedFont(StandardFonts.HelveticaBold)
        dibujarFormularioU(pdfDocExtra, pageExtra, fontExtra, boldExtra, listaPoligonosDDJJ[i])
        const copiadasU = await pdfDoc.copyPages(pdfDocExtra, pdfDocExtra.getPageIndices())
        copiadasU.forEach(p => pdfDoc.addPage(p))
      }

    } else if (tipo === 'formulario_sor') {
      // ── Formulario SOR — Declaración Jurada (Inmueble Suburbano/Rural) ──
      // Misma lógica que Formulario U: plantilla original de Catastro, con sus referencias en
      // rojo (y un resaltado amarillo de ejemplo en el casillero "NO") ya neutralizadas a nivel
      // de archivo (public/pdf-templates/formulario_sor.pdf). Una sola página, sin Rubro 4 ni
      // página de declaración jurada aparte — a diferencia de Formulario U.
      // Coordenadas recalibradas leyendo la posición EXACTA de cada etiqueta con
      // `pdftotext -bbox` (poppler) sobre la plantilla — un calibrado a ojo contra renders (dos
      // intentos previos) seguía saliendo desfasado por errores de lectura de los propios
      // renders; el bbox da coordenadas objetivas en el mismo sistema que usa `drawText`
      // (pdftotext las reporta con Y desde arriba, así que se convierten con `1008 - yMax`).
      const fSor = 8
      // El tamaño fijo se rompía cada vez que aparecía un valor más largo que el dato de prueba
      // usado al calibrar ("Primera" en Sección, un DNI con puntos, "Corrientes" en Provincia...).
      // En vez de ir ajustando campo por campo a mano cada vez que Franco carga algo más largo,
      // `campoSor` recibe el ancho real de la celda y encoge la letra sola (de a 0.5pt, hasta un
      // piso de 5pt) si el valor no entra al tamaño pedido — así cualquier dato futuro se ajusta
      // solo, sin volver a tocar coordenadas.
      const campoSor = (valor: string, x: number, y: number, maxWidth: number, sizeMax = fSor) => {
        let size = sizeMax
        while (size > 5 && bold.widthOfTextAtSize(valor, size) > maxWidth) size -= 0.5
        page.drawText(valor, { x, y, size, font: bold, color: negro })
      }
      const marcarSor = (valor: boolean | null | undefined, xSi: number, xNo: number, y: number, size = fSor) => {
        page.drawText('X', { x: valor ? xSi : xNo, y, size, font: bold, color: negro })
      }

      // Departamento/Localidad están a solo 5pt de distancia en la plantilla (línea a línea de
      // una tipografía original muy chica) — separado 15pt para que entren cómodos sin salirse
      // de la caja, con ancho de celda hasta el casillero de ADREMA.
      campoSor(inmueble?.departamento ?? '', 242, 884, 95, 7)
      campoSor(inmueble?.localidad ?? '', 235, 869, 95, 7)

      // Inciso a) Designación según títulos — Corrientes distingue Chacra/Quinta como
      // subdivisiones propias que hoy no tienen columna en `inmuebles` (solo Fracción, Sección y
      // Lote tienen datos cargados); Paraje/Chacra/Quinta quedan en blanco por ahora. Columnas
      // angostas (~28pt) — anchos medidos contra el casillero siguiente de cada una.
      campoSor((inmueble as any)?.seccion ?? '', 221, 828, 26, 6.5)
      campoSor(inmueble?.fraccion ?? '', 303, 828, 27, 6.5)
      campoSor(inmueble?.parcela ?? '', 333, 828, 40, 6.5)

      // Inciso c) Inscripción en el Registro de la Propiedad
      campoSor((inmueble as any)?.registro_tomo ?? '', 95, 778, 80)
      campoSor((inmueble as any)?.registro_folio ?? '', 205, 778, 90)
      campoSor((inmueble as any)?.registro_anio ?? '', 310, 778, 50)

      // Informaciones adicionales
      campoSor((inmueble as any)?.personas_habitan != null ? String((inmueble as any).personas_habitan) : '', 158, 758, 50)
      // La plantilla trae "2026" impreso como ejemplo, muy compacto (4 dígitos en ~11pt) — si el
      // dato real coincide no se escribe nada encima (mismo criterio que el "100"/"DNI" de U).
      const anioImpuestoSor = String((inmueble as any)?.ultimo_anio_pago_impuesto ?? '')
      if (anioImpuestoSor && anioImpuestoSor !== '2026') {
        anioImpuestoSor.padStart(4, ' ').split('').forEach((digito, i) => {
          if (digito.trim()) campoSor(digito, 366 + i * 3, 758, 3, 6)
        })
      }

      // Rubro 2 — hasta 3 filas de propietario (a, b, c). Cada bloque mide ~48.5pt: renglón de
      // Apellido/%/Tipo y Documento (10pt debajo de su propio encabezado impreso) y, 20pt más
      // abajo, el renglón de Calle/Localidad/Provincia/Ausente (ídem). Coordenadas y anchos de
      // celda tomados de la posición real de cada encabezado vía `pdftotext -bbox`.
      const filasYSor = [719, 670.5, 622]
      ;(expComitentes ?? []).slice(0, 3).forEach((ec: any, i: number) => {
        const c = ec.comitentes
        const y = filasYSor[i]
        const yCalle = y - 20
        const porcentaje = ec.porcentaje_condominio ?? 100
        campoSor(`${c?.apellido ?? ''}, ${c?.nombre ?? ''}`.toUpperCase(), 60, y, 205)
        // La plantilla trae "100" impreso como ejemplo en la fila a) — si el dato real coincide,
        // no se escribe nada encima (mismo criterio que en Formulario U).
        if (porcentaje !== 100) campoSor(String(porcentaje), 273, y, 35)
        // El borde derecho real de la tabla (confirmado con reglas dibujadas encima de la
        // plantilla y comparadas píxel a píxel) está en x≈384 — mucho antes de lo que se venía
        // asumiendo. "Tipo y Nº Documento" comparten esa columna angosta (≈310-384, 74pt en
        // total para las dos), no 40pt cada uno por separado como estaba antes.
        campoSor(c?.tipo_documento ?? 'DNI', 313, y, 33)
        campoSor(c?.dni ?? '', 349, y, 33)
        campoSor(c?.domicilio_calle ?? '', 60, yCalle, 95)
        // Corrido 8pt a la derecha: arrancaba justo en el borde izquierdo de la columna.
        campoSor(c?.domicilio_numero ?? '', 173, yCalle, 42)
        campoSor(c?.domicilio_localidad ?? '', 223, yCalle, 90)
        campoSor(c?.domicilio_provincia ?? '', 319, yCalle, 40)
        marcarSor(ec.ausente_pais, 362, 379, yCalle)
      })

      campoSor((inmueble as any)?.receptoria ?? '', 208, 573, 190)

      // Página de dorso (Rubros 5/6/7 + declaración jurada) — antes faltaba: la plantilla
      // (`formulario_sor.pdf`) tenía una sola página, confirmado con `pdfDoc.getPageCount()`.
      dibujarDorsoSor(pdfDoc, font, bold, negro, comitentePrincipal, rolComitente)

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
      // Filas de 10pt (no 19pt como estaba antes) — verificado dibujando una grilla de
      // referencia sobre la plantilla real: con el espaciado viejo cada casillero cayó una fila
      // más abajo de la que correspondía (ej. "negocios" marcaba el renglón de "espectaculos").
      // "casa_familia"/"asociaciones" (y=889) son las únicas dos que ya estaban bien porque
      // coinciden con las X que trae la plantilla de fábrica — el resto se corrigió contra eso.
      const DESTINO_XY: Record<string, [number, number]> = {
        casa_familia: [308, 889],
        casa_departamentos: [308, 879],
        hotel: [308, 869],
        sanatorio: [308, 859],
        oficina: [308, 849],
        asociaciones: [538, 889],
        negocios: [538, 879],
        espectaculos: [538, 869],
        otros: [538, 859],
      }
      if (destinoSeleccionado && destinoSeleccionado !== 'casa_familia' && DESTINO_XY[destinoSeleccionado]) {
        const [dx, dy] = DESTINO_XY[destinoSeleccionado]
        marcarE1(dx, dy)
      }
      if (destinoSeleccionado === 'otros') {
        // Mismo renglón que la fila "otros" recién corregida (antes estaba en y=826, que
        // correspondía a la posición vieja e incorrecta de esa fila).
        campoE1((edificacion as any)?.destino_otros_detalle ?? '', 460, 859, 7)
      }

      // Rubro 1 — Características: 13 categorías × 5 incisos (a-e). Límites de fila/columna
      // medidos contra el mismo ejemplo real (no son parejos: el inciso a) es bien más ancho que
      // el resto, y la fila "Techos" más baja que las demás). El casillero elegido se marca con
      // una cruz sobre el texto (antes era un relleno gris sólido, que tapaba la opción elegida
      // en vez de señalarla — Franco pidió poder ver qué se marcó).
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
        const inset = 2
        page.drawLine({ start: { x: xIni + inset, y: yIni + inset }, end: { x: xFin - inset, y: yFin - inset }, thickness: 1, color: negro })
        page.drawLine({ start: { x: xIni + inset, y: yFin - inset }, end: { x: xFin - inset, y: yIni + inset }, thickness: 1, color: negro })
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

      // Página de dorso (Rubros 3 a 7) — por consistencia con U y SOR, que ya tienen frente +
      // dorso. Acá no hay ningún dato real que completar (100% reservado para la Dirección).
      dibujarDorsoE1(pdfDoc, font, bold, negro)

    } else if (tipo === 'caratula') {
      // ── Carátula con datos reales del expediente ──────────────────────
      // Franco pidió agrandar el texto para que ocupe más la hoja (antes quedaba chico con
      // mucho blanco de sobra entre el encabezado y el logo del pie). Subido de 22→27
      // (título) y 15→18 (campos); el ajuste a texto largo sigue resuelto por el wrap a
      // varias líneas que ya hacía `partirEnLineas` (no hace falta encoger la letra: con 4
      // campos cortos como estos, uno solo más largo shrinkeando todos parejo se vería
      // inconsistente contra el resto — el wrap ya evita que se salga de la hoja).
      const tituloLineas = partirEnLineas(tipoMensuraTexto, width - 100, 27, boldItalic)
      let yTitulo = yEncabezadoFin - 60
      tituloLineas.forEach(linea => {
        dibujarCentrado(page, linea, yTitulo, 27, boldItalic, negro, width)
        yTitulo -= 34
      })

      // Bloque de datos (lo que Franco marcó en rojo en su carátula, a modo de ejemplo de qué completar)
      const camposCaratula: [string, string][] = [
        ['Departamento: ',         inmueble?.departamento ?? '—'],
        ['Ubicación/Sección: ',    construirUbicacion(inmueble)],
        ['Partida Inmobiliaria: ', inmueble?.matricula_catastral ?? '—'],
        ['Comitente: ',            nombresComitentesTodos],
      ]
      let yCampos = yTitulo - 50
      camposCaratula.forEach(([clave, valor]) => {
        const lineasValor = partirEnLineas(`${clave}${valor}`, width - 145, 18, boldItalic)
        lineasValor.forEach((linea, i) => {
          page.drawText(linea, { x: 90, y: yCampos - i * 24, size: 18, font: boldItalic, color: negro })
        })
        yCampos -= lineasValor.length * 24 + 16
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
      // Con más de un comitente, se listan todos con su propio DNI y rol (pedido de Franco,
      // 19/9) — el teléfono/correo/domicilio de contacto sigue siendo solo del principal (no
      // tiene sentido repetir 3 vías de contacto por cada comitente en el mismo párrafo).
      const itemsComitentesNota = listaComitentesConDatos.map((ec: any) => {
        const c = ec.comitentes
        const nombreC = `${c?.apellido ?? ''}, ${c?.nombre ?? ''}`.toUpperCase()
        const dniC = c?.dni ? ` (DNI: ${c.dni})` : ''
        return `${nombreC}${dniC} EN CALIDAD DE ${rolLabel(ec.rol ?? 'titular').toUpperCase()}`
      })
      const etiquetaComitente = itemsComitentesNota.length > 1 ? 'COMITENTES' : 'COMITENTE'
      const datosComitentePartes = [
        `${etiquetaComitente}: ${listarConY(itemsComitentesNota) || '—'}`,
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

      // Firma de TODOS los comitentes al pie (no solo el principal — pedido de Franco, 19/9),
      // en columnas — mismo criterio y umbral que Acta de Mensura: si no entran en una fila sin
      // angostarse de más, se pasan a una hoja nueva dedicada.
      const firmantesNota = listaComitentesConDatos.length > 0
        ? listaComitentesConDatos.map((ec: any) => ({
            nombre: `${ec.comitentes?.nombre ?? ''} ${ec.comitentes?.apellido ?? ''}`.trim() || '—',
            dni: ec.comitentes?.dni,
          }))
        : [{ nombre: nombreComitenteDirecto, dni: comitenteDni }]
      const minColFirmaNota = 110
      const porFilaNota = Math.max(1, Math.floor(anchoTexto / minColFirmaNota))
      const filasNota = Math.ceil(firmantesNota.length / porFilaNota)

      let paginaFirmaNota = page
      let anchoFirmaNota = width
      let yFirmaCursorNota = 140
      if (filasNota > 1) {
        const nueva = crearPaginaConEncabezado(pdfDoc, { font, bold }, {
          objeto: tipoMensuraTexto, comitente: nombresComitentesTodos, comitentePrimero: nombreComitente,
          ubicacion: ubicacionCompleta, profesional: `Agrimensor ${nombreProfesional}`,
          email: profile?.email, telefono: profile?.telefono,
        }, logoMembrete)
        paginaFirmaNota = nueva.page
        anchoFirmaNota = nueva.width
        dibujarCentrado(nueva.page, 'FIRMAS', nueva.yEncabezadoFin - 20, 12, bold, azul, nueva.width)
        yFirmaCursorNota = nueva.yEncabezadoFin - 70
      }
      for (let fila = 0; fila < filasNota; fila++) {
        const enEstaFila = firmantesNota.slice(fila * porFilaNota, (fila + 1) * porFilaNota)
        const colWNota = anchoFirmaNota / enEstaFila.length
        const yFila = yFirmaCursorNota - fila * 42
        enEstaFila.forEach((f, i) => {
          const colX = colWNota * i
          const centrarEnCol = (texto: string, yPos: number, size: number, fnt: PDFFont) => {
            const w = fnt.widthOfTextAtSize(texto, size)
            paginaFirmaNota.drawText(texto, { x: colX + (colWNota - w) / 2, y: yPos, size, font: fnt, color: negro })
          }
          centrarEnCol(f.nombre, yFila, 11, bold)
          centrarEnCol('Comitente', yFila - 14, 10, font)
          if (f.dni) centrarEnCol(`DNI: ${f.dni}`, yFila - 28, 10, font)
        })
      }

    } else if (tipo === 'documento_identidad') {
      // ── Fotocopia DNI: una página por cada comitente, frente y dorso ──
      const datosEncabezado = {
        objeto: tipoMensuraTexto,
        comitente: nombresComitentesTodos,
        comitentePrimero: nombreComitente,
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
        ? `${Number(poligono.superficie_m2).toFixed(2)} metros cuadrados${poligono.superficie_letras ? ` (${poligono.superficie_letras})` : ''}`
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
        y = dibujarFilaLindero(page, label, valor, margenX + 30, y, anchoTexto - 30, 11, font, bold, negro)
      })
      y -= 14

      page.drawText('ANTECEDENTES DE DOMINIO:', { x: margenX, y, size: 11, font: bold, color: negro })
      y -= 20

      // Antecedentes de Dominio — pluraliza automáticamente si hay más de una inscripción
      // provincial/partida inmobiliaria/inscripción municipal cargada (la 1ª de cada una vive
      // en `inmueble`, las adicionales en `inmueble_inscripciones_extra`/`_partidas_extra` —
      // pedido de Franco, 19/9, con la fórmula "la/las siguientes inscripciones: X, Y y Z").
      // También agrega "el Folio Real" antes de "Matrícula" (pedido explícito de Franco) — solo
      // para el modo matrícula; el modo tomo/folio/finca no lo necesita, ya es autodescriptivo.
      function describirInscripcion(insc: any, depFallback: string): string | null {
        const tipo = insc?.tipo_inscripcion_registro ?? 'matricula'
        const mayorExt = insc?.inscripcion_mayor_extension ? ' (en mayor extensión)' : ''
        if (tipo === 'tomo') {
          const { registro_tomo: tomo, registro_folio: folio, registro_finca: finca, registro_anio: anio } = insc ?? {}
          if (!tomo && !folio && !finca && !anio) return null
          return `el Tomo ${tomo ?? '—'}, Folio ${folio ?? '—'}, Finca ${finca ?? '—'}, Año ${anio ?? '—'} del Departamento de ${depFallback}${mayorExt}`
        }
        const matricula = insc?.matricula_registro
        return matricula ? `el Folio Real Matrícula ${matricula}${mayorExt}` : null
      }
      const depDominio = inmueble?.departamento ?? '—'
      const inscripcionesTodas = [
        describirInscripcion(inmueble, depDominio),
        ...((inscripcionesExtra ?? []) as any[]).map(i => describirInscripcion(i, depDominio)),
      ].filter(Boolean) as string[]
      const fraseInscripcion = inscripcionesTodas.length === 0
        ? 'sin antecedentes de inscripción registrados'
        : inscripcionesTodas.length === 1
          ? `inscripto bajo ${inscripcionesTodas[0]}`
          : `inscripto bajo la/las siguientes inscripciones: ${listarConY(inscripcionesTodas)}`
      const parrafoDominio = `Las presentes operaciones afectan un inmueble identificado según catastro como ${construirUbicacion(inmueble)}, del Departamento de ${depDominio}. En el Registro de la Propiedad Inmueble de la Provincia está ${fraseInscripcion}.`
      y = dibujarParrafo(page, parrafoDominio, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      const partidasTodas = [
        inmueble?.matricula_catastral,
        ...((partidasExtra ?? []) as any[]).map(p => p.matricula_catastral),
      ].filter(Boolean) as string[]
      const parrafoRentas = `En la Dirección General de Rentas, se identifica con la/las Partidas Inmobiliarias ${listarConY(partidasTodas) || '—'}.`
      y = dibujarParrafo(page, parrafoRentas, margenX, y, anchoTexto, 11, font, negro)
      y -= 18

      const municipalesTodas = [
        (inmueble as any)?.matricula_municipal,
        ...((inscripcionesExtra ?? []) as any[]).map(i => i.matricula_municipal),
      ].filter(Boolean) as string[]
      const parrafoMunicipal = municipalesTodas.length > 0
        ? `En el Registro de la Propiedad Municipal se identifica con la/las Matrículas Municipales ${listarConY(municipalesTodas)}.`
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

      // Con más de un comitente, se listan todos con su propio DNI y rol (pedido de Franco,
      // 19/9) — mismo criterio que el 2º párrafo de la Nota de Elevación.
      const itemsComitentesCitacion = listaComitentesConDatos.length > 0
        ? listaComitentesConDatos.map((ec: any) => {
            const c = ec.comitentes
            const nombreC = `${c?.apellido ?? ''}, ${c?.nombre ?? ''}`.toUpperCase()
            const dniC = c?.dni ? ` (DNI: ${c.dni})` : ''
            return `${nombreC}${dniC} en carácter de ${rolLabel(ec.rol ?? 'titular')}`
          })
        : [`${nombreComitente.toUpperCase()} (DNI: ${comitentePrincipal?.dni ?? '—'}) en carácter de ${rolLabel(rolComitente)}`]
      const parrafoComision =
        `El Ing. Agrimensor que suscribe, habiendo recibido comisión de ${listarConY(itemsComitentesCitacion)} ` +
        `- para realizar las operaciones de ` +
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
        y = dibujarFilaLindero(page, label, valor, margenX + 10, y, anchoTexto - 10, 11, font, bold, negro, {
          lineHeight: 18, gapEntreFilas: 18, prefijo: '- ', sufijo: ' ......................................',
        })
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

      // Título = "ACTA DE " + nombre completo del objeto (pedido de Franco, 19/9) — antes era
      // un texto fijo ("ACTA DE MENSURA Y AMOJONAMIENTO") sin importar el tipo de mensura real
      // del expediente. Envuelve a varias líneas si el objeto es largo (hay varios que superan
      // los 100 caracteres).
      const yTrasTitulo = dibujarTituloWrap(page, `ACTA DE ${tipoMensuraTexto}`, yEncabezadoFin - 30, 13, bold, azul, width, anchoTexto)

      let y = yTrasTitulo - 30

      const profesionalDni       = (profile as any)?.dni
      const profesionalMatricula = profile?.matricula
      const profesionalCatastro  = (profile as any)?.matricula_catastro
      const horaTexto = (exp as any)?.hora_mensura ?? '—'

      // Franco (19/9): en este documento el "y otros" no alcanza — hay que listar a TODOS los
      // comitentes con su DNI, igual que ya se hace en Nota de Elevación/Notificación a
      // Linderos (el resto de las fojas ya lo hacía bien, solo faltaba acá).
      const nombresConDniActa = listaComitentesConDatos.length > 0
        ? listaComitentesConDatos.map((ec: any) => {
            const c = ec.comitentes
            const nombreC = `${c?.apellido ?? ''}, ${c?.nombre ?? ''}`.toUpperCase()
            const dniC = c?.dni ? ` (DNI: ${c.dni})` : ''
            return `${nombreC}${dniC}`
          })
        : [`${nombreComitente.toUpperCase()} (DNI: ${comitentePrincipal?.dni ?? '—'})`]
      const esPluralComitentesActa = nombresConDniActa.length > 1
      const listaNombresActa = listarConY(nombresConDniActa)
      // "Posesión ejercida por" sólo aplica al caso de prescripción adquisitiva (rol
      // "poseedor"); para el resto de los roles (titular, apoderado, heredero) va "la
      // propiedad del/de los" — corrección de Franco sobre el Acta de Mensura. El artículo
      // singular/plural ("del Sr." vs "de los Sres.") se arma acá para que contraiga bien en
      // los dos casos.
      const fraseTitularActa = rolComitente === 'poseedor'
        ? (esPluralComitentesActa ? `la posesión ejercida por los Sres. ${listaNombresActa}` : `la posesión ejercida por el Sr. ${listaNombresActa}`)
        : (esPluralComitentesActa ? `la propiedad de los Sres. ${listaNombresActa}` : `la propiedad del Sr. ${listaNombresActa}`)

      const parrafoActa =
        `En el Departamento de ${inmueble?.departamento ?? '—'}, Localidad de ${inmueble?.localidad ?? '—'} – ` +
        `${construirUbicacion(inmueble)} - Provincia de Corrientes. República Argentina. El Ing. Agrimensor ` +
        `que suscribe, ${nombreProfesional.toUpperCase()}` +
        `${profesionalDni ? ` - DNI: ${profesionalDni}` : ''}` +
        `${profesionalMatricula ? ` - MATRICULA PROFESIONAL DEL CONSEJO: ${profesionalMatricula}.` : ''}` +
        `${profesionalCatastro ? ` MATRICULA PROFESIONAL DE CATASTRO: ${profesionalCatastro};` : ''}` +
        ` - siendo ${horaTexto} hs. (${horaALetras(horaTexto)}) del día ${formatearFechaLarga(exp?.fecha_inicio)}, ` +
        `se deja constancia mediante la presente, que se han medido los límites de ${fraseTitularActa}. Habiendo materializado todos ` +
        `los vértices con mojones de madera dura, determinando una superficie TOTAL de ${poligono?.superficie_m2 != null ? Number(poligono.superficie_m2).toFixed(2) : '—'} ` +
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
        y = dibujarFilaLindero(page, label, valor, margenX, y, anchoTexto, 11, font, bold, negro)
      })
      y -= 14

      dibujarParrafo(
        page,
        'Sin más, se da por finalizadas las presentes operaciones, firmando los profesionales actuantes, el comitente que encargó el trabajo y los testigos invitados para tal efecto.',
        margenX, y, anchoTexto, 11, font, negro,
      )

      // Firmas: testigos + TODOS los comitentes (no solo el principal — pedido de Franco,
      // 19/9), en columnas. Si no entran todos en una sola fila sin aplastarse, se pasa a una
      // hoja nueva (con el mismo membrete) dedicada solo a las firmas — así entra la firma y el
      // sello de cada uno, en vez de ir angostando columnas hasta volverse ilegible.
      const firmantesComitentes = listaComitentesConDatos.length > 0
        ? listaComitentesConDatos.map((ec: any) => ({
            nombre: `${ec.comitentes?.nombre ?? ''} ${ec.comitentes?.apellido ?? ''}`.trim() || '—',
            rol: 'Comitente',
            dni: ec.comitentes?.dni,
          }))
        : [{ nombre: nombreComitenteDirecto, rol: 'Comitente', dni: comitentePrincipal?.dni }]
      const firmantes = [
        ...((expTestigos ?? []) as any[]).map((et, idx) => ({
          nombre: `${et.testigos?.nombre ?? ''} ${et.testigos?.apellido ?? ''}`.trim() || '—',
          rol: `Testigo ${idx + 1}`,
          dni: et.testigos?.dni,
        })),
        ...firmantesComitentes,
      ]

      const minColFirma = 110
      const porFilaFirma = Math.max(1, Math.floor(anchoTexto / minColFirma))
      const altoFilaFirma = 55
      const filasNecesarias = Math.ceil(firmantes.length / porFilaFirma)

      let paginaFirma = page
      let anchoFirma = anchoTexto
      let yFirmaCursor = 145
      if (filasNecesarias > 1) {
        // No entran todos en una fila sin angostarse de más — se pasan TODOS (no solo el
        // sobrante) a una hoja nueva dedicada, con espacio de sobra para varias filas.
        const nueva = crearPaginaConEncabezado(pdfDoc, { font, bold }, {
          objeto: tipoMensuraTexto, comitente: nombresComitentesTodos, comitentePrimero: nombreComitente,
          ubicacion: ubicacionCompleta, profesional: `Agrimensor ${nombreProfesional}`,
          email: profile?.email, telefono: profile?.telefono,
        }, logoMembrete)
        paginaFirma = nueva.page
        anchoFirma = nueva.width - margenX * 2
        dibujarCentrado(nueva.page, 'FIRMAS', nueva.yEncabezadoFin - 20, 12, bold, azul, nueva.width)
        yFirmaCursor = nueva.yEncabezadoFin - 70
      }

      for (let fila = 0; fila < filasNecesarias; fila++) {
        const enEstaFila = firmantes.slice(fila * porFilaFirma, (fila + 1) * porFilaFirma)
        const colWFirma = anchoFirma / enEstaFila.length
        const yFila = yFirmaCursor - fila * altoFilaFirma
        enEstaFila.forEach((f, i) => {
          const colX = margenX + colWFirma * i
          const centrarEnCol = (texto: string, yPos: number, size: number, fnt: PDFFont) => {
            const w = fnt.widthOfTextAtSize(texto, size)
            paginaFirma.drawText(texto, { x: colX + (colWFirma - w) / 2, y: yPos, size, font: fnt, color: negro })
          }
          centrarEnCol(f.nombre, yFila, 10, bold)
          centrarEnCol(f.rol, yFila - 14, 9, font)
          if (f.dni) centrarEnCol(`DNI: ${f.dni}`, yFila - 28, 9, font)
        })
      }

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
        y = dibujarFilaLindero(page, label, valor, margenX, y, anchoTexto, 11, font, bold, negro)
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
        objeto: tipoMensuraTexto, comitente: nombresComitentesTodos, comitentePrimero: nombreComitente, ubicacion: ubicacionCompleta,
        profesional: `Agrimensor ${nombreProfesional}`, email: profile?.email, telefono: profile?.telefono,
      }

      page.drawText('MEMORIA DE LAS OPERACIONES:', { x: margenX, y: yEncabezadoFin - 30, size: 13, font: bold, color: azul })

      listaPoligonos.forEach((pol: any, idx: number) => {
        let pag = idx === 0
          ? { page, yEncabezadoFin }
          : crearPaginaConEncabezado(pdfDoc, { font, bold }, datosEncabezadoComun, logoMembrete)

        const ladosPol = (pol?.lados ?? []).slice().sort((a: any, b: any) => a.orden - b.orden)
        const angulosPol = (pol?.angulos ?? []).slice().sort((a: any, b: any) => a.orden - b.orden)

        let y = pag.yEncabezadoFin - (idx === 0 ? 55 : 30)
        if (idx > 0) {
          pag.page.drawText('MEMORIA DE LAS OPERACIONES (continuación):', { x: margenX, y, size: 13, font: bold, color: azul })
          y -= 25
        }
        const tituloPoligono = pol?.nombre || (listaPoligonos.length > 1 ? labelParcela(pol, idx) : 'POLIGONO GENERAL')
        pag.page.drawText(tituloPoligono, { x: margenX, y, size: 11, font: bold, color: negro })
        y -= 26

        // Polígonos con muchos lados (Franco pasó un caso real de 32) no entraban en una sola
        // página — el texto de los últimos lados/ángulos quedaba dibujado por debajo del borde
        // inferior de la hoja, invisible. Antes de cada línea se mide cuánto va a ocupar
        // (puede wrappear a más de un renglón) y, si no entra, se abre una página nueva con su
        // propio membrete y se repite el título de la sección.
        const margenInferior = 70
        const asegurarEspacioMemoria = (texto: string, tituloSeccion: string) => {
          const lineasTexto = partirEnLineas(texto, anchoTexto, 11, font)
          const alturaTexto = lineasTexto.length * 17 + 4
          if (y - alturaTexto < margenInferior) {
            pag = crearPaginaConEncabezado(pdfDoc, { font, bold }, datosEncabezadoComun, logoMembrete)
            y = pag.yEncabezadoFin - 30
            pag.page.drawText('MEMORIA DE LAS OPERACIONES (continuación):', { x: margenX, y, size: 13, font: bold, color: azul })
            y -= 25
            pag.page.drawText(tituloSeccion, { x: margenX, y, size: 11, font: bold, color: negro })
            y -= 20
          }
        }

        pag.page.drawText('LADOS:', { x: margenX, y, size: 11, font: bold, color: negro })
        y -= 20
        if (!ladosPol.length) {
          pag.page.drawText('—', { x: margenX, y, size: 11, font, color: negro })
          y -= 18
        }
        // Franco pidió que cada lado/ángulo diga primero de cuál se trata (antes solo se
        // listaba el valor, sin ninguna designación) — se reusa `generarEtiquetasLados` (ya
        // usado en la Planilla de Cálculos) para los lados, y el número de vértice para los
        // ángulos. Si Franco cargó una designación manual (Tab Mensura — los lados no siempre
        // van en orden correlativo), esa tiene prioridad sobre la automática.
        const etiquetasLadosMemoria = generarEtiquetasLados(ladosPol.length)
        ladosPol.forEach((lado: any, i: number) => {
          const valorM = lado.valor_m != null ? Number(lado.valor_m).toFixed(2).replace('.', ',') : '—'
          const texto = `Lado ${lado.etiqueta || etiquetasLadosMemoria[i] || i + 1}: ${valorM} m = ${lado.valor_letras ?? '—'}`
          asegurarEspacioMemoria(texto, 'LADOS (continuación):')
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
        angulosPol.forEach((ang: any, i: number) => {
          const g = ang.grados ?? 0, m = ang.minutos ?? 0, s = ang.segundos ?? 0
          // Con el prefijo "Ángulo en vértice N:" el texto puede pasarse del ancho de página en
          // ángulos con nombres largos (ej. "TREINTA Y CINCO GRADOS, CINCUENTA Y NUEVE MINUTOS Y
          // CINCUENTA Y NUEVE SEGUNDOS") — se pasa a `dibujarParrafo` (con wrap) en vez de
          // `drawText` plano, mismo criterio ya usado para LADOS más arriba.
          const texto = `Ángulo ${ang.etiqueta || `en vértice ${i + 1}`}: ${formatearDMS(g, m, s)} (${anguloALetrasConComa(g, m, s)}).`
          asegurarEspacioMemoria(texto, 'ANGULOS (continuación):')
          y = dibujarParrafo(pag.page, texto, margenX, y, anchoTexto, 11, font, negro, undefined, 0)
          y -= 4
        })
        y -= 20

        // Mismo resguardo que arriba: si el último ángulo dejó poco margen, la línea de
        // superficie total pasa a una página nueva en vez de quedar cortada.
        if (y - 20 < margenInferior) {
          pag = crearPaginaConEncabezado(pdfDoc, { font, bold }, datosEncabezadoComun, logoMembrete)
          y = pag.yEncabezadoFin - 30
          pag.page.drawText('MEMORIA DE LAS OPERACIONES (continuación):', { x: margenX, y, size: 13, font: bold, color: azul })
          y -= 30
        }

        const superficieTexto = pol?.superficie_m2
          ? `${Number(pol.superficie_m2).toFixed(2)} metros cuadrados${pol.superficie_letras ? ` (${pol.superficie_letras.toUpperCase()})` : ''}`
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
        objeto: tipoMensuraTexto, comitente: nombresComitentesTodos, comitentePrimero: nombreComitente, ubicacion: ubicacionCompleta,
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

        const tituloPlanilla = pol?.nombre
          ? `PLANILLA DE CALCULO DE COORDENADAS Y SUPERFICIE — ${pol.nombre}`
          : listaPoligonos.length > 1
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
            ladosPol[i]?.etiqueta || etiquetas[i], ag, am, as_,
            fmt(Number(ladosPol[i]?.valor_m ?? 0)),
            String(azGrados), String(azMinutos), '0',
            fmt(dx[i]), fmt(dy[i]), fmt(x[i]), fmt(yCoord[i]),
            fmt(dxc[i]), fmt(dyc[i]), fmt(xc[i]), fmt(yc[i]),
          ])
        }
        // Fila de totales — la suma angular se hace en segundos y se vuelve a convertir a
        // grados/minutos/segundos con acarreo (mismo criterio que ya usa la web en
        // actualizarVisor() y la validación server-side de [id].astro): sumar solo el campo
        // `grados` de cada ángulo, como se hacía antes, ignoraba minutos/segundos y daba un
        // total menor al real cada vez que algún ángulo no era un número entero de grados.
        const sumLado = ladosPol.reduce((a: number, l: any) => a + Number(l?.valor_m ?? 0), 0)
        const totalSeg = angulosPol.reduce((a: number, an: any) => a + (an.grados ?? 0) * 3600 + (an.minutos ?? 0) * 60 + (an.segundos ?? 0), 0)
        const sumG = Math.floor(totalSeg / 3600)
        const sumM = Math.floor((totalSeg % 3600) / 60)
        const sumS = totalSeg % 60
        filas.push(['', String(sumG), String(sumM), String(sumS), fmt(sumLado), '', '', '', fmt(sumDX), fmt(sumDY), '', '', fmt(0), fmt(0), '', ''])

        // Polígonos con muchos lados (Franco pasó un caso real de 32) no entraban en una sola
        // página apaisada — la tabla seguía dibujando filas por debajo del borde inferior de la
        // hoja, invisibles. `crearNuevaPaginaPlanilla` arma una página apaisada nueva con su
        // propio membrete, igual que ya se hace para el polígono siguiente (idx > 0) más arriba.
        const crearNuevaPaginaPlanilla = () => {
          const nuevaPagina = pdfDoc.addPage([841.89, 595.28])
          const { width: wN, height: hN } = nuevaPagina.getSize()
          const yFinN = dibujarEncabezado(nuevaPagina, wN, hN, { font, bold }, datosEncabezadoComun, logoMembrete)
          return { page: nuevaPagina, yTop: yFinN - 42 }
        }

        const resultadoTabla = dibujarTabla(
          pag.page, margenX, pag.yEncabezadoFin - 42, anchos, encabezados, filas, { font, bold }, negro, 13, 7,
          { yMinimo: 90, nuevaPagina: crearNuevaPaginaPlanilla },
        )
        let paginaPie = resultadoTabla.page
        let yDespuesTabla = resultadoTabla.y

        // El pie (ERROR TOTAL / TOLERANCIA / SUPERFICIE) necesita ~70pt más debajo de la
        // tabla — si la última página de la tabla terminó demasiado cerca del borde, se pasa
        // el pie a una página nueva en vez de superponerlo/cortarlo.
        if (yDespuesTabla < 90) {
          const nueva = crearNuevaPaginaPlanilla()
          paginaPie = nueva.page
          yDespuesTabla = nueva.yTop
        }

        let yPie = yDespuesTabla - 16
        paginaPie.drawText('ERROR TOTAL: ', { x: margenX + 300, y: yPie, size: 9, font: bold, color: negro })
        paginaPie.drawText(error.toFixed(2), { x: margenX + 380, y: yPie, size: 9, font, color: negro })
        yPie -= 14
        const tolerancia = calcularTolerancia(sumLado, (inmueble as any)?.tipo_inmueble)
        paginaPie.drawText('TOLERANCIA: ', { x: margenX + 300, y: yPie, size: 9, font: bold, color: negro })
        paginaPie.drawText(tolerancia.toFixed(2), { x: margenX + 380, y: yPie, size: 9, font, color: negro })
        yPie -= 20

        const superficieValor = pol?.superficie_m2 ? Number(pol.superficie_m2).toFixed(2) : '—'
        paginaPie.drawRectangle({ x: margenX, y: yPie - 18, width: pag.width - margenX * 2, height: 22, color: rgb(0.92, 0.92, 0.92) })
        paginaPie.drawText('SUPERFICIE:', { x: margenX + 300, y: yPie - 12, size: 10, font: bold, color: negro })
        paginaPie.drawText(`${superficieValor}   m2`, { x: margenX + 390, y: yPie - 12, size: 10, font, color: negro })
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
      objeto: tipoMensuraTexto, comitente: nombresComitentesTodos, comitentePrimero: nombreComitente, ubicacion: ubicacionCompleta,
      profesional: `Agrimensor ${nombreProfesional}`, email: profile?.email, telefono: profile?.telefono,
    }
    // Se embebe una sola vez por documento combinado y se reusa en cada divisoria — embedPng
    // repetido en el mismo PDFDocument no rompe nada, pero infla el archivo sin necesidad.
    const logoMembreteBundle = logoMembreteBytes ? await bundleDoc.embedPng(logoMembreteBytes) : null

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
  } else if (esBundleDDJJ) {
    // "Declaraciones Juradas": junta el/los formulario/s DDJJ del expediente en un solo PDF,
    // sin páginas divisorias ni membrete NICA — son el/los formulario/s oficial/es de Catastro
    // tal cual, ya se explican solos (mismo criterio que ya usa esDDJJ más arriba: "no aplica
    // a las DDJJ, son el PDF oficial de Catastro tal cual, sin nada de NICA encima").
    const bundleDoc = await PDFDocument.create()
    for (const { pdfBytes } of documentosParaSubir) {
      const docCargado = await PDFDocument.load(pdfBytes)
      const paginasCopiadas = await bundleDoc.copyPages(docCargado, docCargado.getPageIndices())
      paginasCopiadas.forEach(p => bundleDoc.addPage(p))
    }

    const bundleBytes = await bundleDoc.save()
    const storagePath = `${expedienteId}/declaraciones_juradas_${Date.now()}.pdf`
    const { error: uploadError } = await db.storage
      .from('documentos')
      .upload(storagePath, bundleBytes, { contentType: 'application/pdf', upsert: true })

    const { data: docInsertado } = await db.from('documentos_generados').insert({
      expediente_id: expedienteId,
      tipo_documento: 'declaraciones_juradas',
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
