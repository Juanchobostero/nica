# NICA — Estado del Proyecto
## Beta v0.4 · Junio 2026

---

## ✅ Funcionalidades implementadas (demo-ready)

> Última actualización: **1 Julio 2026 · v0.6**

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
| 3. Mensura | Tipo, nº expediente, fecha, **uno o varios polígonos** (cards: superficie, lados dinámicos, ángulos dinámicos), linderos | ✅ |
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

## 📋 Cambios de la sesión — 8 Julio 2026 (v0.8)

### 1. Linderos: se resolvió el punto pendiente de la sesión anterior

Franco aclaró cómo es el proceso real: primero se releva quién linda con el inmueble para armar la **citación** (notificación previa a los vecinos), y después, el día de la mensura, se vuelve a constatar en el lugar — normalmente son los mismos linderos, salvo algún caso excepcional (ej. un ocupante ilegal).

**Cambio de tabs** (`src/pages/expedientes/[id].astro`):
- **Tab 2 Inmueble**: ahora tiene la carga completa de "Linderos" (Norte/Sur/Este/Oeste), junto a "Referencias para notificación a linderos". Es el único lugar donde se cargan los linderos de citación.
- **Tab 3 Mensura**: el bloque de linderos dejó de estar dividido en "Linderos Mensura" / "Linderos Citación". Ahora es un solo bloque **"Linderos"** que por defecto muestra los mismos valores cargados en Inmueble, deshabilitados. Hay un checkbox **"Usar los mismos linderos que en la citación"**, tildado por defecto — si al hacer la mensura encontrás que cambió alguno, lo destildás y podés corregir esos 4 campos a mano, sin afectar lo cargado en Inmueble.

**Por qué sigue funcionando bien en los documentos:** "Notificación a Linderos" y "Acta de Ausencia de Linderos" (documentos de la etapa previa) usan los valores de citación (cargados en Inmueble). "Acta de Mensura" y el "Capítulo" (documentos de la mensura en el lugar) usan los valores de mensura — que son los mismos que citación salvo que se haya corregido a mano. De paso se corrigió un detalle interno (`valorLindero` en `generar.ts`) que, con el flujo nuevo, podía dejar la Notificación a Linderos vacía en lugar de mostrar el valor recién cargado en Inmueble.

Con esto queda cerrado el punto que había quedado abierto en la sesión del 6/7 (ver más abajo): los campos de "Referencias" en Inmueble y los linderos ya no son dos cargas separadas — es un solo dato, cargado una sola vez.

### 2. Superficie autocalculada, con opción de corrección manual

Pedido de Franco: que la superficie de cada polígono se calcule sola a partir de los lados y ángulos ya cargados (mismo método que usa la Planilla de Cálculos para cerrar la poligonal), para no tener que calcularla a mano y evitar errores de cálculo — pero con la posibilidad de forzar un valor propio si el resultado no coincide con lo esperado.

**Cómo quedó:**
- El campo de superficie (m² en urbano; Hectáreas/Áreas/Centiáreas en rural) se recalcula solo, en vivo, a medida que se cargan los lados y ángulos del polígono. Por defecto aparece bloqueado (no se puede tipear).
- Checkbox **"Corregir superficie manualmente"**: al tildarlo se desbloquea el campo y se puede escribir un valor propio. Al destildarlo, vuelve a calcularse solo.
- El cálculo usa el mismo método que ya usaba la Planilla de Cálculos (cierre de la poligonal por regla de la brújula + fórmula de superficie de Gauss), así que el número que aparece en Mensura y el que aparece en la Planilla van a coincidir, salvo que se haya forzado un valor manual.
- El cálculo se rehace también del lado del servidor al guardar (no solo en el navegador), así que el valor guardado siempre queda consistente con los lados y ángulos cargados, incluso si algo falla en el navegador.
- Se aprovechó para sacar la fórmula de cálculo de la poligonal (antes solo vivía en la generación de PDFs) a un archivo compartido (`src/lib/poligonal.ts`), usado tanto por la Planilla de Cálculos como por este autocálculo — un solo lugar con la fórmula, sin duplicar.

**Cambio de base de datos** (ejecutar a mano en Supabase, mismo procedimiento que las migraciones anteriores):
```sql
ALTER TABLE poligono ADD COLUMN IF NOT EXISTS superficie_manual boolean DEFAULT false;
```
Es aditivo y no afecta expedientes existentes: todos quedan en modo "automático" por defecto. Si el número calculado no coincide con lo que ya tenían cargado, se va a ver el valor recalculado la próxima vez que abran esa mensura — se puede corregir con el checkbox si hace falta.

