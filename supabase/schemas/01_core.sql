-- Esquema declarativo base para una futura migración a Supabase.
-- Contiene sólo DDL; no crea usuarios, organizaciones ni datos semilla.

create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  user_id uuid not null
    references auth.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx
  on public.organization_members (user_id);

create table public.codigos (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  id text not null,
  nombre text not null,
  categoria text,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  clave text,
  aliases text[] not null default '{}'::text[],
  prioridad integer not null default 100 check (prioridad >= 0),
  primary key (organization_id, id)
);

create table public.reglas (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  id text not null,
  nombre text not null,
  activa boolean not null default true,
  campo text not null,
  operador text not null,
  valor text not null default '',
  accion jsonb not null default '{}'::jsonb,
  prioridad integer not null default 99,
  created_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table public.bancos (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, nombre),
  constraint bancos_nombre_check
    check (nombre = btrim(nombre) and length(nombre) between 2 and 80)
);

create unique index bancos_org_nombre_lower_uidx
  on public.bancos (organization_id, lower(nombre));

create table public.importaciones (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  import_id text not null,
  nombre_archivo text not null,
  modo text not null check (modo in ('agregar', 'reemplazar')),
  filas integer not null check (filas >= 0),
  insertadas integer,
  omitidas integer,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (organization_id, import_id)
);

create index importaciones_created_by_idx
  on public.importaciones (created_by);

create table public.transacciones (
  id text primary key,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  fuente text not null check (fuente in ('banco', 'contabilidad')),
  banco text,
  fecha date not null,
  monto numeric not null,
  saldo numeric,
  descripcion text not null,
  rut text,
  categoria text,
  codigo_id text,
  codigo_origen text check (
    codigo_origen is null or codigo_origen in (
      'explicito', 'id', 'clave', 'alias', 'nombre',
      'perfil', 'contraparte', 'manual'
    )
  ),
  codigo_confianza numeric check (
    codigo_confianza is null
    or codigo_confianza between 0 and 1
  ),
  codigo_evidencia text,
  estado text not null default 'no_conciliada'
    check (estado in ('conciliada', 'pendiente', 'no_conciliada', 'sugerida')),
  match_id text,
  confianza numeric check (confianza is null or confianza between 0 and 1),
  documento text,
  external_id text,
  contraparte text,
  codigo_tipo_doc text,
  iva_total numeric,
  iva_debito numeric,
  saldo_documento numeric,
  folio_referencia text,
  tipo_doc_referencia text,
  subtipo_documento text,
  proveedor text,
  tipo_doc text,
  folio text,
  exento numeric,
  neto numeric,
  iva_recup numeric,
  iva_nr numeric,
  fecha_vencimiento date,
  estado_pago text,
  metadatos jsonb not null default '{}'::jsonb,
  import_id text,
  row_fingerprint text,
  created_at timestamptz not null default now(),
  constraint transacciones_match_distinto_check
    check (match_id is null or match_id <> id),
  constraint transacciones_conciliada_con_match_check
    check (estado <> 'conciliada' or match_id is not null),
  constraint transacciones_match_id_fkey
    foreign key (match_id) references public.transacciones (id)
    deferrable initially deferred,
  constraint transacciones_codigo_fkey
    foreign key (organization_id, codigo_id)
    references public.codigos (organization_id, id)
);

create index transacciones_org_fecha_id_idx
  on public.transacciones (organization_id, fecha, id);
create index transacciones_match_id_idx
  on public.transacciones (match_id) where match_id is not null;
create index transacciones_org_codigo_idx
  on public.transacciones (organization_id, codigo_id)
  where codigo_id is not null;
create unique index transacciones_org_fingerprint_uidx
  on public.transacciones (organization_id, row_fingerprint)
  where row_fingerprint is not null;
create unique index transacciones_org_fuente_external_id_uidx
  on public.transacciones (organization_id, fuente, external_id)
  where external_id is not null and btrim(external_id) <> '';

create table public.importacion_pendientes (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  import_id text not null,
  nombre_archivo text not null,
  modo text not null check (modo in ('agregar', 'reemplazar')),
  total_esperado integer not null check (total_esperado between 1 and 20000),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (organization_id, import_id)
);

create index importacion_pendientes_created_idx
  on public.importacion_pendientes (created_at);
create index importacion_pendientes_created_by_idx
  on public.importacion_pendientes (created_by);

create table public.importacion_chunks (
  organization_id uuid not null,
  import_id text not null,
  chunk_no integer not null check (chunk_no >= 0),
  chunk_hash text not null,
  filas integer not null check (filas between 1 and 1000),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  created_at timestamptz not null default now(),
  primary key (organization_id, import_id, chunk_no),
  foreign key (organization_id, import_id)
    references public.importacion_pendientes (organization_id, import_id)
    on delete cascade
);

create table public.sync_operaciones (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  sync_id text not null,
  total_esperado integer not null check (total_esperado between 1 and 100000),
  completada boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (organization_id, sync_id)
);

create index sync_operaciones_created_idx
  on public.sync_operaciones (created_at);
create index sync_operaciones_created_by_idx
  on public.sync_operaciones (created_by);

create table public.sync_chunks (
  organization_id uuid not null,
  sync_id text not null,
  chunk_no integer not null check (chunk_no >= 0),
  chunk_hash text not null,
  filas integer not null check (filas between 1 and 1000),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  created_at timestamptz not null default now(),
  primary key (organization_id, sync_id, chunk_no),
  foreign key (organization_id, sync_id)
    references public.sync_operaciones (organization_id, sync_id)
    on delete cascade
);
