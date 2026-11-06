import { supabase } from '@/lib/supabase'
import { extraerRUTDeTexto } from '@/lib/rut'

/**
 * Garantiza que la sesión esté cargada y (si corresponde) refrescada antes de
 * consultar. Sin esto, en un refresh del navegador las primeras peticiones
 * pueden salir sin el JWT del usuario y RLS devuelve vacío de forma
 * intermitente, haciendo que la tabla aparezca a veces con datos y a veces no.
 */
export async function asegurarSesion(): Promise<void> {
  await supabase.auth.getSession()
}
import type {
  AccionRegla,
  BancoCatalogo,
  Codigo,
  ProgresoImportacion,
  Regla,
  ResultadoImportacion,
  Transaccion,
} from '@/types/conciliacion'

/**
 * Capa de acceso a datos para Supabase.
 * Mapea entre las filas de Postgres (snake_case) y los tipos de dominio
 * (camelCase), de modo que el resto de la app no cambia.
 */

// ------------------------------ Transacciones ------------------------------

interface TransaccionRow {
  id: string
  fuente: string
  banco: string | null
  fecha: string
  monto: number | string
  saldo: number | string | null
  descripcion: string
  rut: string | null
  categoria: string | null
  codigo_id: string | null
  codigo_origen: string | null
  codigo_confianza: number | string | null
  codigo_evidencia: string | null
  estado: string
  match_id: string | null
  confianza: number | string | null
  documento: string | null
  external_id: string | null
  contraparte: string | null
  codigo_tipo_doc: string | null
  iva_total: number | string | null
  iva_debito: number | string | null
  saldo_documento: number | string | null
  folio_referencia: string | null
  tipo_doc_referencia: string | null
  subtipo_documento: string | null
  proveedor: string | null
  tipo_doc: string | null
  folio: string | null
  exento: number | string | null
  neto: number | string | null
  iva_recup: number | string | null
  iva_nr: number | string | null
  fecha_vencimiento: string | null
  estado_pago: string | null
  metadatos: Record<string, unknown> | null
  import_id: string | null
  row_fingerprint: string | null
}

function numOrNull(v: number | string | null | undefined): number | undefined {
  return v == null ? undefined : Number(v)
}

/**
 * Las cartolas no traen columna de RUT, pero muchas glosas lo incluyen
 * ("PAGO RECIBIDO PRV 078187230-K BCO CHILE"). Se recupera al leer, para que el
 * motor de matching tenga la única llave dura que cruza con los libros.
 *
 * Se hace en lectura y no escribiendo en la base porque el RUT forma parte del
 * `row_fingerprint`, que un trigger valida en cada UPDATE.
 */
function rutDerivadoDeGlosa(r: TransaccionRow): string | undefined {
  if (r.fuente !== 'banco' || r.rut) return undefined
  return extraerRUTDeTexto(r.descripcion)
}

function rowToTransaccion(r: TransaccionRow): Transaccion {
  return {
    id: r.id,
    fuente: r.fuente as Transaccion['fuente'],
    banco: (r.banco ?? undefined) as Transaccion['banco'],
    fecha: r.fecha,
    monto: Number(r.monto),
    saldo: numOrNull(r.saldo),
    descripcion: r.descripcion,
    rut: r.rut ?? rutDerivadoDeGlosa(r),
    categoria: r.categoria ?? undefined,
    codigoId: r.codigo_id ?? undefined,
    codigoOrigen: (r.codigo_origen ?? undefined) as Transaccion['codigoOrigen'],
    codigoConfianza: numOrNull(r.codigo_confianza),
    codigoEvidencia: r.codigo_evidencia ?? undefined,
    estado: r.estado as Transaccion['estado'],
    matchId: r.match_id ?? undefined,
    confianza: numOrNull(r.confianza),
    documento: r.documento ?? undefined,
    externalId: r.external_id ?? undefined,
    contraparte: r.contraparte ?? undefined,
    codigoTipoDoc: r.codigo_tipo_doc ?? undefined,
    ivaTotal: numOrNull(r.iva_total),
    ivaDebito: numOrNull(r.iva_debito),
    saldoDocumento: numOrNull(r.saldo_documento),
    folioReferencia: r.folio_referencia ?? undefined,
    tipoDocReferencia: r.tipo_doc_referencia ?? undefined,
    subtipoDocumento: r.subtipo_documento ?? undefined,
    proveedor: r.proveedor ?? undefined,
    tipoDoc: r.tipo_doc ?? undefined,
    folio: r.folio ?? undefined,
    exento: numOrNull(r.exento),
    neto: numOrNull(r.neto),
    ivaRecup: numOrNull(r.iva_recup),
    ivaNr: numOrNull(r.iva_nr),
    fechaVencimiento: r.fecha_vencimiento ?? undefined,
    estadoPago: r.estado_pago ?? undefined,
    metadatos: r.metadatos ?? undefined,
    importId: r.import_id ?? undefined,
    fingerprint: r.row_fingerprint ?? undefined,
  }
}