**Pendiente (nota interna, no bloqueante):** la tolerancia de la Planilla de Cálculos sigue fija en 0.10 — Franco todavía tiene que pasar la fórmula real que usa Catastro para eso.

---

## 📋 Cambios de la sesión — 6 Julio 2026 (v0.7)

### Tab 3 Mensura — Linderos Mensura deshabilitado (pedido de Franco)

Franco marcó que la carga de **Linderos Mensura** en la Tab 3 Mensura es redundante: la Tab 2 Inmueble ya tiene una sección **"Referencias para notificación a linderos"** (propietario anterior, calle de frente, entre calles) pensada para el mismo fin.

**Decisión de Franco:** no eliminar la sección, sino dejarla visible pero **deshabilitada**, con una aclaración de que la carga real se hace desde Tab 2 Inmueble. **Solo aplica a "Linderos Mensura"** — "Linderos Citación" y el checkbox "Linderos de citación iguales a mensura" quedan exactamente como estaban, totalmente editables.

**Cambio realizado** (`src/pages/expedientes/[id].astro`):
- Los 4 campos de **Linderos Mensura** (Norte/Sur/Este/Oeste) se muestran con `disabled` (solo lectura). Para no perder el valor ya guardado al enviar el formulario (un input `disabled` no viaja en el POST), cada uno tiene un `<input type="hidden">` en paralelo con el mismo `name` y el valor real, así "Guardar linderos" sigue guardando Linderos Citación sin pisar Linderos Mensura con vacío.
- Se agregó un cartel aclaratorio arriba de esos 4 campos indicando que la carga se hace desde Inmueble → Referencias para notificación a linderos.
- **Linderos Citación** y el checkbox de "iguales a mensura" no se tocaron: siguen editables e igual de funcionales que antes.
- **No se tocó** la tabla `linderos` en la base de datos, ni el endpoint `guardar_linderos`, ni la validación `linderosCompletos`, ni la generación de PDFs (`generar.ts`).

**⚠️ A confirmar con Franco:** los campos de "Referencias para notificación a linderos" en Tab 2 (propietario anterior, calle de frente, entre calles) **no son los mismos datos** que Norte/Sur/Este/Oeste de mensura en Tab 3 (que identifican quién linda con el inmueble en cada punto cardinal, y se usan tal cual en los documentos de notificación). Como el campo quedó de solo lectura, para expedientes nuevos que todavía no tengan esos 4 valores cargados, no va a quedar ninguna pantalla desde donde cargarlos — esos documentos van a mostrar "—" en su lugar salvo que se cargue directo en la base de datos. Si Franco efectivamente necesita seguir completando Norte/Sur/Este/Oeste de mensura en algún lugar, hay que definir dónde.

---

## 📋 Cambios de la sesión — 1 Julio 2026 (v0.6)

Implementación del **Ítem 11 — Múltiples polígonos por expediente**, analizado en la sesión anterior (ver sección de análisis más abajo, con las preguntas a Franco). Se armó en 5 pasos independientes, cada uno probado antes de pasar al siguiente, para no romper en ningún momento el caso existente de un solo polígono. **Falta la vuelta de Franco con feedback** antes de dar el ítem por cerrado — quedan preguntas abiertas sobre cómo deben tratar la superficie el resto de los documentos (no solo Memoria/Planilla).

### 1. Esquema de base de datos
- `poligono` pasa de 1:1 a 1:N con `expediente_id` (se sacó el `unique` de la columna, que lo impedía físicamente)
- Columnas nuevas: `parcela_desde`, `parcela_hasta` (default 1/1, así los polígonos existentes quedan como "Parcela 1" sin tocar nada)

```sql
ALTER TABLE poligono DROP CONSTRAINT IF EXISTS poligono_expediente_id_key;
ALTER TABLE poligono ADD COLUMN IF NOT EXISTS parcela_desde integer;
ALTER TABLE poligono ADD COLUMN IF NOT EXISTS parcela_hasta integer;
UPDATE poligono SET parcela_desde = 1, parcela_hasta = 1 WHERE parcela_desde IS NULL;
ALTER TABLE poligono ALTER COLUMN parcela_desde SET DEFAULT 1;
ALTER TABLE poligono ALTER COLUMN parcela_hasta SET DEFAULT 1;
```

