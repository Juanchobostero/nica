# NICA — Estado del Proyecto
## Beta v0.1 · Mayo 2026

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
- Columna comitente principal
- Botón "Limpiar" filtros
- Crear nuevo expediente (nº, tipo, fecha, observaciones)
- Página de edición con **5 tabs**:

| Tab | Contenido | Estado |
|-----|-----------|--------|
| 1. Comitente | Buscar existente o crear nuevo, asignar rol, quitar | ✅ |
| 2. Inmueble | Departamento, localidad, datos catastrales, tipo urbano/rural | ✅ |
| 3. Mensura | Tipo, nº expediente, fecha, polígono (superficie, lados, ángulos), linderos mensura y citación | ✅ |
| 4. Testigos | Buscar existente o crear nuevo | ✅ |
| 5. Documentos | Generar PDFs, tabla de generados con estado y descarga | ✅ |

- Cambio de estado del expediente (borrador / en proceso / finalizado)

### Comitentes
- Listado con búsqueda por nombre, apellido o DNI

### Perfil
- Formulario con datos del profesional (nombre, matrícula, domicilio, etc.)
- Se guardan en tabla `profiles` (usados en generación de PDF)

### Generación de PDF
- Genera archivo PDF real con `pdf-lib` y lo sube a Supabase Storage
- PDF incluye: encabezado NICA, tipo de documento, nº expediente, tipo mensura, fecha
- **Contenido actual:** placeholder — el layout oficial se implementa en siguiente etapa
- 4 tipos disponibles: Nota de Elevación, Capítulo Ubicación, Acta de Mensura, Citación a Linderos
- Descarga con URL firmada (válida 2 minutos)

---

## 🔜 Pendientes post-reunión con Franco

### Prioridad 1 — Para que sea usable en producción

#### Generación de PDFs con contenido real
El punto más importante del sistema. Requiere analizar las plantillas que Franco ya proveyó.

- [ ] Implementar plantilla **Nota de Elevación** con datos reales (perfil del agrimensor, comitente, inmueble)
- [ ] Implementar plantilla **Acta de Mensura y Amojonamiento** (datos completos: polígono, lados, ángulos, testigos)
- [ ] Implementar plantilla **Citación a Linderos** (linderos Norte/Sur/Este/Oeste de citación)
- [ ] Implementar plantilla **Capítulo Ubicación / Extensión / Límites**
- [ ] Definir con Franco: ¿se usa letra en los valores de lados/ángulos? → implementar `numeroALetras.ts`
- [ ] Definir con Franco: ¿necesita firma escaneada del agrimensor en el PDF?

#### Flujo del formulario de expediente
- [ ] Validación de campos requeridos por tab (hoy los campos son todos opcionales)
- [ ] Indicador de progreso / tabs completados (ej: tick verde en tab con datos guardados)
- [ ] Confirmación antes de quitar un comitente
- [ ] En Tab 3 Mensura: filas dinámicas de **lados** (n filas según cantidad_lados ingresada)
- [ ] En Tab 3 Mensura: filas dinámicas de **ángulos** (n filas según cantidad_angulos ingresada)

#### Edición de comitentes y testigos
- [ ] Desde `/comitentes` poder editar los datos de un comitente existente
- [ ] Desde el Tab 4 poder editar datos de un testigo existente

---

### Prioridad 2 — UX para la versión beta

- [ ] **Paginación** en lista de expedientes (hoy carga todos)
- [ ] **Búsqueda en lista** por comitente además de nº expediente
- [ ] **Fecha de mensura y fecha de citación** como campos separados (hoy comparten `fecha_inicio`)
- [ ] **Limpiar registros de documentos viejos** desde el Tab 5 (borrar un registro generado)
- [ ] **Regenerar documento** sobreescribiendo el anterior (hoy crea duplicados)
- [ ] Mensaje de confirmación al cambiar estado del expediente
- [ ] Sidebar: mostrar nombre del usuario logueado (hoy solo aparece el email en el dashboard)