function transaccionToRow(t: Transaccion): TransaccionRow {
  return {
    id: t.id,
    fuente: t.fuente,
    banco: t.banco ?? null,
    fecha: t.fecha,
    monto: t.monto,
    saldo: t.saldo ?? null,
    descripcion: t.descripcion,
    rut: t.rut ?? null,
    categoria: t.categoria ?? null,
    codigo_id: t.codigoId ?? null,
    codigo_origen: t.codigoOrigen ?? null,
    codigo_confianza: t.codigoConfianza ?? null,
    codigo_evidencia: t.codigoEvidencia ?? null,
    estado: t.estado,
    match_id: t.matchId ?? null,
    confianza: t.confianza ?? null,
    documento: t.documento ?? null,
    external_id: t.externalId ?? null,
    contraparte: t.contraparte ?? null,
    codigo_tipo_doc: t.codigoTipoDoc ?? null,
    iva_total: t.ivaTotal ?? null,
    iva_debito: t.ivaDebito ?? null,
    saldo_documento: t.saldoDocumento ?? null,
    folio_referencia: t.folioReferencia ?? null,
    tipo_doc_referencia: t.tipoDocReferencia ?? null,
    subtipo_documento: t.subtipoDocumento ?? null,
    proveedor: t.proveedor ?? null,
    tipo_doc: t.tipoDoc ?? null,
    folio: t.folio ?? null,
    exento: t.exento ?? null,
    neto: t.neto ?? null,
    iva_recup: t.ivaRecup ?? null,
    iva_nr: t.ivaNr ?? null,
    fecha_vencimiento: t.fechaVencimiento ?? null,
    estado_pago: t.estadoPago ?? null,
    metadatos: t.metadatos ?? {},
    import_id: t.importId ?? null,
    row_fingerprint: t.fingerprint ?? null,
  }
}

/** Campos que mutan al conciliar / categorizar. */
function estadoToRow(t: Transaccion) {
  return {
    estado: t.estado,
    match_id: t.matchId ?? null,
    confianza: t.confianza ?? null,
    categoria: t.categoria ?? null,
    codigo_id: t.codigoId ?? null,
    codigo_origen: t.codigoOrigen ?? null,
    codigo_confianza: t.codigoConfianza ?? null,
    codigo_evidencia: t.codigoEvidencia ?? null,
  }
}

/** Cambio mínimo que se persiste durante una conciliación. */
function cambioConciliacion(t: Transaccion) {
  return {
    id: t.id,
    ...estadoToRow(t),
  }
}

/**
 * PostgREST (el API de Supabase) devuelve por defecto un máximo de 1000 filas
 * por request. Si hay más, hay que paginar con `.range()` para traerlas todas;
 * de lo contrario una consulta ordenada por fecha se corta en las más antiguas
 * y los meses recientes nunca llegan al frontend.
 */
const PAGE_SIZE = 1000

/**
 * Peticiones simultáneas. Acotado a propósito: lanzar las ~45 páginas a la vez
 * hacía que el servidor ordenara la tabla completa en paralelo, saturaba la CPU
 * y alguna consulta excedía el statement_timeout (error 57014).
 */
