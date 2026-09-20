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
- 5 contadores generales: total expedientes, en proceso, observados, finalizados, docs generados
- Accesos rápidos (Nuevo expediente / Ver expedientes / Comitentes) — sin listado de expedientes acá (ver v0.22, evita duplicar `/expedientes`, que es la página con el listado completo, búsqueda y filtro)

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

## 📋 Cambios de la sesión — 20 Septiembre 2026 (v0.28) — Polígonos colapsados por defecto en Tab 3 Mensura

Franco: con varios polígonos cargados (screenshot con 9 cards abiertas: "Polígono General", "A1", "A2", "Parcelas 01 a 04...", etc.) la Tab 3 quedaba larguísima al entrar — pidió que arranquen minimizadas y se expandan solo al tocarlas.

Cada polígono ya era un `<details class="poligono-card">` nativo (colapsa/expande con un click en el título, sin JS propio) — simplemente traía el atributo `open` fijo, así que siempre arrancaban expandidos. Se sacó ese atributo; ahora todos arrancan colapsados, mostrando solo el nombre de la parcela, igual que el screenshot de referencia. No hay ningún otro lugar del código que dependa de que arranquen abiertos (ni JS ni validaciones), así que no hizo falta tocar nada más.

**Verificación**: `astro build` limpio.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Linderos con wrap + "Manzana"/"Chacra" seleccionable

Dos pedidos más de Franco (WhatsApp, 19/9):

### Linderos: wrap a la línea siguiente si hay muchos nombres
Screenshot de un lado SUR con varios linderos cargados ("Daniela Estefanía Balguenet, Hernán Gabriel Balguenet, José María Balguenet, Virginia Soledad B...") que se salía por el borde derecho de la hoja, cortado. Pasaba en las 4 partes del sistema que imprimen NORTE/ESTE/SUR/OESTE: Capítulo de Extensión ("Los linderos son:"), Notificación a Linderos ("Cuyos linderos son los siguientes:"), Acta de Mensura ("Sus linderos son:") y Acta de Ausencia de Linderos.

- Nuevo helper `dibujarFilaLindero` (junto a `dibujarTituloWrap`) que envuelve el valor a varias líneas si no entra en el ancho disponible, con sangría colgante (las líneas siguientes se alinean debajo del valor, no debajo de la etiqueta). Soporta un prefijo opcional (el "- " que usa Notificación a Linderos antes de "NORTE:") y un sufijo opcional (la línea de puntos de Notificación a Linderos, que queda al final de la última línea del valor, no de la primera).
- Reemplazados los 4 bloques que dibujaban NORTE/ESTE/SUR/OESTE a mano (`page.drawText` fijo, una sola línea) por llamadas a este helper. Verificado por trazado algebraico que con un valor corto (caso común) el resultado es idéntico al de antes — mismas coordenadas, mismo salto de línea entre filas.

### "Manzana" o "Chacra" seleccionable en el inmueble
"esto podemos editarlo para que nos permita seleccionar entre 'Manzana' (queda por defecto) o 'Chacra' y que después se imprima de acuerdo a lo que se seleccionó" — algunas zonas de Corrientes numeran por "Chacra" en vez de "Manzana", y hasta ahora el sistema solo conocía "Manzana".

- Nueva columna `inmuebles.manzana_tipo` (`'manzana'` default, o `'chacra'`) — el campo numérico en sí (`inmuebles.manzana`) no cambia, solo se agrega esto para saber cómo mostrarlo.
- Tab 2 Inmueble (`[id].astro`): el `<label>Manzana</label>` fijo pasa a ser un `<select>` con las dos opciones, con la misma pinta visual de un label (no de un campo de formulario) — se deshabilita junto con el resto de los campos "solo urbano" cuando el inmueble es rural, mismo criterio que ya tenían Manzana/Parcela.
- `construirUbicacion()` (`generar.ts`, usada en casi todos los documentos narrativos: Capítulo de Extensión, Acta de Mensura, Notificación a Linderos, Acta de Ausencia, Nota de Elevación, etc.) — el punto único donde se arma la frase "Fracción X, Parcela Y, Manzana Z..." ahora imprime "Chacra Z" si corresponde.
- Formulario U (Inc. a — Designación según Título): la plantilla real ya trae una columna "CHACRA" propia en la grilla (al lado de NUMERO/FRAC/MANZANA/LOTE/P.HORIZONT), que hasta ahora quedaba siempre vacía porque el valor de "Manzana" siempre iba a la columna MANZANA. Ahora, si el inmueble es "Chacra", el valor va en la columna CHACRA de la plantilla en vez de MANZANA — coordenada (x≈333) medida con `pdftotext -bbox` sobre la plantilla real y confirmada renderizando con `pdftocairo` (el valor cae centrado dentro del recuadro CHACRA de la grilla impresa, sin invadir las columnas vecinas).

**Verificación**: `astro build` limpio en cada ronda. La columna CHACRA de Formulario U se confirmó visualmente (render con poppler, comparando "Chacra"→columna CHACRA vs "Manzana"→columna MANZANA en la misma plantilla). **Pendiente**: correr la migración SQL (`alter table inmuebles add column if not exists manzana_tipo text default 'manzana' check (manzana_tipo in ('manzana','chacra'));`) en Supabase antes de probar — ya está agregada a `schema.sql`.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Título del Acta de Mensura + criterio "empieza con" en vez de "contiene"

Dos correcciones más de Franco por WhatsApp (19/9), sobre lo mismo del punto 3 de la tanda grande (citación/acta de ausencia solo para mensuras):

### Título del Acta de Mensura = "Acta de + nombre del objeto"
"las actas tienen que tener de titulo el nombre del objeto (Acta de ... xx)" — **aclarado con Juan: este cambio es solo para el Acta de Mensura y Amojonamiento, no para el Acta de Ausencia de Linderos y Autoridades** (esa queda con su título fijo de siempre).
- `generar.ts`, rama `acta_mensura`: el título fijo "ACTA DE MENSURA Y AMOJONAMIENTO" pasa a ser `ACTA DE ${tipoMensuraTexto}` (el tipo de mensura real del expediente, ej. "ACTA DE MENSURA Y DIVISIÓN", "ACTA DE UNIFICACIÓN EN BASE A MENSURA REGISTRADA").
- Nuevo helper `dibujarTituloWrap` (junto a `dibujarCentrado`) — hace falta porque varios tipos de mensura son bastante largos (hay uno de +190 caracteres) y no entrarían en una sola línea centrada como antes: envuelve el título a varias líneas y, si hace falta, encoge el tamaño (mismo criterio ya usado en otras partes del archivo), devolviendo la posición Y de después del título para que el resto del contenido de la página arranque más abajo si el título ocupó más de una línea.

### Citación/Acta de ausencia: "empieza con" en vez de "contiene"
"la NOTIFICACION A LINDEROS el ACTA DE AUSENCIA, solo deben imprimirse en los casos que el objeto comience con la palabra 'MENSURA'" — corrección sobre la regla implementada antes en la sesión (punto 3), que usaba "contiene la palabra mensura en cualquier parte". Con esto, tipos como "Unificación en Base a Mensura Registrada" o "División en Base a Mensura Registrada..." (contienen la palabra pero no empiezan así) dejan de llevar estos 2 documentos, mientras que "Mensura y División", "Mensura para Prescripción Adquisitiva", etc. (empiezan con "Mensura") sí los siguen llevando.
- `datosValidacion.llevaCitacionYAusencia` (`[id].astro`) y `llevaCitacionYAusencia` (`generar.ts`) cambiaron de `.includes('mensura')` a `.trim().toLowerCase().startsWith('mensura')`.

**Verificación**: `astro build` limpio. Revisados a mano los ~31 valores de `TIPOS_MENSURA` — con el cambio a "empieza con", 9 de esos 31 pasan a NO llevar más citación/acta de ausencia (los que dicen "División en Base a Mensura...", "Unificación en Base a Mensura...", "Proyecto de Unificación en Base a Mensura...", "Rectificación de Mensura"), coherente con lo que pidió Franco.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Fix: Acta de Mensura no listaba todos los comitentes en el cuerpo

Franco probó lo de comitentes múltiples (WhatsApp, 19/9): "re bien quedo los doble propietarios... en el ACTA DE MENSURA no se aplica el comando... en el resto de las fojas sí" — faltó listar los comitentes correctamente en ese documento, que se acortaba con "y otros" en vez de nombrarlos a todos.

Causa: el párrafo principal del Acta de Mensura (`dibujarFormularioActa`/rama `acta_mensura` en `generar.ts`, ~línea 2029) fue el único lugar donde el pedido original de Franco decía explícitamente "y otros" para el comitente (ver v0.28 — "Comitentes múltiples", cuerpo del Acta) — pero al verlo impreso, Franco prefiere el mismo criterio que ya usan Carátula/Nota de Elevación/Notificación a Linderos: listar a TODOS con su DNI, no abreviar.

- Nuevo bloque `nombresConDniActa`/`fraseTitularActa` que arma la lista completa ("APELLIDO, Nombre (DNI: X)" por cada comitente, unidos con "y"/comas vía `listarConY`) y elige el artículo singular/plural correcto ("el Sr." / "los Sres.", "la propiedad del" / "la propiedad de los", "la posesión ejercida por el" / "la posesión ejercida por los" — se arma así para que contraiga bien la gramática en los dos casos, no solo agregar una "s"). Reemplaza el viejo `Sr. ${nombreComitente} (DNI...) y otros`.
- El sector de firmas del Acta (todos los comitentes + testigos, paginado si hace falta) ya estaba bien desde la implementación original — no se tocó, Franco confirmó que esa parte "quedó re bien".

**Verificación**: `astro build` limpio.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Tanda grande de pedidos de Franco (en curso)

Lista completa de lo pedido por Franco (vía Juan, 19/9), para ir tildando a medida que se completa cada uno. Ninguno tocado todavía salvo lo marcado ✅.

1. **Múltiples comitentes en documentos**. **✅ Hecho** (ver entrada detallada de abajo, "Comitentes múltiples...").
   - 1.a. Que TODOS los comitentes (no solo el primero) se transcriban en: Carátula, Nota de Elevación (2º párrafo + sector firmas), sector de firmas del Acta de Mensura, rótulo/membrete de todas las hojas (sector "COMITENTE"), y Notificación a Linderos.
   - Si la lista de nombres no entra en una sola línea del rótulo, mostrar solo el primero + "Y OTROS".
   - En el sector de firmas del Acta de Mensura (y donde corresponda firma+sello), deben entrar TODOS los comitentes — saltar a otra hoja si hace falta.
   - Reemplazar la palabra "Titular" por "Propietario" en todo lo que se imprime/muestra (Catastro es exigente con la terminología) — sin tocar el valor interno `'titular'` guardado en DB.

2. **Capítulo de Extensión, Límites e Inscripciones — "Antecedentes de Dominio"**. **✅ Hecho** (ver entrada de abajo).
   - 1er párrafo (Registro de la Propiedad Provincial): decir "...está inscripto bajo el Folio Real Matrícula ...", y si hay más de una inscripción provincial cargada (tabla `inmueble_inscripciones_extra`, ya existe pero `generar.ts` todavía no la lee), pluralizar: "está inscripto bajo la/las siguientes inscripciones: inscripción 1, inscripción 2 y inscripción 3".
   - Mismo criterio de pluralización para el párrafo de inscripción municipal (3er párrafo) si hay más de una.
   - Mismo criterio para Partida Inmobiliaria (2º párrafo, tabla `inmueble_partidas_extra`, tampoco leída todavía) si hay más de una cargada.
   - Franco (WhatsApp, cita textual): *"Las presentes operaciones afectan un inmueble identificado como … En el registro de la Propiedad Inmueble de la Provincia esta/n inscripto al .. / Y ahí que se carguen todas las inscripciones provinciales que el usuario genera / Para un expte"*.

3. **Objetos que no llevan citación/acta de ausencia**. **✅ Hecho** (ver entrada de abajo). "Notificación a Linderos" y "Acta de Ausencia de Linderos y Autoridades" solo deberían ofrecerse como documentos generables cuando `tipo_mensura` contiene la palabra "mensura" — hoy se ofrecen siempre, sin ninguna condición (confirmado: no hay ninguna lógica de este tipo en el código actual).

4. **Módulo de gestión de usuarios**: que los usuarios NO admin también puedan ver/editar TODOS los expedientes del sistema (no solo los propios) — hoy es aislamiento total por dueño (`expedientes.user_id = auth.uid()`, RLS `for all`). Implica abrir en cascada las policies de ~10 tablas dependientes (`exp_comitentes`, `inmuebles`, `poligono`, `lados`, `angulos`, `linderos`, `edificacion`, `documentos_generados`, `inmueble_inscripciones_extra`, `inmueble_partidas_extra`) y sacar los `.eq('user_id', uid)` explícitos en `expedientes/index.astro` y `expedientes/[id].astro`. **✅ Hecho** (ver entrada de abajo) — **requiere correr la migración SQL antes de probar**.
   - 4.1. Mostrar en el listado quién creó cada expediente y quién hizo la última modificación — hoy no existe esa data (`expedientes` no tiene `created_by`/`updated_by`, solo `user_id` y `updated_at` sin registro de autor). Hace falta migración + acomodar la UI del listado. **✅ Hecho** (ver entrada de abajo).

5. **Logos nuevos** (`public/images/logo-nica-circular-131C3A.png`, `logo-nica-circular-blanco.png`, `NICA-LOGO REDONDO - NEGRO SIN FONDO.png`): el azul reemplaza el logo del login; el blanco sin fondo reemplaza el del sidebar, y el logo del sidebar debe ser clickeable → redirige a `/`. **✅ Hecho** (ver entrada de abajo).

**Progreso**: los 5 puntos de la tanda están completos y verificados con `astro build` (ver entradas detalladas abajo). El punto 4 necesita correr la migración SQL de la entrada correspondiente antes de probarlo en el navegador — el resto ya funciona sin pasos adicionales.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Acceso compartido a expedientes + "Creado por" / "Modificado por"

Hasta ahora cada usuario solo veía/editaba sus propios expedientes (aislamiento total por `user_id`, tanto en las consultas de la app como en las policies RLS). Franco pidió que cualquier usuario no-admin pueda ver y editar TODOS los expedientes del sistema, y que el listado muestre quién creó cada uno y quién hizo la última modificación. Decisión tomada con Juan sobre el alcance: **ver y editar quedan compartidos; crear y eliminar quedan como antes** (cada uno gestiona sus propias altas/bajas).

### Base de datos (RLS)
- Nueva columna `expedientes.updated_by uuid` (quién hizo la última modificación — `user_id` sigue siendo "quién lo creó", no se tocó).
- Las policies de `expedientes` y de las ~10 tablas dependientes (`exp_comitentes`, `exp_testigos`, `inmuebles`, `inmueble_inscripciones_extra`, `inmueble_partidas_extra`, `poligono`, `lados`, `angulos`, `linderos`, `edificacion`, `documentos_generados`) se dividieron en SELECT/INSERT/UPDATE/DELETE en vez del `for all` único de antes:
  - **SELECT y UPDATE**: abiertos a cualquier usuario logueado (`auth.uid() is not null`), sin exigir que sea el dueño.
  - **INSERT**: sigue exigiendo `auth.uid() = user_id` en `expedientes` (crear queda igual que antes).
  - **DELETE**: sigue exigiendo `auth.uid() = user_id` en `expedientes` — aunque, importante, el borrado real de la app es un soft-delete (`update eliminado_at`), que cae bajo la policy de UPDATE (abierta). La restricción real de "solo elimina el dueño" la sigue dando el filtro `.eq('user_id', uid)` que ya tenía `expedientes/index.astro` en esa acción puntual, no se sacó.
- `comitentes`/`testigos` (tablas de "maestro" de contactos, no dependientes de `expedientes`) recibieron el mismo criterio: SELECT y UPDATE abiertos a todos, INSERT/DELETE siguen propios — necesario para que un expediente compartido muestre y permita corregir los datos de comitentes/testigos cargados originalmente por otro usuario.

### Código de la app
- `expedientes/[id].astro`: la consulta que carga el expediente (línea ~20) ya no filtra por `user_id` — cualquier usuario logueado puede abrir cualquier expediente por URL. Los 3 `update` a `expedientes` de este archivo (guardar Tab Mensura, cambiar estado, guardar observaciones) ahora también graban `updated_by: uid`. El picker de "agregar comitente/testigo existente" (`comitentesAll`/`testigosAll`) dejó de filtrar por `user_id` — si no, un editor que no sea el dueño original no podía reutilizar los comitentes ya cargados en ese expediente.
- `expedientes/index.astro`: el listado principal ya no filtra por `user_id` (lista TODOS los expedientes del sistema). La acción `actualizar_datos_dgc` (Nº Expediente/Área de Catastro) dejó de filtrar por `user_id` y ahora graba `updated_by`. La acción `eliminar_expediente` (soft-delete) **mantiene** el filtro `.eq('user_id', uid)` — sigue siendo solo del dueño.
- `dashboard.astro`: las 4 métricas de expedientes (Total/En proceso/Observados/Finalizados) dejaron de filtrar por `user_id` — ahora son del sistema entero, coherente con que el listado ya muestra todos ("Docs generados" ya era una métrica global desde antes, sin cambios ahí).

### "Creado por" / "Última modif. por" en el listado (4.1)
- Se agregaron 2 columnas nuevas a la tabla de `/expedientes`: "Creado por" (de `user_id`) y "Modificado por" (de `updated_by`, con fallback a `user_id` si todavía no hay modificaciones registradas) — se integran solas al sistema de columnas arrastrables/reordenables ya existente (`th[draggable="true"]`, sin tocar el script).
- Los nombres se resuelven con el mismo patrón ya usado en `admin.astro`: un cliente `getSupabaseAdmin()` (service role, bypassa RLS de `profiles`) cruza los `user_id`/`updated_by` de la página actual contra `profiles(nombre, apellido)`, con `listUsers()` como respaldo para mostrar el email cuando el usuario todavía no cargó su perfil (ej. recién creado desde `/admin`, sin nombre/apellido todavía).

### Migración SQL a correr en Supabase (antes de probar)
```sql
alter table expedientes add column if not exists updated_by uuid references auth.users(id);
update expedientes set updated_by = user_id where updated_by is null;

-- Expedientes: reemplaza la policy única "Expedientes: CRUD propio"
drop policy if exists "Expedientes: CRUD propio" on expedientes;
create policy "Expedientes: ver todos" on expedientes for select using (auth.uid() is not null);
create policy "Expedientes: crear propio" on expedientes for insert with check (auth.uid() = user_id);
create policy "Expedientes: editar todos" on expedientes for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Expedientes: eliminar propio" on expedientes for delete using (auth.uid() = user_id);

-- Comitentes / Testigos: mismo criterio (ver/editar todos, crear/eliminar propio)
drop policy if exists "Comitentes: CRUD propio" on comitentes;
create policy "Comitentes: ver todos" on comitentes for select using (auth.uid() is not null);
create policy "Comitentes: crear propio" on comitentes for insert with check (auth.uid() = user_id);
create policy "Comitentes: editar todos" on comitentes for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Comitentes: eliminar propio" on comitentes for delete using (auth.uid() = user_id);

drop policy if exists "Testigos: CRUD propio" on testigos;
create policy "Testigos: ver todos" on testigos for select using (auth.uid() is not null);
create policy "Testigos: crear propio" on testigos for insert with check (auth.uid() = user_id);
create policy "Testigos: editar todos" on testigos for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Testigos: eliminar propio" on testigos for delete using (auth.uid() = user_id);

-- Tablas dependientes de expedientes (directas o via inmuebles/poligono): sacan el chequeo de
-- dueño, dejan solo "existe el padre" + sesión válida.
drop policy if exists "exp_comitentes: acceso via expediente propio" on exp_comitentes;
create policy "exp_comitentes: acceso via expediente existente" on exp_comitentes for all
  using (auth.uid() is not null and exists (select 1 from expedientes e where e.id = exp_comitentes.expediente_id))
  with check (auth.uid() is not null and exists (select 1 from expedientes e where e.id = exp_comitentes.expediente_id));

drop policy if exists "exp_testigos: acceso via expediente propio" on exp_testigos;
create policy "exp_testigos: acceso via expediente existente" on exp_testigos for all
  using (auth.uid() is not null and exists (select 1 from expedientes e where e.id = exp_testigos.expediente_id))
  with check (auth.uid() is not null and exists (select 1 from expedientes e where e.id = exp_testigos.expediente_id));

drop policy if exists "Inmuebles: acceso via expediente propio" on inmuebles;
create policy "Inmuebles: acceso via expediente existente" on inmuebles for all
  using (auth.uid() is not null and exists (select 1 from expedientes e where e.id = inmuebles.expediente_id))
  with check (auth.uid() is not null and exists (select 1 from expedientes e where e.id = inmuebles.expediente_id));

drop policy if exists "Inscripciones extra: acceso via inmueble → expediente propio" on inmueble_inscripciones_extra;
create policy "Inscripciones extra: acceso via inmueble existente" on inmueble_inscripciones_extra for all
  using (auth.uid() is not null and exists (select 1 from inmuebles i where i.id = inmueble_inscripciones_extra.inmueble_id))
  with check (auth.uid() is not null and exists (select 1 from inmuebles i where i.id = inmueble_inscripciones_extra.inmueble_id));

drop policy if exists "Partidas extra: acceso via inmueble → expediente propio" on inmueble_partidas_extra;
create policy "Partidas extra: acceso via inmueble existente" on inmueble_partidas_extra for all
  using (auth.uid() is not null and exists (select 1 from inmuebles i where i.id = inmueble_partidas_extra.inmueble_id))
  with check (auth.uid() is not null and exists (select 1 from inmuebles i where i.id = inmueble_partidas_extra.inmueble_id));

drop policy if exists "Poligono: acceso via expediente propio" on poligono;
create policy "Poligono: acceso via expediente existente" on poligono for all
  using (auth.uid() is not null and exists (select 1 from expedientes e where e.id = poligono.expediente_id))
  with check (auth.uid() is not null and exists (select 1 from expedientes e where e.id = poligono.expediente_id));

drop policy if exists "Lados: acceso via poligono → expediente propio" on lados;
create policy "Lados: acceso via poligono existente" on lados for all
  using (auth.uid() is not null and exists (select 1 from poligono p where p.id = lados.poligono_id))
  with check (auth.uid() is not null and exists (select 1 from poligono p where p.id = lados.poligono_id));

drop policy if exists "Angulos: acceso via poligono → expediente propio" on angulos;
create policy "Angulos: acceso via poligono existente" on angulos for all
  using (auth.uid() is not null and exists (select 1 from poligono p where p.id = angulos.poligono_id))
  with check (auth.uid() is not null and exists (select 1 from poligono p where p.id = angulos.poligono_id));

drop policy if exists "Linderos: acceso via expediente propio" on linderos;
create policy "Linderos: acceso via expediente existente" on linderos for all
  using (auth.uid() is not null and exists (select 1 from expedientes e where e.id = linderos.expediente_id))
  with check (auth.uid() is not null and exists (select 1 from expedientes e where e.id = linderos.expediente_id));

drop policy if exists "Edificacion: acceso via expediente propio" on edificacion;
create policy "Edificacion: acceso via expediente existente" on edificacion for all
  using (auth.uid() is not null and exists (select 1 from expedientes e where e.id = edificacion.expediente_id))
  with check (auth.uid() is not null and exists (select 1 from expedientes e where e.id = edificacion.expediente_id));

drop policy if exists "Documentos: acceso via expediente propio" on documentos_generados;
create policy "Documentos: acceso via expediente existente" on documentos_generados for all
  using (auth.uid() is not null and exists (select 1 from expedientes e where e.id = documentos_generados.expediente_id))
  with check (auth.uid() is not null and exists (select 1 from expedientes e where e.id = documentos_generados.expediente_id));
```

