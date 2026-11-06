-- >>> supabase/schemas/01_core.sql
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


-- >>> supabase/schemas/02_functions.sql
-- Funciones, RPC y triggers compatibles con Supabase/PostgREST.

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select om.organization_id
  from public.organization_members as om
  where om.user_id = auth.uid()
  order by
    case om.role when 'admin' then 0 when 'member' then 1 else 2 end,
    om.created_at
  limit 1
$function$;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select exists (
    select 1
    from public.organization_members as om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
  )
$function$;

create or replace function public.set_row_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
begin
  if v_organization_id is null then
    raise exception 'el usuario no pertenece a una organización';
  end if;
  if new.organization_id is null then
    new.organization_id := v_organization_id;
  elsif new.organization_id <> v_organization_id then
    raise exception 'organización no autorizada';
  end if;

  return new;
end;
$function$;

create or replace function public.transaction_canonical(
  p_fuente text,
  p_banco text,
  p_fecha date,
  p_monto numeric,
  p_descripcion text,
  p_rut text,
  p_documento text,
  p_tipo_doc text,
  p_folio text,
  p_proveedor text
)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
  select concat(
    coalesce(p_fuente, ''), '|',
    coalesce(p_banco, ''), '|',
    coalesce(p_fecha::text, ''), '|',
    coalesce(p_monto::text, ''), '|',
    lower(btrim(coalesce(p_descripcion, ''))), '|',
    coalesce(p_rut, ''), '|',
    coalesce(p_documento, ''), '|',
    coalesce(p_tipo_doc, ''), '|',
    coalesce(p_folio, ''), '|',
    coalesce(p_proveedor, '')
  )
$function$;