### 2. Tab 3 Mensura — cards por polígono
- El formulario único de "Polígono" pasa a ser una lista de **cards**, una por polígono/parcela, con el mismo contenido de siempre (superficie, lados y ángulos dinámicos, visor SVG) pero scoped por índice de card
- Encabezado de cada card autocalculado en vivo: "Parcela 3" o "Parcelas 3 a 7" según los campos "Nº Parcela (desde)" / "(hasta)"
- Botón **"+ Agregar polígono"**: guarda lo que ya estaba cargado en las cards existentes y agrega una card nueva vacía, con numeración sugerida (siguiente a la última cargada)
- Botón **"Eliminar"** por card (solo visible si hay más de una), borra ese polígono puntual — sus lados/ángulos se van en cascada por FK
- Los tres campos "en letras" (superficie, lados, ángulos) quedaron **de solo lectura** (`readonly`, no `disabled`, para que el valor se siga mandando al guardar) — no tenía sentido que el usuario los edite a mano si son autogenerados
- Estilo: la card tiene fondo gris claro para distinguirse del resto del formulario; los campos "en letras" de solo lectura quedan en un gris un poco más oscuro, para diferenciarse de los campos editables (blancos)

### 3. Backend de guardado
- "Guardar mensura" pasa de manejar un payload a **N payloads** (uno por card, con campos prefijados `pol_{i}_...`), con validación de sumatoria angular de cada polígono antes de guardar cualquiera de ellos
- Acciones nuevas: `agregar_poligono` (guarda todo lo cargado + inserta una fila vacía) y `eliminar_pol_id` (borra un polígono puntual, sin tocar el resto)

### 4. Generación de documentos (`generar.ts`)
- **Memoria de Mensura** y **Planilla de Cálculos**: con un solo polígono el formato queda idéntico al de siempre (una página, "POLIGONO GENERAL"); con 2 o más, cada uno va en su propia página, titulada "PARCELA N" o "PARCELAS N A M"
- Probado generando ambos documentos con 3 polígonos cargados (una parcela individual + un rango agrupado "Parcelas 3 a 6") — Franco lo revisa mañana
- **Pendiente:** el resto de los documentos (Carátula, Nota de Elevación, Acta de Mensura, Capítulo de Extensión, Formularios U/SOR/E1) todavía usan solo el primer polígono — depende de las respuestas de Franco (ver preguntas pendientes en la sección de análisis)

---

## 📋 Cambios de la sesión — 30 Junio 2026 (v0.5)

Sesión enfocada en **mejoras de formularios** (Tab 2 Inmueble, formulario Nuevo Expediente) y **mejoras de generación de PDFs** (márgenes, logo, inscripción). Todos los cambios coordinados entre sí — no se rompió funcionalidad existente.

### 1. Formulario Nuevo Expediente (`nuevo.astro`)
- **Lista completa de 31 tipos de mensura** — reemplaza la lista corta anterior de 7 ítems. Incluye todos los tipos oficiales usados en la provincia (Mensura, División, Unificación, PH, Conjuntos Inmobiliarios, Regularización Dominial, Derecho de Superficie, Reputación de Dominio, etc.)
- **Campo "Tipo de Inmueble"** (Urbano / Rural) agregado al crear el expediente — define el tipo desde el inicio y ya no puede cambiarse desde Tab 2
- Al crear el expediente, se inserta automáticamente el registro en `inmuebles` con el tipo seleccionado

### 2. Tab 2 Inmueble — reestructuración completa

#### Tipo de inmueble (solo lectura)
- Ya no es editable en Tab 2 — se muestra como **badge informativo** ("Urbano" / "Rural") con leyenda "Se define al crear el expediente"
- El valor viaja al servidor como `hidden input` para no perderse al guardar

#### Identificación Catastral — campos dinámicos según tipo
| Campo | Urbano | Rural |
|-------|--------|-------|
| Manzana | ✅ visible y habilitado | ❌ oculto y deshabilitado |
| Parcela | ✅ visible | ❌ oculto |
| Sección Rural | ❌ oculto | ✅ visible |
| Fracción / Paraje | Label cambia dinámicamente según tipo | Label cambia a "Paraje" |
- **Fracción/Paraje**: deshabilitado por defecto, se habilita con un checkbox "Habilitar fracción/paraje" (solo se guarda si hay valor real)
- **Eliminados**: Circunscripción y Subparcela (no se usan en la provincia)