**Verificación**: `astro build` limpio en cada ronda de edición. `schema.sql` quedó sincronizado con la migración (mismas policies, para que una instalación nueva desde cero ya nazca así). Migración corrida en Supabase (19/9). **Pendiente**: probar en el navegador con 2 usuarios reales (uno abriendo un expediente creado por el otro) — no hay forma de simular 2 sesiones distintas sin datos/usuarios reales, queda para cuando Franco/Juan lo prueben en su entorno.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Comitentes múltiples en documentos

Hasta ahora todos los documentos generados solo mostraban el primer comitente cargado (`nombreComitente`), aunque el expediente tuviera varios. Se agregó, sin sacar `nombreComitente` (sigue existiendo y se sigue usando donde antes, ~10 lugares auditados por grep para no romper nada), una nueva variable `nombresComitentesTodos` que junta apellido+nombre de TODOS los comitentes del expediente con el criterio "A, B y C" (helper `listarConY`), usada puntualmente en:

- **Carátula**: el campo "Comitente:" ahora lista a todos.
- **Nota de Elevación**: 2º párrafo lista a todos los comitentes; sector de firmas reescrito con paginación (antes un solo `dibujarCentrado` fijo) — si no entran todas las firmas en la fila/página actual, arma filas nuevas y, si hace falta, una página nueva.
- **Acta de Mensura**: el cuerpo agrega "y otros" después del nombre cuando hay más de un comitente; sector de firmas reescrito para combinar TODOS los testigos + TODOS los comitentes en un único bloque paginado (misma lógica de fila/página que Nota de Elevación) — si no entran en la página actual, se crea una página nueva con `crearPaginaConEncabezado(...)` titulada "FIRMAS".
- **Notificación a Linderos**: la frase "habiendo recibido comisión de..." ahora lista a todos los comitentes, cada uno con su rol real (`"NOMBRE (DNI: X) en carácter de {rol}"`).
- **Rótulo/membrete de cada hoja** (`dibujarEncabezado`, fila "COMITENTE"): si el listado completo entra en una sola línea se muestra completo; si no entra, se corta a "PRIMERO Y OTROS" (nueva lógica de una sola línea con truncado — solo para esta fila; las demás filas del rótulo, OBJETO/UBICACIÓN/PROFESIONAL, siguen con su wrap libre de siempre sin cambios).
- **"Titular" → "Propietario"**: helper `rolLabel(rol)` aplicado donde el rol se imprime literal (dorso de SOR, Nota de Elevación, Notificación a Linderos) — el valor interno `'titular'` en DB no se tocó, ni las comparaciones internas (`rolComitente === 'poseedor'`, etc.).

Se verificó a mano, con traza algebraica (no solo visual), que con pocos firmantes la nueva lógica de paginación de firmas produce exactamente el mismo resultado que el código viejo de una sola fila — para no arriesgar el caso común (1-2 comitentes) al resolver el caso nuevo (varios).

**Verificación**: `astro build` limpio en cada ronda de edición.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Capítulo de Extensión: pluralización de inscripciones/partidas

El capítulo "ANTECEDENTES DE DOMINIO" (documento `capitulo_ubicacion`) solo contemplaba una inscripción provincial (`inmuebles`), una partida inmobiliaria y una inscripción municipal — pero la Tab Inmueble ya permite cargar inscripciones/partidas adicionales desde la sesión anterior (v0.26, tablas `inmueble_inscripciones_extra`/`inmueble_partidas_extra`), que `generar.ts` todavía no leía para este documento.

- Se agregaron los `select` de ambas tablas (ordenadas por `orden`), justo después de la carga de `edificacion`.
- Nuevo helper `describirInscripcion(insc, depFallback)` + reescritura completa de los 3 párrafos del capítulo (Registro de la Propiedad Provincial, Partida Inmobiliaria/Rentas, inscripción Municipal) con pluralización real: singular igual que antes si hay una sola inscripción/partida cargada, y si hay 2+ arma la lista completa con la fórmula "la/las siguientes inscripciones: inscripción 1, inscripción 2 y inscripción 3" (se mantiene la convención de placeholder literal "la/las" ya presente en el párrafo de Rentas original).

**Verificación**: `astro build` limpio. Pendiente de prueba visual en el navegador con un expediente que tenga más de una inscripción/partida cargada (no hay forma de generar ese caso sin datos reales de Franco).

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Citación a linderos / Acta de ausencia solo para objetos de "mensura"

Franco pidió que "Notificación a Linderos" y "Acta de Ausencia de Linderos y Autoridades" solo se ofrezcan quiénes tengan un `tipo_mensura` que contenga la palabra "mensura" — antes se ofrecían siempre, para cualquier tipo de objeto (ej. "División para Someter al Régimen de Conjuntos Inmobiliarios..." es el único de los ~31 valores reales de `TIPOS_MENSURA` que no la contiene, confirmado por enumeración completa antes de aplicar la regla).

- **`expedientes/[id].astro`**: nuevo campo `datosValidacion.llevaCitacionYAusencia = (exp.tipo_mensura ?? '').toLowerCase().includes('mensura')`; el checklist de documentos de la Tab 5 ahora filtra esos 2 documentos cuando el campo es `false`; el armado del bundle "Expediente completo" (`armarHandlerBundle`) también los agrega/saca condicionalmente del lado del cliente, leyendo `window.datosValidacion.llevaCitacionYAusencia`.
- **`generar.ts`**: la misma condición decide, del lado del servidor, si `citacion_linderos`/`acta_ausencia_linderos` entran en el array `tipos` del bundle "Expediente completo" — evitando que alguien fuerce la generación vía URL directa aunque la UI ya los oculte.
- **Fix proactivo detectado antes de que rompiera nada**: el título de sección "ACTAS" (`DIVISORIAS_BUNDLE`) estaba enganchado al tipo `citacion_linderos` — si ese documento queda afuera del bundle, el título nunca se dibujaría aunque `acta_mensura` siguiera necesitando su encabezado de sección. Se movió la construcción de `DIVISORIAS_BUNDLE` a DESPUÉS de armar `tipos`, con una key computada que engancha "ACTAS" a `citacion_linderos` si está presente, o a `acta_mensura` si no.

**Verificación**: `astro build` limpio. Enumerados a mano los ~31 valores de `TIPOS_MENSURA` (`expedientes/nuevo.astro`) para confirmar que la regla por substring "mensura" es segura y no excluye ningún tipo real que debería llevar estos documentos.

---

## 📋 Cambios de la sesión — 19 Septiembre 2026 (v0.28) — Logos nuevos + "Titular" → "Propietario"

- **Login** (`src/pages/login.astro`): logo cambiado a `logo-nica-circular-131C3A.png` (el azul).
- **Sidebar** (`src/components/sidebar/Sidebar.astro`): logo cambiado a `logo-nica-circular-blanco.png` (blanco sin fondo) — se sacó el `background:#fff`/`box-shadow` que tenía el ícono viejo (ese fondo blanco taparía un logo blanco transparente) y se cambió `object-fit` de `cover` a `contain` para no recortar el logo nuevo, que ya viene circular. El bloque `.sidebar-logo` ahora es un `<a href="/">` en vez de un `<div>` — clickeable, redirige a `/` (que a su vez manda a `/dashboard` si hay sesión, o `/login` si no).
- **"Titular" → "Propietario"**: los `<option>` de rol de comitente en `expedientes/[id].astro` (líneas 753 y 779) ahora muestran "Propietario" — el `value="titular"` interno no se tocó (sigue siendo el valor guardado en `exp_comitentes.rol`, sin migración necesaria). En `generar.ts` se agregó `rolLabel(rol)` (helper nuevo, cerca de `dibujarCentrado`) que mapea `'titular'` → `'propietario'` solo para lo que se IMPRIME — aplicado en los 3 lugares donde `rolComitente` se imprime literalmente en un documento (declaración del dorso de SOR, Nota de Elevación, Notificación a Linderos). La comparación interna en Acta de Mensura (`rolComitente === 'poseedor'`, decide "la posesión ejercida por" vs "la propiedad del") no se tocó — sigue comparando el valor crudo de la base, no el label.

**Verificación**: `astro build` limpio.

---

## 📋 Cambios de la sesión — 18 Septiembre 2026 (v0.27) — Admin: cambiar contraseña de otro usuario

Franco todavía no probó los cambios subidos (v0.26). Mientras tanto pidió: poder cambiar la contraseña de un usuario (la suya propia, por ejemplo) directo desde `/admin`, sin depender del flujo de "olvidé mi contraseña" por email — solo un admin puede hacerlo.

- Nueva acción `cambiar_password` en `src/pages/admin.astro` — usa el mismo método admin de Supabase Auth (`admin.auth.admin.updateUserById(id, { password })`) que ya usaban desactivar/reactivar, confirmado contra los tipos oficiales de `@supabase/auth-js` (`GoTrueAdminApi.d.ts`, "Updates a user's password"). Valida mínimo 6 caracteres (mismo criterio que "Crear usuario"), da feedback claro por `successMsg`/`errorMsg` (el mismo mecanismo de alertas ya usado en toda la página).
- UI: un `<details>` "Cambiar contraseña" por fila de usuario (al lado de Desactivar/Reactivar), que despliega un campito de texto + botón "Guardar" — no hace falta la contraseña actual del usuario objetivo, es un reset directo por admin. Disponible también en la propia fila del admin logueado (a diferencia de Desactivar, que no aplica a uno mismo).
- No se tocó nada de `crear_usuario`/`desactivar_usuario`/`reactivar_usuario` ni del resto de la sesión.

**Verificación**: `astro build` limpio.

---

## 📋 Cambios de la sesión — 17 Septiembre 2026 (v0.26) — Tab Inmueble: inscripciones/partidas adicionales, se saca "notificación a linderos", fix Planilla de Cálculos

Pedidos de Franco (por audio, relayados por Juan) sobre la Tab "Inmueble" del wizard de expediente y la Planilla de Cálculos. **Requiere correr una migración SQL antes de probar** (al final de esta entrada).

### 1. Inscripciones en Registro de la Propiedad — ahora se pueden agregar más de una
Un inmueble armado por unión de varias parcelas puede tener más de una inscripción registral (y, de la mano, más de una inscripción municipal) — antes solo había lugar para una. La primera inscripción sigue cargándose exactamente igual que antes (mismos campos, misma tabla `inmuebles`, sin ningún cambio ahí); las adicionales van a una tabla nueva `inmueble_inscripciones_extra`, con su propia lista + botón "Quitar" + formulario "+ Agregar otra inscripción" (mismo patrón ya usado para comitentes/testigos: cada alta/baja es un mini-form propio, sin tocar el form grande de "Guardar inmueble"). Aparece debajo del botón "Guardar inmueble", dentro de la misma Tab.

### 2. Partida Inmobiliaria — mismo criterio
Mismo patrón, tabla nueva `inmueble_partidas_extra`: la primera partida sigue en `inmuebles.matricula_catastral` (Identificación Catastral, sin cambios), las adicionales en la tabla nueva con su propia lista + agregar/quitar.

### 3. Se saca "Referencias para notificación a linderos" del formulario
Franco pidió sacar "Calle de frente" / "Entre calle" / "Y calle" del formulario — cambio ya definitivo, general para todos los casos. **Ojo, conflicto real que se le señaló a Juan y confirmó seguir adelante igual**: `calle_frente` también completaba el Inc. a) "UBICACIÓN: Calle" del **Formulario U** (Designación según título) — al sacar el input, ese campo de Formulario U y el párrafo de "Notificación a Linderos y Autoridades" (`citacion_linderos`) que arma la frase "...frente a la calle X, entre las calles Y y Z" quedan sin ese dato de acá en más (ambos documentos ya manejaban el caso vacío con gracia, sin texto roto — no hay excepción/crash, solo sale una oración más corta). No se tocó `generar.ts` ni el schema — las columnas siguen existiendo, simplemente no hay más forma de cargarlas desde la UI. "Propietario anterior" se mantiene (sigue siendo un dato real, usado en Formulario U y en la Notificación a Linderos) — solo se le sacó el título de sección "notificación a linderos" que ya no aplica, queda como campo suelto.

### 4. Fix: Planilla de Cálculos no mostraba nombre de parcela ni etiquetas de lado/ángulo
Franco reportó (audio) que los datos de la Planilla de Cálculos no coincidían con lo cargado en la Tab Mensura. Causa: el `select` de `generar.ts` (rama `planilla_calculos`/Memoria de Mensura, línea ~977) no traía las columnas `nombre` (de `poligono`) ni `etiqueta` (de `lados`/`angulos`) — aunque el código más abajo ya las usaba (`pol.nombre` para el título de la planilla, `lado.etiqueta`/`ang.etiqueta` para las designaciones manuales de lado/ángulo tipo "L1-B"), así que siempre llegaban `undefined` y esos datos salían en blanco/con la designación automática aunque Franco los hubiera cargado a mano en Mensura. Se agregaron ambas columnas al `select`.

### Migración SQL a correr en Supabase (antes de probar)
```sql
create table if not exists inmueble_inscripciones_extra (
  id                            uuid primary key default gen_random_uuid(),
  inmueble_id                   uuid references inmuebles(id) on delete cascade not null,
  orden                         int default 1,
  tipo_inscripcion_registro     text default 'matricula' check (tipo_inscripcion_registro in ('matricula','tomo')),
  matricula_registro            text,
  registro_tomo                 text,
  registro_folio                text,
  registro_finca                text,
  registro_anio                 text,
  inscripcion_mayor_extension   boolean default false,
  matricula_municipal           text
);
alter table inmueble_inscripciones_extra enable row level security;
create policy "Inscripciones extra: acceso via inmueble → expediente propio"
  on inmueble_inscripciones_extra for all
  using (exists (select 1 from inmuebles i join expedientes e on e.id = i.expediente_id where i.id = inmueble_inscripciones_extra.inmueble_id and e.user_id = auth.uid()))
  with check (exists (select 1 from inmuebles i join expedientes e on e.id = i.expediente_id where i.id = inmueble_inscripciones_extra.inmueble_id and e.user_id = auth.uid()));

create table if not exists inmueble_partidas_extra (
  id            uuid primary key default gen_random_uuid(),
  inmueble_id   uuid references inmuebles(id) on delete cascade not null,
  orden         int default 1,
  matricula_catastral text not null
);
alter table inmueble_partidas_extra enable row level security;
create policy "Partidas extra: acceso via inmueble → expediente propio"
  on inmueble_partidas_extra for all
  using (exists (select 1 from inmuebles i join expedientes e on e.id = i.expediente_id where i.id = inmueble_partidas_extra.inmueble_id and e.user_id = auth.uid()))
  with check (exists (select 1 from inmuebles i join expedientes e on e.id = i.expediente_id where i.id = inmueble_partidas_extra.inmueble_id and e.user_id = auth.uid()));
```

**Verificación**: `astro build` limpio. `astro dev` levanta sin error de arranque (ruta protegida redirige a `/login` como siempre, sin 500). El Fragment nuevo (`<>...</>`) que envuelve la Tab Inmueble para poder agregar las 2 secciones nuevas como hermanas del `<form>` principal (HTML no permite forms anidados) se validó vía `astro build`, que compila/analiza el archivo completo. **Pendiente de probar en el navegador con datos reales** — Juan lo va a probar después de correr la migración.

---

## 📋 Cambios de la sesión — 15 Septiembre 2026 (v0.25) — Rubro 5 del dorso de SOR: reconstrucción completa desde geometría exacta del Excel

El primer ajuste (14/9, entrada anterior) mejoró el tamaño de los títulos y fusionó las filas 6-9, pero el usuario marcó que seguía sin parecerse al Excel de referencia. Se rehizo por completo, esta vez extrayendo la geometría con precisión real en vez de a ojo: un script aparte (`xlsx`, ya usado en sesiones anteriores para este mismo Excel — reutiliza el archivo `C:\Users\juanc\Downloads\DDJJ - UNIVERSALES (SOR - E1 - U).xlsx` ya analizado, no hizo falta pedirle nada nuevo al usuario) suma el ancho real (`wpx`) de cada columna de la hoja "SoR (D)" desde la columna A, dando la posición x exacta de cada grupo y sub-columna — antes esas posiciones eran una estimación.

Esa segunda pasada reveló 3 cosas de la estructura real que la primera no había capturado:
- **Cada sub-columna tiene un número clave (1, 2, 3...) impreso justo debajo de su etiqueta** (fila 10 del Excel) — así es como Catastro marca la grilla en el formulario real (tilda el número, no la palabra). Se agregó esa fila de números, ausente hasta ahora.
- **La fila "MONTE" (9) no es una franja fusionada de ancho completo** como las filas 6-8 ("Afloramientos"/"Lagunas"/"Carrisales") — son 3 segmentos propios BUENO / REGULAR / MALO (merges reales del Excel: R28:Y28, AA28:AK28, AM28:AT28). Se corrigió de "MONTE (BUENO / REGULAR / MALO)" en un solo texto a 3 columnas reales con su propio divisor.
- **Algunos títulos de grupo están fusionados en 2 filas propias** en el Excel (no solo "AGUA DEL SUBSUELO"/"CAPACIDAD GANADERA", que ya se habían partido a mano en el primer intento) — "ESPESOR DE CAPA ARABLE" y "COLOR DE LA TIERRA" también necesitan 2 líneas para entrar en su columna, y el primer intento los dejaba en una sola línea que nunca entraba (ni al tamaño mínimo), desbordando sobre el título vecino. Se resolvió con un helper nuevo (`encogerYEnvolver`) que reduce el tamaño Y envuelve el texto a 1-2 líneas a la vez (en vez de solo reducir tamaño sin envolver), aplicado parejo a los 7 títulos.

Se probó también, y se descartó, una alternativa: dar vuelta el texto de las sub-columnas angostas (LLANO/ONDULADO/etc.) a horizontal en vez de vertical, para que se pareciera más al renglón de texto horizontal que se ve en Excel. No es viable: esas sub-columnas miden ~8pt de ancho en esta escala de página — ningún tamaño de letra legible entra ahí horizontal, ni envolviendo (algunas etiquetas como "BUENAS A MAS DE 15 MTS" tendrían que partirse en 6-7 líneas de 3-4 letras cada una, ilegible). El texto rotado 90°, que ya estaba, es la solución correcta para columnas de este ancho — igual que usan formularios oficiales reales con muchas columnas angostas.

**Verificación**: `astro build` limpio. Script aislado con `pdf-lib` + render con poppler, comparado directamente contra la captura del Excel de referencia — confirmado que los 7 títulos de grupo ya no se superponen, los números clave aparecen bajo cada sub-columna, y la fila "MONTE" muestra sus 3 segmentos con divisor. El resto de la página (Rubro 6, declaración jurada, firma) no se tocó — solo se ajustó el punto de arranque (`yTexto`) para que siga inmediatamente después de la grilla, que ahora es un poco más alta que antes.

---

## 📋 Cambios de la sesión — 14 Septiembre 2026 (v0.25) — Ajuste visual: Rubro 5 del dorso de Formulario SOR

El usuario marcó que la tabla "RUBRO 5: CARACTERISTICAS" del dorso de SOR (`dibujarDorsoSor`, Fase B) se veía desprolija, comparándola contra la hoja "SoR (D)" del Excel de referencia de Franco. Dos correcciones, ninguna copia colores de Franco (siguen sin colores, solo la grilla — regla ya establecida), son ajustes de estructura/tipografía:

- **Títulos de columna a un tamaño parejo**: antes cada título ("RELIEVE", "ESP. CAPA ARABLE", "COLOR DE TIERRA", etc.) encogía su letra por separado hasta entrar en su propia columna — con columnas angostas como "COLOR DE TIERRA", terminaba mucho más chico que sus vecinos "RELIEVE"/"AGUA SUBSUELO", una fila de encabezado con tamaños dispares. Ahora se calcula un solo tamaño (el más chico que entra en la columna más angosta) y se usa parejo en los 7 títulos.
- **Filas 6 a 9 ("Afloramientos de tosca", "Lagunas...", "Carrisales", "Monte") fusionadas en una sola franja, sin grilla interna**: revisando la hoja de Excel de Franco de nuevo, esas 4 filas son estructuralmente un renglón descriptivo simple, no una grilla de casilleros como las filas 1-5 (se ve claro en el Excel: esas filas son una franja fusionada sin columnas internas). El código las dibujaba igual que las filas 1-5, con las líneas verticales de las 7 columnas cruzando por encima del texto largo (ej. "LAGUNAS Y OTROS ESPEJOS DE AGUA" atravesado por 5-8 líneas de grilla que no aplican ahí) — de ahí lo "feo". Se cortan los divisores verticales al pie de la fila 5 (`yLimiteGrid`) en vez de seguir hasta el final de la tabla, y el texto de esas 4 filas arranca un poco más a la izquierda (en la columna ALTIMETRIA, no después de ella) para aprovechar el ancho fusionado.

**Verificación**: `astro build` limpio. Script aislado con `pdf-lib` + render con poppler, comparado antes/después — confirmado visualmente que las filas 6-9 quedan como una franja limpia sin líneas cruzando el texto, y los 7 títulos de columna se leen parejos.

---

## 📋 Cambios de la sesión — 14 Septiembre 2026 (v0.25) — Fase D (DDJJ interactivas / AcroForm): implementada y luego revertida por decisión del usuario

Se implementó y verificó de punta a punta la conversión completa de los 3 formularios de DDJJ (U, SOR, E1) a PDF interactivo (AcroForm) — campos de texto y grupos de opciones reales, editables desde el visor nativo de PDF, sin aplanar el documento. Las 3 sub-fases (D.1 Formulario U, D.2 Formulario SOR, D.3 Formulario E1) se completaron y se verificaron con scripts aislados + render con poppler, sin errores de build.

**Al probarlo en un expediente real, el usuario decidió revertir todo el enfoque**: no le gustó el resultado visual en el navegador (el resaltado celeste/gris que Chrome dibuja sobre cada campo interactivo para señalar dónde se puede hacer click, visible en la vista previa). Pidió deshacer los documentos interactivos por completo y buscar otro enfoque para que cargar las DDJJ sea menos engorroso, sin tocar nada más de lo agregado en la sesión.

**Reversión realizada** (manual, no había ningún commit hecho desde que arrancó la Fase D — se reconstruyó cada rama a partir de lo ya leído en la propia conversación, en vez de descartar todo el archivo): en `generar.ts` se sacaron los 4 helpers de AcroForm (`crearCampoTexto`, `crearCampoTextoMultilinea`, `crearSiNo`, `crearCheckbox`), el import de `type PDFForm`, y las 3 ramas (`formulario_u`, `formulario_sor`, `formulario_e1`) volvieron a su versión de texto fijo/`drawText` con `campo`/`marcar`/`campoSor`/`marcarSor`/`campoE1`/`marcarE1` — **incluidos los 8 campos nuevos que se habían agregado en espacios antes vacíos de Formulario U** (Nomenclatura Catastral, ADREMA, "Cantidad de formularios que se acompañan", Nº de Mensura inscripto, Superficie según Título/Estimado): esos datos vuelven a quedar sin completar, como estaban antes de esta fase. Confirmado con `grep` que no queda ninguna referencia a AcroForm en el archivo, y `astro build` limpio.

**Se mantuvo sin tocar** todo lo demás de la sesión: el fix del declarante de Formulario U (Fase A, comitente con datos de Franco por defecto — decisión de Franco), el dorso de Formulario SOR (Fase B, `dibujarDorsoSor`), el dorso de Formulario E1 (`dibujarDorsoE1`), el módulo de administración, y el listado de expedientes con filtros/orden/columnas reordenables/paginado.

**Hallazgo del Rubro 2 de Formulario E1** (columna "Coeficiente" pisando los valores en x=540, detectado durante la verificación de D.3 y confirmado como preexistente al código de antes de esta fase) sigue sin corregir — no se tocó al revertir, porque no formaba parte de la Fase D en sí. Sigue pendiente de revisar con Franco.

**Pendiente**: definir un enfoque distinto para agilizar la carga de datos de DDJJ que hoy faltan (Nomenclatura Catastral, ADREMA, etc.) sin usar campos interactivos de PDF — a discutir con el usuario en la próxima sesión.

---

## 📋 Cambios de la sesión — 14 Septiembre 2026 (v0.24) — Listado de Expedientes: filtros, orden, columnas reordenables y paginado

`expedientes/index.astro` no tenía paginado (la lista ya se estaba haciendo larga), los filtros eran solo estado + búsqueda por Nº, y no había forma de ordenar por última modificación. Se agregaron las 4 mejoras pedidas, todas dentro de lo que ya existía (mismo patrón de filtros vía `GET`, sin tocar el modelo de datos):

- **Filtros nuevos**: Área de Catastro (dropdown, reusa `AREAS_CATASTRO` ya existente) y rango de fechas (`desde`/`hasta` sobre `fecha_inicio`, `.gte()`/`.lte()`). La búsqueda por texto (`q`) ahora también matchea contra "Tipo de mensura" además de "Nº Expediente" (antes solo esto último) — vía `.or(...)`, mismo mecanismo ya usado en `comitentes/index.astro`.
- **Ordenar por última modificación**: nueva columna "Última modif." (la tabla `expedientes` ya tenía `updated_at` con un trigger de auto-update — no hizo falta migración) con un link en el header que alterna asc/desc (`?sort=updated_at&dir=asc|desc`); sin tocar el header, el orden por defecto sigue siendo el de siempre (más nuevo por `created_at`).
- **Paginado**: mismo patrón exacto ya usado en `comitentes/index.astro` (`POR_PAGINA=10`, `.range()` + `count:'exact'`, controles Anterior/Siguiente).
- **Columnas reordenables**: arrastrar y soltar cualquier header (excepto "Acciones", que queda siempre al final) para reordenar la tabla — el orden se guarda en `localStorage` del navegador (no es una preferencia de usuario en la base, es puramente visual/local) y se restaura solo al volver a cargar la página.
- Se agregó una función `armarQuery(overrides)` en el frontmatter para no repetir a mano la reconstrucción del query string (filtros + orden + página) en cada link de paginado/orden — arma la URL completa preservando todos los filtros activos salvo los que se pisan explícitamente.

### Verificado
`astro build` sin errores de tipo. El reordenamiento de columnas (la parte más delicada, todo en el cliente) se verificó de punta a punta con un arnés de Playwright que sirve el script real extraído tal cual del archivo (mismo método ya usado en sesiones anteriores para JS de cliente) a través del compilador de Astro: se simulan los eventos nativos de `dragstart`/`dragover`/`drop` (Playwright no tiene una API de alto nivel para drag & drop HTML5) arrastrando una columna del medio hasta la primera posición, y se confirma que (1) el header y las celdas de cada fila quedan reordenados exactamente igual entre sí, (2) "Acciones" se mantiene siempre al final, (3) el nuevo orden se guarda en `localStorage`, y (4) recargando la página el orden se restaura igual. Confirmado por el usuario en la app real ("quedo bien").

### Ajuste (v0.24) — Filtros dinámicos, sin botón "Filtrar"

A pedido del usuario: se sacó el botón "Filtrar" — el form (`#form-filtros`) ahora se envía solo. Selects (estado, área) y las fechas envían al tocarlos (evento `change`, discreto, no hace falta esperar nada); el campo de búsqueda de texto espera una pausa de 400ms después de que el usuario deja de tipear antes de enviar (si mandara uno por letra, recargaría la página constantemente). Como cada envío sigue siendo una recarga completa de página (no se reescribió a AJAX — mismo patrón 100% SSR que el resto del proyecto), se agregó también que el campo de búsqueda recupere el foco y el cursor al final después de recargar (si ya tenía texto) — sin eso, cada pausa al tipear le hacía perder el foco y había que volver a clickear el campo para seguir. El botón "Limpiar" queda igual que antes (solo aparece si hay algún filtro activo).

### Verificado
`astro build` sin errores de tipo. Falta confirmar con el usuario en la app real.

---

## 📋 Cambios de la sesión — 14 Septiembre 2026 (v0.24) — Dorso del Formulario E1

El usuario confirmó las Fases A/B/C del Roadmap 3 (declarante del Formulario U, dorso del SOR, módulo de administración) — todas probadas en su entorno real. Antes de pasar a la conversión a AcroForm (Fase D), pidió terminar de dejar los 3 documentos parejos: **Formulario E1 también con página de dorso**, igual que U y SOR.

**Diferencia clave con U/SOR**: el E1 ya tiene su declaración jurada en el **frente** (implementado en una sesión anterior) — el dorso real (Rubros 3 a 7) es **100% "Reservado para uso de la Dirección"**: determinación del valor unitario, valuación del edificio (vivienda y negocio/espectáculos), obras accesorias, y resumen de valuación. Nuestro sistema nunca completa nada ahí — se agregó solo por consistencia visual con los otros 2 formularios (decisión del usuario).

- **Nueva función `dibujarDorsoE1`** en `generar.ts` (misma zona que `dibujarDorsoSor`), con un helper genérico `dibujarTablaE1` reutilizado en las 5 sub-tablas (Rubros 3, 4, 5, 6, 7) — más simple que la grilla del SOR (columnas más anchas, alcanza con texto horizontal partido en líneas vía `partirEnLineas`, sin necesitar texto girado 90°).
- Coordenadas extraídas de la hoja "E1 (D)" del Excel de Franco (mismo método `xlsx` ya usado para el SOR).
- **Dos ajustes hechos al renderizar y revisar visualmente** (no eran evidentes solo mirando los números): los títulos de "Rubro 4" y "Rubro 7" quedaban pegados al borde de la tabla anterior en las coordenadas tal cual las daba el Excel (0pt de separación) — se les agregó un margen (`GAP_R4`/`GAP_R7`) para que no se superpongan. Además, la hoja de Excel original repite el texto "TOTAL DE RUBRO 4" en la tabla del Rubro 5 (un error de copiado del formulario/Excel original) — se corrigió a "TOTAL RUBRO 5" en la versión que genera el sistema.
- Se llama a `dibujarDorsoE1(pdfDoc, font, bold, negro)` al final de la rama `formulario_e1`, después de la declaración jurada del frente.

**Verificación de que no se rompe nada en preview/descarga** (pedido explícito del usuario, con los 3 documentos ahora en 2 páginas cada uno): revisado el código de la vista previa (`[id].astro`, modal — carga la URL firmada en un `<iframe>`, el visor nativo del navegador ya muestra/scrollea todas las páginas sin ningún código nuestro de por medio) y de la descarga (`descargar.ts` — sirve el archivo tal cual está en Storage, sin ninguna suposición de cantidad de páginas). También los dos PDFs combinados ("Declaraciones juradas" y "Expediente completo") usan `copyPages(doc, doc.getPageIndices())` — ya copian **todas** las páginas de cada documento, no solo la primera. Conclusión: nada de esto necesitaba cambios, ya era agnóstico a la cantidad de páginas por documento.

### Verificado
`astro build` sin errores de tipo. Renderizado con `pdf-lib` + poppler en un script aislado, iterando una vez para corregir los dos problemas de superposición encontrados visualmente — el resultado final muestra las 5 sub-tablas del dorso completas, legibles, sin superposiciones, y toda la página entra sin desbordar (termina a ~940pt de una página de 1008pt). Falta confirmar con el usuario en la app real.

---

## 📋 Cambios de la sesión — 13 Septiembre 2026 (v0.23) — Roadmap 3: correcciones de DDJJ contra Excel de Franco

Franco pasó un Excel de referencia (`DDJJ - UNIVERSALES (SOR - E1 - U).xlsx`, 6 hojas: frente/dorso de SoR, E1 y U, cada uno con un caso real completado) para terminar de darle forma a la tarea de DDJJ. Se analizó completo (extraído con la librería `xlsx` en un proyecto Node aparte, sin tocar el proyecto) y se cruzó campo por campo contra `generar.ts` — el mapeo ya calibrado coincide casi exactamente, buena señal para la conversión a AcroForm (Fase D, pendiente). Aparecieron 2 correcciones concretas en Formulario U (Fase A, esta entrada) y una plantilla incompleta en el SOR (Fase B, sesión en curso). Plan completo de las 4 fases (A a D) guardado en el plan de la sesión.

### Fase A (v0.23) — Formulario U: declarante correcto + croquis en blanco

**A.1 — Declarante**: el párrafo de declaración jurada (`dibujarFormularioU`, rama `formulario_u`) usaba al **agrimensor** (`profile`) como declarante con carácter fijo "AGRIMENSOR" — decisión tomada en el Roadmap 1 contra un ejemplo distinto. Los dos ejemplos reales de este Excel nuevo muestran como declarante al **comitente**, con su rol real ("...en su carácter de POSEEDOR" / "...en su carácter de AUTORIZADO"). Cambiado a `comitentePrincipal`/`rolComitente` (ya calculados en el archivo, reusados también por Acta de Mensura y Nota de Elevación) — de paso, nacionalidad y tipo de documento ahora salen de columnas reales de `comitentes` en vez de asumir "Argentina"/"DNI" fijo (que era necesario cuando el declarante era `profile`, sin esas columnas).

**A.2 — Croquis en blanco**: Franco pidió que el recuadro de "Croquis de la Parcela" (Rubro 2) quede completamente en blanco, sin ningún cuadrado (lo dibuja él a mano). Renderizando la plantilla actual con poppler se confirmó que, además de las 4 marcas de esquina que el código ya blanqueaba, **el recuadro cuadrado en sí también viene impreso en la plantilla** (`public/pdf-templates/formulario_u.pdf`) — se agregó un quinto `drawRectangle` blanco cubriendo el cuadrado completo (`x=361,y=541,w=118,h=119`).

### Verificado
`astro build` sin errores de tipo. Verificado con un script aislado de `pdf-lib` (mismo método ya usado en sesiones anteriores para PDFs): se generó un Formulario U de prueba con un comitente de rol `poseedor` y se renderizó con poppler — el párrafo sale "El que suscribe LUIS HECTOR MARTINEZ nacionalidad Argentina documento de identidad DNI Nº 17.016.868 en su carácter de POSEEDOR declara..." (comitente real, no Franco) y el recuadro del croquis sale completamente en blanco, sin bordes ni marcas. Falta confirmar con Franco en la app real.

### Ajuste (v0.23) — Declarante del dorso de Formulario U: vuelve a ser Franco por defecto

Franco confirmó por WhatsApp (14/9): "En el dorso, puede ir el comitente, el dueño o puedo firmar yo. Dejale con mis datos nomas, por defecto, en el dorso". Es decir, la A.1 de arriba se revierte **solo para la página de declaración del Formulario U** — vuelve a usar `profile` (Franco, carácter "AGRIMENSOR", Argentina/DNI fijo) como antes del Roadmap 1. La declaración jurada del **dorso del SOR** (Fase B, más abajo) queda **sin cambios**, con comitente + rol — Franco no pidió tocar esa.

### Verificado
`astro build` sin errores de tipo. Se verificó que solo quedó una ocurrencia de `const declarante = profile` en todo el archivo (la de `dibujarFormularioU`) y que `dibujarDorsoSor` sigue intacto usando `comitentePrincipal`/`rolComitente`.

### Fase B (v0.23) — Página de dorso del Formulario SOR

`public/pdf-templates/formulario_sor.pdf` tenía **una sola página** (confirmado con `pdfDoc.getPageCount()`) — le faltaba la segunda página que sí tiene el formulario real: Rubros 5 (grilla de características del terreno: relieve, capa arable, color de tierra, agua de subsuelo, capacidad ganadera, aptitudes agrícola-ganaderas 1-9), 6 (distancias en km) y 7 (valor del inmueble) — todo "Reservado para la Dirección", nuestro sistema nunca completa esos valores — más la declaración jurada + fecha + DNI + firma, que sí lleva datos reales.

Se construyó con `pdf-lib` directamente (nueva función `dibujarDorsoSor` en `generar.ts`, agregada al final de la rama `formulario_sor`) — **sin instalar ninguna herramienta nueva** (se descartó exportar la hoja de Excel vía LibreOffice). Las coordenadas de cada etiqueta/columna se extrajeron con la librería `xlsx` (script aparte en el scratchpad, sin tocar el proyecto) leyendo el ancho de columna/alto de fila de la hoja "SoR (D)" del Excel de Franco, escaladas a los 612pt de ancho de página. **Solo se replicó la grilla y las etiquetas impresas del formulario — nunca los datos de ejemplo que Franco cargó en su Excel** (números de superficie, marcas "x", nombre de ruta/población, etc.) para mostrar dónde va cada cosa, tal como pidió el usuario.

Con las columnas reales del formulario (hasta 8 sub-columnas dentro de un mismo grupo, en un ancho de página de 612pt) el texto horizontal se superponía entre columnas vecinas — se resolvió con el mismo recurso que usan los formularios de Catastro reales para columnas muy angostas: las sub-etiquetas de cada grupo (LLANO/ONDULADO/etc.) y las etiquetas de categoría de fila (AGRICOLAS GANADERAS/OTRAS APTITUDES) van con texto girado 90° (`rotate: degrees(90)` de `pdf-lib`, se lee de abajo hacia arriba); los títulos de grupo (RELIEVE, ESPESOR, etc.) quedan horizontales pero encogidos a su propio ancho de columna (`encogerHastaEntrar`, mismo criterio que ya usaba `campoSor` en la página de frente). La declaración jurada usa el mismo fix de la Fase A: declarante = comitente + rol (no el agrimensor).

### Verificado
`astro build` sin errores de tipo. Verificado con un script aislado de `pdf-lib` + render con poppler, iterando 2 veces hasta que quedó legible: la primera pasada mostraba texto superpuesto e ilegible en la grilla (columnas demasiado angostas para texto horizontal); con el texto girado 90° y los títulos de grupo encogidos, la grilla quedó clara y reconocible, sin superposiciones, con las 9 filas de aptitudes, los 7 grupos de columnas, y la declaración jurada abajo con el comitente/rol correcto. Se confirmó también que la página 1 (frente del SOR) no se vio afectada. Falta confirmar con Franco en la app real.

### Fase C (v0.23) — Módulo de administración de usuarios

Arquitectura resuelta con el usuario: **cuentas aisladas** (cada usuario nuevo es independiente, ve solo sus propios expedientes — el modelo actual de RLS por `user_id` ya lo soporta sin cambios, no hizo falta tocar ninguna política).

- **`src/lib/supabase.ts`**: nueva función `getSupabaseAdmin()` — cliente con la **service role key** (env var `SUPABASE_SERVICE_ROLE_KEY`, sin prefijo `PUBLIC_`, nunca llega al cliente), necesaria porque crear/listar/banear usuarios de Supabase Auth requiere la Admin API (`auth.admin.*`), que la anon key no puede usar.
- **`schema.sql`**: columna `is_admin boolean default false` en `profiles`.
- **Nueva página `/admin`**: protegida (redirige a `/dashboard` si `!profile.is_admin`, aunque se entre directo por URL). Listado de usuarios (`auth.admin.listUsers()`, cruzado con `profiles` para nombre/apellido/admin), formulario para crear uno nuevo (`auth.admin.createUser({email, password, email_confirm:true})` + un insert inmediato en `profiles` con `is_admin:false`, para que tenga perfil desde el primer login), y un botón Desactivar/Reactivar por usuario (`auth.admin.updateUserById(id, {ban_duration:'876000h'})`/`{ban_duration:'none'}`) — oculto para la propia fila del admin logueado, para no poder autobanearse por error. Nada de permisos granulares todavía (Franco ya avisó que eso se refina después).
- **`Sidebar.astro`**: nuevo ítem "Administración" en la navegación.

### Verificado
`astro build` sin errores de tipo. Se verificó cada llamada a la Admin API (`createUser`/`listUsers`/`updateUserById`, formas de `data`/`error` devueltas, campo `ban_duration`) contra los `.d.ts` de `@supabase/auth-js` instalado (2.105.4) — coinciden exactamente con lo escrito.

**Confirmado por el usuario en local, de punta a punta**: corrió la migración + se marcó admin a las 2 cuentas existentes (con un ajuste: `profiles.nombre` tiene un `not null` en la base real que no estaba reflejado en `schema.sql` — resuelto al toque con datos reales en el insert), cargó la `SUPABASE_SERVICE_ROLE_KEY`, creó un usuario de prueba desde `/admin`, y confirmó que al loguearse con esa cuenta ve un Dashboard completamente vacío (0 expedientes) — cuentas aisladas funcionando como se esperaba.

### Ajuste (v0.23) — Ocultar "Administración" del sidebar para quien no sea admin

El usuario probó con la cuenta de prueba (no-admin) y el link "Administración" seguía apareciéndole en el menú (aunque `/admin` ya lo redirigía al tocarlo) — confuso para un futuro empleado sin `is_admin`. En vez de duplicar una verificación completa de auth (`auth.getUser()`) en `Sidebar.astro` (se renderiza en TODAS las páginas — duplicar esa llamada de red en cada una hubiera reintroducido justo el tipo de latencia que costó tanto sacar en el fix del login colgado), se aprovechó que la política RLS de `profiles` ("Usuario ve su propio perfil", `using (auth.uid() = id)`) ya filtra automáticamente cualquier consulta a esa tabla a la fila del dueño del token — alcanza con `getSupabase(token).from('profiles').select('is_admin').maybeSingle()` (sin `.eq('id', ...)`, RLS ya lo hace) para saber si el usuario actual es admin, sin necesitar una verificación de auth aparte. Con token vencido/ausente, la consulta no devuelve fila y el link simplemente no se muestra (comportamiento seguro por default).