---

### Prioridad 3 — Revisiones a confirmar con Franco en la reunión

Estos puntos dependen de cómo Franco trabaja en su flujo real:

- [ ] **¿El nº de expediente lo asigna Franco o lo genera el sistema?** (hoy es texto libre)
- [ ] **¿Puede haber más de un polígono por expediente?** (hoy el modelo soporta uno solo)
- [ ] **¿Fecha de citación es siempre distinta a fecha de mensura?** → separar campos
- [ ] **¿Qué campos son obligatorios para poder generar cada documento?** → definir validaciones por tipo de doc
- [ ] **¿El Acta necesita firma o rúbrica?** → analizar si va imagen o campo de firma
- [ ] **¿Qué otros documentos usa además de los 4 implementados?** (el system design los menciona como abiertos)
- [ ] **Orden de los comitentes en documentos** → confirmar que "orden" es relevante en el PDF
- [ ] **Formato de lados y ángulos en el PDF** → metros con cuántos decimales, ángulos en qué formato

---

## 💡 Ideas para fases futuras

### Gestos táctiles con Hammer.js
Librería liviana (~7kb) para agregar interacciones táctiles naturales. Relevante porque Franco probablemente use la app desde tablet en el campo.

**Casos de uso concretos:**

- **Visor de preview del PDF** — antes de generar el documento final, mostrar una vista previa con pinch-to-zoom para revisar detalles de tablas de medidas, y swipe para cambiar entre documentos (Nota de Elevación → Acta → Citación)
- **Swipe entre tabs del expediente** — navegar entre los 5 tabs deslizando lateralmente, muy natural en tablet
- **Croquis interactivo del polígono** — mini visualización del terreno dibujada con Canvas/SVG a partir de los lados y ángulos cargados, con zoom y pan para revisar la geometría antes de generar el PDF

> Confirmar con Franco en la reunión si usa tablet en el campo y si el visor de preview es una necesidad real.

---

## 🗂 Estructura técnica actual

```
src/
├── lib/
│   └── supabase.ts          ← supabase (anon) + getSupabase(token) autenticado
├── styles/
│   └── global.css           ← variables CSS, botones, inputs, tabla, tabs, badges
├── layouts/
│   ├── AuthLayout.astro     ← login (sin sidebar)
│   └── AppLayout.astro      ← app (con sidebar, protege rutas)
├── components/
│   └── sidebar/Sidebar.astro
└── pages/
    ├── index.astro           ← redirect a /dashboard o /login
    ├── login.astro
    ├── dashboard.astro
    ├── perfil.astro
    ├── expedientes/
    │   ├── index.astro       ← lista + filtros
    │   ├── nuevo.astro       ← crear expediente
    │   └── [id].astro        ← 5 tabs edición
    ├── comitentes/
    │   └── index.astro
    └── api/
        ├── auth/logout.ts
        └── documentos/
            ├── generar.ts    ← genera PDF con pdf-lib + sube a Storage
            └── descargar.ts  ← URL firmada → redirect
```

## Stack
| Capa | Tecnología |
|------|-----------|
| Frontend/Backend | Astro 6 (SSR con @astrojs/node) |
| Base de datos | Supabase PostgreSQL |
| Auth | Supabase Auth (email + password) |
| Storage PDFs | Supabase Storage (bucket `documentos`) |
| Generación PDF | pdf-lib 1.17 |
| Estilos | CSS variables puras (sin Tailwind) |
| Deploy futuro | Vercel |

---

## Notas de infraestructura Supabase

Para que el proyecto funcione correctamente deben estar aplicados:

```sql
-- Permisos de tablas para rol authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Políticas de storage (bucket: documentos)
CREATE POLICY "Documentos: subir" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');
CREATE POLICY "Documentos: leer"  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documentos');
CREATE POLICY "Documentos: eliminar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documentos');
```

---

*Documento generado: Mayo 2026 · NICA Beta v0.1*
