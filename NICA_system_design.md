# NICA — System Design Document
## Referencia completa para desarrollo · Beta v1.0
### Agrimensor Franco Arturo Nigro Carriere · Corrientes, Argentina

---

## 1. VISIÓN GENERAL

NICA es una aplicación web para gestión de expedientes de mensura. Permite a Franco cargar los datos de cada expediente y generar automáticamente los documentos PDF oficiales (Nota de Elevación, Acta de Mensura, Citación, etc.).

**Usuario único (beta):** Franco Nigro  
**Diseñado para escalar** a más usuarios sin reescribir la app.

---

## 2. STACK

| Capa | Tecnología |
|------|-----------|
| Frontend | Astro |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth — email + password |
| Storage PDFs | Supabase Storage (bucket `documentos`) |
| Generación PDF | pdf-lib (recomendado) o puppeteer |
| Deploy | Vercel (recomendado) |
| Styling | CSS variables puras (sin Tailwind) |

---

## 3. CREDENCIALES SUPABASE

```env
PUBLIC_SUPABASE_URL=https://cervgqsqivquclclbhjs.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlcnZncXNxaXZxdWNsY2xiaGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2Mzg1NDQsImV4cCI6MjA5NDIxNDU0NH0.KHOIXRvxKWipS_fpq9iAYIurPa1SxGiaJ58JA2rbGeM
```

Crear archivo `.env` en la raíz del proyecto con estas variables.

---

## 4. ESTRUCTURA DE CARPETAS (Astro)

```
nica/
├── .env
├── astro.config.mjs
├── package.json
├── public/
│   └── favicon.svg
└── src/
    ├── layouts/
    │   ├── AuthLayout.astro        ← layout para login (sin sidebar)
    │   └── AppLayout.astro         ← layout principal con sidebar
    ├── pages/
    │   ├── index.astro             ← redirect a /dashboard o /login
    │   ├── login.astro
    │   ├── dashboard.astro
    │   ├── expedientes/
    │   │   ├── index.astro         ← lista de expedientes
    │   │   ├── nuevo.astro         ← formulario nuevo expediente
    │   │   └── [id].astro          ← detalle de expediente
    │   ├── comitentes/
    │   │   └── index.astro         ← lista de comitentes
    │   └── perfil.astro
    ├── components/
    │   ├── sidebar/
    │   │   └── Sidebar.astro
    │   ├── expediente/
    │   │   ├── TabComitente.astro
    │   │   ├── TabInmueble.astro
    │   │   ├── TabMensura.astro
    │   │   ├── TabTestigos.astro
    │   │   └── TabDocumentos.astro
    │   └── ui/
    │       ├── Button.astro
    │       ├── Input.astro
    │       └── Badge.astro
    ├── lib/
    │   ├── supabase.ts             ← cliente Supabase
    │   └── pdf/
    │       └── generarPDF.ts       ← lógica de generación PDF
    └── styles/
        └── global.css              ← variables CSS + reset
```

---

## 5. DISEÑO VISUAL

### Paleta de colores

```css
:root {
  /* Primarios */
  --color-primary:        #1B2E5E;   /* azul marino principal */
  --color-primary-light:  #2A4080;   /* hover de botones */
  --color-primary-dark:   #111D3D;   /* sidebar, header */

  /* Fondos */
  --color-bg:             #F4F6FA;   /* fondo general */
  --color-surface:        #FFFFFF;   /* cards, paneles */
  --color-sidebar:        #1B2E5E;   /* sidebar */

  /* Texto */
  --color-text:           #1A1A2E;   /* texto principal */
  --color-text-secondary: #6B7280;   /* subtítulos, labels */
  --color-text-inverse:   #FFFFFF;   /* texto sobre fondo azul */

  /* Bordes */
  --color-border:         #E2E8F0;

  /* Estados */
  --color-success:        #10B981;   /* expediente finalizado */
  --color-warning:        #F59E0B;   /* en proceso */
  --color-muted:          #94A3B8;   /* borrador */

  /* Acento */
  --color-accent:         #3B82F6;   /* links, focus rings */
}
```