#### Inscripción Municipal (movida arriba de Registro)
- Deshabilitada por defecto (la mayoría de los inmuebles no la tienen)
- Checkbox "Habilitar inscripción municipal (caso excepcional)" para activar el campo
- Posicionada **antes** de Inscripción en Registro de la Propiedad

#### Inscripción en Registro de la Propiedad Inmueble
- **Radio toggle**: "Matrícula" (default) / "Tomo / Folio / Finca / Año"
  - Matrícula: muestra 1 campo (nº de matrícula)
  - Tomo/Folio/Finca/Año: muestra 4 campos (sistema pre-matrícula)
- **Checkbox "en mayor extensión"**: para cuando la escritura corresponde a una parcela de mayor superficie
- El tipo seleccionado se guarda en `tipo_inscripcion_registro`; según el tipo se limpian los campos del otro modo

### 3. Tab 3 Mensura

#### Tipo de mensura (ahora solo lectura)
- El select de tipo mensura fue **eliminado** de Tab 3 — el tipo se define al crear el expediente y no se puede cambiar
- Si el expediente tiene tipo mensura asignado, se muestra como bloque informativo de solo lectura

#### Superficie — campos según tipo de inmueble
- **Urbano**: un campo `Superficie total (m²)` — igual que antes
- **Rural**: tres campos separados — **Hectáreas / Áreas / Centiáreas** — se combinan para calcular m² al guardar (1 ha = 10.000 m², 1 a = 100 m²)
- Los campos rurales se pre-populan desde el m² almacenado al reabrir

#### Auto-conversión a letras
- La superficie se convierte automáticamente a texto al tipear, igual que lados y ángulos
- Urbano: "CIENTO VEINTE METROS CUADRADOS CON CINCUENTA CENTÍMETROS"
- Rural: "DOS HECTÁREAS, TRES ÁREAS, QUINCE CENTIÁREAS"

### 4. Generación de PDFs (`generar.ts`)

#### Márgenes
- Margen izquierdo aumentado de 40 → **55pt** en todos los documentos de texto (Nota de Elevación, Capítulo, Citación, Acta de Mensura, Acta de Ausencia, Memoria)
- Carátula: margen izquierdo del cuerpo aumentado de 55 → **90pt** para proteger el texto del anillado

#### Carátula — logo PNG
- **Sello circular dibujado** (pdf-lib primitives) **eliminado** — reemplazado por el logo PNG oficial del estudio
- Logo se carga desde `public/images/nica-logo-caratula.png` con `fs.readFile` (más confiable que fetch a sí mismo en dev SSR); fallback a HTTP fetch para producción
- El PNG incluye el sello, nombre del profesional y datos de contacto — no se duplica texto debajo
- **Nota técnica**: Chrome guarda imágenes WebP con extensión `.png` pero el contenido sigue siendo WebP (incompatible con pdf-lib). La conversión correcta se hace con PowerShell usando el codec WIC nativo de Windows 11

#### Tipo de mensura en documentos
- El prefijo "MENSURA PARA " fue eliminado del título — ahora se usa el nombre del tipo directamente (evita redundancia como "MENSURA PARA MENSURA Y DIVISIÓN")

#### Inscripción en Capítulo de Extensión
- Ahora usa `tipo_inscripcion_registro` para mostrar el texto correcto:
  - Matrícula: "inscripto bajo Matrícula XXXX"
  - Tomo: "inscripto al Tomo X, Folio Y, Finca Z, Año AAAA del Departamento de..."
  - Agrega "en mayor extensión" si `inscripcion_mayor_extension = true`

#### "Generado por NICA · fecha" eliminado
- El timestamp al pie de todos los documentos fue eliminado (no corresponde en documentos legales de mensura)

### SQL ejecutado para esta sesión
```sql
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS tipo_inscripcion_registro text DEFAULT 'matricula';
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS registro_finca text;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS inscripcion_mayor_extension boolean DEFAULT false;
```

### Ítem pendiente
- **Ítem 11 — Múltiples polígonos**: ✅ implementado (ver changelog v0.6 más abajo y detalle en la sección **"🔍 Análisis: Ítem 11 — Múltiples polígonos por expediente"**). Falta la vuelta de Franco con feedback y confirmar las preguntas pendientes antes de dar el ítem por cerrado.

---

## 🔍 Análisis: Ítem 11 — Múltiples polígonos por expediente

> **Estado: ✅ implementado (1 Julio 2026, v0.6)** — el análisis y el plan de abajo se mantienen como referencia de las decisiones de diseño. El detalle de qué se construyó está en el changelog v0.6. Sigue pendiente la vuelta de Franco con feedback y las preguntas de la última sección.