const CONCURRENCIA = 6

const aISO = (d: Date): string => d.toISOString().slice(0, 10)
const sumarDias = (iso: string, n: number): string =>
  aISO(new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000))

/**
 * Parte un rango de fechas en tramos para poder pedirlos en paralelo. Cada
 * tramo se resuelve con su propio cursor apoyado en el índice
 * `transacciones_org_fecha_id_idx`, sin OFFSET profundos.
 */
function tramosDeFechas(desde: string, hasta: string): [string, string][] {
  const dias = Math.round(
    (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / 86400000,
  ) + 1
  if (dias <= 1) return [[desde, hasta]]

  // ~10 días por tramo, con un techo para no disparar demasiadas peticiones.
  const tramos = Math.min(12, Math.max(1, Math.ceil(dias / 10)))
  const paso = Math.ceil(dias / tramos)
  const rangos: [string, string][] = []
  for (let i = 0; i < dias; i += paso) {
    const ini = sumarDias(desde, i)
    const fin = sumarDias(desde, Math.min(i + paso - 1, dias - 1))
    rangos.push([ini, fin])
  }
  return rangos
}

/** Ejecuta las tareas con un máximo de `limite` en vuelo, conservando el orden. */
async function enPool<T, R>(
  items: T[],
  limite: number,
  tarea: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(items.length)
  let siguiente = 0
  const trabajador = async (): Promise<void> => {
    for (;;) {
      const i = siguiente
      siguiente += 1
      if (i >= items.length) return
      resultados[i] = await tarea(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limite, items.length) }, () => trabajador()),
  )
  return resultados
}

/** Recorre un tramo de fechas paginando por cursor sobre (fecha, id). */
async function paginarTramo(desde: string, hasta: string): Promise<TransaccionRow[]> {
  const filas: TransaccionRow[] = []
  let ultimaFecha: string | undefined
  let ultimoId: string | undefined

  for (;;) {
    let q = supabase
      .from('transacciones')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
    if (ultimaFecha !== undefined && ultimoId !== undefined) {
      // Siguiente página: fecha posterior, o misma fecha con id mayor.
      q = q.or(`fecha.gt.${ultimaFecha},and(fecha.eq.${ultimaFecha},id.gt.${ultimoId})`)
    }

    const { data, error } = await q
    if (error) throw errorSupabase(error, 'No se pudo cargar las transacciones')
    const pagina = (data as unknown as TransaccionRow[] | null) ?? []
    filas.push(...pagina)
    if (pagina.length < PAGE_SIZE) break

    const cursor = pagina[pagina.length - 1]
    ultimaFecha = cursor.fecha
    ultimoId = cursor.id
  }
  return filas
}

/** Primera y última fecha con datos; sirve para repartir el trabajo. */
async function limitesDeFechas(): Promise<[string, string] | null> {
  const extremo = async (ascendente: boolean) => {
    const { data, error } = await supabase
      .from('transacciones')
      .select('fecha')
      .order('fecha', { ascending: ascendente })
      .limit(1)
    if (error) throw errorSupabase(error, 'No se pudo determinar el rango de fechas')
    return (data as unknown as { fecha: string }[] | null)?.[0]?.fecha
  }
  const [min, max] = await Promise.all([extremo(true), extremo(false)])
  return min && max ? [min, max] : null
}

/**
 * Carga transacciones, opcionalmente acotadas a un rango de fechas.
 *
 * El rango se reparte en tramos que se piden en paralelo (con concurrencia
 * acotada); dentro de cada tramo se avanza por cursor. Antes se recorría todo
 * de forma secuencial, y con ~45.000 filas el pintado inicial tardaba unos 30
 * segundos; así baja a unos 7.
 */
async function cargarTransaccionesRango(
  desdeFecha?: string,
  hastaFecha?: string,
): Promise<Transaccion[]> {
  let desde = desdeFecha
  let hasta = hastaFecha
  if (!desde || !hasta) {
    const limites = await limitesDeFechas()
    if (!limites) return []
    desde = desde ?? limites[0]
    hasta = hasta ?? limites[1]
  }

  const tramos = tramosDeFechas(desde, hasta)
  const porTramo = await enPool(tramos, CONCURRENCIA, ([d, h]) => paginarTramo(d, h))
  // Los tramos son cronológicos y cada uno viene ordenado, así que concatenar
  // en orden conserva el orden global por (fecha, id).
  return porTramo.flat().map(rowToTransaccion)
}

