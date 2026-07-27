// Cálculo de poligonal cerrada a partir de lados (longitud) y ángulos internos:
// azimuts, proyecciones DX/DY, coordenadas X/Y, y su corrección por cierre (regla de la brújula).
// Compartido entre la generación de PDFs (Planilla de Cálculos) y el guardado de la
// mensura (autocálculo de superficie), para no duplicar la fórmula en dos lugares.
export function calcularPoligonal(lados: any[], angulos: any[]) {
  const n = Math.max(lados.length, angulos.length)
  if (n === 0) return null

  const azimuts: number[] = []
  for (let i = 0; i < n; i++) {
    const ang = angulos[i] ?? {}
    const angDecimal = (ang.grados ?? 0) + (ang.minutos ?? 0) / 60 + (ang.segundos ?? 0) / 3600
    if (i === 0) {
      azimuts.push(90)
    } else {
      const az = azimuts[i - 1] - (180 - angDecimal)
      azimuts.push(((az % 360) + 360) % 360)
    }
  }

  const dx: number[] = [], dy: number[] = [], x: number[] = [], y: number[] = []
  let cumX = 0, cumY = 0
  for (let i = 0; i < n; i++) {
    x.push(cumX); y.push(cumY)
    const L = Number(lados[i]?.valor_m ?? 0)
    const rad = (azimuts[i] * Math.PI) / 180
    const dxi = L * Math.cos(rad)
    const dyi = L * Math.sin(rad)
    dx.push(dxi); dy.push(dyi)
    cumX += dxi; cumY += dyi
  }

  const sumDX = dx.reduce((a, b) => a + b, 0)
  const sumDY = dy.reduce((a, b) => a + b, 0)
  const totalLength = lados.reduce((a, l) => a + Number(l?.valor_m ?? 0), 0)
  const error = Math.sqrt(sumDX * sumDX + sumDY * sumDY)

  // Corrección proporcional al largo de cada lado (regla de la brújula), para que el polígono cierre exacto
  const dxc: number[] = [], dyc: number[] = [], xc: number[] = [], yc: number[] = []
  let cumXC = 0, cumYC = 0
  for (let i = 0; i < n; i++) {
    const L = Number(lados[i]?.valor_m ?? 0)
    const corrX = totalLength ? -sumDX * (L / totalLength) : 0
    const corrY = totalLength ? -sumDY * (L / totalLength) : 0
    const dxci = dx[i] + corrX
    const dyci = dy[i] + corrY
    xc.push(cumXC); yc.push(cumYC)
    dxc.push(dxci); dyc.push(dyci)
    cumXC += dxci; cumYC += dyci
  }

  return { n, azimuts, dx, dy, x, y, dxc, dyc, xc, yc, sumDX, sumDY, totalLength, error }
}

// Tolerancia admitida para el error de cierre de la poligonal, según normativa de Catastro
// (Corrientes). Fórmulas confirmadas por Franco — condición "favorable" en ambos casos, que es
// la que se usa por el momento (el resto de la tabla, condiciones desfavorables/muy
// desfavorables y suburbano, queda para cuando haya un selector de condición de trabajo):
//   Urbano: T = 0,00025·L + 0,03
//   Rural:  T = 0,00046·L + 0,20
// L es el perímetro (suma de los lados) que resulta de la propia planilla de cálculo.
export function calcularTolerancia(perimetro: number, tipoInmueble: string | null | undefined): number {
  return tipoInmueble === 'rural'
    ? 0.00046 * perimetro + 0.20
    : 0.00025 * perimetro + 0.03
}

// Superficie de un polígono cerrado a partir de sus coordenadas compensadas (fórmula de Gauss / shoelace).
export function calcularSuperficie(calc: ReturnType<typeof calcularPoligonal>): number {
  if (!calc) return 0
  const { n, xc, yc } = calc
  let suma = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    suma += xc[i] * yc[j] - xc[j] * yc[i]
  }
  return Math.abs(suma) / 2
}