**Planteo:** un expediente puede tener más de un polígono (ej. una división en varias parcelas). Antes de esta sesión el sistema asumía **un solo polígono por expediente** (`poligono` era 1:1 con `expediente_id`, `.maybeSingle()` en el código).

### Preguntas a Franco y su respuesta

| Pregunta | Respuesta de Franco |
|---|---|
| ¿Nombre libre ("Parcela A/B") o numeración automática (P1, P2...)? | **Numeración consecutiva** (Parcela 1, Parcela 2, ..., Parcela-n) |
| ¿Cuántos polígonos puede tener un expediente en casos complejos? | **No suelen ser trabajos grandes** — pocos polígonos por expediente |
| — (aporte extra de Franco) | Catastro permite **agrupar polígonos/parcelas con medidas iguales en una misma planilla**, indicando el rango de parcelas que abarca. Aplica tanto a la **Memoria de Mensura** como a la **Planilla de Cálculos**. |

Este último punto cambia el modelo: no conviene guardar "una fila por parcela", sino **una fila por conjunto de medidas**, que puede cubrir una sola parcela o un rango consecutivo.

### Modelo de datos propuesto

- `poligono` pasa de 1:1 a **1:N** con `expediente_id` (se elimina el supuesto de `.maybeSingle()`).
- Nuevas columnas en `poligono`:
  - `parcela_desde` integer
  - `parcela_hasta` integer
- Si `parcela_desde = parcela_hasta` → es una parcela individual ("Parcela 3"). Si difieren → es un grupo agrupado ("Parcelas 3 a 7").
- `lados` y `angulos` **no cambian** — ya cuelgan de `poligono_id`, así que cada fila/grupo tiene automáticamente su propio juego de lados y ángulos.
- Numeración automática: cada polígono nuevo sugiere `parcela_desde` = `parcela_hasta` del anterior + 1. El usuario indica "cuántas parcelas abarca" (default 1) y el sistema calcula `parcela_hasta`.

```sql
ALTER TABLE poligono ADD COLUMN IF NOT EXISTS parcela_desde integer;
ALTER TABLE poligono ADD COLUMN IF NOT EXISTS parcela_hasta integer;
UPDATE poligono SET parcela_desde = 1, parcela_hasta = 1 WHERE parcela_desde IS NULL;
```

### Compatibilidad con el caso actual (un solo polígono)

**El caso de un único polígono sigue siendo el caso mínimo/por defecto** — no desaparece ni se vuelve más complicado. Un expediente con un solo polígono es simplemente una fila con `parcela_desde = parcela_hasta = 1`, que es exactamente el estado de todos los expedientes existentes hoy tras la migración. La UI con "cards" arranca siempre con una card visible (no hace falta tocar nada para el caso simple), y el botón "+ Agregar polígono" es opcional para los casos de división.

### UI propuesta (Tab 3 Mensura)

- El formulario único pasa a ser una **lista de cards**, una por polígono/grupo, con el mismo contenido que existe hoy (superficie, cantidad de lados/ángulos, filas dinámicas, visor SVG de ángulos), namespaced por card (ids únicos por índice).
- Encabezado de cada card: "Parcela 3" o "Parcelas 3 a 7" (calculado a partir de `parcela_desde`/`parcela_hasta`).
- Botón **"+ Agregar polígono"** al pie de la lista.
- Botón **"Eliminar"** por card (con confirmación), renumera automáticamente las cards siguientes.

### Guardado (backend)

- El POST de Tab 3 pasa de manejar **un payload** a manejar un **array de payloads** (uno por card).
- Se hace diff contra lo existente en BD: `update` de los que ya tienen id, `insert` de los nuevos, `delete` de los que se quitaron.
- Se reutiliza la lógica actual de borrar + reinsertar `lados`/`angulos` por cada `poligono_id`.

### Generación de documentos (`generar.ts`)

- La consulta de `poligono` deja de usar `.maybeSingle()` y trae un **array** ordenado por `parcela_desde`.
- **Memoria de Mensura** y **Planilla de Cálculos**: en vez de una sola sección de lados/ángulos/superficie, iteran el array e imprimen un subtítulo **"PARCELA N"** / **"PARCELAS N A M"** antes de cada tabla — formato que acepta Catastro según lo indicado por Franco.
- Los demás documentos (Carátula, Nota de Elevación, Acta de Mensura, Capítulo de Extensión, Formularios U/SOR/E1) hoy hablan de "una superficie total" — con más de un polígono hay que decidir si suman todas las parcelas o desglosan. Ver preguntas pendientes abajo.

