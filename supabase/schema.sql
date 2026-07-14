-- ============================================================
-- NICA — Schema completo + RLS
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── profiles ──────────────────────────────────────────────
create table if not exists profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nombre              text,
  apellido            text,
  dni                 text,
  matricula           text, -- Matrícula del Consejo Profesional
  matricula_catastro  text, -- Matrícula de la Dirección Gral. de Catastro
  telefono            text,
  email               text,
  domicilio           text,
  created_at          timestamptz default now()
);

alter table profiles enable row level security;

create policy "Usuario ve su propio perfil"
  on profiles for select using (auth.uid() = id);

create policy "Usuario actualiza su propio perfil"
  on profiles for insert with check (auth.uid() = id);

create policy "Usuario edita su propio perfil"
  on profiles for update using (auth.uid() = id);


-- ── comitentes ────────────────────────────────────────────
create table if not exists comitentes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  nombre      text,
  apellido    text,
  dni         text,
  domicilio   text,
  telefono    text,
  email       text,
  dni_scan_path        text,
  dni_scan_path_dorso  text,
  created_at  timestamptz default now(),
  -- Para Declaraciones Juradas (Formulario U / SOR): datos de la persona, se
  -- reusan solos entre expedientes distintos del mismo comitente.
  nacionalidad          text,
  tipo_documento        text default 'DNI', -- 'DNI' | 'LC' | 'LE'
  domicilio_calle       text,
  domicilio_numero      text,
  domicilio_localidad   text,
  domicilio_provincia   text
);

alter table comitentes enable row level security;

create policy "Comitentes: CRUD propio"
  on comitentes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ── testigos ──────────────────────────────────────────────
create table if not exists testigos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  nombre      text,
  apellido    text,
  dni         text,
  domicilio   text,
  created_at  timestamptz default now()
);

alter table testigos enable row level security;

create policy "Testigos: CRUD propio"
  on testigos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ── expedientes ───────────────────────────────────────────
create table if not exists expedientes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade not null,
  numero_expediente   text,
  tipo_mensura        text,
  estado              text default 'borrador' check (estado in ('borrador','en_proceso','finalizado')),
  fecha_inicio        date,
  hora_mensura        text,
  fecha_cierre        date,
  observaciones       text,
  area_catastro       text,
  eliminado_at        timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

alter table expedientes enable row level security;

create policy "Expedientes: CRUD propio"
  on expedientes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger expedientes_updated_at
  before update on expedientes
  for each row execute function update_updated_at();


-- ── exp_comitentes ────────────────────────────────────────
create table if not exists exp_comitentes (
  id              uuid primary key default gen_random_uuid(),
  expediente_id   uuid references expedientes(id) on delete cascade not null,
  comitente_id    uuid references comitentes(id) on delete cascade not null,
  rol             text default 'titular' check (rol in ('titular','apoderado','heredero','poseedor')),
  orden           int default 1,
  -- Para Declaraciones Juradas: propios de esta relación expediente↔comitente,
  -- no de la persona en general (el mismo comitente puede tener % distinto en otro expediente).
  porcentaje_condominio  numeric(5,2) default 100,
  ausente_pais           boolean default false
);

alter table exp_comitentes enable row level security;

create policy "exp_comitentes: acceso via expediente propio"
  on exp_comitentes for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = exp_comitentes.expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = exp_comitentes.expediente_id and e.user_id = auth.uid()
    )
  );


-- ── exp_testigos ──────────────────────────────────────────
create table if not exists exp_testigos (
  id              uuid primary key default gen_random_uuid(),
  expediente_id   uuid references expedientes(id) on delete cascade not null,
  testigo_id      uuid references testigos(id) on delete cascade not null
);

alter table exp_testigos enable row level security;

create policy "exp_testigos: acceso via expediente propio"
  on exp_testigos for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = exp_testigos.expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = exp_testigos.expediente_id and e.user_id = auth.uid()
    )
  );


-- ── inmuebles ─────────────────────────────────────────────
create table if not exists inmuebles (
  id                    uuid primary key default gen_random_uuid(),
  expediente_id         uuid references expedientes(id) on delete cascade not null unique,
  departamento          text,
  localidad             text,
  circunscripcion       text,
  seccion               text,
  fraccion              text,
  manzana               text,
  parcela               text,
  subparcela            text,
  matricula_catastral   text,
  matricula_registro    text,
  matricula_municipal   text,
  registro_tomo         text,
  registro_folio        text,
  registro_anio         text,
  antecedentes_tecnicos         text,
  propietario_anterior          text,
  calle_frente                  text,
  calle_entre1                  text,
  calle_entre2                  text,
  tipo_inmueble                 text check (tipo_inmueble in ('urbano','rural')),
  tipo_inscripcion_registro     text default 'matricula',  -- 'matricula' | 'tomo'
  registro_finca                text,                      -- para inscripción por tomo (anterior al 87)
  inscripcion_mayor_extension   boolean default false,     -- inscripto en mayor extensión
  -- Para Declaraciones Juradas (Formulario U / SOR)
  agua_corriente                 boolean,
  cloacas                        boolean,
  personas_habitan               int,
  ultimo_anio_pago_impuesto      text,
  receptoria                     text
);

