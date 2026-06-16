# NICA — Estado del Proyecto
## Beta v0.2 · Junio 2026

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
