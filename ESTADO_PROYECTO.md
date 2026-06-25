# NICA — Estado del Proyecto
## Beta v0.4 · Junio 2026

---

## ✅ Funcionalidades implementadas (demo-ready)

### Autenticación
- Login con email + password (Supabase Auth)
- Cookies httpOnly con access-token y refresh-token
- Logout desde sidebar
- Protección de rutas: redirige a `/login` si no hay sesión

### Dashboard
- 4 contadores: total expedientes, en proceso, finalizados, docs generados
- Tabla de últimos 5 expedientes con estado y acceso directo

### Expedientes
- Listado con filtro por estado y búsqueda por nº expediente
- **Identificador provisional:** cuando no hay nº expediente asignado, muestra el apellido y nombre del comitente principal (en listado y en encabezado del expediente). El número lo asigna Catastro luego.
- Botón "Limpiar" filtros
- Crear nuevo expediente (nº, tipo, fecha, observaciones)
- Página de edición con **5 tabs**:

| Tab | Contenido | Estado |
|-----|-----------|--------|
| 1. Comitente | Buscar existente o crear nuevo, asignar rol, quitar, subir DNI escaneado | ✅ |
| 2. Inmueble | Departamento, localidad, **Partida Inmobiliaria**, **Matrícula Registro de la Propiedad**, tipo | ✅ |
| 3. Mensura | Tipo, nº expediente, fecha, polígono completo (superficie, lados dinámicos, ángulos dinámicos), linderos | ✅ |
| 4. Testigos | Buscar existente o crear nuevo | ✅ |
| 5. Documentos | Generar 12 tipos de PDFs, tabla de generados con estado y descarga | ✅ |

- Cambio de estado del expediente (borrador / en proceso / finalizado)

### Tab 3 Mensura — Polígono dinámico (nuevo v0.2)

#### Lados
- Al ingresar **Cantidad de lados**, aparecen dinámicamente N filas con: Longitud (m) y En letras
- **Conversión automática** de metros a texto en español: `40.15` → `CUARENTA METROS CON QUINCE CENTÍMETROS`
- Suma acumulada en tiempo real al pie de la tabla
- Los valores se guardan en la tabla `lados` al presionar "Guardar mensura"
- Al reabrir el expediente los datos se precargan desde la BD

#### Ángulos
- Al ingresar **Cantidad de ángulos**, aparecen dinámicamente N filas con: Valor (formato `GG.MMSS`) y En letras
- **Formato de entrada:** `90.3010` → 90 grados, 30 minutos, 10 segundos
- **Conversión automática** a texto: `90.3010` → `NOVENTA GRADOS TREINTA MINUTOS DIEZ SEGUNDOS`
- **Visor gráfico** en tiempo real: figura geométrica SVG (abanico de rayos desde vértice, con arcos coloreados por ángulo) + tabla resumen DMS + sumatoria total `∑`
- Los valores se guardan en la tabla `angulos` (columnas: `grados`, `minutos`, `segundos`, `valor_letras`) al presionar "Guardar mensura"
- Al reabrir el expediente los datos se precargan y se reconstruye el formato `GG.MMSS`

### Generación de PDF
- Genera archivo PDF real con `pdf-lib` y lo sube a Supabase Storage
- **12 tipos de documentos** disponibles, agrupados:
  - Carátula
  - Nota de Elevación a la Directora
  - Capítulo de Extensión, Límites e Inscripciones
  - Notificación a Linderos y Autoridades
  - Acta de Mensura y Amojonamiento
  - Acta de Ausencia de Linderos y Autoridades
  - Acta de Ausencia de Autoridad Judicial
  - Memoria de Mensura
  - Planilla de Cálculos
  - Formulario "U" — Declaración Jurada (Urbano)
  - Formulario "SOR" — Declaración Jurada (Suburbano/Rural)
  - Formulario "E1" — Declaración Jurada (Con Construcciones)
- **Contenido actual:** placeholder con encabezado NICA, tipo de documento, datos del expediente y fecha
- Descarga con URL firmada (válida 2 minutos)