### Tipografía

```css
/* Usar Google Fonts: Outfit (títulos) + Inter (cuerpo) */
--font-display: 'Outfit', sans-serif;
--font-body:    'Inter', sans-serif;
```

### Espaciado y bordes

```css
--radius-sm:   6px;
--radius-md:   10px;
--radius-lg:   16px;
--shadow-card: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
```

---

## 6. PANTALLAS Y FLUJO

### 6.1 Login (`/login`)
- Logo NICA centrado (texto + ícono compás/teodolito)
- Card blanca con sombra suave, fondo azul marino de pantalla completa
- Campo email, campo password, botón "Ingresar"
- Link "¿Olvidaste tu contraseña?" → Magic Link por email
- Sin registro público (solo Franco usa el sistema)

### 6.2 Dashboard (`/dashboard`)
- **Header:** Logo NICA + nombre usuario + botón cerrar sesión
- **Sidebar izquierdo** (fijo, fondo `--color-primary-dark`):
  - Dashboard
  - Expedientes
  - Comitentes
  - Perfil
- **Stats cards (4):**
  - Total expedientes
  - En proceso
  - Finalizados
  - Documentos generados
- **Tabla últimos expedientes** (5 más recientes): nº expediente, tipo, comitente, estado, fecha, acciones

### 6.3 Lista Expedientes (`/expedientes`)
- Barra superior: título + botón "Nuevo expediente"
- Filtros: estado (todos / borrador / en proceso / finalizado), búsqueda por texto
- Tabla: nº expediente, tipo mensura, comitente principal, inmueble, estado (badge), fecha, acciones (ver / editar / eliminar)
- Badge estados:
  - `borrador` → gris
  - `en_proceso` → amarillo
  - `finalizado` → verde

### 6.4 Nuevo / Editar Expediente (`/expedientes/nuevo` y `/expedientes/[id]`)

Formulario en **5 tabs secuenciales**. El expediente se crea al guardar el Tab 1 y los demás tabs usan el `id` generado.

#### Tab 1 — Comitente
- Buscador de comitentes existentes (autocomplete desde tabla `comitentes`)
- Si no existe: formulario para crear nuevo (nombre, apellido, DNI, domicilio, teléfono, email)
- Soporte para **múltiples comitentes** por expediente (botón "Agregar otro comitente")
- Campo **Rol**: titular / apoderado / heredero
- Lista de comitentes agregados con opción de quitar

#### Tab 2 — Inmueble
- Departamento (select: lista de departamentos de Corrientes)
- Localidad (texto)
- Circunscripción, Sección, Fracción, Manzana, Parcela, Subparcela (texto)
- Matrícula catastral, Matrícula registro (texto)
- Tipo de inmueble: urbano / rural (radio)

#### Tab 3 — Mensura
- **Datos generales:** Tipo de mensura (select), Número de expediente, Fecha de mensura, Fecha de citación
- **Polígono:**
  - Superficie total m² (número) + en letras (texto)
  - Cantidad de lados (número → genera dinámicamente los campos de lados)
  - Cantidad de ángulos (número → genera dinámicamente los campos de ángulos)
- **Lados** (dinámico, n filas): orden | valor metros | valor en letras | rumbo
- **Ángulos** (dinámico, n filas): orden | grados | minutos | segundos | valor en letras
- **Linderos mensura:** Norte / Sur / Este / Oeste (texto)
- **Linderos citación:** checkbox "Son iguales a mensura" → si no, campos separados Norte/Sur/Este/Oeste

#### Tab 4 — Testigos
- Buscador de testigos existentes (autocomplete desde tabla `testigos`)
- Si no existe: crear nuevo (nombre, apellido, DNI, domicilio)
- Lista de testigos agregados