create or replace function public.transaction_hash(p_text text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_a bigint := 2166136261;
  v_b bigint := 2654435769;
  v_code bigint;
  v_index integer;
begin
  for v_index in 1..char_length(p_text) loop
    v_code := ascii(substr(p_text, v_index, 1));
    v_a := mod((v_a # v_code)::numeric * 16777619, 4294967296)::bigint;
    v_b := mod((v_b # v_code)::numeric * 2246822507, 4294967296)::bigint;
  end loop;

  return lpad(to_hex(v_a), 8, '0') || lpad(to_hex(v_b), 8, '0');
end;
$function$;

create or replace function public.validate_transaction_fingerprint()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_expected text;
begin
  if new.row_fingerprint is null then
    return new;
  end if;

  v_expected := public.transaction_hash(public.transaction_canonical(
    new.fuente,
    new.banco,
    new.fecha,
    new.monto,
    new.descripcion,
    new.rut,
    new.documento,
    new.tipo_doc,
    new.folio,
    new.proveedor
  ));

  if new.row_fingerprint !~ '^[0-9a-f]{16}-[1-9][0-9]*$'
    or split_part(new.row_fingerprint, '-', 1) <> v_expected then
    raise exception 'fingerprint de transacción inválido';
  end if;

  return new;
end;
$function$;

create or replace function public.clear_codigo_from_transactions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  update public.transacciones
  set
    codigo_id = null,
    codigo_origen = null,
    codigo_confianza = null,
    codigo_evidencia = null
  where organization_id = old.organization_id
    and codigo_id = old.id;

  return old;
end;
$function$;

create or replace function public.import_transacciones(
  p_import_id text,
  p_nombre_archivo text,
  p_modo text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
  v_total integer;
  v_insertadas integer := 0;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;
  if p_import_id is null
    or length(btrim(p_import_id)) < 8
    or length(p_import_id) > 160 then
    raise exception 'import_id inválido';
  end if;
  if p_modo not in ('agregar', 'reemplazar') then
    raise exception 'modo de importación inválido';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows debe ser un arreglo JSON';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total not between 1 and 20000 then
    raise exception 'la importación debe contener entre 1 y 20000 filas';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_organization_id::text, 0));

  if exists (
    select 1
    from public.importaciones as i
    where i.organization_id = v_organization_id
      and i.import_id = p_import_id
  ) then
    return jsonb_build_object(
      'insertadas', 0,
      'omitidas', v_total,
      'ya_importado', true
    );
  end if;

  if p_modo = 'reemplazar' then
    delete from public.transacciones
    where organization_id = v_organization_id;
  end if;

  insert into public.transacciones (
    id, organization_id, fuente, banco, fecha, monto, saldo, descripcion,
    rut, categoria, codigo_id, codigo_origen, codigo_confianza,
    codigo_evidencia, estado, match_id, confianza, documento, external_id,
    contraparte, codigo_tipo_doc, iva_total, iva_debito, saldo_documento,
    folio_referencia, tipo_doc_referencia, subtipo_documento, proveedor,
    tipo_doc, folio, exento, neto, iva_recup, iva_nr, fecha_vencimiento,
    estado_pago, metadatos, import_id, row_fingerprint
  )
  select
    v_organization_id::text || ':' || r.id,
    v_organization_id,
    r.fuente,
    r.banco,
    r.fecha,
    r.monto,
    r.saldo,
    r.descripcion,
    r.rut,
    r.categoria,
    nullif(upper(btrim(r.codigo_id)), ''),
    r.codigo_origen,
    r.codigo_confianza,
    r.codigo_evidencia,
    'no_conciliada',
    null,
    null,
    r.documento,
    nullif(btrim(r.external_id), ''),
    r.contraparte,
    r.codigo_tipo_doc,
    r.iva_total,
    r.iva_debito,
    r.saldo_documento,
    r.folio_referencia,
    r.tipo_doc_referencia,
    r.subtipo_documento,
    r.proveedor,
    r.tipo_doc,
    r.folio,
    r.exento,
    r.neto,
    r.iva_recup,
    r.iva_nr,
    r.fecha_vencimiento,
    r.estado_pago,
    coalesce(r.metadatos, '{}'::jsonb),
    p_import_id,
    r.row_fingerprint
  from jsonb_to_recordset(p_rows) as r(
    id text,
    fuente text,
    banco text,
    fecha date,
    monto numeric,
    saldo numeric,
    descripcion text,
    rut text,
    categoria text,
    codigo_id text,
    codigo_origen text,
    codigo_confianza numeric,
    codigo_evidencia text,
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
    metadatos jsonb,
    row_fingerprint text
  )
  where r.id is not null
    and r.id <> ''
    and r.row_fingerprint is not null
    and r.row_fingerprint <> ''
    and r.fuente in ('banco', 'contabilidad')
    and r.fecha is not null
    and r.monto is not null
    and r.descripcion is not null
    and r.descripcion <> ''
    and (
      r.codigo_id is null
      or btrim(r.codigo_id) = ''
      or exists (
        select 1
        from public.codigos as c
        where c.organization_id = v_organization_id
          and c.id = upper(btrim(r.codigo_id))
          and c.activo
      )
    )
  on conflict do nothing;

  get diagnostics v_insertadas = row_count;
  if v_insertadas = 0 and p_modo = 'reemplazar' then
    raise exception 'ninguna fila válida pudo importarse';
  end if;

  insert into public.importaciones (
    organization_id,
    import_id,
    nombre_archivo,
    modo,
    filas,
    insertadas,
    omitidas,
    created_by
  ) values (
    v_organization_id,
    p_import_id,
    coalesce(nullif(btrim(p_nombre_archivo), ''), 'archivo'),
    p_modo,
    v_total,
    v_insertadas,
    v_total - v_insertadas,
    auth.uid()
  );

  return jsonb_build_object(
    'insertadas', v_insertadas,
    'omitidas', v_total - v_insertadas,
    'ya_importado', false
  );
end;
$function$;

create or replace function public.clear_transacciones()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;

  delete from public.sync_operaciones
  where organization_id = v_organization_id;
  delete from public.importacion_pendientes
  where organization_id = v_organization_id;
  delete from public.transacciones
  where organization_id = v_organization_id;
  delete from public.importaciones
  where organization_id = v_organization_id;
end;
$function$;

create or replace function public.sync_transacciones(p_cambios jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'p_cambios debe ser un arreglo JSON';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_cambios) as c(id text)
    where c.id is null or c.id = ''
  ) then
    raise exception 'cada cambio debe incluir un id';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_cambios) as c(id text)
    group by c.id
    having count(*) > 1
  ) then
    raise exception 'un id no puede aparecer más de una vez en el lote';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_cambios) as c(id text)
    left join public.transacciones as t
      on t.id = c.id
      and t.organization_id = v_organization_id
    where t.id is null
  ) then
    raise exception 'el lote contiene una transacción inexistente o no autorizada';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_cambios) as c(codigo_id text)
    left join public.codigos as codigo
      on codigo.organization_id = v_organization_id
      and codigo.id = upper(btrim(c.codigo_id))
      and codigo.activo
    where c.codigo_id is not null
      and btrim(c.codigo_id) <> ''
      and codigo.id is null
  ) then
    raise exception 'el lote contiene un código inexistente, inactivo o no autorizado';
  end if;

  update public.transacciones as destino
  set
    estado = c.estado,
    match_id = c.match_id,
    confianza = c.confianza,
    categoria = c.categoria,
    codigo_id = nullif(upper(btrim(c.codigo_id)), ''),
    codigo_origen = case
      when nullif(btrim(c.codigo_id), '') is null then null
      else c.codigo_origen
    end,
    codigo_confianza = case
      when nullif(btrim(c.codigo_id), '') is null then null
      else c.codigo_confianza
    end,
    codigo_evidencia = case
      when nullif(btrim(c.codigo_id), '') is null then null
      else c.codigo_evidencia
    end
  from jsonb_to_recordset(p_cambios) as c(
    id text,
    estado text,
    match_id text,
    confianza numeric,
    categoria text,
    codigo_id text,
    codigo_origen text,
    codigo_confianza numeric,
    codigo_evidencia text
  )
  where destino.id = c.id
    and destino.organization_id = v_organization_id;

  if exists (
    select 1
    from public.transacciones as a
    left join public.transacciones as b on b.id = a.match_id
    where a.organization_id = v_organization_id
      and a.match_id is not null
      and (
        b.id is null
        or b.organization_id <> v_organization_id
        or b.match_id is distinct from a.id
        or b.estado is distinct from a.estado
        or b.fuente = a.fuente
      )
  ) then
    raise exception 'el lote deja conciliaciones no recíprocas';
  end if;