### Comitentes
- Listado con búsqueda por nombre, apellido o DNI
- Carga de DNI escaneado (JPG, PNG o PDF) desde Tab 1 del expediente

### Perfil
- Formulario con datos del profesional (nombre, matrícula, domicilio, etc.)

---

## 📋 Cambios de la sesión — Junio 2026 (v0.4)

Arranque de la generación de **contenido real** en los PDFs (hasta ahora todos los documentos eran un placeholder genérico). Se trabajó a partir de dos referencias que proveyó Franco: un checklist de elementos mínimos del expediente, y un expediente real completo (caso "Hugo Da Silva Bairro") con el formato exacto a respetar.

### Encabezado tipo membrete (aplica a los 13 documentos)
- Reemplaza la franja azul genérica anterior
- Logo "N" + "CONSULTORIA EN AGRIMENSURA" sobre fondo blanco a la izquierda
- Caja negra a la derecha con **OBJETO / COMITENTE / UBICACIÓN / PROFESIONAL**, tomados en vivo del expediente
- Línea de contacto (Celular/Correo del profesional) debajo
- Función reutilizable `dibujarEncabezado()` en `generar.ts`, usada por todos los tipos de documento

### 1. Carátula — contenido real
- Título "MENSURA PARA [tipo de mensura]" centrado
- Datos del expediente: Departamento, Ubicación/Sección, Partida Inmobiliaria, Comitente — en negrita-cursiva (la fuente estándar de PDF más parecida a la del modelo de Franco)
- Texto justificado y con sangría en la primera línea de cada bloque, igual que el original
- **Sello circular** "ESTUDIO DE AGRIMENSURA" con texto curvo (dibujado letra por letra con rotación, ya que PDF no soporta texto curvo nativo) sobre la firma del profesional

### 2. Nota de Elevación a la Directora — contenido real
- Fecha actual, destinatario fijo (Directora General de Catastro, Dr. Yenny Contte — institucional, no depende del expediente)
- Párrafo con todos los datos del profesional: nombre, DNI, Matrícula Consejo, Matrícula Catastro, correo, celular, domicilio legal
- Párrafo con datos del comitente: nombre, DNI, **carácter** (Titular/Apoderado/Heredero/Poseedor — se agregó "Poseedor" como rol nuevo, necesario para casos de Prescripción Adquisitiva), teléfono, correo, domicilio
- Párrafo de solicitud armado con tipo de mensura + ubicación del inmueble
- Firma del comitente al pie
- Implementado párrafo **justificado** (ambos márgenes alineados, distribuyendo el espacio entre palabras) + sangría de primera línea, para igualar el formato del modelo

### 3. Fotocopia del DNI del/los Comitente/s — nuevo documento, multipágina
- Genera **una página por cada comitente** del expediente (no solo el principal)
- Cada página: nombre del comitente + recuadros **FRENTE** y **DORSO** con la imagen real **incrustada** en el PDF (no un link — se descarga de Supabase Storage y se embebe)
- Soporta tanto imágenes (jpg/png) como PDFs escaneados como DNI (se embebe la página escalada dentro del recuadro)
- Si falta el escaneo de un lado, muestra el recuadro vacío con aviso, sin romper la generación
- El pie de página ("Generado por NICA...") ahora se dibuja en todas las páginas del PDF, no solo la primera (necesario para documentos multipágina)