### Plan de implementación (paso a paso, sin romper lo existente)

1. ✅ **Migración de esquema** (columnas nuevas con backfill `1/1`) — no cambió comportamiento, todo siguió funcionando igual.
2. ✅ **Backend de lectura**: `.maybeSingle()` → array ordenado por `parcela_desde`.
3. ✅ **UI**: cards por polígono + botón "+ Agregar polígono" (ver detalle en changelog v0.6, incluye ajustes que no estaban en el plan original: campos "en letras" readonly, numeración en vivo, estilo visual de la card).
4. ✅ **Backend de guardado**: N payloads (`pol_{i}_...`) con validación de sumatoria angular por polígono + acciones `agregar_poligono` / `eliminar_pol_id`.
5. ✅ **`generar.ts`**: Memoria de Mensura y Planilla de Cálculos iteran por polígono, con subtítulo de parcela/rango. Probado con 3 polígonos (1 individual + 1 rango agrupado) — pendiente de que Franco lo revise.
6. ⏳ **Pendiente** — revisar uno por uno los demás tipos de documento (Carátula, Nota de Elevación, Acta de Mensura, Capítulo, Formularios U/SOR/E1) para definir cómo tratan la superficie cuando hay más de un polígono. Depende de las respuestas de Franco.

Cada paso fue independiente y no rompió el funcionamiento del paso anterior — se probó y confirmó entre paso y paso (incluida una prueba real en browser tras cada uno).

### Preguntas pendientes para confirmar con Franco

> Franco va a probar la funcionalidad y dar feedback. Estas preguntas quedan para esa devolución, además de cualquier ajuste que surja de la prueba.

- Para los documentos que hoy hablan de "una superficie total" (Carátula, Nota de Elevación, Acta de Mensura, Capítulo de Extensión, Formularios U/SOR/E1): cuando hay más de una parcela, ¿el texto debe usar la **superficie total sumada** de todas las parcelas, o debe **desglosar por parcela**?
- En la Planilla de Cálculo y la Memoria de Mensura, ¿el encabezado de un grupo agrupado se escribe literalmente **"PARCELAS 3 A 7"**, o hay una convención distinta (ej. "PARCELAS 3 AL 7", "PARCELA 3-7")?
- Los **linderos** (Norte/Sur/Este/Oeste) hoy son una sola tabla por expediente (`linderos`, 1:1). Cuando se agrupan parcelas con medidas iguales, ¿los linderos también se repiten igual para todo el grupo, o pueden variar entre parcelas de un mismo grupo?
- Numeración: ¿siempre arranca en 1, o a veces el expediente ya trae una numeración preexistente de Catastro que hay que respetar (ej. parcela madre "12" se divide en "12a", "12b")?
- ¿Puede haber casos donde cada parcela resultante de la división tenga **comitentes distintos** (ej. herencia dividida entre hermanos), o los comitentes siempre aplican al expediente completo?

### Preguntas adicionales que surgieron durante la implementación

Decisiones de diseño que tomé por mi cuenta al construir esto (elegí la opción que rompía menos o requería menos esfuerzo) y que conviene que Franco confirme o corrija con el uso real:

- **Renumeración al eliminar:** si se borra una card del medio (ej. Parcela 2 de 1, 2, 3), las que quedan **no se renumeran automáticamente** — quedan "Parcela 1" y "Parcela 3", y el usuario tendría que corregir el número a mano si quiere que quede consecutivo. ¿Conviene que el sistema renumere solo, o prefiere control manual (por si el hueco es intencional)?
- **Una página por polígono en los PDF:** en Memoria de Mensura y Planilla de Cálculos, cada polígono/parcela adicional genera una **página nueva** (en vez de todo corrido en una sola página o planilla continua). ¿Es el formato que espera Catastro, o prefiere todo en una sola página mientras entre?
- **Rango "hasta" sin validación cruzada:** el campo "Nº Parcela (hasta)" de cada card es de carga libre — el sistema no valida que los rangos entre cards no se solapen o salteen números (ej. que la card 2 diga "hasta 5" y la card 3 arranque en "3"). Por ahora se confía en que el usuario lo cargue bien. ¿Vale la pena agregar una validación, o es un caso tan raro que no hace falta?

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