end;
$function$;

create or replace function public.begin_importacion(
  p_import_id text,
  p_nombre_archivo text,
  p_modo text,
  p_total_esperado integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
  v_completada record;
  v_pendiente record;
  v_chunks integer := 0;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;
  if p_import_id is null
    or length(btrim(p_import_id)) < 8
    or length(p_import_id) > 160 then
    raise exception 'import_id inválido';
  end if;
  if p_modo not in ('agregar', 'reemplazar') then
    raise exception 'modo de importación inválido';
  end if;
  if p_total_esperado is null
    or p_total_esperado not between 1 and 20000 then
    raise exception 'la importación debe contener entre 1 y 20000 filas';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':' || p_import_id, 0)
  );

  select modo, filas, insertadas, omitidas
  into v_completada
  from public.importaciones
  where organization_id = v_organization_id
    and import_id = p_import_id;

  if found then
    if v_completada.modo <> p_modo
      or v_completada.filas <> p_total_esperado then
      raise exception 'el identificador ya existe con otros parámetros';
    end if;

    return jsonb_build_object(
      'ya_importado', true,
      'insertadas', coalesce(v_completada.insertadas, v_completada.filas),
      'omitidas', coalesce(v_completada.omitidas, 0)
    );
  end if;

  select modo, total_esperado
  into v_pendiente
  from public.importacion_pendientes
  where organization_id = v_organization_id
    and import_id = p_import_id;

  if found then
    if v_pendiente.modo <> p_modo
      or v_pendiente.total_esperado <> p_total_esperado then
      raise exception 'la carga pendiente tiene otros parámetros';
    end if;

    select count(*)
    into v_chunks
    from public.importacion_chunks
    where organization_id = v_organization_id
      and import_id = p_import_id;

    return jsonb_build_object(
      'ya_importado', false,
      'reanudada', true,
      'chunks', v_chunks
    );
  end if;

  delete from public.importacion_pendientes
  where organization_id = v_organization_id
    and created_by = auth.uid()
    and created_at < now() - interval '24 hours';

  insert into public.importacion_pendientes (
    organization_id,
    import_id,
    nombre_archivo,
    modo,
    total_esperado,
    created_by
  ) values (
    v_organization_id,
    p_import_id,
    coalesce(nullif(btrim(p_nombre_archivo), ''), 'archivo'),
    p_modo,
    p_total_esperado,
    auth.uid()
  );

  return jsonb_build_object(
    'ya_importado', false,
    'reanudada', false,
    'chunks', 0
  );
