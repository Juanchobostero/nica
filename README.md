# NICA — Sistema de Gestión de Mensuras

Aplicación web para la gestión de expedientes de mensura del agrimensor **Franco Arturo Nigro Carriere** (Corrientes, Argentina).

Permite cargar los datos de cada expediente y generar automáticamente los documentos PDF oficiales (Nota de Elevación, Acta de Mensura, Citación a Linderos, etc.).

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend / Backend | Astro 6 (SSR) |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth — email + password |
| Storage PDFs | Supabase Storage |
| Generación PDF | pdf-lib |
| Estilos | CSS variables puras |
| Deploy | Vercel (pendiente) |

---

## Configuración local

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
PUBLIC_SUPABASE_URL=tu_url_de_supabase
PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 3. Levantar servidor de desarrollo

```bash
pnpm dev
```

La app queda disponible en `http://localhost:4321`.

---

## Comandos disponibles

| Comando | Acción |
|---------|--------|
| `pnpm dev` | Servidor de desarrollo en `localhost:4321` |
| `pnpm build` | Build de producción en `./dist/` |
| `pnpm preview` | Preview del build antes de deployar |

---

## Estructura del proyecto

```
src/
├── lib/
│   └── supabase.ts           # Cliente Supabase (anon + autenticado)
├── styles/
│   └── global.css            # Variables CSS, componentes base
├── layouts/
│   ├── AuthLayout.astro      # Layout para login
│   └── AppLayout.astro       # Layout principal con sidebar
├── components/
│   └── sidebar/Sidebar.astro
└── pages/
    ├── index.astro            # Redirect a /dashboard o /login
    ├── login.astro
    ├── dashboard.astro
    ├── perfil.astro
    ├── expedientes/
    │   ├── index.astro        # Lista de expedientes
    │   ├── nuevo.astro        # Crear expediente
    │   └── [id].astro         # Edición (5 tabs)
    ├── comitentes/
    │   └── index.astro
    └── api/
        ├── auth/logout.ts
        └── documentos/
            ├── generar.ts     # Genera PDF + sube a Storage
            └── descargar.ts   # URL firmada de descarga
```

---

## Supabase — configuración requerida

El schema de tablas está en `supabase/schema.sql`.

Luego de crear las tablas, aplicar los siguientes grants en el SQL Editor:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```

Para el Storage (bucket `documentos`):

```sql
CREATE POLICY "Documentos: subir"    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');
CREATE POLICY "Documentos: leer"     ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documentos');
CREATE POLICY "Documentos: eliminar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documentos');
```

---

## Estado del proyecto

Ver [ESTADO_PROYECTO.md](./ESTADO_PROYECTO.md) para el detalle de funcionalidades implementadas y pendientes.