### Verificado
`astro build` sin errores de tipo. Pendiente: confirmación visual del usuario (loguearse con la cuenta de prueba no-admin y ver que el link ya no aparece).

---

## 📋 Cambios de la sesión — 12 Septiembre 2026 (v0.22) — Roadmap 2

Franco mandó una nueva tanda de pedidos (12 chicos/medianos + un pedido grande: pasar las DDJJ — Formulario U/SOR/E1 — a formularios PDF rellenables reales en vez de calcular coordenadas para centrar cada valor). Se armó un roadmap de 7 fases nuevas (Fase 6 a 12, continuando la numeración del roadmap anterior) — plan completo guardado en el plan de la sesión.

**Investigación clave, antes de tocar código**: confirmado que sí es factible convertir las 3 plantillas de DDJJ a formularios PDF reales (AcroForm) con `pdf-lib` (ya instalado, sin agregar dependencias) — `PDFForm.createTextField/createCheckBox/createRadioGroup` + `.addToPage()`. Alcance acordado con el usuario: la app autocompleta por nombre de campo (no coordenadas) y sirve el PDF sin aplanar en el modal de vista previa ya existente — ahí Franco puede tildar/completar lo que falte con el visor nativo del navegador. Para bajar su copia editada usa el botón de descarga del visor de PDF, no el de la app. Esto es la Fase 11, la más grande — todavía no implementada.

### Fase 6 (v0.22) — Ajustes chicos de datos/UI

**6.1 — Estado "observado"**: agregado al `check` de `estado` en `expedientes` (`schema.sql`, **Franco tiene que correr la migración a mano**: `alter table expedientes drop constraint if exists expedientes_estado_check; alter table expedientes add constraint expedientes_estado_check check (estado in ('borrador','en_proceso','observado','finalizado'));`), a los dos `<select>` (`[id].astro` y `expedientes/index.astro`), y un `.badge-observado` (violeta, `#EDE9FE`/`#5B21B6`, distinto de los otros 3 colores). De paso se agregó un 5º stat card "Observados" en el Dashboard (la grilla pasó de 4 a 5 columnas, con nuevos breakpoints responsive).

**6.2 — Área de Catastro: selector fijo**: antes un `<input>` de texto libre en el modal del Dashboard. Ahora un `<select>` con las 7 opciones que pidió Franco (Mesa de entradas y salidas, Agrimensores, Jurídico, Dirección, Carga/sistema, Actualización Gráfica, Profesional). Se creó `src/lib/areaCatastro.ts` (mismo patrón que `edificacionE1.ts`: constantes compartidas + un helper `labelAreaCatastro()`) para no duplicar la lista entre `dashboard.astro` y la futura Fase 7 en `expedientes/index.astro`. Expedientes viejos con texto libre guardado de antes de este cambio no rompen: si el valor no matchea ninguna opción, el `<select>` simplemente no preselecciona nada (el helper de display muestra el texto crudo tal cual en la tabla).

**6.3 — Observaciones**: la columna ya existía en `expedientes` pero no se podía ver/editar después de crear el expediente, ni se imprimía en ningún documento. Franco confirmó que quiere que aparezcan en el **Formulario U**, y específicamente encontramos que la plantilla (`formulario_u.pdf`, página 3 — la misma del Rubro 4/declaración jurada) **ya trae impresa una sección "OBSERVACIONES :"** con renglones punteados en blanco, nunca usada por el código hasta ahora (medida su posición vía `pdftotext -bbox`: la etiqueta termina en x≈145, arranca en y≈624 bottom-up, con margen de sobra hasta el aviso de "extravío" que empieza en y≈249). Se agregó:
- Un campo de observaciones editable en Tab 1 Comitente (nueva acción `guardar_observaciones`, mismo patrón que el resto).
- En `generar.ts`, rama `formulario_u`: si `exp.observaciones` tiene texto, se escribe envuelto (`dibujarParrafo`) justo después de la etiqueta impresa.

**Importante para la Fase 11**: esta implementación usa el mismo mecanismo de coordenadas que el resto del Formulario U hoy — a propósito, para no adelantar trabajo de un mecanismo distinto (AcroForm) antes de que le toque el turno a esa fase. Cuando llegue la Fase 11, este mismo campo se convierte en un `createTextField` más, reusando esta misma posición ya calibrada.

### Verificado (Fase 6)
`astro build` completo sin errores de tipo. Probado con un script aislado (mismo método de esta sesión: PDF sintético con datos de prueba, sin depender de loguearse en la app real): el texto de observaciones cae correctamente en la sección impresa, envuelto a varias líneas, sin invadir el aviso de "extravío" de más abajo. Nota cosmética menor: las líneas envueltas no quedan perfectamente centradas entre cada renglón punteado impreso (el interlineado del texto no coincide exactamente con el espaciado de los puntos) — legible y correcto, pero si Franco lo nota se puede afinar. Falta probar en la app corriendo: cambiar un expediente a "Observado", elegir un Área de Catastro del nuevo selector, y cargar/generar observaciones reales en un Formulario U.

### Fase 7 (v0.22) — Nº Expediente / Área de Catastro: acceso completo

El editor solo vivía en el Dashboard (`dashboard.astro`), que lista únicamente los últimos 5 expedientes — uno más viejo que recién ahora consigue número no tenía forma de cargarlo. Se copió el mismo botón "Nº Exp. / Catastro" (mismo modal, misma acción `actualizar_datos_dgc`) a `expedientes/index.astro`, que sí lista todos los expedientes con búsqueda y filtro por estado. Reusa `AREAS_CATASTRO` de `src/lib/areaCatastro.ts` (agregado en la Fase 6) para no duplicar la lista de opciones.

### Verificado (Fase 7)
`astro build` completo sin errores de tipo. Falta probar en la app corriendo: desde `/expedientes` (no desde el Dashboard), editar Nº Expediente/Área de Catastro de un expediente viejo que no esté entre los últimos 5, y confirmar que se refleja en el título del expediente.

### Fase 8 (v0.22) — Etiquetas manuales: lado, ángulo, nombre de parcela

Franco cargó un polígono de 32 lados y notó que la designación automática ("Lado 1-2, 2-3...") no siempre sirve porque los lados no van necesariamente en orden correlativo. Se agregó la posibilidad de sobreescribir manualmente:
- **Migración SQL** (`schema.sql`, **a correr a mano**): columna `etiqueta text` en `lados` y en `angulos`; columna `nombre text` en `poligono`. Todas nullable, sin default — vacías no cambian nada del comportamiento actual.
- **UI (Tab Mensura, `[id].astro`)**: un campo "Nombre de la parcela" (placeholder = el nombre automático "Parcela N"), y una 4ª columna "Designación" en las tablas de lados/ángulos (placeholder = la designación automática "L{i}"/"A{i}") — todo opcional, se puede dejar en blanco y sigue funcionando como antes.
- **Guardado** (`guardar_mensura`): se leen y persisten los 3 campos nuevos junto con el resto.
- **`generar.ts`** (Memoria de Mensura y Planilla de Cálculo): la etiqueta manual tiene prioridad sobre la automática en los 3 lugares que corresponde (título de la parcela, "Lado X:", "Ángulo X:", y la columna "N°" de la tabla de la Planilla) — `lado.etiqueta || etiquetaAutomatica`.

### Fase 9 (v0.22) — Colapsar cada card de parcela

Franco pidió una flecha para minimizar cada parcela cargada (Tab Mensura) y no tener un scroll larguísimo con varias. Se convirtió `.poligono-card` de un `<div>` fijo a un `<details open>` con `.poligono-card-header` (label + botón Eliminar) como `<summary>` — mismo patrón `<details>` ya usado en otras partes de este archivo. Se sacó el marcador nativo del navegador y se reemplazó por una flechita propia (`▸`/rotada 90° cuando está abierto) vía CSS. Por default todas las cards arrancan abiertas (`open`), así que no cambia el comportamiento visual actual hasta que Franco decida colapsar una — cero cambios en los nombres de los inputs ni en el JS de generación de filas/guardado.

### Verificado (Fase 8 y 9)
`astro build` completo sin errores de tipo. Fase 9 confirmada visualmente con un mockup estático (Playwright headless, mismo método usado para el sidebar del wizard en el Roadmap 1): la card colapsa/expande correctamente, la flecha rota, y el botón "Eliminar" queda accesible dentro del `<summary>` sin problemas. Falta probar en la app corriendo: cargar un polígono con lados fuera de secuencia, ponerles designación manual, guardar, recargar y confirmar que persiste; generar Memoria de Mensura/Planilla de Cálculo y confirmar que usan la designación manual; y colapsar/expandir una parcela real con datos cargados sin perder ningún valor.

### Fase 10 (v0.22) — Recorte y rotación de foto de DNI antes de subir

Franco recibe fotos de DNI mal encuadradas o giradas y hoy las tiene que editar él mismo antes de subirlas. Se agregó un editor propio con `<canvas>` nativo (sin ninguna librería nueva — no había ninguna de imágenes instalada en el proyecto): al elegir un archivo de imagen (jpg/png — un PDF sigue subiéndose tal cual, no se puede "recortar" un PDF con este método) se abre un modal con un recuadro de recorte arrastrable (mover el centro, o cada esquina para redimensionar) y dos botones de giro de 90°. Al confirmar, se recorta+gira en un canvas de salida y se exporta como blob JPEG — el `<form>` de subida arma el `FormData` a mano en vez de `new FormData(form)` (no se puede reasignar `fileInput.files` con el blob editado), así que `upload-dni.ts` no necesitó ningún cambio: sigue recibiendo un archivo `archivo` como siempre.

**Verificación exhaustiva** (esta fue la pieza más "matemática" de toda la tanda — rotar y recortar con canvas requiere que las coordenadas de pantalla y las de píxeles reales de la imagen coincidan bien, así que ameritaba más que una revisión visual): se armó un arnés de prueba aparte con Playwright que **extrae textualmente el mismo bloque de JS del archivo real** (no una versión reescrita a mano, para no probar una copia distinta del código), genera una imagen sintética de 4 cuadrantes de colores (rojo/verde/azul/amarillo), y:
- **Test de recorte** (arrastrando la esquina inferior-derecha hacia el centro, sin girar): el resultado midió ~203×153px (el objetivo era ~200×150) con el cuadrante rojo puro en el centro — correcto.
- **Test de rotación** (90° a la derecha, sin recortar): el resultado midió exactamente 300×400 (dimensiones intercambiadas, como corresponde), y los 4 cuadrantes de color aparecieron exactamente en la esquina esperada tras la rotación (calculado a mano con la fórmula de rotación 2D y verificado pixel por pixel) — correcto.

Esto da mucha confianza en la lógica en sí (la matemática de recorte/rotación funciona), pero **no reemplaza probarlo con una foto de DNI real** en la app corriendo — el arnés de prueba no ejercita el flujo completo de selección de archivo real ni la subida a Storage.

### Verificado (Fase 10)
Ver el detalle exhaustivo arriba. `astro build` completo sin errores de tipo. Falta probar en la app corriendo: elegir una foto de DNI real (girada), recortarla y rotarla en el editor, subirla, y confirmar que la imagen guardada en Storage refleja el recorte/rotación y no el archivo original sin tocar.

### Fase 10.1 (v0.22) — Editar el recorte de una imagen de DNI ya subida

Pedido de seguimiento: poder volver a recortar/girar una imagen que ya se subió (no solo elegir un archivo nuevo o eliminarla). Se agregó un botón "✎" en la preview (al lado del "✕" de eliminar, solo para imágenes — un PDF no se puede recortar) que:
1. Descarga la imagen ya subida (`fetch` a la misma URL que ya se usa para mostrarla).
2. Reabre el mismo modal de recorte/rotación de la Fase 10 con esa imagen.
3. Al confirmar, sube el resultado **automáticamente** (sin un click extra en "Subir") — a diferencia de elegir un archivo nuevo, acá la intención de "guardar el ajuste" ya quedó expresada al abrir el editor desde este botón.

Se agregó un registro `dniFormsPorClave` (comitente+lado → su `<form>` de subida) para poder ubicar el form correcto desde el botón "✎" de la preview y reusar exactamente el mismo flujo de subida que ya existía (mismo endpoint, misma actualización de la preview) — nada nuevo que mantener en paralelo. `abrirModalCrop()` ahora acepta un 5º parámetro opcional `{autoSubmit: true}` para este caso.

**Pendiente de confirmar**: la descarga de la imagen ya subida depende de que la URL firmada de Supabase Storage permita `fetch()` cross-origin (no solo mostrarla en un `<img>`, que es más permisivo) — el modal de vista previa de PDF ya hace algo equivalente con éxito, así que es probable que funcione, pero **hay que probarlo con una imagen real** para confirmarlo.

### Verificado (Fase 10.1)
`astro build` completo sin errores de tipo. No se repitió el test exhaustivo con Playwright de la Fase 10 (la lógica de recorte/rotación en sí es la misma, ya verificada) — lo nuevo acá es la orquestación (fetch + reapertura del modal + auto-envío), que no se pudo probar sin loguearse en la app real. Falta probar: click en "✎" sobre una imagen de DNI ya subida, ajustar el recorte, confirmar, y verificar que se sube sola y la preview se actualiza con la nueva versión.

### Fix (v0.22) — "Quitar" imagen de DNI dejaba de responder tras un intento fallido

Franco reportó: "cuando vuelvo a subir la imagen no me deja quitarla de nuevo" (el botón "✕" deja de reaccionar después de re-subir una imagen).

**Causa**: el handler del botón "Quitar imagen" (`[id].astro`, confirmación del modal `#modal-overlay-dni`) deshabilitaba el botón (`btn.disabled = true`) antes de llamar a `/api/comitentes/eliminar-dni`, y solo lo "recuperaba" en el camino feliz — al reemplazar todo el bloque de la preview (`previewWrap.innerHTML = renderPreviewVacio(...)`), el botón deshabilitado quedaba destruido junto con el resto. Pero si ese pedido fallaba por cualquier motivo transitorio (sesión vencida, blip de red, un redeploy en curso — el propio flujo de trabajo de este proyecto es "lo pusheo y que pruebe Franco", así que un intento justo durante un deploy es un caso real), el código solo mostraba un `alert()` y **nunca volvía a habilitar el botón** — quedaba `disabled` para siempre en esa preview. Un botón deshabilitado no dispara eventos `click` en el navegador, así que ni siquiera el listener delegado en `document` volvía a enterarse de los clicks siguientes: para el usuario, el botón simplemente dejaba de responder, sin ningún mensaje de error visible la segunda vez.

**Fix**: en las dos ramas de error (`!data.ok` y `.catch`) del handler de confirmación, se agregó `btn.disabled = false` — así un intento fallido dejá el botón usable para volver a intentarlo, en vez de bloquearlo permanentemente.

### Verificado
Lectura exhaustiva de todo el flujo (subida, recorte/edición Fase 10.1, y eliminación) para descartar otras causas — la lógica de subida (`upload-dni.ts`, el `submit` handler del form) y el flujo de edición (Fase 10.1) ya restauran correctamente sus propios botones en un `.finally()`; el de "Quitar" era el único que no lo hacía, consistente con el síntoma reportado. `astro build` sin errores de tipo. Falta confirmar con Franco en la app real: reproducir el reporte original (re-subir una imagen y quitarla de nuevo) ahora que el botón se recupera ante cualquier fallo.

### Fix (v0.22) — Botones "✎"/"✕" de la preview de DNI "no aparecen" tras subir una imagen nueva

Franco siguió probando y reportó un segundo síntoma relacionado: "quito la imagen subida, vuelvo a subir otra, la subo y no me aparecen los botones de editar y eliminar — recién al actualizar la página vuelven a aparecer".

**Investigación**: se armó un arnés de prueba con Playwright que extrae textualmente el script real completo (agregando también los demás modales/tablas de la página que el script intenta enlazar al cargar, para que se ejecute igual que en la real sin cortarse a mitad de camino) y con `fetch` mockeado (simulando `eliminar-dni`/`upload-dni` exitosos) se recorrió la secuencia exacta: quitar la imagen existente → seleccionar un archivo nuevo → confirmar el recorte → click en "Subir". **El HTML resultante en el DOM sí contiene ambos botones** tras la subida — la lógica de re-renderizado (`renderPreviewArchivo`, la referencia a `previewWrap`) es correcta y no se detectó ningún bug de JavaScript en esta secuencia.

**Diagnóstico**: ambos botones ("✎"/"✕") están siempre en el DOM pero son **invisibles por diseño** (`opacity:0`) hasta que el mouse pasa por encima de la miniatura (`.dni-preview-inner:hover`) — un patrón pensado para no ensuciar visualmente la tabla. El problema: justo después de tocar "Subir", el mouse queda posicionado sobre ese botón (bien por debajo de la miniatura), no sobre la imagen — así que los botones, aunque están ahí, no se ven hasta que el usuario mueve el mouse de nuevo sobre la miniatura. Esto explica el síntoma exacto sin que haya ningún bug funcional: recargar la página "los hace reaparecer" simplemente porque, al mirar la miniatura de nuevo, el usuario pasa el mouse por encima y ahí sí se revelan. En un dispositivo táctil (sin estado `:hover`) el problema sería incluso peor — quedarían invisibles permanentemente.

**Fix**: en vez de depender de este bug de diagnóstico, se sacó el `opacity:0`/`:hover`-para-revelar — ambos botones pasan a estar **siempre visibles** (opacidad 0.85, subiendo a 1 al pasar el mouse por encima, solo como refuerzo visual) tanto en el HTML servido por el servidor como en el HTML insertado por JS (misma clase CSS para los dos casos, un solo cambio en `<style>` alcanza).

### Verificado
`astro build` sin errores de tipo. Arnés de Playwright confirmó que el HTML de ambos botones se genera correctamente tras la secuencia completa (quitar → subir de nuevo); con el cambio de CSS ya no dependen de ningún estado de hover para ser visibles. Falta confirmar con Franco que ahora los ve aparecer de inmediato tras subir, sin necesidad de recargar.

### Fix (v0.22) — Causa real: referencia de DOM cacheada ("stale") en el flujo de subida

El cambio de CSS de arriba no fue suficiente — Franco reportó que el problema persistía **incluso en la primerísima subida de una imagen** (nunca antes cargada para ese comitente), y que hacía falta recargar la página Y cambiar de pestaña y volver para que aparecieran. Esto descartaba el diagnóstico de hover y apuntaba a algo más de fondo.

**Causa real encontrada**: comparando los dos flujos de DNI (quitar vs. subir), había una asimetría — el de "Quitar" busca el `.dni-preview-wrap` **en el momento del click de confirmación** (`document.querySelector(...)` recién ahí), mientras que el de "Subir" lo buscaba **una sola vez, al cargar la página**, lo guardaba en una variable, y reusaba esa misma referencia adentro del `.then()` de la subida (que responde recién después de un viaje de red, un rato después). Si por cualquier motivo ese nodo puntual dejaba de ser el que está realmente visible en el DOM en ese momento posterior (el guardado en el closure queda "huérfano"), el `.innerHTML = ...` de la subida actualizaba un nodo que ya nadie ve, mientras la miniatura visible seguía mostrando "Sin cargar" — exactamente el síntoma reportado, y coherente con que solo se arreglara al forzar un re-render completo de la página (recarga + cambio de pestaña).

**Fix**: se sacó esa referencia cacheada y ahora la subida busca el `.dni-preview-wrap` **recién en el momento de actualizarlo** (`buscarPreviewWrap()`, la misma estrategia que ya usaba con éxito el flujo de "Quitar") — `[id].astro`, dentro del `forEach` que registra cada form de subida.

### Verificado
Se armó un segundo test con Playwright que reproduce a propósito el escenario que motivó el fix: reemplaza el nodo `.dni-preview-wrap` por un clon equivalente (mismo HTML, pero otro objeto en memoria — simula cualquier causa real que deje la referencia cacheada apuntando a un nodo que ya no es el vivo) y después ejecuta la subida completa. Con el fix, el nodo que realmente queda en pantalla (consultado de nuevo, en vivo) tiene ambos botones — sin el fix este mismo test hubiera mostrado "Sin cargar" en el nodo visible mientras el nodo huérfano se actualizaba en la sombra. `astro build` sin errores de tipo. Falta confirmar con Franco en la app real: subir una imagen (primera vez, sin pasos previos) y ver que "✎"/"✕" aparecen de inmediato, sin recargar ni cambiar de pestaña.

### Fix (v0.22) — El síntoma seguía igual tras los fixes anteriores: red de seguridad + diagnóstico

El usuario confirmó que, probando en `pnpm dev` local (reiniciando y refrescando entre cada intento), el síntoma seguía exactamente igual incluso en la primerísima subida de una imagen para un comitente. Esto descartó tanto la teoría del CSS/hover como la del nodo huérfano como causa ÚNICA — o hay otra causa más, o algo específico del entorno real que no se pudo reproducir en los tests.

**Verificación exhaustiva adicional**: se armó una página Astro temporal (`testdnidebug.astro`, borrada al terminar) que reproduce la sección de comitente+DNI (frente y dorso, arrancando en "Sin cargar" como el caso reportado) y se sirvió con el propio compilador de Astro/Vite del proyecto (no una copia hecha a mano) en un servidor de desarrollo aparte, para descartar cualquier diferencia entre "lo que yo transcribí a mano" y "lo que Astro realmente compila". Con `fetch` mockeado (simulando `upload-dni` exitoso) se repitió la secuencia exacta reportada: primera subida, sin pasos previos. **Resultado: los botones aparecen correctamente también ahí** — no se pudo reproducir el bug a través del compilador real tampoco.