#### Tab 5 — Documentos
- Resumen del expediente (solo lectura)
- Lista de documentos disponibles para generar:
  - ☐ Nota de Elevación
  - ☐ Capítulo Ubicación / Extensión / Límites
  - ☐ Acta de Mensura y Amojonamiento
  - ☐ Citación a Linderos
  - ☐ (otros según definición de Franco)
- Botón "Generar seleccionados" → genera los PDFs y los guarda en Supabase Storage
- Lista de documentos ya generados con fecha y botón de descarga

### 6.5 Detalle Expediente (`/expedientes/[id]`)
- Header con nº expediente + tipo + estado (badge) + botones Editar / Cambiar estado
- 4 secciones colapsables: Comitentes | Inmueble | Mensura | Testigos
- Panel lateral: Documentos generados (lista con fecha + descarga)

### 6.6 Lista Comitentes (`/comitentes`)
- Buscador por nombre/apellido/DNI
- Tabla: nombre completo, DNI, teléfono, expedientes asociados (nº), acciones (ver/editar)
- Al hacer click → modal con datos completos + expedientes en los que aparece

### 6.7 Perfil (`/perfil`)
- Datos de Franco: nombre, apellido, matrícula, teléfono, email, domicilio
- Botón guardar → actualiza tabla `profiles`
- Estos datos se usan al generar los documentos PDF

---

## 7. BASE DE DATOS

### Diagrama de relaciones

```
auth.users (Supabase)
    │
    ├── profiles (1:1)
    ├── comitentes (1:n)
    ├── testigos (1:n)
    └── expedientes (1:n)
            │
            ├── exp_comitentes (n:m → comitentes)
            ├── exp_testigos   (n:m → testigos)
            ├── inmuebles      (1:1)
            ├── linderos       (1:1)
            ├── poligono       (1:1)
            │       ├── lados   (1:n)
            │       └── angulos (1:n)
            └── documentos_generados (1:n)
```

### Tablas detalladas

#### `profiles`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK, FK auth.users) | |
| nombre | TEXT | |
| apellido | TEXT | |
| matricula | TEXT | Nº de matrícula profesional |
| telefono | TEXT | |
| email | TEXT | |
| domicilio | TEXT | |
| created_at | TIMESTAMPTZ | |

#### `comitentes`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK auth.users) | |
| nombre | TEXT | |
| apellido | TEXT | |
| dni | TEXT | |
| domicilio | TEXT | |
| telefono | TEXT | |
| email | TEXT | |
| created_at | TIMESTAMPTZ | |

#### `expedientes`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK auth.users) | |
| numero_expediente | TEXT | Nº oficial |
| tipo_mensura | TEXT | División / Unificación / Simple / etc. |
| estado | TEXT | borrador / en_proceso / finalizado |
| fecha_inicio | DATE | |
| fecha_cierre | DATE | |
| observaciones | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | auto-update via trigger |

#### `exp_comitentes`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| expediente_id | UUID (FK expedientes) | |
| comitente_id | UUID (FK comitentes) | |
| rol | TEXT | titular / apoderado / heredero |
| orden | INT | orden de aparición en documentos |

#### `inmuebles`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| expediente_id | UUID (FK expedientes) | |
| departamento | TEXT | |
| localidad | TEXT | |
| circunscripcion | TEXT | |
| seccion | TEXT | |
| fraccion | TEXT | |
| manzana | TEXT | |
| parcela | TEXT | |
| subparcela | TEXT | |
| matricula_catastral | TEXT | |
| matricula_registro | TEXT | |
| tipo_inmueble | TEXT | urbano / rural |

#### `poligono`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| expediente_id | UUID (FK expedientes) | |
| superficie_m2 | NUMERIC(14,4) | |
| superficie_letras | TEXT | |
| cantidad_lados | INT | |
| cantidad_angulos | INT | |

#### `lados`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| poligono_id | UUID (FK poligono) | |
| orden | INT | |
| valor_m | NUMERIC(10,4) | metros |
| valor_letras | TEXT | en letras |
| rumbo | TEXT | |

