// Área de Catastro del expediente — antes era texto libre (riesgo de error de tipeo), Franco
// pidió un desplegable con estas 7 opciones fijas. Compartido entre dashboard.astro y
// expedientes/index.astro (los dos lugares donde se edita Nº Expediente/Área de Catastro).
export const AREAS_CATASTRO = [
  { value: 'mesa_entradas',          label: 'Mesa de entradas y salidas' },
  { value: 'agrimensores',           label: 'Agrimensores' },
  { value: 'juridico',               label: 'Jurídico' },
  { value: 'direccion',              label: 'Dirección' },
  { value: 'carga_sistema',          label: 'Carga/sistema' },
  { value: 'actualizacion_grafica',  label: 'Actualización Gráfica' },
  { value: 'profesional',            label: 'Profesional' },
]

// Expedientes viejos pueden tener texto libre guardado de antes de este cambio — en ese caso
// no hay opción que matchee y se muestra el valor crudo tal cual, en vez de romper.
export function labelAreaCatastro(value: string | null | undefined): string {
  if (!value) return '—'
  return AREAS_CATASTRO.find(a => a.value === value)?.label ?? value
}