### Campos nuevos en base de datos
| Tabla | Columna | Uso |
|---|---|---|
| `profiles` | `dni` | DNI del profesional, usado en Nota de Elevación |
| `profiles` | `matricula_catastro` | Matrícula de Catastro (distinta de la Matrícula del Consejo, que ya existía como `matricula`) |
| `exp_comitentes` | `rol` (constraint) | Se agregó `'poseedor'` como valor válido, junto a titular/apoderado/heredero |

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dni text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS matricula_catastro text;
ALTER TABLE exp_comitentes DROP CONSTRAINT IF EXISTS exp_comitentes_rol_check;
ALTER TABLE exp_comitentes ADD CONSTRAINT exp_comitentes_rol_check CHECK (rol IN ('titular','apoderado','heredero','poseedor'));
```

### Otros ajustes menores
- Se agregó "Prescripción Adquisitiva" a la lista de tipos de mensura (Tab 3)
- Tab Perfil: separación de "Matrícula Consejo" y "Matrícula Catastro", nuevo campo DNI

---

## 📋 Cambios de la sesión — Junio 2026 (v0.3)

### 1. Preview de fotos de DNI (frente y dorso)
- Cada comitente ahora tiene **dos** espacios de carga: DNI Frente y DNI Dorso
- Si el archivo es una imagen (jpg/png), se muestra una **miniatura visual** clickeable (abre el original en pestaña nueva)
- Si es PDF, se muestra un link "Ver PDF" en lugar de miniatura
- Columnas nuevas en `comitentes`: `dni_scan_path` (frente, ya existía) y `dni_scan_path_dorso` (nuevo)
- El endpoint `/api/comitentes/upload-dni` ahora recibe un campo `lado` (`frente`/`dorso`) para saber dónde guardar
- **Pendiente futuro:** insertar ambas imágenes (frente/dorso) dentro de una página del PDF generado — se abordará junto con la implementación de contenido real de los documentos

### 2. Editar y quitar testigos
- Tab 4: cada testigo tiene un botón **Editar** (despliega un formulario inline con sus datos: nombre, apellido, DNI, domicilio) y un botón **Quitar** (lo desvincula del expediente sin borrar el registro global del testigo, igual que comitentes)
- Nuevas acciones: `editar_testigo`, `quitar_testigo`

### 3. Eliminar expedientes desde la lista
- En `/expedientes`, cada fila tiene un botón **Eliminar** que abre un **modal de confirmación** (diseño propio estilo shadcn/ui, no el `confirm()` nativo del navegador) con el nombre/número del expediente afectado
- **Borrado lógico (soft delete):** no se borra físicamente de la base. Se marca con `eliminado_at = now()` y desaparece de la lista (la query filtra `eliminado_at is null`), pero el registro y todos sus datos relacionados quedan intactos en la BD — se puede recuperar manualmente desde Supabase si fue un error
- Se eligió este enfoque porque los expedientes son registros legales de mensura; un borrado físico accidental sería irreversible y de alto impacto
- Columna nueva: `expedientes.eliminado_at` (timestamptz, null = activo)
- **Pendiente futuro:** vista de "Papelera" para restaurar expedientes eliminados, y job de limpieza definitiva después de X meses si se decide

### 4. Área de Catastro (ubicación actual del expediente)
- Nuevo campo en Tab 3 Mensura, junto a Nº de Expediente y Fecha de mensura
- Permite anotar dónde está físicamente el expediente en este momento del trámite (ej: "Dirección General de Catastro - Mesa de entradas")
- Columna nueva: `expedientes.area_catastro`

### 5. Antecedentes Técnicos
- Nuevo campo de texto libre (textarea) en Tab 2 Inmueble, antes de "Tipo de inmueble"
- Pensado para registrar el historial de inscripciones previas del inmueble (Folio Real, Matrícula, Registro de la Propiedad, sistema GEOSIT, duplicados de mensuras anteriores, etc. — según el ejemplo que proveyó Franco)
- Columna nueva: `inmuebles.antecedentes_tecnicos`

### SQL ejecutado para esta sesión
```sql
ALTER TABLE comitentes  ADD COLUMN IF NOT EXISTS dni_scan_path_dorso   text;
ALTER TABLE expedientes ADD COLUMN IF NOT EXISTS area_catastro         text;
ALTER TABLE expedientes ADD COLUMN IF NOT EXISTS eliminado_at          timestamptz;
ALTER TABLE inmuebles   ADD COLUMN IF NOT EXISTS antecedentes_tecnicos text;
```

---

## 🔍 Análisis: Punto 6 — Revisión de DDJJ (Declaraciones Juradas)

**Planteo de Franco:** tomar un PDF de Declaración Jurada ya prediseñado (plantilla oficial fija) y completarlo automáticamente con los datos que se van cargando en el sistema (comitente, inmueble, polígono, etc.), permitiendo luego descargar el PDF ya rellenado.

**Viabilidad técnica:** Sí es posible, y es una mejora natural sobre lo que ya existe (`pdf-lib` ya está instalado y en uso). Hay dos caminos según cómo esté armada la plantilla original de Franco:

| Enfoque | Cuándo aplica | Cómo funciona |
|---|---|---|
| **A. PDF con campos de formulario (AcroForm)** | Si la plantilla original tiene campos de texto editables (como un PDF rellenable de Adobe) | `pdf-lib` puede abrir el PDF base con `PDFDocument.load()`, ubicar cada campo por nombre con `form.getTextField('nombre_campo')`, y escribir el valor con `.setText()`. Es el camino más prolijo: se preserva el diseño exacto del PDF oficial. |
| **B. PDF "plano" (imagen/texto fijo sin campos)** | Si la plantilla es un PDF escaneado o exportado sin campos editables | Se "dibuja" texto encima del PDF en coordenadas X/Y fijas con `page.drawText()`, igual a como ya se genera el contenido placeholder actual. Requiere medir manualmente la posición de cada campo una vez (mirando la plantilla), pero después es automático. |

**Pasos concretos para implementarlo (una vez se aborde):**
1. Franco provee el/los PDF de DDJJ como archivo base (ya los mencionó: Formulario "U", "SOR", "E1")
2. Subir esos PDFs base a una carpeta del proyecto (o a Storage) como plantilla
3. Definir el mapeo: qué campo del sistema (ej. `comitente.nombre`, `inmueble.matricula_catastral`, `poligono.superficie_m2`) va en qué posición/campo del PDF
4. Adaptar `src/pages/api/documentos/generar.ts` para que, en vez de crear el PDF desde cero como hace ahora, cargue la plantilla base y la complete
5. Repetir el mapeo por cada tipo de DDJJ (son 3: U, SOR, E1) ya que cada una tiene campos distintos

**Qué se necesita de Franco para arrancar:** los archivos PDF originales de cada DDJJ, y idealmente que indique si son rellenables (con campos) o no — eso decide el Enfoque A o B.

> Este punto se aborda después de probar y confirmar los puntos 1 a 5.

---

## 📋 Cambios de la sesión — Junio 2026

### 1. Labels Tab 2 Inmueble
| Campo | Antes | Ahora |
|-------|-------|-------|
| `matricula_catastral` | Matrícula catastral | **Partida Inmobiliaria** |
| `matricula_registro` | Matrícula registro | **Matrícula Registro de la Propiedad** |
> Solo se cambió el label visible. El nombre de campo en BD no se modificó.

### 2. Identificador provisional de expediente
- En la lista `/expedientes` y en el encabezado de `/expedientes/[id]`: cuando `numero_expediente` es null, se muestra `Apellido, Nombre` del primer comitente con la aclaración "(sin nº asignado)"
- El número lo asigna Catastro luego y se puede editar en el campo correspondiente

### 3. Lados dinámicos del polígono
- Input `Cantidad de lados` genera N filas dinámicas (L1, L2…)
- Cada fila: Longitud (m) + En letras (auto-generado)
- Función `numeroALetras()`: convierte valor numérico a español con metros y centímetros
- Suma en tiempo real visible al pie
- Guardado: delete + re-insert en tabla `lados` al guardar mensura

### 4. Conversión automática a letras — ángulos
- Función `anguloALetras()`: convierte formato `GG.MMSS` a texto en español
- Función `parsearAngulo()`: parsea `GG.MMSS` → `{grados, minutos, segundos}`
- Función `formatearValorAngulo()`: reconstruye `GG.MMSS` desde los campos separados de la BD

### 5. Visor gráfico de ángulos (SVG)
- Figura geométrica tipo "abanico": rayos desde un vértice con arcos coloreados por segmento
- Degradé de azul oscuro → azul medio entre ángulos
- Muestra etiqueta A1, A2... en cada sector
- Arco indicador interno en el vértice
- Resumen en texto (DMS) a la izquierda del gráfico
- Sumatoria `∑` total
- Se actualiza en tiempo real al escribir los valores

---

## 🔜 Pendientes — próxima etapa

### Prioridad 1 — PDFs con contenido real
El punto más importante del sistema. Franco ya proveyó plantillas Word/PDF.

- [ ] Implementar plantilla **Nota de Elevación** con datos reales del perfil, comitente e inmueble
- [ ] Implementar plantilla **Acta de Mensura** con polígono completo (lados con letras, ángulos con letras)
- [ ] Implementar plantilla **Citación a Linderos** (linderos Norte/Sur/Este/Oeste)
- [ ] Implementar plantilla **Capítulo Ubicación / Extensión / Límites**
- [ ] Definir firma del agrimensor en PDF (¿imagen escaneada?)
- [ ] Los 12 tipos de documentos → decidir cuáles tienen plantilla real y cuáles quedan como declaraciones juradas

### Prioridad 2 — Flujo del formulario
- [ ] Validación de campos requeridos por tab
- [ ] Indicador visual de tabs completados (tick verde)
- [ ] Confirmación antes de quitar un comitente
- [ ] Filas dinámicas de **ángulos** en el mismo estilo que lados ✅ (ya implementado)

### Prioridad 3 — UX
- [ ] Editar datos de comitente/testigo existente desde el expediente
- [ ] Paginación en lista de expedientes
- [ ] Búsqueda por comitente en lista
- [ ] Limpiar / regenerar documentos (hoy crea duplicados)
- [ ] Mensaje de confirmación al cambiar estado

---

## 💡 Ideas para fases futuras

### Gestos táctiles con Hammer.js
Librería liviana (~7kb) para interacciones táctiles. Relevante para uso en tablet en el campo.

- **Visor de preview del PDF** con pinch-to-zoom y swipe entre documentos
- **Swipe entre tabs** del expediente
- **Croquis interactivo del polígono** con Canvas/SVG a partir de lados y ángulos (ya tenemos el SVG del abanico de ángulos como base)

---

## 🗂 Estructura técnica actual

```
src/
├── lib/
│   └── supabase.ts            ← supabase (anon) + getSupabase(token) autenticado
├── styles/
│   └── global.css             ← variables CSS, botones, inputs, tabla, tabs, badges
├── layouts/
│   ├── AuthLayout.astro
│   └── AppLayout.astro        ← protege rutas, verifica cookies
├── pages/
│   ├── index.astro
│   ├── login.astro
│   ├── dashboard.astro
│   ├── perfil.astro
│   ├── expedientes/
│   │   ├── index.astro        ← lista + filtros + identificador provisional
│   │   ├── nuevo.astro
│   │   └── [id].astro         ← 5 tabs · polígono dinámico · visor SVG ángulos
│   ├── comitentes/
│   │   └── index.astro
│   └── api/
│       ├── auth/logout.ts
│       ├── comitentes/
│       │   └── upload-dni.ts  ← sube DNI a Supabase Storage
│       └── documentos/
│           ├── generar.ts     ← genera PDF (12 tipos) + sube a Storage
│           └── descargar.ts   ← URL firmada → redirect descarga
```

## Stack
| Capa | Tecnología |
|------|-----------|
| Frontend/Backend | Astro 6 SSR con `@astrojs/vercel` |
| Base de datos | Supabase PostgreSQL + RLS |
| Auth | Supabase Auth (email + password) |
| Storage PDFs | Supabase Storage (bucket `documentos`) |
| Generación PDF | pdf-lib 1.17 |
| Estilos | CSS variables puras (sin Tailwind) |
| Deploy | Vercel |

> **Nota local:** `pnpm build` falla en Windows por un bug de symlinks con `@astrojs/vercel`. Usar siempre `pnpm dev` para desarrollo local. El build en Vercel (Linux) funciona correctamente.

---

## Notas de infraestructura Supabase

```sql
-- Permisos de tablas para rol authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Políticas de storage (bucket: documentos)
CREATE POLICY "Documentos: subir"    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');
CREATE POLICY "Documentos: leer"     ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documentos');
CREATE POLICY "Documentos: eliminar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documentos');

-- Columna DNI scan en comitentes (ejecutar si no existe)
ALTER TABLE comitentes ADD COLUMN IF NOT EXISTS dni_scan_path text;
```

---

*Documento actualizado: Junio 2026 · NICA Beta v0.2*