**Decisión**: dado que no se pudo reproducir el bug pese a dos métodos de verificación rigurosos (incluyendo el compilador real de Astro), pero el usuario lo sigue viendo en su entorno, se agregó una **red de seguridad** en vez de seguir buscando a ciegas: tanto la subida como el "quitar" ahora envuelven la actualización de la preview en un `try/catch`, y si el bloque a actualizar no se encuentra (o cualquier otra cosa falla al armar el HTML nuevo), se hace `console.error(...)` con el detalle Y se recarga la página automáticamente (`window.location.reload()`) — el archivo ya quedó guardado en el servidor en ese punto (la respuesta ok:true ya llegó), así que no se pierde nada, y el usuario nunca más debería quedar viendo una preview vieja/incompleta esperando a recargar manualmente.

### Verificado
`astro build` sin errores de tipo. **Pendiente, importante**: si el problema persiste después de este cambio, dado que ya no hay forma de que la preview quede "trabada" (el `catch`/reload de respaldo se encarga), el próximo paso es abrir la consola del navegador (F12 → pestaña Console) al momento de subir una imagen y revisar si aparece el mensaje de error en rojo que se agregó (empieza con "DNI: ...") — eso daría el dato concreto que hasta ahora no se pudo obtener por lectura de código ni por los tests, para terminar de encontrar la causa de fondo si es que la red de seguridad se llega a activar.

### Causa real encontrada: extensión "Console Ninja" de VS Code, no un bug del código

El usuario mandó la captura del panel Sources de Chrome DevTools en la línea exacta del error: `i:string,...v:any[]){try{oo_cm().consoleLog(i, v);}catch(e){} return v}`. Eso **no es código del proyecto** — es la instrumentación que inyecta la extensión **Console Ninja** (ya se había visto en el log de arranque de `pnpm dev`: "✔ Console Ninja extension is connected to Vite") para poder mostrar los `console.log` dentro del editor. Esa instrumentación tiene sintaxis de TypeScript (`i:string`, `...v:any[]`) que en este caso se sirvió sin transpilar, rompiendo el parseo de **todo el script de DNI** con un `SyntaxError` — por eso ni "Subir" ni "Quitar" corrían ninguna lógica de JS (ninguno de los `addEventListener` llegaba a registrarse), y solo un refresh + cambio de pestaña (que fuerza un re-render SSR completo, sin depender de que ese script cargue) mostraba el estado correcto. Esto también explica por qué nunca se pudo reproducir ni con el arnés de Playwright ni sirviendo la página con el compilador real de Astro en un servidor aparte: ninguno de esos servidores de prueba tenía Console Ninja enganchado de la misma forma sobre ese archivo puntual.

**Esto confirma que el código en sí nunca tuvo el bug que parecía tener** — pero como la extensión puede seguir interfiriendo (y no es algo que el código pueda controlar), se dejó igual la mejora de robustez de abajo, que además simplifica el código.

### Fix definitivo (v0.22) — Subir/Quitar DNI ahora recargan la pestaña en vez de parchear el DOM

A pedido del usuario ("forzá una recarga de solo ese dato, así siempre se ven los botones") se simplificó el mecanismo: en vez de armar el HTML de la preview a mano en el cliente (`renderPreviewArchivo`/`renderPreviewVacio`, ya eliminadas), tanto "Subir" como "Quitar" ahora, apenas el servidor confirma `ok:true`, llaman a una función nueva `recargarTrasAccionDni()` que recarga la pestaña actual (`window.location.reload()`) — así la preview (imagen + botones "✎"/"✕") queda **siempre** exactamente como la arma el servidor, sin ninguna lógica de parcheo de DOM de la que depender (y sin depender de que el script de DNI se haya cargado bien, aunque algo como Console Ninja vuelva a interferir).

Como esta recarga podría perder texto sin guardar en el textarea de "Observaciones" (misma pestaña, formulario aparte con su propio botón "Guardar"), se agregó una preservación simple: antes de recargar, el valor actual del textarea se guarda en `sessionStorage` (clave por URL del expediente), y al cargar la página se restaura automáticamente y se borra de `sessionStorage` — un borrador sin guardar nunca se pierde por subir o quitar una foto de DNI.

### Verificado
`astro build` sin errores de tipo. Se probó de punta a punta contra el compilador real de Astro (arnés de Playwright con `fetch` mockeado): se escribe un borrador sin guardar en Observaciones, se sube una imagen de DNI nueva, se confirma que la página navega/recarga (`waitForNavigation`), y que el borrador de Observaciones sigue intacto después — ambas cosas confirmadas. Falta la confirmación final del usuario en su entorno real, ahora que la causa (Console Ninja) está identificada y además el mecanismo ya no depende de que ese script particular cargue sin errores.

**Confirmado por el usuario en su entorno real** ("ahi funciona perfecto"): recarga tras subir/quitar DNI, con el borrador de Observaciones preservado. Cierra este bug definitivamente.

### Fix (v0.22) — Dashboard y Expedientes mostraban lo mismo (listado de expedientes duplicado)

El usuario notó que el Dashboard (tarjetas de stats + tabla de "Últimos 5 expedientes" con acciones "Ver"/"Nº Exp. / Catastro") y `/expedientes` (listado completo con búsqueda, filtro por estado, y las mismas acciones más "Eliminar") mostraban información redundante. Pidió unificar ambas páginas, o — como alternativa más simple si unificar era muy invasivo — sacar el listado del Dashboard y dejarlo más general, sin tocar `/expedientes` para nada.

Se optó por la alternativa simple (menor riesgo, confirmado con el usuario): **no se fusionaron las rutas** — cada página sigue siendo independiente, sin tocar la navegación ni ningún link existente hacia `/dashboard` o `/expedientes`.

- **`dashboard.astro`**: se sacó la tabla "Últimos expedientes" (junto con su modal "Nº Exp. / Catastro" y el script que lo manejaba) — esa acción ya existe de forma completa e independiente en `/expedientes` (agregada en la Fase 7, incluso con la celda del Nº de expediente clickeable), así que no se perdió ninguna funcionalidad. En su lugar, se agregó una sección simple de "Accesos rápidos" (Nuevo expediente / Ver expedientes / Comitentes). El Dashboard ahora es puramente un panel de métricas generales (los 5 contadores) + navegación, sin datos específicos de ningún expediente.
- **`expedientes/index.astro`**: **sin ningún cambio** — queda exactamente como estaba, tal cual pidió el usuario.
- Se eliminó del `dashboard.astro` la consulta `ultimos` (los últimos 5 expedientes) y la acción POST `actualizar_datos_dgc` de su frontmatter (ambas ya no se usan ahí — la de `/expedientes` es una copia independiente con sus propios nombres de variable, no se tocó).

### Verificado
`astro build` sin errores de tipo (se verificó que no quedó ninguna referencia colgante a `AREAS_CATASTRO`/`labelAreaCatastro`/`ultimos`/el modal eliminado). Confirmado visualmente por el usuario con capturas: Dashboard muestra las 5 tarjetas + accesos rápidos, sin tabla; `/expedientes` sigue mostrando el listado completo con búsqueda, filtro, y el botón "Nº Exp. / Catastro" funcionando igual que siempre.

### Fix (v0.22) — Logo real en el sidebar

Pedido: reemplazar el ícono de texto "⊙ NICA" del sidebar (`src/components/sidebar/Sidebar.astro`, usado en TODAS las páginas autenticadas vía `AppLayout`) por el logo real, con una presentación más prolija.

- Se usa `public/images/nica-logo-icono.png` (el mismo logo circular ya usado en `login.astro`) como una insignia circular de 46px (`border-radius:50%`, `object-fit:cover`, fondo blanco + sombra sutil para que resalte sobre el fondo azul oscuro del sidebar).
- Al lado, un lockup de dos líneas: "NICA" (wordmark, igual que antes) + "Estudio de Agrimensura" como subtítulo chico en mayúsculas (el mismo texto que ya está grabado alrededor del logo) — con el texto correcto puede pasar a dos líneas en vez de cortarse con "...", se probó explícitamente para evitar que quede truncado feo.
- Cambio puramente visual — la navegación (links, estado activo, botón de cerrar sesión) no se tocó.

### Verificado
`astro build` sin errores de tipo. Renderizado y capturado con Playwright (import aislado del componente `Sidebar.astro` fuera del flujo de auth, ya que requiere estar logueado) en dos anchos de viewport para confirmar que el subtítulo no queda cortado y que el conjunto se ve prolijo — visto y ajustado (tamaño de fuente del subtítulo) hasta que quedó bien. Pendiente: confirmación visual del usuario en la app real.

---

## 🐛 Bug crítico — 19 Agosto 2026 (v0.22) — Login se quedaba colgado indefinidamente

Juan reportó que `/login` se quedaba cargando para siempre (el request nunca devolvía status code, ni en incógnito). En los logs de Auth de Supabase aparecían llamadas repetidas a `GET /user` devolviendo 403 "Token has invalid claims: token is expired" cada 6-10 segundos. Las keys, la config de expiración de sesión y los timeouts de Supabase ya estaban descartados como causa.

**Causa real:** `src/lib/supabase.ts` exporta un cliente único a nivel de módulo (`export const supabase = createClient(...)`), reusado por `login.astro` (`signInWithPassword`) y por las 9 páginas/endpoints protegidos (`supabase.auth.getUser(token)`). El SDK de `@supabase/supabase-js` trae por defecto `autoRefreshToken: true` y `persistSession: true` — pensado para un cliente de un solo usuario en un browser. Al reusarse ese mismo cliente en el servidor entre requests de usuarios distintos: cada login exitoso dejaba la sesión de ese usuario guardada adentro del cliente compartido y arrancaba un timer de auto-refresh en segundo plano que nunca se apagaba (el cliente nunca se destruye, vive mientras el proceso/función serverless esté caliente). Ese timer terminaba reintentando refrescar un token ya vencido en loop — los 403 repetidos de los logs — y como el SDK serializa las operaciones de auth con un lock interno, un login nuevo podía quedarse esperando ese lock para siempre: el request colgado.

**Primer arreglo (insuficiente):** `auth: { autoRefreshToken: false, persistSession: false }` en los dos clientes de `supabase.ts`. Necesario pero no alcanzaba — Juan confirmó el deploy en Vercel (Ready, Production, commit correcto) y el login seguía mal: no colgado infinito, pero tardaba 30-90 segundos entre el POST exitoso a `/login` (302, confirmado en los logs de Vercel) y que `/dashboard` terminara de cargar, y después de un rato volvía a mandar a `/login` solo.

**Causa real completa:** apagar `autoRefreshToken`/`persistSession` frena que el cliente arranque timers nuevos, pero no cambia que siga siendo **un solo cliente compartido a nivel de módulo**. El SDK sigue serializando con un lock interno las operaciones de auth (`getUser`, `signInWithPassword`) hechas sobre un mismo cliente — con varios requests (usuarios, pestañas, reintentos) pegándole al mismo singleton en el servidor, cada operación se ponía en fila detrás de la anterior en vez de correr en paralelo. Nunca era un deadlock infinito (por eso el POST sí terminaba devolviendo 302), pero la cola podía tardar casi un minuto y medio bajo uso concurrente — y como `dashboard.astro` valida el token en cada carga con ese mismo cliente compartido, una validación lenta/atascada en la cola podía hacer que `getUser()` tardara tanto que el usuario terminaba recargando o navegando de nuevo, cayendo otra vez en `/login`.

**Arreglo de fondo:** se sacó el `export const supabase = createClient(...)` de `supabase.ts` — ya no existe un cliente compartido. En su lugar, `getSupabaseAnon()` crea un cliente nuevo por llamada (mismo criterio que ya usaba `getSupabase(accessToken)` para el cliente autenticado con RLS). Se actualizaron los 12 archivos que importaban el singleton viejo (`login.astro` y las 9 páginas/endpoints protegidos que hacen `getUser(token)`) para llamar a `getSupabaseAnon()` en vez de usar un cliente importado — cada request queda completamente aislado, sin ningún lock ni estado compartido con otros requests.

**Verificado:** `astro build` sin errores. Diagnosticado con los logs de Vercel (`/login` en Runtime Logs mostrando el 302 real vs. cuándo cargaba `/dashboard` — la brecha de tiempo fue la pista clave) además de los logs de Auth de Supabase. **Pendiente de que Juan confirme en producción** que ahora sí es instantáneo y no vuelve a expulsar a `/login`.

---

## 📋 Cambios de la sesión — 14 Agosto 2026 (v0.21) — Feedback de Franco tras probar las 5 fases

Franco probó las 5 fases del roadmap grande (v0.16-v0.20) y mandó 4 items nuevos de ajuste.

### Requisitos (tal como los mandó Franco, agrupados)
1. Login: sacar la palabra "NICA" del texto (el logo circular ya la tiene grabada adentro) y agrandar el logo.
2. Pestaña Comitentes (`/comitentes`) aparece vacía ("No hay comitentes registrados aún"), pero los comitentes siguen existiendo — se ven igual al buscarlos desde el desplegable de un expediente.
3. Generación de documentos:
   - 3.1: un polígono de 32 lados (caso real de Franco) no entra en una sola página de la Memoria de Mensura — el texto de los últimos lados/ángulos queda dibujado fuera del borde inferior de la hoja, invisible, en vez de continuar en una página nueva.
   - 3.2: la designación de lados por letras (AB, BC, CD...) se queda sin letras del abecedario después de 26 lados y empieza a repetirse desde "A" — Franco pidió cambiar a designación numérica ("Lado 1-2", "Lado 2-3"...) tanto en la Memoria de Mensura como en la Planilla de Cálculo, y que esta última también pueda continuar en una página siguiente si hay muchas filas.

### Implementado

**1 — Logo del login**: sacado el `<h1>NICA</h1>` de `login.astro` (quedan el logo circular, que ya tiene "NICA" grabado en el sello, y el subtítulo "Sistema de Gestión de Mensuras"). Logo agrandado de 84px a 160px — con el texto afuera, pasa a ser el elemento visual principal.

**3.2 — Numeración de lados**: `generarEtiquetasLados()` en `generar.ts` generaba pares de letras de vértices consecutivos (`String.fromCharCode(65 + (i % 26))`) — con más de 26 vértices, `i % 26` vuelve a dar 0 y repite "A". Reescrita para devolver `"1-2", "2-3", ..., "n-1"` — sin techo, y el pedido explícito de Franco. Usada en Memoria de Mensura y Planilla de Cálculo (única función, dos usos), ningún otro cambio necesario en esos dos lugares para este punto.

**3.1 y 3.2 (paginación) — Memoria de Mensura y Planilla de Cálculo**: ninguna de las dos tenía chequeo de espacio restante en la página — los lados/ángulos (Memoria) o las filas de la tabla (Planilla) se seguían dibujando con `y` decreciente sin límite, y lo que caía por debajo del borde de la hoja quedaba invisible (bug real, no solo estético: para un polígono con muchos lados se perdía información).
- **Memoria de Mensura** (rama `memoria_mensura`): nueva función `asegurarEspacioMemoria(texto, tituloSeccion)`, llamada antes de dibujar cada lado y cada ángulo — mide cuántas líneas va a ocupar el texto (`partirEnLineas`, ya existente) y, si no entra en lo que queda de página, crea una página nueva (`crearPaginaConEncabezado`, ya usado para el caso de varios polígonos) con el título "MEMORIA DE LAS OPERACIONES (continuación):" y el título de sección repetido ("LADOS (continuación):" / "ANGULOS (continuación):"). Mismo resguardo agregado antes de la línea final de "SUPERFICIE TOTAL".
- **Planilla de Cálculo** (rama `planilla_calculos`): la función genérica `dibujarTabla()` ahora acepta un parámetro opcional `paginacion: { yMinimo, nuevaPagina }` — antes de dibujar cada fila, si no entra, llama a `nuevaPagina()` (crea una página apaisada nueva con membrete) y repite la fila de encabezados de columna arriba. Cambió su tipo de retorno de `number` a `{page, y}` (antes solo devolvía la posición Y final, asumiendo que seguía siendo la misma página) — el único call site (línea ~1772) fue actualizado para dibujar el pie (ERROR TOTAL/TOLERANCIA/SUPERFICIE) en la página que la tabla haya terminado usando, con un resguardo extra: si esa página quedó con poco margen para el pie, se abre una página más solo para eso.

### 2 — Comitentes vacío: resuelto

Confirmado: era la migración SQL de la Fase 4 (`eliminado_at` en `comitentes`) que no se había corrido — el cartel de error agregado (`comitentes/index.astro`, ver más abajo) mostró literalmente `column comitentes.eliminado_at does not exist`. Franco corrió la migración y la lista volvió a mostrarse con normalidad.

Se dejó el manejo de error permanente en la página (`const { data: comitentes, error: errorComitentes } = await query`, con un cartel rojo si `errorComitentes` viene con algo) — antes solo se destructuraba `data` y cualquier error de Supabase se perdía en silencio, mostrando "No hay comitentes registrados aún" sin ninguna pista de que en realidad era un error de query. Vale la pena aplicar este mismo criterio si aparece otro caso de "lista vacía sospechosa" en otra página.

### 2.1 — Comitentes: paginado

Franco pidió agregar paginado a `/comitentes` (mismo caso que Documentos generados, que ya lo tenía) para no listar todo de una. Mismo patrón ya usado en `expedientes/[id].astro` para "Documentos generados": `POR_PAGINA = 20`, `?pag=N` en la URL, `.range(desde, hasta)` + `count: 'exact'` en la query de Supabase, controles "← Anterior / Página X de Y / Siguiente →" con `.btn-disabled` en los extremos. El término de búsqueda (`q`) se re-agrega a los links de paginado para no perderlo al cambiar de página.

### Verificado
Sintaxis (`esbuild`) y `astro build` completos sin errores de tipo. La paginación de ambos documentos se probó con un script aislado que replica la lógica agregada (mismo método ya usado varias veces esta sesión para no depender de loguearse en la app real) con un polígono sintético de 32 lados — confirmado visualmente: la Memoria corta limpio antes del borde inferior y continúa en una página nueva con el título repetido (4 páginas para 32 lados + 32 ángulos), y la Planilla repite el encabezado de columnas en la página 2 y ubica el pie sin superposiciones (2 páginas para 32 filas). Confirmado en la app real por Juan: la lista de Comitentes volvió a andar después de correr la migración, y el paginado de esa misma página quedó agregado. **Sigue pendiente que Franco confirme su caso real de 32 lados en la app corriendo** (la Memoria/Planilla se probaron con datos sintéticos, no con ese expediente puntual).

Franco mandó una tanda de 14 pedidos juntos (bugs + mejoras + un rediseño visual grande). Se armó un roadmap de 5 fases con el usuario (guardado como plan de esta sesión) y se ejecutan una por una, probando cada una antes de seguir con la próxima.

### Fase 1 (v0.16) — Bugs y formato de PDFs
Todos en `src/pages/api/documentos/generar.ts` (y dos ajustes chicos en `[id].astro`). **Probada por Franco vía capturas — confirmado que el formato de superficie, la Planilla y demás salen bien.**

### Fase 2 (v0.17) — Datos: rol "Intendente", limpieza de E1 huérfano

**Rol "Intendente"**: agregado a los tipos de comitente. Cambios:
- `supabase/schema.sql:116` — el `check` de la columna `rol` en `exp_comitentes` ahora incluye `'intendente'`. **Franco tiene que correr esto a mano en Supabase** (el `create table if not exists` no actualiza una tabla que ya existe):
  ```sql
  alter table exp_comitentes drop constraint if exists exp_comitentes_rol_check;
  alter table exp_comitentes add constraint exp_comitentes_rol_check
    check (rol in ('titular','apoderado','heredero','poseedor','intendente'));
  ```
- `<option value="intendente">Intendente</option>` agregado en los dos `<select>` de rol en `[id].astro` (agregar comitente existente y crear comitente nuevo).
- Revisado `generar.ts` (donde se usa `rolComitente` para el texto de la firma en los PDFs, 3 lugares): ya imprime el rol de forma genérica, sin ningún `switch` limitado a los 4 roles viejos — no hizo falta tocar nada ahí, "Intendente" ya sale bien.

**Formulario E1 — limpiar dato huérfano al marcar un lote como baldío**: antes, desmarcar "¿tiene construcciones?" en Tab DDJJ solo ocultaba el formulario en el cliente (`display:none`) — la fila `edificacion` ya guardada quedaba huérfana en la base y el Formulario E1 se seguía incluyendo en el expediente completo, aunque el lote ahora figurara como baldío. Se agregó:
- Nueva acción server-side `eliminar_edificacion` (mismo patrón que `quitar_comitente`/`quitar_testigo`: `delete().eq('expediente_id', id)`).
- Un botón nuevo "Eliminar datos de edificación" que aparece **solo** cuando ya había una fila `edificacion` guardada y el usuario destilda el checkbox (antes, en ese estado, no había ningún botón visible con el que guardar ese cambio — el formulario entero, botón incluido, se ocultaba).

**Formulario U por polígono**: confirmado en el código que **ya está implementado** — `generar.ts` (función `dibujarFormularioU`, usada en un loop sobre `listaPoligonosDDJJ`) ya genera una copia completa del Formulario U por cada polígono cargado en el expediente, agregando cada una como páginas nuevas al PDF. No hizo falta programar el botón que había sugerido Franco. Pendiente: probarlo con un expediente real de 3+ polígonos y confirmárselo.

### Verificado (Fase 2)
`astro build` completo sin errores de tipo después de cada tanda (el único error de build sigue siendo el `EPERM` de symlinks de Windows al empaquetar para Vercel, no relacionado con el código). Falta probar en la app corriendo: alta de un comitente con rol Intendente y su reflejo en un documento generado, el flujo de tildar/destildar construcciones + eliminar datos, y el conteo de copias del Formulario U en un expediente con varios polígonos.

### Fase 3 (v0.18) — Arreglo rápido del bug de sesión