alter table inmuebles enable row level security;

create policy "Inmuebles: acceso via expediente propio"
  on inmuebles for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = inmuebles.expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = inmuebles.expediente_id and e.user_id = auth.uid()
    )
  );


-- ── poligono ──────────────────────────────────────────────
-- Nota: un expediente puede tener varios polígonos (división en parcelas).
-- Cada fila cubre una parcela o un rango de parcelas con medidas idénticas
-- (parcela_desde = parcela_hasta para una parcela individual).
create table if not exists poligono (
  id                  uuid primary key default gen_random_uuid(),
  expediente_id       uuid references expedientes(id) on delete cascade not null,
  parcela_desde       int default 1,
  parcela_hasta       int default 1,
  superficie_m2       numeric(14,4),
  superficie_letras   text,
  cantidad_lados      int default 0,
  cantidad_angulos    int default 0,
  -- false (default): superficie_m2 se recalcula solo a partir de lados/ángulos (fórmula de Gauss).
  -- true: el agrimensor forzó un valor manual y no se pisa con el cálculo automático.
  superficie_manual   boolean default false
);

alter table poligono enable row level security;

create policy "Poligono: acceso via expediente propio"
  on poligono for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = poligono.expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = poligono.expediente_id and e.user_id = auth.uid()
    )
  );


-- ── lados ─────────────────────────────────────────────────
create table if not exists lados (
  id              uuid primary key default gen_random_uuid(),
  poligono_id     uuid references poligono(id) on delete cascade not null,
  orden           int not null,
  valor_m         numeric(10,4),
  valor_letras    text,
  rumbo           text
);

alter table lados enable row level security;

create policy "Lados: acceso via poligono → expediente propio"
  on lados for all
  using (
    exists (
      select 1 from poligono p
      join expedientes e on e.id = p.expediente_id
      where p.id = lados.poligono_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from poligono p
      join expedientes e on e.id = p.expediente_id
      where p.id = lados.poligono_id and e.user_id = auth.uid()
    )
  );


-- ── angulos ───────────────────────────────────────────────
create table if not exists angulos (
  id              uuid primary key default gen_random_uuid(),
  poligono_id     uuid references poligono(id) on delete cascade not null,
  orden           int not null,
  grados          int,
  minutos         int,
  segundos        numeric(5,2),
  valor_letras    text
);

alter table angulos enable row level security;

create policy "Angulos: acceso via poligono → expediente propio"
  on angulos for all
  using (
    exists (
      select 1 from poligono p
      join expedientes e on e.id = p.expediente_id
      where p.id = angulos.poligono_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from poligono p
      join expedientes e on e.id = p.expediente_id
      where p.id = angulos.poligono_id and e.user_id = auth.uid()
    )
  );


-- ── linderos ──────────────────────────────────────────────
create table if not exists linderos (
  id                  uuid primary key default gen_random_uuid(),
  expediente_id       uuid references expedientes(id) on delete cascade not null unique,
  norte_mensura       text,
  sur_mensura         text,
  este_mensura        text,
  oeste_mensura       text,
  norte_citacion      text,
  sur_citacion        text,
  este_citacion       text,
  oeste_citacion      text,
  linderos_iguales    boolean default true
);

alter table linderos enable row level security;

create policy "Linderos: acceso via expediente propio"
  on linderos for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = linderos.expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = linderos.expediente_id and e.user_id = auth.uid()
    )
  );


-- ── documentos_generados ──────────────────────────────────
create table if not exists documentos_generados (
  id              uuid primary key default gen_random_uuid(),
  expediente_id   uuid references expedientes(id) on delete cascade not null,
  tipo_documento  text not null,
  storage_path    text,
  estado          text default 'generado' check (estado in ('generado','archivado')),
  generado_at     timestamptz default now()
);

alter table documentos_generados enable row level security;

create policy "Documentos: acceso via expediente propio"
  on documentos_generados for all
  using (
    exists (
      select 1 from expedientes e
      where e.id = documentos_generados.expediente_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from expedientes e
      where e.id = documentos_generados.expediente_id and e.user_id = auth.uid()
    )
  );


-- ── Storage bucket ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy "Documentos storage: acceso autenticado"
  on storage.objects for all
  using (bucket_id = 'documentos' and auth.role() = 'authenticated')
  with check (bucket_id = 'documentos' and auth.role() = 'authenticated');