end;
$function$;

create or replace function public.upload_importacion_chunk(
  p_import_id text,
  p_chunk_no integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
  v_esperadas integer;
  v_filas integer;
  v_acumuladas integer;
  v_hash text;
  v_existente record;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;
  if p_chunk_no is null or p_chunk_no < 0 or p_chunk_no > 1000 then
    raise exception 'número de bloque inválido';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'el bloque debe ser un arreglo JSON';
  end if;

  v_filas := jsonb_array_length(p_rows);
  if v_filas not between 1 and 1000 then
    raise exception 'cada bloque debe contener entre 1 y 1000 filas';
  end if;
  if octet_length(p_rows::text) > 700000 then
    raise exception 'el bloque supera el máximo de 700000 bytes';
  end if;

  v_hash := md5(p_rows::text);
  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':' || p_import_id, 0)
  );

  select total_esperado
  into v_esperadas
  from public.importacion_pendientes
  where organization_id = v_organization_id
    and import_id = p_import_id;

  if not found then
    raise exception 'no existe una carga pendiente para este archivo';
  end if;

  select chunk_hash, filas
  into v_existente
  from public.importacion_chunks
  where organization_id = v_organization_id
    and import_id = p_import_id
    and chunk_no = p_chunk_no;

  if found then
    if v_existente.chunk_hash <> v_hash
      or v_existente.filas <> v_filas then
      raise exception 'el bloque ya existe con contenido diferente';
    end if;

    return jsonb_build_object(
      'guardado', true,
      'ya_existia', true,
      'chunk', p_chunk_no,
      'filas', v_filas
    );
  end if;

  select coalesce(sum(filas), 0)
  into v_acumuladas
  from public.importacion_chunks
  where organization_id = v_organization_id
    and import_id = p_import_id;

  if v_acumuladas + v_filas > v_esperadas then
    raise exception 'los bloques superan el total esperado';
  end if;

  insert into public.importacion_chunks (
    organization_id,
    import_id,
    chunk_no,
    chunk_hash,
    filas,
    rows
  ) values (
    v_organization_id,
    p_import_id,
    p_chunk_no,
    v_hash,
    v_filas,
    p_rows
  );

  return jsonb_build_object(
    'guardado', true,
    'ya_existia', false,
    'chunk', p_chunk_no,
    'filas', v_filas
  );
end;
$function$;