#### `angulos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| poligono_id | UUID (FK poligono) | |
| orden | INT | |
| grados | INT | |
| minutos | INT | |
| segundos | NUMERIC(5,2) | |
| valor_letras | TEXT | |

#### `linderos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| expediente_id | UUID (FK expedientes) | |
| norte_mensura | TEXT | |
| sur_mensura | TEXT | |
| este_mensura | TEXT | |
| oeste_mensura | TEXT | |
| norte_citacion | TEXT | |
| sur_citacion | TEXT | |
| este_citacion | TEXT | |
| oeste_citacion | TEXT | |
| linderos_iguales | BOOLEAN | true = citación = mensura |

#### `testigos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK auth.users) | |
| nombre | TEXT | |
| apellido | TEXT | |
| dni | TEXT | |
| domicilio | TEXT | |

#### `exp_testigos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| expediente_id | UUID (FK expedientes) | |
| testigo_id | UUID (FK testigos) | |

#### `documentos_generados`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID (PK) | |
| expediente_id | UUID (FK expedientes) | |
| tipo_documento | TEXT | nota_elevacion / acta_mensura / citacion / etc. |
| storage_path | TEXT | path en Supabase Storage |
| estado | TEXT | generado / archivado |
| generado_at | TIMESTAMPTZ | |

### Seguridad (RLS)
Todas las tablas tienen Row Level Security habilitado.  
Política general: cada usuario solo ve y edita sus propios registros (`auth.uid() = user_id`).  
Para tablas hijas (ej. lados, angulos) la política sube por FK hasta verificar `user_id` del expediente.

---

## 8. AUTENTICACIÓN

- Supabase Auth con email + password
- Middleware en Astro para proteger todas las rutas excepto `/login`
- Al entrar a `/`: verificar sesión → redirect a `/dashboard` o `/login`
- Magic Link disponible como alternativa ("Iniciar sin contraseña")

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
)
```

---

## 9. GENERACIÓN DE PDF

### Flujo
1. Usuario llega al Tab 5 (Documentos) con el expediente ya guardado
2. Selecciona qué documentos generar
3. El sistema:
   a. Consulta todos los datos del expediente (con joins)
   b. Llena la plantilla correspondiente
   c. Genera el PDF en el cliente o servidor
   d. Sube el PDF a Supabase Storage (`bucket: documentos/{expediente_id}/`)
   e. Registra en tabla `documentos_generados`
4. El usuario ve el link de descarga

### Tipos de documento
- `nota_elevacion`
- `capitulo_ubicacion`
- `acta_mensura`
- `citacion_linderos`

### Librería recomendada
`pdf-lib` para generación en cliente/servidor sin dependencias pesadas.  
Si se necesitan plantillas complejas con layout exacto, considerar `puppeteer` en una Edge Function de Supabase.

---

## 10. RUTAS Y NAVEGACIÓN

```
/                    → redirect a /dashboard (si auth) o /login
/login               → pantalla de login
/dashboard           → stats + últimos expedientes
/expedientes         → lista de expedientes
/expedientes/nuevo   → formulario nuevo (tabs 1-5)
/expedientes/[id]    → detalle + editar
/comitentes          → lista de comitentes
/perfil              → datos del profesional
```

---

## 11. CONVENCIONES DE CÓDIGO

- **Astro components:** PascalCase (`TabComitente.astro`)
- **Pages:** kebab-case (`nuevo.astro`, `index.astro`)
- **Funciones TS:** camelCase
- **Variables CSS:** `--color-*`, `--font-*`, `--radius-*`
- **IDs de Supabase:** siempre UUID, nunca autoincremental
- **Fechas:** ISO 8601 en BD, mostrar en formato `dd/mm/yyyy` en UI
- **Números con letras:** lógica de conversión en `src/lib/numeroALetras.ts`

---

## 12. DEPENDENCIAS RECOMENDADAS

```bash
pnpm add @supabase/supabase-js
pnpm add pdf-lib
pnpm add @fontsource/outfit @fontsource/inter
```

---

*Documento generado: Mayo 2026 · Versión beta*