**Causa confirmada**: ninguna página verificaba que `supabase.auth.getUser(token)` hubiera devuelto un usuario válido — solo que las cookies existieran. Con el token vencido, `getUser()` devuelve `user: null` sin tirar error; `uid` quedaba en `''` y la página renderizaba "bien" pero vacía. En `expedientes/[id].astro` era peor: el lookup del expediente (`if (!exp) return redirect('/expedientes')`) fallaba con `uid=''` y mandaba a la lista de expedientes **antes** de llegar a la lógica de guardado del POST — el submit se perdía en silencio, sin ningún aviso. Cerrar sesión y volver a entrar era el único camino que renovaba el token, por eso "arreglaba" el síntoma.

**Fix aplicado** (alcance acordado: detectar y redirigir a `/login`, sin refresh silencioso de token):
- Agregado `if (!user) return Astro.redirect('/login')` justo después de `getUser()` en las 6 páginas que no lo tenían: `dashboard.astro`, `comitentes/index.astro`, `expedientes/index.astro`, `expedientes/nuevo.astro`, `expedientes/[id].astro` (la más importante, por el bug del guardado silencioso) y `perfil.astro`.
- `src/pages/api/documentos/generar.ts`: ya tenía el chequeo (`if (!user) return redirect('/login')`), pero respondía con un redirect 302 incluso cuando la llamada era AJAX (el fetch del modal de generar documentos) — `fetch` sigue el redirect a `/login`, y el `.json()` sobre ese HTML fallaba, mostrando un alert genérico en vez de avisar que la sesión venció. Corregido para devolver `401` con `{ok:false, warn:'no_autenticado'}` cuando la llamada es AJAX (mismo patrón que `descargar.ts`/`upload-dni.ts`), y mantener el redirect normal para navegación directa.
- `[id].astro`: los dos handlers de fetch que llaman a `generar.ts` (botón "Generar seleccionados" y el `armarHandlerBundle` compartido por "Generar expediente completo"/"Generar declaraciones juradas") ahora detectan `data.warn === 'no_autenticado'` y muestran un aviso claro ("Tu sesión venció...") + redirigen a `/login`, en vez de cualquiera de los mensajes de error genéricos.

**Nota importante para probar**: con el fix, si el token vencido cachea en medio de estar cargando una pestaña, al guardar se manda a `/login` — el dato que se estaba por guardar **se pierde igual** (no hay refresh silencioso, eso quedó fuera del alcance de este arreglo), pero ahora queda claro qué pasó en vez de una pantalla en blanco sin explicación.

### Verificado (Fase 3)
Sintaxis (`esbuild`) y `astro build` completo sin errores de tipo. Falta probar en la app corriendo con un token realmente vencido (se puede simular editando la cookie `sb-access-token` a mano en las devtools) — confirmar que cada página manda a `/login` en vez de mostrarse vacía, y que el botón de generar documentos muestra el aviso de sesión vencida en vez de fallar en silencio.

### Fase 4 (v0.19) — Mejoras funcionales

**4.1 — Formulario E1 a botón/modal**: antes era un checkbox ("¿tiene construcciones?") al fondo de Tab DDJJ que mostraba/ocultaba con `display:none` un formulario largo (13 categorías × 5 incisos + Rubro 2) — fácil de no encontrar. Ahora es un botón ("Agregar datos de edificación" / "Editar datos de edificación ✓" si ya hay datos cargados) que abre un modal grande y con scroll propio (`.modal-card-e1`, mismo patrón que el modal de vista previa de PDF). El botón "Eliminar (lote baldío)" de la Fase 2 quedó al lado, con un `confirm()` de JS antes de mandar el POST. La acción de guardado (`guardar_ddjj_e1`) no se tocó — mismo formulario, mismos campos, solo cambió dónde vive en el DOM.

**4.2 — Comitentes: editar y eliminar**: `src/pages/comitentes/index.astro` era una lista de solo lectura. Se agregó:
- Columna "Acciones" con botones Editar y Eliminar por fila.
- **Eliminar es soft-delete**: se agregó la columna `eliminado_at` a la tabla `comitentes` (`schema.sql`, **Franco tiene que agregarla a mano en Supabase**: `alter table comitentes add column if not exists eliminado_at timestamptz;`) — un comitente puede estar vinculado a expedientes ya cerrados vía `exp_comitentes` (con `on delete cascade`), así que un borrado de verdad rompería esos vínculos históricos sin que nadie lo note. El listado ahora filtra `.is('eliminado_at', null)`.
- **Editar** abre un modal con todos los campos relevantes (nombre, apellido, tipo y nº de documento, teléfono, email, nacionalidad, domicilio completo) — reusa el patrón de modal de confirmación ya existente en `expedientes/index.astro`, adaptado a un formulario en vez de un mensaje.

**4.3 — Logo circular real en el login**: `login.astro` usaba un carácter Unicode (⊙) como "logo". Reemplazado por `<img src="/images/nica-logo-icono.png">` (el mismo PNG circular que ya usa el membrete de los PDFs), con `border-radius:50%` y tamaño fijo (84px).

**4.4 — Nº Expediente / Área de Catastro movidos al Dashboard**: sacados de Tab Mensura (donde no tenía sentido cargarlos al iniciar la mensura, cuando el expediente todavía no existe ante la Dirección de Catastro). Ahora se editan desde un botón "Nº Exp. / Catastro" en la tabla de "Últimos expedientes" del Dashboard, que abre un modal chico con los 2 campos (nueva acción `actualizar_datos_dgc`, primera vez que `dashboard.astro` maneja un POST). **Importante**: se sacaron ambos campos del `update` de `guardar_mensura` en `[id].astro` — si se hubieran dejado ahí sin los inputs correspondientes en el form, cada guardado de Tab Mensura los habría pisado con `null`. Limitación conocida: el Dashboard solo muestra los últimos 5 expedientes, así que uno más viejo no aparece ahí para editar sus datos DGC — no se pidió resolver esto, queda anotado por si hace falta más adelante (subir el límite o agregar el mismo botón en `expedientes/index.astro`).

### Verificado (Fase 4)
`astro build` completo sin errores de tipo. Falta probar en la app corriendo: abrir/guardar el modal de E1, editar y eliminar un comitente de prueba (y confirmar que sigue apareciendo en expedientes donde ya estaba vinculado), ver el logo nuevo en `/login`, y cargar Nº Expediente/Área de Catastro desde el Dashboard confirmando que se reflejan en el título del expediente y en `expedientes/index.astro`.

### Fase 5 (v0.20) — Rediseño visual: tabs del expediente estilo wizard

Reemplazada la barra horizontal de pestañas (`.tabs-nav`/`.tab-btn` de `global.css`) por un sidebar vertical con los 6 pasos numerados en círculos, en `[id].astro`: círculo con ✓ (verde) si el paso tiene datos cargados, o el número si no, conectados por una línea vertical, más un resaltado de fondo en toda la fila del paso activo (necesario: el color de texto "activo" solía confundirse con el texto normal, dos tonos de azul/negro casi idénticos — el fondo resaltado lo deja inequívoco). El contenido de cada pestaña pasa a vivir en una card a la derecha (`.wizard-content`).

**Solo layout y estilo — cero cambios de lógica**: cada paso sigue siendo el mismo `<a href="?tab=...">` de siempre (navegación server-rendered, no SPA), mismo `activeTab` calculado en el server, y ninguno de los `<form>`/acciones `_action`/patrón de guardado (PRG con redirect a `?tab=...&ok=1`) de cada pestaña se tocó — literalmente se movieron los mismos bloques `{activeTab === 'x' && (...)}` de lugar (de ser hijos de `.card` junto al `.tabs-nav`, a ser hijos de `.wizard-content` dentro de `.wizard-layout`), sin tocar una línea de su contenido interno.

"Completado" por paso se infiere de datos ya disponibles en la página (sin queries nuevas): comitente = hay algún `exp_comitentes`; inmueble = existe la fila `inmueble`; mensura = hay al menos un lado cargado; testigos = hay algún `exp_testigos`; DDJJ = se cargó `personas_habitan` o hay `edificacion`; documentos = hay algún documento generado.

Responsive: por debajo de 860px el sidebar colapsa a una fila horizontal con scroll (sin la línea conectora ni el subtítulo de cada paso, para que entre en pantallas chicas).

### Verificado (Fase 5)
`astro build` completo sin errores de tipo. Como es un cambio puramente visual y no hay forma de loguearse en la app real desde acá, se armó una réplica estática del sidebar (mismas clases CSS, copiadas tal cual del archivo) y se renderizó con Playwright (headless) en dos anchos (1100px y 480px) para confirmar visualmente: los círculos ✓/número, la línea conectora, el resaltado del paso activo, y el colapso responsive a fila horizontal — los tres se ven correctos. Esto valida el CSS en aislado, no reemplaza probar la página real con datos de Franco — recomendado antes de dar la Fase 5 (y el roadmap completo de las 14 cosas) por cerrado: recorrer las 6 pestañas, guardar en cada una y confirmar que el dato persiste y el redirect vuelve al tab correcto.

### Detalle técnico de la Fase 1 (v0.16)

### 1.1 — Bug real: suma angular mal en Planilla de Cálculos
La fila de totales sumaba solo el campo `grados` de cada ángulo y dejaba minutos/segundos hardcodeados en `0`/`0` — nunca hacía el acarreo (carry) de segundos→minutos→grados, por eso dos ángulos con minutos/segundos daban un total menor al real en el PDF, aunque la web (que sí hace el acarreo) mostraba el valor correcto. Ahora la Planilla suma todo en segundos y vuelve a convertir con `Math.floor`/`%`, igual que ya hacía `actualizarVisor()` en la web.

### 1.2 — Carátula: texto más grande
Título 22→27pt, campos (Departamento/Ubicación/Partida/Comitente) 15→18pt, con más espacio entre líneas. Probado con un caso extremo (comitente con nombre muy largo, el campo envuelve a 3 líneas) — queda con margen de sobra antes del logo del pie, no se pisan.

### 1.3 — Superficies: redondeo real a 2 decimales (al centímetro), en el guardado
Encontramos 3 lugares en `generar.ts` que imprimían `superficie_m2` sin ningún `.toFixed()` (Capítulo de Ubicación, Acta de Mensura, Memoria de Mensura) — ya corregidos. Pero el arreglo de fondo se hizo en el guardado (`[id].astro`, acción `guardar_mensura`): antes se guardaba el float crudo del cálculo (ej. `179.6667`), arrastrando esa imprecisión a cualquier lugar que lo mostrara. Ahora se redondea a 2 decimales ahí mismo, así todo (web y los 5 documentos que la imprimen) sale bien desde un solo lugar. De paso: el input de superficie en Tab Mensura pasó de autocompletarse con 4 decimales a 2, y su `step` de `0.0001` a `0.01`; la "Suma total" de lados (que se ve en vivo mientras se cargan los lados) también pasó de 4 a 2 decimales.

### 1.4 — Memoria de Mensura: designación de lado/ángulo antes de la medida
Antes: `"30,00 m = TREINTA METROS"` a secas. Ahora: `"Lado AB: 30,00 m = TREINTA METROS"` (reusa `generarEtiquetasLados`, ya usada en la Planilla de Cálculos) y `"Ángulo en vértice 2: 90°00' (NOVENTA GRADOS...)."`. El texto de ángulo pasó de `drawText` plano a `dibujarParrafo` (con wrap) porque con el prefijo nuevo un ángulo de nombre largo podía pasarse del ancho de la hoja.

### 1.5 — Sangría de párrafos aumentada
`dibujarParrafo`/`dibujarParrafoMixto`: sangría por defecto 18→30pt. Los llamados que pasan `sangria=0` explícitamente (filas tipo lista: lados/ángulos de Memoria, algunas líneas de cierre) no cambian.

### Verificado
Sintaxis (`esbuild` sobre `generar.ts` y los `<script>` de `[id].astro`) y compilación completa (`astro build`, sin errores de tipo — el único error del build fue un `EPERM` de symlinks de Windows al empaquetar para Vercel, no relacionado con el código). Carátula probada con datos sintéticos en caso extremo (ver 1.2). El resto (suma angular con datos reales, Memoria con varios lados/ángulos, superficies en un expediente real) queda pendiente de probar en la app corriendo con datos reales — recomendado antes de dar la Fase 1 por cerrada.

### Pendiente — las 5 fases están implementadas, falta terminar de probar

Franco mandó 14 pedidos juntos (por chat y por captura). Las 5 fases del roadmap ya están implementadas (ver arriba, v0.16 a v0.20) — lo que falta es terminar de probarlas en la app corriendo con datos reales:
- Fase 1: suma angular con datos reales, Memoria con varios lados/ángulos, superficies en un expediente real. **Confirmado por Franco vía capturas.**
- Fase 2: **migración SQL del rol "Intendente" ya corrida por Franco.** Falta probar el flujo de eliminar edificación y el conteo de Formularios U con varios polígonos.
- Fase 3: token vencido real (se puede simular editando la cookie `sb-access-token` a mano).
- Fase 4: modal de E1, editar/eliminar comitente, logo del login, editor de Nº Expediente/Área de Catastro en Dashboard — incluye correr a mano en Supabase `alter table comitentes add column if not exists eliminado_at timestamptz;`.
- Fase 5: recorrer las 6 pestañas con el layout nuevo, guardar en cada una y confirmar que el dato persiste y el redirect vuelve al tab correcto — la verificación hecha esta sesión fue solo visual/CSS en aislado (ver arriba), no un recorrido real de la página.

---

## 📋 Cambios de la sesión — 27 Julio 2026 (v0.15) — Correcciones de Franco: membrete, actas, tolerancias, formularios

Franco pasó `CORRECCIONES_NICA.pdf` — un expediente de prueba con anotaciones en rojo, página por página, marcando ajustes puntuales — más el detalle de las fórmulas de tolerancia y una propuesta de membrete nuevo por WhatsApp. Se repasaron todas las anotaciones contra el código real antes de tocar nada, y se implementó todo lo que no dependía de información pendiente de Franco.

### Membrete — rediseño completo

Franco propuso sacar el fondo negro del encabezado y reemplazar el isologo rectangular por el logo circular "ESTUDIO DE AGRIMENSURA" (el mismo que ya se usa al pie de la Carátula), mandando de referencia una imagen y un Word (`Membrete.docm`, protegido con contraseña — no se pudo abrir). Un primer intento redibujó el sello a mano con formas vectoriales de `pdf-lib` (círculo + texto curvo + "N"/"CA"), pero comparado contra `MEMBRETE_PROPUESTO.pdf` (que Franco convirtió del Word protegido a PDF para destrabar esto) no quedaba igual al logo real — quedó descartado.

**Solución final:** se recortó del asset ya existente `public/images/nica-logo-caratula.png` (865×488px) el círculo aislado, sin el nombre ni el contacto de abajo (bounding box detectado con `sharp().trim()`, 284×288px), guardado como `public/images/nica-logo-icono.png`. Ese PNG se embebe ahora en el encabezado (`dibujarEncabezado` en `generar.ts`) igual que antes se embebía el JPG negro — mismo mecanismo de siempre (parámetro `logo: PDFImage`, cargado una vez y reembebido por documento).

Cambios de diseño en `dibujarEncabezado`:
- Sin relleno negro — franja blanca, texto en negro (antes blanco sobre negro).
- El logo ahora ocupa casi toda la altura del bloque de 4 líneas de texto (antes era un ícono fijo de 40pt, chico y desproporcionado respecto a la referencia).
- Cada etiqueta (OBJETO / COMITENTE / UBICACIÓN / PROFESIONAL) se subraya, igual que en `MEMBRETE_PROPUESTO.pdf`.

Afecta a los mismos 9 documentos con membrete propio de siempre (Nota de Elevación, Documento de Identidad, Capítulo de Ubicación, Notificación a Linderos, Acta de Mensura, Acta de Ausencia de Linderos, Memoria de Mensura, Planilla de Cálculos, y las páginas divisorias del expediente combinado).

### Acta de Mensura — leyenda según rol del comitente

La leyenda de límites decía siempre "la posesión ejercida por" — Franco aclaró que eso sólo aplica a prescripción adquisitiva (rol Poseedor); el resto de los casos debe decir "la propiedad del". Se condicionó por `rol` (columna ya existente en `exp_comitentes`: titular/apoderado/heredero/poseedor).

### Notificación a Linderos y Autoridades — ahora sí va en el expediente completo

Hasta esta sesión quedaba afuera del "Generar expediente completo" a propósito (documentado como decisión de diseño en v0.12: "es un trámite previo a la mensura"). Franco corrigió ese criterio: debe incluirse, dentro de la sección "ACTAS". Se agregó al bundle, delante de Acta de Mensura y Acta de Ausencia de Linderos.

### Tolerancias en Planilla de Cálculo — ya no es un valor fijo

Estaba hardcodeado en `0.10` desde la sesión del 8 Julio (quedó anotado como pendiente en v0.8). Franco pasó las fórmulas oficiales según normativa y confirmó cuáles usar por el momento (condición favorable):

- **Urbano:** T = 0,00025·L + 0,03
- **Rural:** T = 0,00046·L + 0,20

(L = perímetro del polígono). Nueva función `calcularTolerancia(perimetro, tipoInmueble)` en `src/lib/poligonal.ts`, usada en `generar.ts` con el perímetro que ya calcula `calcularPoligonal()` y el `tipo_inmueble` del expediente. El resto de la tabla completa de Franco (condiciones desfavorables/muy desfavorables, suburbano) quedó afuera por ahora — falta un selector de "condición de trabajo" para usarla, ver pendientes.

### Memoria de Operaciones — "con cero centímetros" siempre

Franco pidió que la aclaración en centímetros figure siempre, aunque sea cero (ej. "TREINTA METROS **CON CERO CENTÍMETROS**"). El bug era literal: `if (centimetros > 0)` en la conversión a letras (`[id].astro`) — se sacó la condición. Aplica tanto a lados como a superficie.

### Formulario E1 — cruz en vez de relleno gris

El casillero de Rubro 1 que se elige por cada característica se tapaba con un relleno gris sólido — Franco pidió poder ver qué se marcó. Ahora se dibuja una cruz sobre el texto, sin taparlo.

### Formulario U — tres correcciones puntuales

- **Departamento:** faltaba por completo — sólo se imprimía Localidad. Se agregó (coordenadas aproximadas, falta verificar contra un render real).
- **Superposición en el dorso (Rubro 4):** el rectángulo blanco que tapa el párrafo de ejemplo de la plantilla medía 48pt de alto, pero el párrafo real de 4 líneas necesitaba más — la última línea quedaba pisando texto de la plantilla sin tapar. Se agrandó el rectángulo.
- **Aclaración de firma:** estaba en una posición fija (x=390); ahora se centra según el ancho real del nombre.

### Carátulas y páginas divisorias — tamaño de letra dinámico

Los títulos con poco texto (ej. "ACTAS") se veían chicos y poco representativos con el tamaño fijo de 26pt. Ahora escala según la longitud del título más largo (hasta 40pt para títulos de una palabra corta).

### Verificado

Sin `@astrojs/check`/`typescript` como dependencia del proyecto, no se pudo correr un typecheck completo (no se instalaron paquetes nuevos sin confirmar con el usuario). Se verificó con `astro build` (compila y bundlea todo, incluye esbuild) después de cada tanda de cambios — sin errores.

### Pendiente

1. ~~Formulario U — croquis con objetos tachados~~, ~~"SI"/"NO" cortados (Agua Corriente/Cloacas)~~ y ~~Departamento/Localidad amontonados~~ → **resueltos, ver v0.16 más abajo** (no hizo falta tocar la plantilla base, se pudo con la misma técnica de tapar+redibujar que ya se usaba en el resto del archivo).
2. **Formulario U — plantilla con defectos que no se pudieron resolver bien por código:** "FOLIO" partido en "FOLI"/"O", y "NO" partido en "N"/"O" en el casillero de "Ausente del País" (Rubro 3). Ambos se probaron con la técnica de tapar+redibujar (que sí funcionó para Agua Corriente/Cloacas), pero en estos dos casos el resultado no quedó bien — Juan decidió dejarlos tal cual vienen de la plantilla y pedirle a Franco una plantilla nueva con esos casilleros puntuales corregidos de origen, ver detalle en v0.16.
3. ~~Formulario E1 — posición de textos de Rubro 1/2~~ → **revisado, ver v0.17 más abajo.** El grid de Rubro 1 y Rubro 2 estaban bien; se encontró y corrigió un bug real en "Destino del Edificio".
4. ~~Declaraciones juradas por parcela~~ → **resuelto para Formulario U, ver v0.18 más abajo.** SOR y E1 no se replican — no tienen ningún dato que varíe por parcela (avisar a Franco).
5. ~~Botones separados de descarga~~ → **resuelto, ver v0.18 más abajo.**
6. **A verificar visualmente antes de dar por cerrado:** tamaño del rectángulo del dorso de Formulario U y el tamaño del logo del membrete en el resto de los documentos (Franco sólo probó Carátula, el membrete suelto y Formulario U hasta el momento — falta Nota de Elevación, Actas, Memoria, Planillas, E1).

---

## 📋 Cambios de la sesión — 28 Julio 2026 (v0.16) — Formulario U: croquis, "SI"/"NO" cortados, Departamento/Localidad y FOLIO

Cierre de todos los puntos de Formulario U que en v0.15 habían quedado marcados como "no es código, vive en la plantilla" o "coordenadas aproximadas, falta verificar". Se resolvieron sin tocar `formulario_u.pdf`, con la misma técnica de tapar con un rectángulo blanco y redibujar encima que ya usa el resto del archivo (ej. el párrafo de la declaración jurada en Rubro 4) — todo en la rama `formulario_u` de `generar.ts`. Repartido en dos partes: la primera (croquis + SI/NO) se hizo anoche desde otra máquina (commit `e4d5d0c "terminar de corregir U"`), la segunda (Departamento/Localidad + FOLIO) hoy, retomando con Juan tras el pull.