create or replace function public.finalize_importacion(p_import_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
  v_completada record;
  v_pendiente record;
  v_total integer;
  v_chunks integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_rows jsonb;
  v_resultado jsonb;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':' || p_import_id, 0)
  );

  select modo, filas, insertadas, omitidas
  into v_completada
  from public.importaciones
  where organization_id = v_organization_id
    and import_id = p_import_id;

  if found then
    return jsonb_build_object(
      'insertadas', coalesce(v_completada.insertadas, v_completada.filas),
      'omitidas', coalesce(v_completada.omitidas, 0),
      'ya_importado', true
    );
  end if;

  select nombre_archivo, modo, total_esperado
  into v_pendiente
  from public.importacion_pendientes
  where organization_id = v_organization_id
    and import_id = p_import_id;

  if not found then
    raise exception 'no existe una carga pendiente para finalizar';
  end if;

  select coalesce(sum(filas), 0), count(*), min(chunk_no), max(chunk_no)
  into v_total, v_chunks, v_min_chunk, v_max_chunk
  from public.importacion_chunks
  where organization_id = v_organization_id
    and import_id = p_import_id;

  if v_total <> v_pendiente.total_esperado then
    raise exception 'carga incompleta: % de % filas',
      v_total, v_pendiente.total_esperado;
  end if;
  if v_chunks = 0 or v_min_chunk <> 0 or v_max_chunk <> v_chunks - 1 then
    raise exception 'la secuencia de bloques está incompleta';
  end if;

  select jsonb_agg(elemento.value order by c.chunk_no, elemento.orden)
  into v_rows
  from public.importacion_chunks as c
  cross join lateral jsonb_array_elements(c.rows)
    with ordinality as elemento(value, orden)
  where c.organization_id = v_organization_id
    and c.import_id = p_import_id;

  v_resultado := public.import_transacciones(
    p_import_id,
    v_pendiente.nombre_archivo,
    v_pendiente.modo,
    v_rows
  );

  delete from public.importacion_pendientes
  where organization_id = v_organization_id
    and import_id = p_import_id;

  return v_resultado;
end;
$function$;

create or replace function public.begin_sync_transacciones(
  p_sync_id text,
  p_total_esperado integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
  v_operacion record;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;
  if p_sync_id is null
    or length(btrim(p_sync_id)) < 8
    or length(p_sync_id) > 160 then
    raise exception 'sync_id inválido';
  end if;
  if p_total_esperado is null
    or p_total_esperado not between 1 and 100000 then
    raise exception 'la sincronización debe contener entre 1 y 100000 cambios';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':sync:' || p_sync_id, 0)
  );

  select total_esperado, completada
  into v_operacion
  from public.sync_operaciones
  where organization_id = v_organization_id
    and sync_id = p_sync_id;

  if found then
    if v_operacion.total_esperado <> p_total_esperado then
      raise exception 'la sincronización existente tiene otro total';
    end if;

    return jsonb_build_object(
      'completada', v_operacion.completada,
      'reanudada', true
    );
  end if;

  delete from public.sync_operaciones
  where organization_id = v_organization_id
    and created_by = auth.uid()
    and (
      (completada and completed_at < now() - interval '24 hours')
      or (not completada and created_at < now() - interval '24 hours')
    );

  insert into public.sync_operaciones (
    organization_id,
    sync_id,
    total_esperado,
    created_by
  ) values (
    v_organization_id,
    p_sync_id,
    p_total_esperado,
    auth.uid()
  );

  return jsonb_build_object(
    'completada', false,
    'reanudada', false
  );
end;
$function$;

create or replace function public.upload_sync_transacciones_chunk(
  p_sync_id text,
  p_chunk_no integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
  v_esperadas integer;
  v_filas integer;
  v_acumuladas integer;
  v_hash text;
  v_existente record;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;
  if p_chunk_no is null or p_chunk_no < 0 or p_chunk_no > 1000 then
    raise exception 'número de bloque inválido';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'el bloque debe ser un arreglo JSON';
  end if;

  v_filas := jsonb_array_length(p_rows);
  if v_filas not between 1 and 1000 then
    raise exception 'cada bloque debe contener entre 1 y 1000 cambios';
  end if;
  if octet_length(p_rows::text) > 700000 then
    raise exception 'el bloque supera el máximo de 700000 bytes';
  end if;

  v_hash := md5(p_rows::text);
  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':sync:' || p_sync_id, 0)
  );

  select total_esperado
  into v_esperadas
  from public.sync_operaciones
  where organization_id = v_organization_id
    and sync_id = p_sync_id
    and not completada;

  if not found then
    raise exception 'no existe una sincronización pendiente';
  end if;

  select chunk_hash, filas
  into v_existente
  from public.sync_chunks
  where organization_id = v_organization_id
    and sync_id = p_sync_id
    and chunk_no = p_chunk_no;

  if found then
    if v_existente.chunk_hash <> v_hash
      or v_existente.filas <> v_filas then
      raise exception 'el bloque ya existe con contenido diferente';
    end if;

    return jsonb_build_object('guardado', true, 'ya_existia', true);
  end if;

  select coalesce(sum(filas), 0)
  into v_acumuladas
  from public.sync_chunks
  where organization_id = v_organization_id
    and sync_id = p_sync_id;

  if v_acumuladas + v_filas > v_esperadas then
    raise exception 'los bloques superan el total esperado';
  end if;

  insert into public.sync_chunks (
    organization_id,
    sync_id,
    chunk_no,
    chunk_hash,
    filas,
    rows
  ) values (
    v_organization_id,
    p_sync_id,
    p_chunk_no,
    v_hash,
    v_filas,
    p_rows
  );

  return jsonb_build_object('guardado', true, 'ya_existia', false);
