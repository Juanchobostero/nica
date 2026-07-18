// Formulario E1 — Rubro 1: por cada categoría se elige un solo inciso (a-e), no las ~150
// variantes individuales que trae la planilla original (son varias frases sinónimas por
// casillero) — es el dato que Catastro usa para clasificar el edificio.
// Compartido entre la Tab DDJJ ([id].astro) y el generador de PDF (generar.ts) para que la
// lista de categorías/incisos/destinos viva en un solo lugar.
export const CATEGORIAS_E1 = [
  { key: 'fachada',      label: 'Fachada' },
  { key: 'paredes',      label: 'Paredes' },
  { key: 'techos',       label: 'Techos' },
  { key: 'cielorraso',   label: 'Cielorraso' },
  { key: 'pisos',        label: 'Pisos' },
  { key: 'revoques',     label: 'Revoques' },
  { key: 'escalera',     label: 'Escalera' },
  { key: 'carpinteria_madera',  label: 'Carpintería de madera' },
  { key: 'carpinteria_metalica', label: 'Carpintería metálica' },
  { key: 'banos',        label: 'Baños' },
  { key: 'cocina',       label: 'Cocina' },
  { key: 'revestimientos', label: 'Revestimientos' },
  { key: 'obras_accesorias', label: 'Obras accesorias' },
]

export const INCISOS_E1 = ['a', 'b', 'c', 'd', 'e']

export const DESTINOS_E1 = [
  { value: 'casa_familia', label: 'Casa de familia' },
  { value: 'casa_departamentos', label: 'Casa de departamentos' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'sanatorio', label: 'Sanatorio' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'asociaciones', label: 'Asociaciones deportivas, sociales o culturales' },
  { value: 'negocios', label: 'Negocios' },
  { value: 'espectaculos', label: 'Sala de espectáculos públicos' },
  { value: 'otros', label: 'Otros' },
]