**Croquis de la Parcela (Rubro 2):** la plantilla traía 4 marcas de esquina (trazos gruesos en L, tipo "marca de recorte") alrededor del recuadro en blanco. Se cubrieron con 4 rectángulos blancos, medidos contra la plantilla real para no tocar el borde fino del recuadro.

**"SI"/"NO" partidos en dos renglones (Agua Corriente, Cloacas, Ausente del País x2 filas):** la columna angosta exportada desde Google Sheets partía la palabra en dos líneas ("S" arriba / "I" abajo, ídem "N"/"O"). Se tapa cada etiqueta partida con un rectángulo angosto y se reescribe en una sola línea (5.5-6pt). Un primer intento tapaba de más y se comía el borde punteado del casillero; se corrigió midiendo los bordes reales pixel a pixel. El "SI" de Cloacas no estaba partido en la plantilla original y se dejó tal cual.

**Departamento/Localidad amontonados:** Franco marcó que el texto "no quedaba acorde al renglón al que pertenece" — con captura de un caso real se vio que ambos valores aparecían pegoteados arriba, sin usar los dos renglones reales de la plantilla. Causa: las coordenadas de v0.15 fueron una estimación ("11pt arriba de Localidad") nunca confirmada — el renglón real de Departamento está en y≈845 (termina en x≈460) y el de Localidad en y≈820 (termina en x≈615, con 3 casilleros al lado), no separados por 11pt sino por 25. Se recalibraron dibujando una grilla de referencia sobre una copia de la plantilla real y comparando visualmente contra los renglones (mismo método que ya usaron sesiones anteriores para SOR/E1) — confirmado con un PDF de prueba aparte antes de tocar el archivo real.

**FOLIO partido en "FOLI"/"O":** se armó un fix (tapar + reescribir en una línea, igual que el resto), pero Juan pidió revertirlo — a diferencia de los SI/NO, éste no está priorizado para corregir y se prefiere dejarlo tal cual viene en la plantilla. Revertido, sin cambios en el archivo final.

**"NO" de "Ausente del País" seguía partido tras el pull:** Juan mandó una captura real donde el "NO" seguía viéndose "N" arriba / "O" abajo pese al fix de anoche. Un primer merge de prueba standalone (mismo código del commit de anoche, `pdf-lib`, fuera del servidor) no reproducía el problema a la escala de zoom usada — pero repitiendo la prueba con una grilla mucho más fina (2pt) y a mayor zoom se encontró la causa real: el rectángulo de anoche (8.5×11.7pt) tapaba la "N" pero se quedaba corto para la "O", que cae más abajo de lo que parecía a la escala de calibración anterior. Recalibrado en varias pasadas visuales (una versión intermedia se pasó para el otro lado y tapaba parte del renglón divisorio de "Ausente del País") hasta dar con un rectángulo (14×23pt) que cubre "N" y "O" completos sin tocar el renglón divisorio de arriba ni el borde negro exterior del casillero.

**Segunda vuelta — "NO" desalineado de "SI" entre las dos filas:** con el rectángulo ya corregido, Juan reportó asimetría entre las dos filas de comitentes en el mismo casillero. Causa: "SI" es texto original de la plantilla (nunca se tocó) mientras que "NO" es el texto que se redibuja — el primer redibujado usaba una altura propia (y-37) en vez de la línea de base real donde cae "SI", así que no quedaban a la misma altura, y al no ser la misma diferencia en las dos filas se notaba como asimetría. Solución: alinear "NO" a la misma línea de base que ya usa la marca X de ese casillero (y-31, coordenada preexistente ya calibrada correctamente contra "SI") en vez de una altura inventada — mismo criterio que ya usan Agua Corriente/Cloacas (ahí "SI" y "NO" comparten línea de base porque las dos se redibujan a mano al mismo y).

**Tercera vuelta — dos problemas más, con capturas nuevas de Juan:**
- La marca X (que sí depende del dato, `ec.ausente_pais`) quedaba a la misma altura que el "NO" recién alineado (y-31 los dos) — antes se notaba menos porque el texto estaba descolocado, pero ahora la X caía justo encima de la "N", amontonado. Se bajó la X a y-37.5 (6.5pt por debajo del texto), mismo desfasaje que ya usan Agua Corriente/Cloacas entre su X y su "SI"/"NO".
- La fila b) (segundo comitente) seguía mostrando el defecto original de la plantilla sin arreglar — el fix de tapar+redibujar "NO" estaba adentro del `forEach` de comitentes cargados, así que si el expediente de prueba sólo tenía un comitente, la fila b) nunca se tocaba. Se sacó del forEach a un loop propio sobre las dos posiciones fijas (`filasY`), igual que Agua Corriente/Cloacas.

**Revertido — Juan decidió dejarlo como estaba en la plantilla:** después de esta tercera vuelta el resultado seguía sin convencer. A diferencia de Agua Corriente/Cloacas (que sí funcionaron bien con la técnica de tapar+redibujar), el casillero de "Ausente del País" resultó más frágil — parece que el margen real alrededor de "N"/"O" en la plantilla es más angosto, y cada intento de arreglarlo terminaba generando un problema nuevo (tapaba de más, quedaba desalineado de "SI", chocaba con la X). Juan prefirió cortar por lo sano: se revirtió todo (el rectángulo, el redibujado, y el offset de la X vuelve a y-31 como estaba antes de tocar nada) y va a pedirle a Franco una plantilla con ese casillero puntual ya corregido de origen, en vez de seguir iterando con parches de código. Queda igual que "FOLIO": defecto conocido de la plantilla, no priorizado para arreglar por código.

**Verificado:** `astro build` sin errores después de cada tanda (mismo criterio que v0.15 — sin `@astrojs/check` instalado no se corrió typecheck completo).

---

## 📋 Cambios de la sesión — 28 Julio 2026 (v0.17) — Formulario E1: revisión de Rubro 1/2

Retomando el pendiente marcado desde v0.10 ("el calibrado de E1 quedó en su primera pasada... puede necesitar un corrimiento fino"). Se armó un merge de prueba standalone (`pdf-lib`, contra la plantilla real `formulario_e1.pdf`, fuera del servidor) con una grilla de referencia dibujada encima — mismo método ya usado para Formulario U — para verificar cada bloque de coordenadas con datos de ejemplo antes de dar el pendiente por cerrado.

**Rubro 1 (grilla de 13 categorías × 5 incisos) y Rubro 2 (12 renglones de datos numéricos):** se probaron con una diagonal de valores de ejemplo cubriendo las 13 filas y las 5 columnas — las cruces quedaron bien contenidas dentro de cada casillero, sin invadir el texto ni las filas vecinas. Ya estaban bien calibrados de antes (quedan igual, no se tocó nada acá).

**Destino del Edificio — bug real encontrado y corregido:** las coordenadas Y de las 9 opciones (`DESTINO_XY`) estaban espaciadas 19pt entre sí (889, 870, 851, 832...), pero la plantilla real tiene los renglones a 10pt de distancia — cada casillero después del primero terminaba marcando la fila siguiente a la que correspondía (ej. tildar "Negocios" en realidad marcaba el casillero de "Sala de Espectáculos Públicos"). Sólo las dos primeras opciones de cada columna (`casa_familia` y `asociaciones`, en y=889) daban bien, porque coinciden con las X que la plantilla ya trae pre-marcadas de fábrica — el resto nunca se había confirmado contra un render real. Recalibrado a 10pt de espaciado real, confirmado con grilla fina superpuesta sobre la plantilla para las 9 opciones (5 de la columna izquierda + 4 de la derecha). De paso se corrigió la posición del campo de texto libre "Otros Destinos (Indique):" (`destino_otros_detalle`), que dependía de la posición vieja de esa fila.

**Encabezado (Departamento/Localidad/Apellido):** se verificaron los tres contra la plantilla real, caen bien apoyados en su renglón correspondiente — sin cambios.

**Verificado:** `astro build` sin errores.

---

## 📋 Cambios de la sesión — 28 Julio 2026 (v0.18) — Botones de descarga separados + declaraciones juradas por parcela

Últimos dos pendientes que Franco había dejado para el final (WhatsApp, 24/07): separar la descarga de las DDJJ del expediente completo, y replicar las declaraciones juradas cuando hay más de una parcela cargada. Se hizo en dos pasos independientes, cada uno verificado antes de pasar al siguiente — el primero de bajo riesgo (sólo arma listas distintas de qué incluir en cada bundle), el segundo tocando el código de Formulario U recién calibrado hoy mismo (v0.16), así que se armó con una técnica que garantiza que el caso de un solo polígono (el más común) queda exactamente igual a como estaba.

### Paso 1 — Botón "Generar declaraciones juradas" aparte

Franco: *"deberíamos descargar el expte completo (sin las declaraciones juradas) y por otro un botón de todas las declaraciones juradas juntas, así no se hace un archivo tan grande en casos de muchas parcelas"*.

- Nuevo marcador de bundle `declaraciones_juradas_completo` (mismo mecanismo que ya usaba `expediente_completo`: el cliente sólo manda el marcador, el servidor arma su propia lista fija).
- "Generar expediente completo" ya **no incluye** Formulario U/SOR/E1 — sólo los 8 documentos base.
- El nuevo bundle junta el/los formulario/s DDJJ que correspondan (U o SOR + E1 si hay edificación cargada) en un solo PDF, **sin páginas divisorias** — son 1-2 formularios oficiales de Catastro que ya se bastan solos, mismo criterio que ya estaba comentado en el archivo sobre las DDJJ ("no aplica nada de NICA encima").
- Nueva fila en `documentos_generados` con `tipo_documento: 'declaraciones_juradas'` — se lista sola en la tabla existente, sin tocarla (ya formatea cualquier tipo con `.replace(/_/g,' ')`).
- Nuevo botón "Generar declaraciones juradas (PDF único)" en Tab Documentos, mismo patrón visual que el de expediente completo (form oculto + `form="..."` en el botón). El handler de submit de ambos botones se unificó en una función (`armarHandlerBundle`) para no duplicar el código de validación/fetch/inserción de fila.

### Paso 2 — Formulario U replicado por parcela

Franco: *"las declaraciones juradas se generan por parcela cargada... hay que replicar las declaraciones por la cantidad de parcelas generadas"*.

**Técnica:** todo el código de dibujo de Formulario U (sin cambiar una sola línea de las coordenadas/lógica calibradas hoy) se movió adentro de una función local `dibujarFormularioU(pdfDoc, page, font, bold, poligono)`. Con un solo polígono cargado (el caso común) se llama una sola vez, igual que antes — **comportamiento idéntico, verificado con un merge de prueba standalone contra la plantilla real**. Con más de un polígono, por cada uno extra se carga una copia nueva de la plantilla, se llama a la misma función con la superficie de ESE polígono, y sus páginas se pegan al final del documento con `copyPages()` (misma técnica que ya usa el armado de "expediente completo"). Probado con 3 polígonos simulados (superficies 304.48, 224.23 y 150 m²): salieron 6 páginas (2 por parcela — página de datos + página de declaración jurada), cada una con su propia superficie y sin contenido cruzado entre copias.

**Formulario SOR — decisión de NO replicarlo:** revisando la plantilla real de Catastro (`formulario_sor.pdf`) se confirmó que el SOR **no tiene ningún campo de "Superficie del Terreno"** — a diferencia de Formulario U, que sí lo tiene (Inc. e). El contenido del SOR (designación según títulos/catastro/registro, datos de propietarios, receptoría) no varía por parcela en absoluto. Replicarlo hubiera generado N copias exactamente idénticas, sin ningún valor agregado. **Se decidió con Juan dejar SOR generándose una sola vez, como siempre** — si Franco confirma después que necesita algo específico por parcela en el SOR, es un agregado chico sobre esta misma base (mismo mecanismo que Formulario U). **Importante para la próxima charla con Franco: avisarle de este detalle.**

Formulario E1 tampoco se replica (ver v0.15/v0.16: `edificacion` es 1:1 con el expediente, no con cada polígono — mismo motivo que SOR).

**Verificado:** `astro build` sin errores después de cada paso; merge de prueba standalone (`pdf-lib`, fuera del servidor) confirmando 6 páginas correctas para 3 polígonos antes de dar el paso 2 por cerrado.

### Ajuste chico — paginación de "Documentos generados"

Juan pidió bajar la cantidad de filas por página de la tabla de documentos generados (venía en 10, con 36 documentos de prueba ya generados quedaba una tabla larga). `DOCS_POR_PAGINA` en `[id].astro` pasó de 10 a 5 — es la única constante que controla el `range()` de la consulta y el cálculo de páginas, no hizo falta tocar nada más.

**Sin cambios de base de datos** — todo lo necesario (`poligonos`, `edificacion`, tabla `documentos_generados` genérica) ya existía.

---

## 📋 Cambios de la sesión — 22 Julio 2026 (v0.14) — Vista previa de PDF en modal + orden de botones

Dos pedidos de UX en Tab Documentos:

1. **Botones en fila:** "Generar seleccionados" y "Generar expediente completo (PDF único)" estaban uno debajo del otro (dos `<form>` separados). Se mantienen como dos formularios distintos (submits independientes, cada uno con su propia validación de "faltan datos"), pero el segundo botón ahora vive visualmente dentro del primer bloque con el atributo HTML `form="form_expediente_completo"` — así apunta a su propio formulario al enviarse aunque esté anidado en el markup del otro, sin duplicar la lista de checkboxes ni anidar `<form>` (inválido en HTML). Nueva clase `.botones-generar-fila` (flex, gap) para alinearlos.

2. **Vista previa en modal:** "Descargar" ya no navega a otra página — abre un modal (mismo estilo que los de confirmación ya existentes: overlay oscuro atenuando el fondo, `Esc`/click-afuera para cerrar) con un `<iframe>` mostrando el PDF y un botón "Descargar" real al lado. Funciona tanto para las filas ya en pantalla como para las que se agregan dinámicamente al generar (delegación de eventos, `.btn-descargar-pdf`).
   - `descargar.ts`: además del redirect de siempre (fallback si se abre el link directo, ej. clic derecho → abrir en pestaña nueva), ahora responde JSON con la URL firmada cuando la pide el modal vía `X-Requested-With: fetch` — mismo patrón ya usado en `generar.ts`. De paso la URL firmada pasó de 2 a 5 minutos de validez (tiempo de sobra para mirar el PDF en el modal sin que expire).
   - Sin tocar la subida a Storage ni `documentos_generados` — el PDF generado es exactamente el mismo archivo, solo cambia cómo se abre.

---

## 📋 Cambios de la sesión — 22 Julio 2026 (v0.13) — Formulario SOR: recalibrado de coordenadas

Franco reportó que el Formulario SOR salía con los datos totalmente desfasados — texto flotando fuera de la tabla, en columnas y filas que no correspondían (`EXPTE_GENERADO.pdf`, página del SOR). Pidió corregir solo eso, sin tocar el resto.

**Causa:** el calibrado original (sesión pasada) se había medido a ojo contra un render en pantalla, y salió mal. Esta vez, después de dos intentos más que TAMBIÉN salieron mal calibrando a ojo contra renders (confirmando que leer coordenadas de una imagen renderizada, para esta plantilla puntual, era poco confiable — probablemente por lo compacta que es la tipografía original, exportada desde Google Sheets), se cambió de método: se usó `pdftotext -bbox` (poppler) para leer la posición **exacta** de cada etiqueta de la plantilla (en el mismo sistema de coordenadas que usa `drawText` de `pdf-lib`, con el eje Y invertido — poppler lo da desde arriba, se convierte con `1008 - yMax`). Con eso se recalibraron **todas** las coordenadas del branch `formulario_sor` en `generar.ts`: Departamento/Localidad, Inciso a) Sección/Fracción/Lote, Inciso c) Tomo/Folio/Año, Informaciones adicionales, y las 3 filas de Rubro 2 (Apellido/%/Tipo y Documento/Calle/Localidad/Provincia/Ausente).

**Verificación:** se generó un PDF de prueba con datos de ejemplo y se volvió a pasar por `pdftotext -bbox` para confirmar **numéricamente** (no solo a ojo) que cada dato cae en la fila/columna de su etiqueta correspondiente — antes de eso, dos pasadas visuales seguidas habían salido mal, así que esta vez no se dio por buena la corrección hasta confirmarla con números.

Sin cambios de base de datos ni en ningún otro documento — el resto de las DDJJ (U, E1) y el PDF combinado no se tocaron.

**Ajuste posterior (mismo día) — tamaño de letra dinámico:** con datos reales aparecieron 3 desbordes puntuales (Departamento/Localidad muy pegados entre sí, "Primera" en Sección invadiendo la columna de Chacra, el DNI justo contra el borde) — corregidos primero a mano, pero Juan señaló que ese enfoque (achicar campo por campo cada vez que aparece un valor más largo) no escala. Se cambió `campoSor` para que reciba el **ancho real de la celda** y encoja la letra sola (de a 0.5pt, con un piso de 5pt) cuando el valor no entra al tamaño pedido, en vez de tener un tamaño fijo por campo.

**Segunda vuelta sobre el DNI** — el primer ancho que se le puso a la celda de "Tipo y Nº Documento" (60pt, después 40pt) seguía sin alcanzar, porque estaba mal medido el borde derecho real de la tabla en ese tramo. Se confirmó dibujando reglas numeradas directamente sobre la plantilla y comparando línea por línea contra el borde negro real (no alcanza con leer las etiquetas de texto vía `pdftotext -bbox`, hay que ver dónde está el borde de la celda en sí): el borde está en **x≈384**, no en 486 como se había estimado en un paso intermedio. "Tipo" y "Nº Documento" comparten una columna angosta de ~74pt en total (no 40pt cada uno) — se repartió el espacio entre los dos (33pt cada uno) y con el achique automático ya entran cómodos, probado con "PASAPORTE 99.999.999" (peor caso que un DNI).

---

## 📋 Cambios de la sesión — 21 Julio 2026 (v0.12) — Fidelidad de formato + "Generar expediente completo"

Franco pasó `EXP_PRUEBA.pdf` (un expediente real de 19 páginas, exportado desde Word) como referencia definitiva. Se instaló `poppler` (vía winget, herramienta de la máquina de Juan — no toca el proyecto) para poder renderizar y comparar página por página contra esa referencia.

**Dos correcciones puntuales que salieron del análisis:**
- **Formulario U, declarante:** la página de declaración jurada (Rubro 4) declaraba al comitente — la referencia real de Franco confirma que el declarante es **el profesional agrimensor** ("El que suscribe FRANCO ARTURO NIGRO CARRIERE... en su carácter de AGRIMENSOR"). Corregido en `generar.ts`. `profiles` no tiene columna de nacionalidad ni tipo de documento — se asume Argentina/DNI fijo (así es siempre en la práctica, no amerita columna nueva).
- **Formulario E1, Rubro 1:** se encontró una copia de `EXP_PRUEBA.pdf` con el E1 completo y lleno por Franco (páginas 17-18) — mucho mejor referencia que la plantilla vacía usada en el primer calibrado. Con eso se recalibraron las coordenadas de Destino del Edificio, la grilla de 13×5 y Rubro 2, y se cambiaron dos cosas de diseño (confirmadas con el usuario): el casillero elegido ahora se **sombrea en gris** (no una X), y la fila "14) Tipo del edificio" se completa con un **conteo automático** por columna (cuántas de las 13 categorías eligieron cada inciso A-E) — antes quedaba en blanco. De paso se descubrió que la plantilla trae "Casa de Familia" pre-tildado de fábrica (mismo patrón que el "100"/"DNI" de Formulario U) — no se dibuja nada encima si el destino real coincide con ese default.

**"Generar expediente completo" — nuevo botón en Tab Documentos:**
Genera **un solo PDF** con todos los documentos del expediente, en el mismo orden y con las mismas "mini-carátulas" divisorias que usa Franco en `EXP_PRUEBA.pdf`:
```
Carátula → Nota de Elevación → Documento de Identidad (1 por comitente)
  → divisoria "DESCRIPCIÓN Y DOMINIO DEL INMUEBLE" → Capítulo de Ubicación
  → divisoria "ACTAS" → Acta de Mensura → Acta de Ausencia de Linderos
  → divisoria "MEMORIA DE OPERACIONES" → Memoria de Mensura
  → divisoria "PLANILLAS DE CÁLCULO" → Planilla de Cálculos
  → divisoria "DECLARACIONES JURADAS FORMULARIOS «...»" (título dinámico) → Formulario U/SOR (el que aplique) → Formulario E1 (si el inmueble tiene construcciones cargadas)
  → divisoria final "PLANO DE MENSURA" (Franco adjunta el plano de CAD aparte — fuera del alcance de la app)
```
**"Notificación a Linderos y Autoridades" queda afuera a propósito** — es un trámite previo a la mensura, no forma parte del expediente final que se presenta a Catastro (confirmado: no aparece en `EXP_PRUEBA.pdf`).

**Cómo se armó, técnicamente** (en `generar.ts`):
- El bloque de subida a Storage + insert en `documentos_generados` (antes al final del loop que genera cada documento) se movió a **después** del loop — durante el loop ahora solo se juntan los pares `{ tipo, bytes }` en un array. Para una generación normal (no combinada) esto no cambia nada del resultado, solo reordena el código.
- Para el modo combinado, esos bytes (generados con el mismo código de siempre, sin tocarlo) se pegan en un único `PDFDocument` con `copyPages()` — la forma estándar de `pdf-lib` de mezclar PDFs — intercalando páginas divisorias nuevas (`crearPaginaDivisoria`, mismo formato que ya usa la Carátula: membrete + título grande + logo circular al pie).
- El servidor arma su propia lista de qué incluir (no confía en lo que mande el cliente): determina Formulario U vs SOR por `tipo_inmueble` e incluye E1 solo si hay datos de `edificacion` cargados — mismo criterio que ya se usa en el resto de la app.
- Un solo archivo subido, una sola fila en `documentos_generados` (`tipo_documento: 'expediente_completo'`) — se lista y descarga solo en la tabla de "Documentos generados" existente, sin tocar nada ahí (esa tabla ya era genérica).
- Validación: reusa tal cual `validarDocumentosSeleccionados`/`mostrarModalValidacion`, que ya agrupan por documento — se le pasa la lista fija de 8-10 tipos en vez de los tildados a mano.
- Probado con un merge de prueba standalone (`pdf-lib`, fuera del servidor) antes de tocar nada real: 17 páginas en el orden esperado, título dinámico de la divisoria de DDJJ correcto, página apaisada de Planilla intercalada sin problemas entre páginas verticales.