end;
$function$;

create or replace function public.finalize_sync_transacciones(p_sync_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_organization_id uuid := public.current_organization_id();
  v_operacion record;
  v_total integer;
  v_chunks integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_rows jsonb;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'usuario sin organización autorizada';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_organization_id::text || ':sync:' || p_sync_id, 0)
  );

  select total_esperado, completada
  into v_operacion
  from public.sync_operaciones
  where organization_id = v_organization_id
    and sync_id = p_sync_id;

  if not found then
    raise exception 'no existe una sincronización para finalizar';
  end if;
  if v_operacion.completada then
    return jsonb_build_object('completada', true, 'ya_completada', true);
  end if;

  select coalesce(sum(filas), 0), count(*), min(chunk_no), max(chunk_no)
  into v_total, v_chunks, v_min_chunk, v_max_chunk
  from public.sync_chunks
  where organization_id = v_organization_id
    and sync_id = p_sync_id;

  if v_total <> v_operacion.total_esperado then
    raise exception 'sincronización incompleta: % de % cambios',
      v_total, v_operacion.total_esperado;
  end if;
  if v_chunks = 0 or v_min_chunk <> 0 or v_max_chunk <> v_chunks - 1 then
    raise exception 'la secuencia de bloques de sincronización está incompleta';
  end if;

  select jsonb_agg(elemento.value order by c.chunk_no, elemento.orden)
  into v_rows
  from public.sync_chunks as c
  cross join lateral jsonb_array_elements(c.rows)
    with ordinality as elemento(value, orden)
  where c.organization_id = v_organization_id
    and c.sync_id = p_sync_id;

  perform public.sync_transacciones(v_rows);

  update public.sync_operaciones
  set completada = true,
      completed_at = now()
  where organization_id = v_organization_id
    and sync_id = p_sync_id;

  delete from public.sync_chunks
  where organization_id = v_organization_id
    and sync_id = p_sync_id;

  return jsonb_build_object('completada', true, 'ya_completada', false);
end;
$function$;

create trigger reglas_set_organization
before insert on public.reglas
for each row execute function public.set_row_organization();

create trigger codigos_set_organization
before insert on public.codigos
for each row execute function public.set_row_organization();

create trigger bancos_set_organization
before insert on public.bancos
for each row execute function public.set_row_organization();

create trigger transacciones_validate_fingerprint
before insert or update of
  fuente, banco, fecha, monto, descripcion, rut,
  documento, tipo_doc, folio, proveedor, row_fingerprint
on public.transacciones
for each row execute function public.validate_transaction_fingerprint();

create trigger codigos_clear_transactions_before_delete
before delete on public.codigos
for each row execute function public.clear_codigo_from_transactions();


-- >>> supabase/schemas/03_rls.sql
-- RLS y permisos para los roles estándar de Supabase.

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.transacciones enable row level security;
alter table public.reglas enable row level security;
alter table public.codigos enable row level security;
alter table public.bancos enable row level security;
alter table public.importaciones enable row level security;
alter table public.importacion_pendientes enable row level security;
alter table public.importacion_chunks enable row level security;
alter table public.sync_operaciones enable row level security;
alter table public.sync_chunks enable row level security;