/** Carga todas las transacciones de la organización. */
export async function fetchTransacciones(): Promise<Transaccion[]> {
  return cargarTransaccionesRango()
}

/** Carga solo las transacciones del período (mes/año) para el primer pintado. */
export async function fetchTransaccionesPeriodo(
  mes: number,
  anio: number,
): Promise<Transaccion[]> {
  const mm = String(mes).padStart(2, '0')
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const desde = `${anio}-${mm}-01`
  const hasta = `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}`
  return cargarTransaccionesRango(desde, hasta)
}

/** Tamaño de lote para inserts masivos. Insertar cientos de filas en un solo
 *  request puede provocar cortes de conexión ("socket hang up") en el
 *  servidor; dividir en lotes más pequeños es más confiable. */
const TAMANO_LOTE = 100

/** Divide un arreglo en trozos de tamaño `size`. */
function enLotes<T>(items: T[], size: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    lotes.push(items.slice(i, i + size))
  }
  return lotes
}

const MAX_CHUNK_ROWS = 1000
const MAX_CHUNK_BYTES = 400_000
const MAX_RPC_INTENTOS = 3

/**
 * Convierte un error de Supabase en un `Error` real.
 *
 * PostgREST devuelve el error del `{ data, error }` como objeto plano
 * (`{ message, details, hint, code }`), NO como instancia de `Error`. Si se
 * relanza tal cual, cualquier `e instanceof Error ? e.message : String(e)`
 * aguas arriba termina imprimiendo `[object Object]` y se pierde la causa real.
 */
export function errorSupabase(error: unknown, contexto: string): Error {
  if (error instanceof Error) {
    return new Error(`${contexto}: ${error.message}`)
  }
  const detalle = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {}
  const partes = [detalle.message, detalle.details, detalle.hint, detalle.code]
    .filter((valor): valor is string => typeof valor === 'string' && valor.trim() !== '')
  return new Error(`${contexto}: ${partes.join(' · ') || String(error || 'error desconocido')}`)
}

function errorImportacion(error: unknown, contexto: string): Error {
  return errorSupabase(error, contexto)
}