**Sin cambios en base de datos** — esta sesión fue puramente de generación de PDF.

---

## 📋 Cambios de la sesión — 20 Julio 2026 (v0.11) — Logo en el membrete

Franco pasó `EXP_PRUEBA.pdf` (un expediente real exportado desde Word) como referencia del membrete que usa en sus documentos — quería el logo a la izquierda, tal cual se ve ahí, y que se respetaran las sangrías reales (no las que traía el membrete actual de NICA).

**Cómo se sacaron los datos exactos:** en vez de adivinar posiciones a ojo, se abrió `EXP_PRUEBA.pdf` con `pdf-lib` y se leyó directamente el content stream de varias páginas — la franja negra del membrete resultó ser idéntica en 15 de las 19 páginas (`x=83.05, y=753.57, ancho=442.25, alto=51.9`), con el logo (`Image7`, JPEG chico de fondo negro con "NICA CONSULTORIA EN AGRIMENSURA") dibujado en `x=90, y=755.47, ancho=144.37, alto=49.55` — confirmando que es un encabezado de página fijo de Word, no algo puntual de una sola hoja. El logo se extrajo del PDF (estaba embebido como JPEG) y se guardó en `public/images/nica-logo-membrete.jpg`.

**Cambios en `dibujarEncabezado`/`crearPaginaConEncabezado`/`generar.ts`:**
- Los márgenes de la franja pasaron de 30/30 (simétrico, genérico) a 83/70 (izquierda/derecha), calcados de la referencia real.
- El logo se dibuja dentro de la franja, a la izquierda, con el texto OBJETO/COMITENTE/UBICACIÓN/PROFESIONAL corriéndose para no superponerse.
- El logo se lee de disco **una sola vez** antes del loop de generación (no una vez por documento) y se embebe (`embedJpg`, barato) dentro de cada `PDFDocument` nuevo — se agregó un tercer parámetro opcional `logo` a ambas funciones, y se actualizaron los 3 lugares donde se llaman (documento normal de una página, comitentes con DNI en `documento_identidad`, y páginas extra de `memoria_mensura`/`planilla_calculos` para expedientes con más de un polígono).
- La altura de la franja se sigue calculando dinámicamente según cuánto texto entra (a diferencia de Word, que la deja fija) — se mantiene esa mejora de la sesión original, solo se ajustaron ancho/posición y se agregó el logo.
- Los **9 documentos con membrete propio** (todo menos Carátula y las 3 DDJJ, que ya tienen su propio diseño) se ven afectados: Nota de Elevación, Documento de Identidad, Capítulo de Ubicación, Notificación a Linderos, Acta de Mensura, Acta de Ausencia de Linderos, Memoria de Mensura y Planilla de Cálculos.
- Probado con `pdf-lib` standalone (mismo código, fuera del servidor) antes de tocar el archivo real, comparando visualmente contra la posición del logo y el ancho de la franja en `EXP_PRUEBA.pdf`.

**Pendiente (siguiente paso, ya charlado con Juan):** un check en Tab Documentos para "generar todos" en un solo documento igual al `EXP_PRUEBA.pdf` de referencia, con validación de datos faltantes por sección — todavía no arrancado.

---

## 📋 Cambios de la sesión — 17 Julio 2026 (v0.10) — Declaraciones Juradas: SOR y E1

Continuación de v0.9: con Formulario U ya cerrado y confirmado por Franco, se replicó el mismo mecanismo (plantilla oficial + `drawText` en coordenadas fijas) para **Formulario SOR** (suburbano/rural) y **Formulario E1** (características constructivas del edificio, adicional cuando el inmueble tiene construcciones). Con esto quedan los 3 tipos de DDJJ implementados — pendiente la vuelta de Franco probando los 3 antes de darlos por cerrados del todo.

**Formulario SOR** — mismas tablas que U (`inmuebles`, `comitentes`, `exp_comitentes`), sin columnas nuevas:
- Limpieza de plantilla: mismas 11 referencias en rojo neutralizadas a blanco en el content stream (misma técnica que U), más un resaltado amarillo de ejemplo en un casillero que también se neutralizó.
- `generar.ts`: nueva rama `formulario_sor`, calibrada con la técnica de grilla de referencia (dibujar líneas verdes numeradas sobre una copia de la plantilla para leer coordenadas exactas antes de escribir el código final, en vez de ir a prueba y error a ciegas) — más rápido que el calibrado de U. Cubre Departamento/Localidad, Fracción/Sección/Parcela, Tomo/Folio/Año, cantidad de personas y último año pagado, hasta 3 titulares (Rubro 2, con % de condominio/tipo de documento/domicilio/ausente del país) y receptoría.
- Tab DDJJ: no necesitó ningún cambio — el bloque de campos ya era genérico para U/SOR (el título ya cambiaba solo según `tipo_inmueble`).
- Quedan algunas dudas menores sobre 2-3 coordenadas (Sección, tipo/dni/provincia) a confirmar cuando Franco lo pruebe contra la plantilla física.

**Formulario E1** — características constructivas, tabla nueva `edificacion` (1:1 con expediente, mismo patrón que `linderos`):
```sql
create table if not exists edificacion (
  id                        uuid primary key default gen_random_uuid(),
  expediente_id             uuid references expedientes(id) on delete cascade not null unique,
  destino_edificio          text,
  destino_otros_detalle     text,
  estado_conservacion       text,
  edad_edificio             int,
  superficie_cubierta       numeric(10,2),
  superficie_semicubierta   numeric(10,2),
  superficie_negocios       numeric(10,2),
  banos_principales         int,
  toilettes                 int,
  pileta_natacion           numeric(10,2),
  agua_caliente_central     int,
  ascensores                int,
  instalaciones_incendio    int,
  cantidad_habitaciones     int,
  caracteristicas           jsonb default '{}'::jsonb
);

alter table edificacion enable row level security;

create policy "Edificacion: acceso via expediente propio"
  on edificacion for all
  using (exists (select 1 from expedientes e where e.id = edificacion.expediente_id and e.user_id = auth.uid()))
  with check (exists (select 1 from expedientes e where e.id = edificacion.expediente_id and e.user_id = auth.uid()));

grant all on edificacion to anon, authenticated;
```
- La planilla real de Rubro 1 trae ~150 variantes de texto por categoría (13 categorías × 5 incisos, con 2-4 frases sinónimas por casillero) — se simplificó a **un solo inciso (a-e) por categoría**, que es el dato que Catastro usa para clasificar el edificio (no la frase exacta elegida dentro de la columna). Constante compartida `src/lib/edificacionE1.ts` (categorías, incisos, destinos del edificio) usada tanto por la Tab DDJJ como por `generar.ts`, para no mantener la lista dos veces.
- Tab DDJJ: checkbox "¿El inmueble tiene construcciones?" que despliega un formulario aparte (`guardar_ddjj_e1`) con Destino del edificio, la grilla de 13 categorías × 5 radios, y los datos numéricos de Rubro 2 (superficies, baños, pileta, ascensores, etc.).
- Limpieza de plantilla: 7 referencias en rojo neutralizadas a blanco (misma técnica). El relleno gris de un título/banner se dejó tal cual (no es una referencia de Franco).
- `generar.ts`: nueva rama `formulario_e1`, con las coordenadas de un primer calibrado (Departamento/Localidad/Apellido, Destino del edificio, grilla de Rubro 1, Rubro 2, lugar y fecha).

**⚠️ A revisar con Franco:** a diferencia de U y SOR (que tuvieron varias rondas de ajuste fino con capturas de pantalla reales), el calibrado de E1 quedó en su primera pasada — en particular la posición exacta del bloque "Destino del edificio" y de la grilla de 65 casilleros de Rubro 1 (la más densa de las 3 plantillas) puede necesitar un corrimiento fino una vez que Franco lo compare contra el papel real. No debería requerir más que ajustar números de coordenadas puntuales en `generar.ts`, mismo mecanismo ya probado en U y SOR.

**Housekeeping:** se sacó el freno `DDJJ_NO_IMPLEMENTADAS` en `generar.ts` (ya no hace falta, los 3 formularios están implementados) — los checkboxes de U/SOR/E1 en Tab Documentos ya generan el PDF real en vez de la advertencia "todavía no implementado".

**⚠️ Post-mortem (18 Julio 2026):** el checkbox de Tab Documentos para SOR y E1 había quedado con el texto viejo "todavía no implementado" y deshabilitado (nunca se actualizó al implementarlos) — corregido, ahora son tildables de verdad y con la misma validación de "faltan datos" que ya tenían el resto de los documentos.

**🐛 Bug reportado por Franco — "Guardar características del edificio" no guardaba:** el botón parecía no hacer nada — quedaba "Guardado correctamente" en verde, pero al volver a la Tab DDJJ el formulario aparecía en blanco y el checkbox "¿tiene construcciones?" destildado. Causa: `guardar_ddjj_e1` hacía el `insert`/`update` a la tabla `edificacion` sin chequear si la escritura fallaba — y aunque hubiera fallado, el mensaje de "Guardado correctamente" que se ve en pantalla depende únicamente de que la request haga el redirect final (no de si el guardado fue exitoso), así que un error silencioso quedaba completamente invisible. Se corrigió: ahora si el insert/update devuelve error, se corta con un redirect propio que muestra el detalle real (`warn=ddjj_e1_error&detalle=...`) en vez de seguir de largo. De paso se corrigió que un valor en `0` (ej. "Pileta de natación" o "Superficie destinada a negocios" en 0) se guardaba como vacío por un `|| null` que trata a `0` como falsy.

**Causa de fondo confirmada (20 Julio 2026):** con el fix de arriba, el error real salió a la luz: `permission denied for table edificacion`. No es RLS (esa da otro mensaje, o simplemente no devuelve filas) — es que el rol `authenticated` nunca tuvo permiso de Postgres sobre esa tabla. El `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated` que se corrió en su momento (ver "Notas de infraestructura Supabase" al final del documento) solo alcanza a las tablas que existían en ese instante — `edificacion` se creó después, en esta misma sesión, y quedó afuera. **Solución: correr en Supabase**
```sql
grant all on edificacion to anon, authenticated;
```
Ya agregado también al bloque de creación de la tabla más arriba, para que quien corra ese SQL desde cero no se tope con lo mismo.

Franco también pidió, por separado, que los datos cargados no se pierdan al cambiar de pestaña sin guardar (una especie de "caché" de borrador). Es un pedido de UX legítimo pero es una funcionalidad nueva, no parte de este bug — queda anotado para una próxima sesión si se confirma que hace falta.

---

## 📋 Cambios de la sesión — 8 Julio 2026 (v0.9) — Declaraciones Juradas, piloto Formulario U

Retomamos el punto pendiente "🔍 Análisis: Punto 6 — Revisión de DDJJ" (más abajo) ahora que tenemos las 3 plantillas reales de Franco (`FORMULARIO_U.pdf`, `FORMULARIO_SOR.pdf`, `FORMULARIO_E1.pdf`). Confirmado por código: los 3 son PDF planos, sin campos rellenables (AcroForm = 0 campos) — se generan dibujando el texto encima en coordenadas fijas, la plantilla se guarda tal cual en `public/pdf-templates/`.

**Diseño acordado:**
- Formulario U (urbano) y SOR (rural) no se eligen a mano: se auto-determinan por `inmueble.tipo_inmueble`.
- Formulario E1 (características constructivas) no es una alternativa, es un adicional para cuando el inmueble tiene construcciones — queda pendiente para la próxima etapa.
- Nueva **Tab 6 "DDJJ"** en la página de expediente, con los campos que estos formularios piden y que hoy no existían en NICA (agua corriente, cloacas, cantidad de personas, % de condominio, domicilio estructurado del comitente, etc.) — sin duplicar carga: son columnas nuevas en `inmuebles`, `comitentes` y `exp_comitentes`, no una sección aparte.

**Implementado en esta sesión — Formulario U completo, de punta a punta:**
- Tab 6 DDJJ: campos nuevos de Inmueble + un bloque por cada comitente ya cargado, con action `guardar_ddjj`.
- `generar.ts`: nuevo camino en el generador de PDFs — para `formulario_u` (y ya preparado para `formulario_sor`/`formulario_e1`), en vez de crear una hoja en blanco con membrete NICA, carga la plantilla oficial de Catastro y dibuja los datos encima en las coordenadas medidas. El resto de los 9 documentos existentes sigue exactamente igual (mismo camino de código que antes, solo se movió de lugar).
- Coordenadas calibradas contra la plantilla real en 3 rondas de prueba visual — quedaron bien ubicadas: Localidad, Calle/Fracción/Manzana/Lote, Tomo/Folio/Año, Superficie del terreno (toma directo el valor autocalculado de la sesión anterior), Agua corriente/Cloacas, cantidad de personas, último año pagado, receptoría, datos del propietario (Rubro 3, hasta 2 titulares — el formulario oficial no admite más sin su propio "Anexo A"), nombre del propietario anterior, y la declaración jurada de la página 3 (nombre, nacionalidad, documento, carácter, fecha).

**SQL a correr a mano en Supabase** (mismo procedimiento que las migraciones anteriores):
```sql
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS agua_corriente boolean;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS cloacas boolean;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS personas_habitan int;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS ultimo_anio_pago_impuesto text;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS receptoria text;

ALTER TABLE comitentes ADD COLUMN IF NOT EXISTS nacionalidad text;
ALTER TABLE comitentes ADD COLUMN IF NOT EXISTS tipo_documento text DEFAULT 'DNI';
ALTER TABLE comitentes ADD COLUMN IF NOT EXISTS domicilio_calle text;
ALTER TABLE comitentes ADD COLUMN IF NOT EXISTS domicilio_numero text;
ALTER TABLE comitentes ADD COLUMN IF NOT EXISTS domicilio_localidad text;
ALTER TABLE comitentes ADD COLUMN IF NOT EXISTS domicilio_provincia text;

ALTER TABLE exp_comitentes ADD COLUMN IF NOT EXISTS porcentaje_condominio numeric(5,2) DEFAULT 100;
ALTER TABLE exp_comitentes ADD COLUMN IF NOT EXISTS ausente_pais boolean DEFAULT false;
```
Aditivo, no afecta nada existente — todos los expedientes actuales quedan con estos campos vacíos hasta que se carguen desde la Tab DDJJ.

**Ajuste posterior — limpieza de las referencias en rojo de la plantilla:** la plantilla original de Catastro trae, en rojo, los números de referencia que Franco fue marcando al analizar qué dato va en cada casillero ("2.3", "3.6", etc. — son 11 en total). Se probó taparlos con rectángulos blancos calculando su posición a mano, pero medir esas coordenadas contra la imagen no daba la precisión necesaria y en un intento incluso se llegó a tapar por error parte de un encabezado real. La solución que quedó, mucho más robusta: se abrió el archivo `formulario_u.pdf`, se ubicó el color de relleno que usa ese texto en rojo (`1.0 0 0` en el content stream del PDF) y se cambió por blanco (`1.0 1.0 1.0`) directamente ahí — mismo texto, mismas coordenadas, ahora invisible, sin depender de acertar ninguna posición ni tocar ninguna línea de la grilla. El único rectángulo que sigue en el código es el del párrafo de ejemplo de la página de la declaración (que es texto negro, no rojo, y sí necesita taparse a mano porque se reemplaza por el párrafo real). Esta misma técnica es la que conviene usar directamente para SOR y E1 cuando se les llegue el turno, en vez de repetir el proceso de prueba y error con rectángulos.

**Pulido posterior (mismo día, varias rondas con capturas de Juan):**
- Los datos escritos (Calle, Fracción/Manzana/Lote, Tomo/Folio/Año, Superficie, Rubro 3) quedaron centrados dentro de su casillero — antes quedaban pegados contra el borde superior.
- Los tildes de Sí/No (agua corriente, cloacas, ausente del país) se marcan con una **X en negrita** sobre el casillero correspondiente (se probó pintar el casillero de gris, pero Franco prefirió volver a la X; el tamaño se ajustó para que cruce el casillero sin tapar del todo la letra S/I o N/O impresa detrás).
- La plantilla trae impreso en negro (no en rojo, por eso no lo tapaba la limpieza de más arriba) un "100" y un "DNI" de ejemplo en Rubro 3. Tapar ese texto con un rectángulo terminaba cortando alguna línea de la grilla en distintos intentos — la solución que quedó: cuando el dato real coincide con ese ejemplo (100% de condominio, documento DNI — el caso más común), directamente **no se escribe nada encima**, se deja el impreso de la plantilla. Solo se escribe cuando el dato real es distinto.
- El casillero de "Folio" es angosto y la etiqueta se parte en "FOLI"/"O" — el valor se corrió para no pisar esa "O".
- El casillero de "Último año pagado de impuesto" es de un dígito por celda — el año se reparte dígito por dígito en vez de escribirse corrido.
- Se investigó el "recuadro blanco que corta líneas" reportado en un par de capturas: se confirmó contra el content stream del PDF que los 11 textos convertidos de rojo a blanco son todos texto (ninguno es una figura/rectángulo de relleno), así que no viene de ahí — se lo asoció al tamaño grande de la X (se venía probando en 12pt) y se corrigió a un tamaño más moderado (9pt).
- LOCALIDAD: se había tapado con un rectángulo y redibujado como "LOCALIDAD: valor" — Franco pidió que quede igual que en la plantilla original (valor solo, en el renglón en blanco que ya trae la plantilla arriba de la etiqueta "LOCALIDAD", sin ningún tapado). Como el "3.1" de ese renglón ya es invisible por la limpieza de rojo→blanco, no hace falta ningún rectángulo: el valor se escribe directo ahí.
- El año de "Último año pagado" se corrigió un casillero (arrancaba un dígito corrido a la derecha de lo que correspondía).

**Pendiente para la próxima sesión:** replicar el mismo mecanismo para Formulario SOR (mismas tablas, ya extendidas — solo cambian los campos de ubicación rural y sus coordenadas) y armar Formulario E1 (tabla nueva `edificacion`, grilla de características constructivas). Ver plan completo guardado en la sesión. → **Hecho, ver changelog v0.10 más arriba.**

---

## 📋 Cambios de la sesión — 8 Julio 2026 (v0.8)

### 1. Linderos: se resolvió el punto pendiente de la sesión anterior

Franco aclaró cómo es el proceso real: primero se releva quién linda con el inmueble para armar la **citación** (notificación previa a los vecinos), y después, el día de la mensura, se vuelve a constatar en el lugar — normalmente son los mismos linderos, salvo algún caso excepcional (ej. un ocupante ilegal).

**Cambio de tabs** (`src/pages/expedientes/[id].astro`):
- **Tab 2 Inmueble**: ahora tiene la carga completa de "Linderos" (Norte/Sur/Este/Oeste), junto a "Referencias para notificación a linderos". Es el único lugar donde se cargan los linderos de citación.
- **Tab 3 Mensura**: el bloque de linderos dejó de estar dividido en "Linderos Mensura" / "Linderos Citación". Ahora es un solo bloque **"Linderos"** que por defecto muestra los mismos valores cargados en Inmueble, deshabilitados. Hay un checkbox **"Usar los mismos linderos que en la citación"**, tildado por defecto — si al hacer la mensura encontrás que cambió alguno, lo destildás y podés corregir esos 4 campos a mano, sin afectar lo cargado en Inmueble.

**Por qué sigue funcionando bien en los documentos:** "Notificación a Linderos" y "Acta de Ausencia de Linderos" (documentos de la etapa previa) usan los valores de citación (cargados en Inmueble). "Acta de Mensura" y el "Capítulo" (documentos de la mensura en el lugar) usan los valores de mensura — que son los mismos que citación salvo que se haya corregido a mano. De paso se corrigió un detalle interno (`valorLindero` en `generar.ts`) que, con el flujo nuevo, podía dejar la Notificación a Linderos vacía en lugar de mostrar el valor recién cargado en Inmueble.

Con esto queda cerrado el punto que había quedado abierto en la sesión del 6/7 (ver más abajo): los campos de "Referencias" en Inmueble y los linderos ya no son dos cargas separadas — es un solo dato, cargado una sola vez.

**⚠️ Nota sobre expedientes de prueba viejos:** el checkbox "iguales" es la misma columna (`linderos_iguales`) que ya existía, pero le dimos vuelta el sentido (antes controlaba si citación copiaba a mensura; ahora controla si mensura copia a citación). En expedientes de prueba creados antes de este cambio, el valor guardado de esa columna puede quedar "invertido" respecto a lo que se ve ahora — por eso puede aparecer Tab Mensura con un valor viejo distinto al de Tab Inmueble, aunque el dato en sí no se perdió. Se soluciona tildando y guardando una vez en Tab Mensura. Como todos los expedientes actuales son de prueba, no afecta datos reales — pero vale tenerlo presente si algo se ve "desincronizado" al revisar casos viejos.

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

> **Estado: ✅ completo (17 Julio 2026, v0.10)** — Formulario U, SOR y E1 implementados de punta a punta (ver changelog v0.10 y v0.9 más arriba). El análisis de abajo se mantiene como referencia; terminó siendo el **Enfoque B** (plantilla plana, sin AcroForm).

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