create policy organizations_member_select
on public.organizations
for select
to authenticated
using (public.is_organization_member(id));

create policy organization_members_self_select
on public.organization_members
for select
to authenticated
using (user_id = auth.uid());

create policy transacciones_member_select
on public.transacciones
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy importaciones_member_select
on public.importaciones
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy reglas_member_access
on public.reglas
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy codigos_member_access
on public.codigos
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy bancos_member_access
on public.bancos
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy importacion_pendientes_member_select
on public.importacion_pendientes
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy importacion_chunks_member_select
on public.importacion_chunks
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy sync_operaciones_member_select
on public.sync_operaciones
for select
to authenticated
using (public.is_organization_member(organization_id));

create policy sync_chunks_member_select
on public.sync_chunks
for select
to authenticated
using (public.is_organization_member(organization_id));

revoke all on table
  public.organizations,
  public.organization_members,
  public.transacciones,
  public.reglas,
  public.codigos,
  public.bancos,
  public.importaciones,
  public.importacion_pendientes,
  public.importacion_chunks,
  public.sync_operaciones,
  public.sync_chunks
from public, anon, authenticated;

grant select on table
  public.organizations,
  public.organization_members,
  public.transacciones,
  public.importaciones,
  public.importacion_pendientes,
  public.importacion_chunks,
  public.sync_operaciones,
  public.sync_chunks
to authenticated;

grant select, insert, update, delete on table
  public.reglas,
  public.codigos
to authenticated;

grant select, insert, delete on table public.bancos to authenticated;

grant all on table
  public.organizations,
  public.organization_members,
  public.transacciones,
  public.reglas,
  public.codigos,
  public.bancos,
  public.importaciones,
  public.importacion_pendientes,
  public.importacion_chunks,
  public.sync_operaciones,
  public.sync_chunks
to service_role;

revoke all on function public.current_organization_id()
from public, anon;
revoke all on function public.is_organization_member(uuid)
from public, anon;
revoke all on function public.set_row_organization()
from public, anon, authenticated;
revoke all on function public.transaction_canonical(
  text, text, date, numeric, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.transaction_hash(text)
from public, anon, authenticated;
revoke all on function public.validate_transaction_fingerprint()
from public, anon, authenticated;
revoke all on function public.clear_codigo_from_transactions()
from public, anon, authenticated;
revoke all on function public.import_transacciones(text, text, text, jsonb)
from public, anon;
revoke all on function public.clear_transacciones()
from public, anon;
revoke all on function public.sync_transacciones(jsonb)
from public, anon;
revoke all on function public.begin_importacion(text, text, text, integer)
from public, anon;
revoke all on function public.upload_importacion_chunk(text, integer, jsonb)
from public, anon;
revoke all on function public.finalize_importacion(text)
from public, anon;
revoke all on function public.begin_sync_transacciones(text, integer)
from public, anon;
revoke all on function public.upload_sync_transacciones_chunk(text, integer, jsonb)
from public, anon;
revoke all on function public.finalize_sync_transacciones(text)
from public, anon;

grant execute on function public.current_organization_id()
to authenticated;
grant execute on function public.is_organization_member(uuid)
to authenticated;
grant execute on function public.import_transacciones(text, text, text, jsonb)
to authenticated;
grant execute on function public.clear_transacciones()
to authenticated;
grant execute on function public.sync_transacciones(jsonb)
to authenticated;
grant execute on function public.begin_importacion(text, text, text, integer)
to authenticated;
grant execute on function public.upload_importacion_chunk(text, integer, jsonb)
to authenticated;
grant execute on function public.finalize_importacion(text)
to authenticated;
grant execute on function public.begin_sync_transacciones(text, integer)
to authenticated;
grant execute on function public.upload_sync_transacciones_chunk(text, integer, jsonb)
to authenticated;
grant execute on function public.finalize_sync_transacciones(text)
to authenticated;

grant execute on all functions in schema public to service_role;

notify pgrst, 'reload schema';