function errorEsTransitorio(error: unknown): boolean {
  let texto: string
  try {
    texto = error instanceof Error ? error.message : JSON.stringify(error)
  } catch {
    texto = String(error)
  }
  return /socket|network|fetch|timeout|econn|connection|refused|aborted|getaddrinfo|enotfound|502|503|504/i.test(texto)
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function rpcImportacion(
  nombre: string,
  argumentos: Record<string, unknown>,
  contexto: string,
): Promise<unknown> {
  let ultimoError: unknown
  for (let intento = 1; intento <= MAX_RPC_INTENTOS; intento += 1) {
    try {
      const { data, error } = await supabase.rpc(nombre, argumentos)
      if (!error) return data
      ultimoError = error
    } catch (error) {
      ultimoError = error
    }
    if (!errorEsTransitorio(ultimoError) || intento === MAX_RPC_INTENTOS) break
    await esperar(500 * intento)
  }
  throw errorImportacion(ultimoError, contexto)
}

function compactarFila(row: Transaccion): Record<string, unknown> {
  const fila = {
    ...transaccionToRow(row),
    import_id: undefined,
    row_fingerprint: row.fingerprint,
  }
  return Object.fromEntries(
    Object.entries(fila).filter(([, valor]) => valor !== null && valor !== undefined),
  )
}

function dividirPorTamano(
  rows: Record<string, unknown>[],
): Record<string, unknown>[][] {
  const encoder = new TextEncoder()
  const lotes: Record<string, unknown>[][] = []
  let lote: Record<string, unknown>[] = []
  let bytes = 2

  for (const row of rows) {
    const rowBytes = encoder.encode(JSON.stringify(row)).byteLength
    if (rowBytes + 2 > MAX_CHUNK_BYTES) {
      throw new Error('Un registro supera el tamaño máximo permitido por el servidor')
    }

    const separador = lote.length > 0 ? 1 : 0
    const excedeFilas = lote.length >= MAX_CHUNK_ROWS
    const excedeBytes = bytes + separador + rowBytes > MAX_CHUNK_BYTES
    if (lote.length > 0 && (excedeFilas || excedeBytes)) {
      lotes.push(lote)
      lote = []
      bytes = 2
    }

    const separadorActual = lote.length > 0 ? 1 : 0
    lote.push(row)
    bytes += separadorActual + rowBytes
  }
  if (lote.length > 0) lotes.push(lote)
  return lotes
}

export async function importarTransacciones(
  rows: Transaccion[],
  modo: 'agregar' | 'reemplazar',
  importId: string,
  nombreArchivo: string,
  onProgress?: (progreso: ProgresoImportacion) => void,
): Promise<ResultadoImportacion> {
  if (rows.length === 0) throw new Error('No hay filas válidas para importar')
  const payload = rows.map(compactarFila)
  const lotes = dividirPorTamano(payload)
  onProgress?.({
    etapa: 'preparando', actual: 0, total: lotes.length,
    mensaje: 'Preparando una carga segura…',
  })

  const inicio = await rpcImportacion('begin_importacion', {
    p_import_id: importId,
    p_nombre_archivo: nombreArchivo,
    p_modo: modo,
    p_total_esperado: payload.length,
  }, 'No se pudo iniciar la importación') as {
    ya_importado?: boolean
    insertadas?: number
    omitidas?: number
  } | null

  if (inicio?.ya_importado) {
    return {
      insertadas: inicio.insertadas ?? 0,
      omitidas: inicio.omitidas ?? 0,
      yaImportado: true,
    }
  }

  for (let i = 0; i < lotes.length; i += 1) {
    onProgress?.({
      etapa: 'subiendo', actual: i, total: lotes.length,
      mensaje: `Cargando bloque ${i + 1} de ${lotes.length}…`,
    })
    await rpcImportacion('upload_importacion_chunk', {
      p_import_id: importId,
      p_chunk_no: i,
      p_rows: lotes[i],
    }, `No se pudo cargar el bloque ${i + 1} de ${lotes.length}`)
    onProgress?.({
      etapa: 'subiendo', actual: i + 1, total: lotes.length,
      mensaje: `Bloque ${i + 1} de ${lotes.length} cargado`,
    })
  }

  onProgress?.({
    etapa: 'confirmando', actual: lotes.length, total: lotes.length,
    mensaje: 'Confirmando todas las filas en una sola transacción…',
  })
  const resultado = await rpcImportacion('finalize_importacion', {
    p_import_id: importId,
  }, 'Los bloques se cargaron, pero no se pudo confirmar la importación') as {
    insertadas?: number
    omitidas?: number
    ya_importado?: boolean
  } | null

  return {
    insertadas: resultado?.insertadas ?? 0,
    omitidas: resultado?.omitidas ?? 0,
    yaImportado: resultado?.ya_importado ?? false,
  }
}

/** Actualiza estado / match / confianza / categoría de una transacción. */
export async function syncTransaccion(t: Transaccion): Promise<void> {
  await syncTransacciones([t])
}

/**
 * Sincroniza el conjunto completo como una operación atómica del servidor.
 * La función SQL valida que todo match sea recíproco antes de confirmar; así
 * nunca queda uno de los dos movimientos conciliado si falla la red a mitad
 * de la sincronización.
 */
async function crearSyncId(cambios: Record<string, unknown>[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(cambios))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = [...new Uint8Array(digest)]
    .map((valor) => valor.toString(16).padStart(2, '0'))
    .join('')
  return `sync-${hash.slice(0, 48)}-${cambios.length}`
}

export async function syncTransacciones(rows: Transaccion[]): Promise<void> {
  if (rows.length === 0) return
  const cambios = rows.map(cambioConciliacion) as Record<string, unknown>[]

  // Operaciones pequeñas no necesitan staging; las grandes nunca atraviesan
  // PostgREST como un único JSON para evitar agotar su heap.
  if (cambios.length <= 100) {
    await rpcImportacion('sync_transacciones', {
      p_cambios: cambios,
    }, 'No se pudo sincronizar la conciliación')
    return
  }

  const lotes = dividirPorTamano(cambios)
  const syncId = await crearSyncId(cambios)
  const inicio = await rpcImportacion('begin_sync_transacciones', {
    p_sync_id: syncId,
    p_total_esperado: cambios.length,
  }, 'No se pudo iniciar la sincronización') as { completada?: boolean } | null
  if (inicio?.completada) return

  for (let i = 0; i < lotes.length; i += 1) {
    await rpcImportacion('upload_sync_transacciones_chunk', {
      p_sync_id: syncId,
      p_chunk_no: i,
      p_rows: lotes[i],
    }, `No se pudo sincronizar el bloque ${i + 1} de ${lotes.length}`)
  }

  await rpcImportacion('finalize_sync_transacciones', {
    p_sync_id: syncId,
  }, 'No se pudo confirmar la sincronización')
}

/** Sincroniza muchas filas en el mismo RPC transaccional. */
export async function reemplazarLote(rows: Transaccion[]): Promise<void> {
  await syncTransacciones(rows)
}

/** Elimina atómicamente los datos de la organización activa. */
export async function clearTransacciones(): Promise<void> {
  const { error } = await supabase.rpc('clear_transacciones')
  if (error) throw errorSupabase(error, 'No se pudo limpiar las transacciones')
}

// --------------------------------- Reglas ----------------------------------

interface ReglaRow {
  id: string
  nombre: string
  activa: boolean
  campo: string
  operador: string
  valor: string
  accion: AccionRegla
  prioridad: number
}

function rowToRegla(r: ReglaRow): Regla {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    campo: r.campo as Regla['campo'],
    operador: r.operador as Regla['operador'],
    valor: r.valor,
    accion: r.accion,
    prioridad: r.prioridad,
  }
}

function reglaToRow(r: Regla): ReglaRow {
  return {
    id: r.id,
    nombre: r.nombre,
    activa: r.activa,
    campo: r.campo,
    operador: r.operador,
    valor: r.valor,
    accion: r.accion,
    prioridad: r.prioridad,
  }
}

export async function fetchReglas(): Promise<Regla[]> {
  const { data, error } = await supabase
    .from('reglas')
    .select('*')
    .order('prioridad', { ascending: true })
  if (error) throw errorSupabase(error, 'No se pudo cargar las reglas')
  return (data as unknown as ReglaRow[] | null ?? []).map(rowToRegla)
}

export async function insertRegla(r: Regla): Promise<void> {
  const { error } = await supabase
    .from('reglas')
    .insert([reglaToRow(r)] as unknown as never[])
  if (error) throw errorSupabase(error, 'No se pudo crear la regla')
}

export async function updateRegla(r: Regla): Promise<void> {
  const { error } = await supabase
    .from('reglas')
    .update(reglaToRow(r) as unknown as never)
    .eq('id', r.id)
  if (error) throw errorSupabase(error, 'No se pudo actualizar la regla')
}

export async function deleteRegla(id: string): Promise<void> {
  const { error } = await supabase
    .from('reglas')
    .delete()
    .eq('id', id)
  if (error) throw errorSupabase(error, 'No se pudo eliminar la regla')
}

// --------------------------------- Códigos ----------------------------------

interface CodigoRow {
  id: string
  nombre: string
  categoria: string | null
  descripcion: string | null
  clave: string | null
  aliases: string[] | null
  prioridad: number | string
  activo: boolean
}

function rowToCodigo(r: CodigoRow): Codigo {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria ?? undefined,
    descripcion: r.descripcion ?? undefined,
    clave: r.clave ?? undefined,
    aliases: r.aliases ?? [],
    prioridad: Number(r.prioridad ?? 100),
    activo: r.activo,
  }
}

function codigoToRow(c: Codigo): CodigoRow {
  return {
    id: c.id.toUpperCase(),
    nombre: c.nombre,
    categoria: c.categoria ?? null,
    descripcion: c.descripcion ?? null,
    clave: c.clave ?? null,
    aliases: c.aliases,
    prioridad: c.prioridad,
    activo: c.activo,
  }
}

export async function fetchCodigos(): Promise<Codigo[]> {
  const { data, error } = await supabase
    .from('codigos')
    .select('*')
    .order('id', { ascending: true })
  if (error) throw errorSupabase(error, 'No se pudo cargar los códigos')
  return (data as unknown as CodigoRow[] | null ?? []).map(rowToCodigo)
}

export async function insertCodigo(c: Codigo): Promise<void> {
  const { error } = await supabase
    .from('codigos')
    .insert([codigoToRow(c)] as unknown as never[])
  if (error) throw errorSupabase(error, 'No se pudo crear el código')
}

/** ¿El error de Postgres es una clave duplicada (PK/unique)? */
function esClaveDuplicada(error: unknown): boolean {
  const detalle = (error ?? {}) as Record<string, unknown>
  return detalle.code === '23505' || /duplicate key/i.test(String(detalle.message ?? ''))
}

/**
 * Guarda un código: intenta crearlo y, si el id ya existe en la base —aunque no
 * esté en el catálogo que la app tiene en memoria—, lo actualiza. Así, crear
 * sobre un id ya tomado no revienta con el error crudo de la clave primaria.
 */
export async function guardarCodigo(c: Codigo): Promise<'creado' | 'actualizado'> {
  const { error } = await supabase
    .from('codigos')
    .insert([codigoToRow(c)] as unknown as never[])
  if (!error) return 'creado'
  if (!esClaveDuplicada(error)) throw errorSupabase(error, 'No se pudo crear el código')
  const { error: errorUpdate } = await supabase
    .from('codigos')
    .update(codigoToRow(c) as unknown as never)
    .eq('id', c.id.toUpperCase())
  if (errorUpdate) throw errorSupabase(errorUpdate, 'No se pudo actualizar el código')
  return 'actualizado'
}

export async function insertCodigos(cs: Codigo[]): Promise<void> {
  if (cs.length === 0) return
  for (const lote of enLotes(cs, TAMANO_LOTE)) {
    const { error } = await supabase
      .from('codigos')
      .insert(lote.map(codigoToRow) as unknown as never[])
    if (error) throw errorSupabase(error, 'No se pudo importar los códigos')
  }
}

export async function updateCodigo(c: Codigo): Promise<void> {
  const { error } = await supabase
    .from('codigos')
    .update(codigoToRow(c) as unknown as never)
    .eq('id', c.id.toUpperCase())
  if (error) throw errorSupabase(error, 'No se pudo actualizar el código')
}

export async function deleteCodigo(id: string): Promise<void> {
  const { error } = await supabase
    .from('codigos')
    .delete()
    .eq('id', id.toUpperCase())
  if (error) throw errorSupabase(error, 'No se pudo eliminar el código')
}

// ---------------------------- Bancos ----------------------------

interface BancoRow {
  nombre: string
}

export async function fetchBancos(): Promise<BancoCatalogo[]> {
  const { data, error } = await supabase
    .from('bancos')
    .select('nombre')
    .order('nombre', { ascending: true })
  if (error) throw errorSupabase(error, 'No se pudo cargar los bancos')
  return (data as unknown as BancoRow[] | null ?? []).map((row) => ({ nombre: row.nombre }))
}

export async function insertBanco(nombre: string): Promise<void> {
  const { error } = await supabase
    .from('bancos')
    .insert([{ nombre }] as unknown as never[])
  if (error) throw errorSupabase(error, 'No se pudo agregar el banco')
}

export async function deleteBanco(nombre: string): Promise<void> {
  const { error } = await supabase
    .from('bancos')
    .delete()
    .eq('nombre', nombre)
  if (error) throw errorSupabase(error, 'No se pudo eliminar el banco')
}
