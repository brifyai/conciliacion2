import Papa from 'papaparse'
import type ExcelJS from 'exceljs'
import type { BancoChileno, FuenteDatos, Transaccion } from '@/types/conciliacion'
import { limpiarRUT, validarRUT, extraerRUTDeTexto } from '@/lib/rut'

export type Fila = Record<string, string>

/** Perfiles soportados por los extractos y documentos contables. */
export type PerfilArchivo =
  | 'banco'
  | 'compras'
  | 'ventas'
  | 'nota_credito'
  | 'nota_debito'
  | 'factoring'

/** Campos normalizados a los que se mapean las columnas del archivo. */
export type CampoMapeado =
  | 'fecha'
  | 'monto'
  | 'cargo'
  | 'abono'
  | 'descripcion'
  | 'rut'
  | 'saldo'
  | 'saldo_documento'
  | 'pago_parcial'
  | 'documento'
  | 'external_id'
  | 'contraparte'
  | 'codigo_contable'
  | 'codigo_aliases'
  | 'codigo_tipo_doc'
  | 'proveedor'
  | 'tipo_doc'
  | 'folio'
  | 'folio_referencia'
  | 'tipo_doc_referencia'
  | 'subtipo_documento'
  | 'exento'
  | 'neto'
  | 'iva_total'
  | 'iva_debito'
  | 'iva_recup'
  | 'iva_nr'
  | 'fecha_vencimiento'
  | 'estado_pago'
  | 'ignorar'

/** Mapeo sugerido: nombre de columna original -> campo normalizado. */
export type MapeoColumnas = Record<string, CampoMapeado>

function normalizarEncabezado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const MAPEO_EXACTO: Record<string, CampoMapeado> = {
  'fecha vencimiento': 'fecha_vencimiento',
  'fecha cesion': 'fecha',
  'fecha emision': 'fecha',
  fecha: 'fecha',
  'monto total': 'monto',
  total: 'monto',
  'monto recibido': 'monto',
  'monto neto': 'neto',
  neto: 'neto',
  'monto iva': 'iva_total',
  iva: 'iva_total',
  'iva debito': 'iva_debito',
  'monto exento': 'exento',
  exento: 'exento',
  uuid: 'external_id',
  codigo: 'codigo_contable',
  cod: 'codigo_contable',
  'codigo contable': 'codigo_contable',
  'cod contable': 'codigo_contable',
  'cuenta contable': 'codigo_contable',
  'clave contable': 'codigo_contable',
  'codigo cuenta': 'codigo_contable',
  aliases: 'codigo_aliases',
  'alias': 'codigo_aliases',
  'cod tipo': 'codigo_tipo_doc',
  'razon social': 'contraparte',
  'razon social proveedor': 'contraparte',
  'razon social cliente': 'contraparte',
  'nombre cliente': 'contraparte',
  'nombre contraparte': 'contraparte',
  'entidad factoring': 'contraparte',
  'n referencia': 'documento',
  'factura referencia folio': 'folio_referencia',
  'factura folio': 'folio_referencia',
  'factura referencia tipo': 'tipo_doc_referencia',
  'tipo nota': 'subtipo_documento',
  'saldo de libros': 'saldo_documento',
  'saldo de banco': 'saldo',
  'saldo por cobrar': 'saldo_documento',
  'saldo faltante': 'saldo_documento',
  'saldo pendiente': 'saldo_documento',
  'saldo insoluto': 'saldo_documento',
  'pago abono': 'pago_parcial',
  'total pagos': 'pago_parcial',
  'total pagado': 'pago_parcial',
  folio: 'folio',
  'tipo documento': 'tipo_doc',
  estado: 'estado_pago',
}

const PATRONES: Array<[CampoMapeado, RegExp[]]> = [
  ['fecha_vencimiento', [/vencim/, /^vcto$/]],
  ['fecha', [/^fecha/, /fecha.*(op|oper|trans)/, /^fec/, /^date/, /^fch/, /^emi$/, /emision/]],
  ['cargo', [/^cargo(?: clp)?$/, /^debe$/, /^debito$/, /cargos?$/, /giros? y/, /^giro/]],
  ['abono', [/^abono(?: clp)?$/, /^haber$/, /^credito$/, /abonos?$/, /^depositos?/]],
  ['descripcion', [/^descripcion$/, /glosa/, /detalle/, /concepto/, /narrativ/, /observaciones?/, /^motivo$/]],
  ['rut', [/^rut/, /run/, /^doc$/]],
  ['documento', [/documento/, /cheque/, /comprob/]],
  ['codigo_contable', [/^codigo contable$/, /^cod contable$/, /^cuenta contable$/, /^clave contable$/]],
  ['contraparte', [/razon social/, /nombre (?:cliente|contraparte)/, /entidad factoring/]],
  ['folio', [/^folio$/, /^factura$/, /num.*factura/, /nro?.*factura/, /numero.*fact/, /n dcto/]],
  ['tipo_doc', [/^tipo$/, /tipo doc/, /tipo dte/, /tipo documento/]],
  ['proveedor', [/^proveedor$/, /emisor/, /^nombre$/]],
  ['iva_recup', [/iva.*recup/]],
  ['iva_nr', [/iva.*nr/, /iva.*no recup/]],
  ['iva_debito', [/iva.*debito/]],
  ['iva_total', [/^iva$/, /monto iva/]],
  ['exento', [/exent/]],
  ['neto', [/neto/]],
  ['monto', [/^monto total$/, /^monto recibido$/, /importe/, /valor/, /amount/, /^sum/, /^total$/]],
  ['estado_pago', [/estado pago/, /^estado(?: 2)?$/]],
  ['pago_parcial', [/^p\d+$/, /^cuota\b/, /^pago \d+$/, /^abono \d+$/]],
  ['saldo', [/saldo/, /balance/]],
]

const MAPEO_POR_PERFIL: Partial<Record<PerfilArchivo, Record<string, CampoMapeado>>> = {
  banco: { saldo: 'saldo', descripcion: 'descripcion', 'glosa detalle': 'ignorar' },
  compras: {
    saldo: 'saldo_documento',
    observaciones: 'descripcion',
    'razon social proveedor': 'contraparte',
    'entidad factoring': 'ignorar',
  },
  ventas: {
    saldo: 'saldo_documento',
    observaciones: 'descripcion',
    'razon social cliente': 'contraparte',
    'entidad factoring': 'ignorar',
  },
  nota_credito: { motivo: 'descripcion', observaciones: 'ignorar' },
  nota_debito: { motivo: 'descripcion', observaciones: 'ignorar' },
  factoring: {
    'fecha cesion': 'fecha',
    'monto recibido': 'monto',
    'factura folio': 'folio_referencia',
    'rut factoring': 'rut',
    observaciones: 'ignorar',
  },
}

type CandidatoMapeo = {
  head: string
  campo: CampoMapeado
  prioridad: number
  indice: number
}

export function sugerirMapeo(
  encabezados: string[],
  perfil?: PerfilArchivo,
): MapeoColumnas {
  const especifico = perfil ? MAPEO_POR_PERFIL[perfil] ?? {} : {}
  const candidatos: CandidatoMapeo[] = encabezados.map((head, indice) => {
    const normalizado = normalizarEncabezado(head)
    if (Object.prototype.hasOwnProperty.call(especifico, normalizado)) {
      return { head, campo: especifico[normalizado], prioridad: 3, indice }
    }
    if (Object.prototype.hasOwnProperty.call(MAPEO_EXACTO, normalizado)) {
      return { head, campo: MAPEO_EXACTO[normalizado], prioridad: 2, indice }
    }
    const campo = PATRONES.find(([, patrones]) =>
      patrones.some((patron) => patron.test(normalizado)))?.[0]
    return { head, campo: campo ?? 'ignorar', prioridad: campo ? 1 : 0, indice }
  })

  // Cada campo escalar debe tener un único ganador. Las reglas específicas del
  // perfil prevalecen sobre coincidencias exactas globales y patrones genéricos.
  // 'pago_parcial' admite varias columnas (P1..Pn, cuotas); el resto de campos
  // escalares tiene un único ganador.
  const MULTI: ReadonlySet<CampoMapeado> = new Set(['pago_parcial'])
  const ganadorPorCampo = new Map<CampoMapeado, CandidatoMapeo>()
  for (const candidato of candidatos) {
    if (candidato.campo === 'ignorar' || MULTI.has(candidato.campo)) continue
    const actual = ganadorPorCampo.get(candidato.campo)
    if (!actual || candidato.prioridad > actual.prioridad) {
      ganadorPorCampo.set(candidato.campo, candidato)
    }
  }

  const mapeo: MapeoColumnas = {}
  for (const candidato of candidatos) {
    if (MULTI.has(candidato.campo)) {
      mapeo[candidato.head] = candidato.campo
      continue
    }
    const ganador = ganadorPorCampo.get(candidato.campo)
    mapeo[candidato.head] = candidato.campo !== 'ignorar' && ganador?.indice === candidato.indice
      ? candidato.campo
      : 'ignorar'
  }
  return mapeo
}

/** Sugiere un perfil usando nombre y encabezados, sin impedir corrección manual. */
export function detectarPerfilArchivo(nombre: string, encabezados: string[]): PerfilArchivo {
  const nombreNormalizado = normalizarEncabezado(nombre)
  const headersNormalizados = normalizarEncabezado(encabezados.join(' '))
  const pista = `${nombreNormalizado} ${headersNormalizados}`
  if (/factoring/.test(nombreNormalizado) || /fecha cesion|monto recibido/.test(headersNormalizados)) {
    return 'factoring'
  }
  if (/nota(?:s)? (?:de )?credito/.test(pista)) return 'nota_credito'
  if (/nota(?:s)? (?:de )?debito/.test(pista)) return 'nota_debito'
  if (/libro (?:de )?ventas|rut cliente|razon social cliente/.test(pista)) return 'ventas'
  if (/libro (?:de )?compras|rut proveedor|razon social proveedor/.test(pista)) return 'compras'
  // Nombre de archivo habitual: "ventas.xlsx", "LIBRO VENTA 2025", "COMPRAS (lista)".
  // Va después de las pistas de encabezado para no pisarlas.
  if (/ventas?\b/.test(nombreNormalizado)) return 'ventas'
  if (/compras?\b/.test(nombreNormalizado)) return 'compras'
  return 'banco'
}

export type Progreso = { etapa: string; actual?: number; total?: number }
export type ProgressCb = (p: Progreso) => void

export type ArchivoLeido = {
  filas: Fila[]
  encabezados: string[]
  hojas: string[]
  hoja: string
  erroresLectura: string[]
}

/** Lee CSV o XLSX. Los archivos XLS binarios antiguos deben guardarse como XLSX. */
export async function leerArchivo(
  file: File,
  onProgress?: ProgressCb,
): Promise<ArchivoLeido> {
  const nombre = file.name.toLowerCase()
  const esExcel = nombre.endsWith('.xlsx') || file.type.includes('sheet')
  if (nombre.endsWith('.xls') && !nombre.endsWith('.xlsx')) {
    throw new Error('El formato XLS antiguo no es compatible; guárdalo como XLSX')
  }
  if (esExcel) return leerExcel(file, onProgress)
  const { filas, encabezados, erroresLectura } = await leerCSV(file)
  return { filas, encabezados, hojas: [], hoja: '', erroresLectura }
}

export async function leerHoja(
  file: File,
  hoja: string,
  onProgress?: ProgressCb,
): Promise<{ filas: Fila[]; encabezados: string[] }> {
  onProgress?.({ etapa: 'Leyendo archivo…' })
  const { default: ExcelJSRuntime } = await import('exceljs')
  const wb = new ExcelJSRuntime.Workbook()
  await wb.xlsx.load(await file.arrayBuffer() as never)
  const ws = wb.getWorksheet(hoja)
  return ws ? parsearHoja(ws, onProgress) : { filas: [], encabezados: [] }
}

function leerCSV(
  file: File,
): Promise<{ filas: Fila[]; encabezados: string[]; erroresLectura: string[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Fila>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: '',
      complete: (res) => {
        const encabezados = res.meta.fields ?? []
        const filas = (res.data as Fila[])
          .map(limpiarFila)
          .filter((fila) => filaNoVacia(fila) && !esFilaEncabezado(fila, encabezados))
        const erroresLectura = res.errors.map(
          (e) => `Fila ${(e.row ?? 0) + 2}: ${e.message}`,
        )
        resolve({ filas, encabezados, erroresLectura })
      },
      error: reject,
    })
  })
}

async function leerExcel(file: File, onProgress?: ProgressCb): Promise<ArchivoLeido> {
  onProgress?.({ etapa: 'Leyendo archivo…' })
  const { default: ExcelJSRuntime } = await import('exceljs')
  const wb = new ExcelJSRuntime.Workbook()
  await wb.xlsx.load(await file.arrayBuffer() as never)
  const hojas = wb.worksheets.map((ws) => ws.name)
  if (hojas.length === 0) {
    return { filas: [], encabezados: [], hojas: [], hoja: '', erroresLectura: [] }
  }

  onProgress?.({ etapa: 'Analizando hojas…' })
  const mejor = [...wb.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0]
  const { filas, encabezados } = await parsearHoja(mejor, onProgress)
  return { filas, encabezados, hojas, hoja: mejor.name, erroresLectura: [] }
}

function encabezadosUnicos(ws: ExcelJS.Worksheet): string[] {
  const usados = new Map<string, number>()
  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const base = normalizarTexto(cell.text.trim()) || `Columna ${col}`
    const numero = (usados.get(base) ?? 0) + 1
    usados.set(base, numero)
    headers[col - 1] = numero === 1 ? base : `${base} (${numero})`
  })
  return headers
}

async function parsearHoja(
  ws: ExcelJS.Worksheet,
  onProgress?: ProgressCb,
): Promise<{ filas: Fila[]; encabezados: string[] }> {
  const encabezados = encabezadosUnicos(ws)
  if (encabezados.length === 0) return { filas: [], encabezados: [] }

  const filas: Fila[] = []
  const total = Math.max(0, ws.actualRowCount - 1)
  const lote = 4000
  for (let inicio = 2; inicio <= ws.actualRowCount; inicio += lote) {
    const fin = Math.min(ws.actualRowCount, inicio + lote - 1)
    for (let numero = inicio; numero <= fin; numero += 1) {
      const row = ws.getRow(numero)
      const fila: Fila = {}
      encabezados.forEach((head, index) => {
        fila[head] = normalizarTexto(row.getCell(index + 1).text.trim())
      })
      if (filaNoVacia(fila) && !esFilaEncabezado(fila, encabezados)) filas.push(fila)
    }
    onProgress?.({ etapa: 'Procesando filas…', actual: fin - 1, total })
    if (total > lote) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { filas, encabezados }
}

/** Calcula una clave estable del archivo sin transmitir su contenido. */
export async function calcularHashArchivo(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Una fila se considera vacía si todos sus valores son blanco. */
function filaNoVacia(fila: Fila): boolean {
  return Object.values(fila).some((v) => String(v ?? '').trim() !== '')
}

/** Omite encabezados repetidos dentro del cuerpo (comunes en los XLSX de exdatos). */
function esFilaEncabezado(fila: Fila, encabezados: string[]): boolean {
  return encabezados.length > 0 && encabezados.every(
    (head) => normalizarTexto(String(fila[head] ?? '').trim()) === normalizarTexto(head.trim()),
  )
}

function limpiarFila(fila: Fila): Fila {
  const limpia: Fila = {}
  for (const [k, v] of Object.entries(fila)) {
    limpia[k.trim()] = normalizarTexto(String(v ?? '').trim())
  }
  return limpia
}

/** Repara mojibake: cuando el texto UTF-8 fue interpretado como Latin-1
 *  (p.ej. "VerificaciÃ³n" en vez de "VerificaciÃ³n"). Detectamos los
 *  bytes UTF-8 reales y los decodificamos correctamente. Si el texto ya
 *  está bien, no se altera. */
function normalizarTexto(texto: string): string {
  if (!texto) return texto
  // Señal típica de mojibake UTF-8-leído-como-Latin1: aparición de "Ã"
  // seguida de otro byte alto. Es raro en español bien codificado.
  if (!/[\u00C0-\u00FF]{2,}/.test(texto) && !texto.includes('Ã')) {
    return texto
  }
  try {
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return texto
  }
}

/** Convierte texto de monto a número CLP.
 *  Detecta automáticamente el formato para no romper con separadores de
 *  miles:
 *  - "1.234.567" (punto = miles, CL)        -> 1234567
 *  - "1.234.567,89" (punto miles, coma dec) -> 1234568 (redondea)
 *  - "28,452,900" (coma = miles, EN mal impreso) -> 28452900
 *  - "141,842" → si bien parece decimal, en el contexto chileno de un libro
 *    de compras con totales en pesos, casi siempre es separador de miles.
 *    La heurística: si hay coma Y punto, la coma suele ser decimal y el
 *    punto miles. Si hay SOLO coma, se trata como miles (salvo que tenga
 *    exactamente 2 decimales y el valor sea razonable como decimal). */
function parsearMontoSeguro(texto: string): number | undefined {
  if (!texto || String(texto).trim() === '') return undefined
  // Detecta notación contable de paréntesis: (1.234) → negativo.
  const entreParentesis = /^\(.*\)$/.test(String(texto).trim())
  let t = String(texto).replace(/\$|\s|CLP/gi, '').replace(/[()]/g, '').trim()
  if (!t) return undefined
  let negativo = entreParentesis
  if (/^-/.test(t)) {
    negativo = true
    t = t.slice(1)
  }

  const tienePunto = t.includes('.')
  const tieneComa = t.includes(',')

  let limpio: string
  if (tienePunto && tieneComa) {
    // El último separador es el decimal; el otro, de miles.
    if (t.lastIndexOf('.') > t.lastIndexOf(',')) {
      // Formato EN: 1,234,567.89
      limpio = t.replace(/,/g, '')
    } else {
      // Formato CL: 1.234.567,89
      limpio = t.replace(/\./g, '').replace(',', '.')
    }
  } else if (tienePunto) {
    // Solo puntos. Si hay varios, son miles: 1.234.567
    // Si hay uno solo y a la izquierda hay <=3 dígitos y a la derecha 2,
    // podría ser decimal, pero en pesos CL conviene tratarlo como miles.
    const partes = t.split('.')
    if (partes.length > 2) {
      limpio = partes.join('') // varios puntos → miles
    } else if (partes[1]?.length === 3) {
      limpio = partes.join('') // "1.234" de 4 cifras → miles (no decimal)
    } else {
      limpio = t // un punto, podría ser decimal real
    }
  } else if (tieneComa) {
    // Solo comas. Varios → miles (28,452,900 mal impreso).
    // Uno solo con 3 decimales → miles (141,842).
    // Uno solo con 2 decimales → decimal.
    const partes = t.split(',')
    if (partes.length > 2) {
      limpio = partes.join('')
    } else if (partes[1]?.length === 3) {
      limpio = partes.join('')
    } else {
      limpio = t.replace(',', '.')
    }
  } else {
    limpio = t
  }

  const n = Number(limpio)
  if (!Number.isFinite(n)) return undefined
  const valor = Math.round(n)
  return negativo ? -valor : valor
}

/** Compatibilidad para consumidores que necesitan un número; la conversión
 *  masiva usa la variante segura y reporta valores inválidos. */
export function parsearMonto(texto: string): number {
  return parsearMontoSeguro(texto) ?? 0
}

/** Convierte variados formatos de fecha chilenos a ISO (YYYY-MM-DD). */
export function parsearFecha(texto: string): string {
  if (!texto) return ''
  const t = texto.trim()
  let m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (m) return fechaISOValida(toISO(m[3], m[2], m[1]))
  m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return fechaISOValida(toISO(m[1], m[2], m[3]))
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

function toISO(y: string, m: string, d: string): string {
  const yyyy = y.length === 2 ? `20${y}` : y
  return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Evita que JavaScript normalice silenciosamente fechas imposibles, como
 *  31/02/2026, al mes siguiente. */
function fechaISOValida(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const comprobacion = new Date(Date.UTC(y, m - 1, d))
  return comprobacion.getUTCFullYear() === y &&
    comprobacion.getUTCMonth() === m - 1 &&
    comprobacion.getUTCDate() === d
    ? fecha
    : ''
}

function fechaHoyISO(): string {
  const ahora = new Date()
  const offset = ahora.getTimezoneOffset() * 60_000
  return new Date(ahora.getTime() - offset).toISOString().slice(0, 10)
}

/** Cuenta filas con una fecha de operación futura antes de importarlas. */
export function contarFechasFuturas(
  filas: Fila[],
  mapeo: MapeoColumnas,
): number {
  const columnaFecha = Object.entries(mapeo).find(([, campo]) => campo === 'fecha')?.[0]
  if (!columnaFecha) return 0
  const hoy = fechaHoyISO()
  return filas.reduce((total, fila) => {
    const fecha = parsearFecha(fila[columnaFecha] ?? '')
    return total + (fecha !== '' && fecha > hoy ? 1 : 0)
  }, 0)
}

function slug(clave: string): string {
  return clave
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function numeroOpc(texto: string): number | undefined {
  return parsearMontoSeguro(texto)
}

export interface DiagnosticoFila {
  fila: number
  tipo: 'omitida' | 'advertencia'
  motivo: string
}

export interface ResultadoConversion {
  transacciones: Transaccion[]
  diagnosticos: DiagnosticoFila[]
  omitidas: number
  advertencias: number
}

function hashTexto(texto: string): string {
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (let i = 0; i < texto.length; i += 1) {
    const code = texto.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193)
    b = Math.imul(b ^ code, 0x85ebca6b)
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

export function crearIdImportacion(fileHash: string, contexto: string): string {
  return `${fileHash.slice(0, 48)}-${hashTexto(contexto)}`
}

function esNotaCredito(tipoDoc: string): boolean {
  const normalizado = tipoDoc
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return /nota.*credito|(^|\s)nc([\s-]|$)|(^|\s)61([\s-]|$)/i.test(normalizado)
}

function resolverPerfil(
  fuente: FuenteDatos,
  perfilOLibroCompras: PerfilArchivo | boolean,
): PerfilArchivo {
  if (typeof perfilOLibroCompras === 'string') return perfilOLibroCompras
  if (fuente === 'banco') return 'banco'
  return perfilOLibroCompras ? 'compras' : 'ventas'
}

function tipoDocPerfil(perfil: PerfilArchivo): string | undefined {
  if (perfil.startsWith('nota_credito')) return 'Nota de Crédito'
  if (perfil.startsWith('nota_debito')) return 'Nota de Débito'
  if (perfil === 'factoring') return 'Factoring'
  return undefined
}

function aplicarSignoContable(
  monto: number,
  perfil: PerfilArchivo,
  tipoDoc: string,
): number {
  const valor = Math.abs(monto)
  switch (perfil) {
    case 'compras': return esNotaCredito(tipoDoc) ? valor : -valor
    case 'ventas': return esNotaCredito(tipoDoc) ? -valor : valor
    case 'nota_credito': return -valor
    case 'nota_debito': return valor
    case 'factoring': return valor
    default: return monto
  }
}

/** Convierte filas y entrega un reporte explícito de lo omitido o dudoso. */
export function analizarFilas(
  filas: Fila[],
  mapeo: MapeoColumnas,
  fuente: FuenteDatos,
  banco: BancoChileno | undefined,
  perfilOLibroCompras: PerfilArchivo | boolean = false,
): ResultadoConversion {
  const perfil = resolverPerfil(fuente, perfilOLibroCompras)
  const porCampo = new Map<CampoMapeado, string>()
  for (const [head, campo] of Object.entries(mapeo)) {
    if (campo !== 'ignorar' && !porCampo.has(campo)) porCampo.set(campo, head)
  }
  const get = (f: Fila, campo: CampoMapeado): string => {
    const head = porCampo.get(campo)
    return head ? f[head] ?? '' : ''
  }

  const transacciones: Transaccion[] = []
  const diagnosticos: DiagnosticoFila[] = []
  const ocurrencias = new Map<string, number>()

  filas.forEach((f, index) => {
    const numeroFila = index + 2
    const fecha = parsearFecha(get(f, 'fecha'))
    if (!fecha) {
      diagnosticos.push({ fila: numeroFila, tipo: 'omitida', motivo: 'Fecha vacía o inválida' })
      return
    }

    const montoDirecto = get(f, 'monto')
    const cargoTexto = get(f, 'cargo')
    const abonoTexto = get(f, 'abono')
    let montoBase: number | undefined
    if (montoDirecto !== '') {
      montoBase = parsearMontoSeguro(montoDirecto)
    } else if (cargoTexto !== '' || abonoTexto !== '') {
      const cargo = cargoTexto === '' ? 0 : parsearMontoSeguro(cargoTexto)
      const abono = abonoTexto === '' ? 0 : parsearMontoSeguro(abonoTexto)
      if (cargo === undefined || abono === undefined) {
        montoBase = undefined
      } else {
        montoBase = Math.abs(abono) - Math.abs(cargo)
        if (cargo !== 0 && abono !== 0) {
          diagnosticos.push({
            fila: numeroFila,
            tipo: 'advertencia',
            motivo: 'La fila contiene Cargo y Abono; se importó la diferencia',
          })
        }
      }
    }

    if (montoBase === undefined) {
      diagnosticos.push({ fila: numeroFila, tipo: 'omitida', motivo: 'Monto vacío o inválido' })
      return
    }

    const tipoDoc = (tipoDocPerfil(perfil) ?? get(f, 'tipo_doc')) || undefined
    let monto = montoBase
    if (fuente === 'contabilidad') {
      monto = aplicarSignoContable(montoBase, perfil, tipoDoc ?? '')
    }
    if (monto === 0) {
      diagnosticos.push({ fila: numeroFila, tipo: 'advertencia', motivo: 'Movimiento de monto $0' })
    }

    const rutOriginal = get(f, 'rut')
    const rutLimpio = limpiarRUT(rutOriginal)
    const rut = rutLimpio && validarRUT(rutLimpio) ? rutLimpio : undefined
    if (rutOriginal && !rut) {
      diagnosticos.push({ fila: numeroFila, tipo: 'advertencia', motivo: 'RUT inválido; se dejó vacío' })
    }

    const proveedor = get(f, 'proveedor') || undefined
    const contraparte = get(f, 'contraparte') || undefined
    const folio = get(f, 'folio') || undefined
    const folioReferencia = get(f, 'folio_referencia') || undefined
    const descripcionDerivada = perfil === 'factoring'
      ? [tipoDoc, contraparte, folioReferencia ?? folio].filter(Boolean).join(' ')
      : [tipoDoc, contraparte ?? proveedor, folio].filter(Boolean).join(' ')
    const descripcion = perfil === 'factoring'
      ? descripcionDerivada || '(sin glosa)'
      : get(f, 'descripcion') || descripcionDerivada || '(sin glosa)'

    // Las cartolas no traen columna de RUT, pero muchas glosas lo incluyen
    // ("PAGO RECIBIDO PRV 078187230-K BCO CHILE"). Se recupera aquí, antes de
    // calcular el fingerprint, para que la huella lo incluya y el trigger de
    // la base acepte la fila.
    const rutFinal = rut ?? (perfil === 'banco' ? extraerRUTDeTexto(descripcion) : undefined)

    // Coherencia del libro: si el archivo trae neto/IVA/exento, `monto` debe ser
    // el TOTAL. Cuando no cuadra suele ser porque se mapeó "Monto Neto" en vez
    // de "Monto Total", y entonces el pago del banco (que va con IVA) nunca
    // calza por monto.
    const netoVal = numeroOpc(get(f, 'neto'))
    const ivaVal = numeroOpc(get(f, 'iva_total'))
    const exentoVal = numeroOpc(get(f, 'exento'))
    const tieneDesglose = [netoVal, ivaVal, exentoVal].some((v) => v !== undefined && v !== 0)
    if (tieneDesglose && fuente === 'contabilidad') {
      const total = Math.abs(netoVal ?? 0) + Math.abs(ivaVal ?? 0) + Math.abs(exentoVal ?? 0)
      if (Math.abs(Math.abs(monto) - total) > 2) {
        diagnosticos.push({
          fila: numeroFila,
          tipo: 'advertencia',
          motivo:
            `El monto (${monto}) no cuadra con neto + IVA + exento (${total}); ` +
            'revisa si se mapeó "Monto Neto" en lugar de "Monto Total"',
        })
      }
    }

    const metadatos: Record<string, unknown> = { perfil_archivo: perfil }
    for (const [head, campo] of Object.entries(mapeo)) {
      // 'pago_parcial' admite varias columnas y se consolida aparte en
      // montos_pago; no se vuelca a metadatos como campo duplicado.
      if (campo === 'pago_parcial') continue
      const duplicada = campo !== 'ignorar' && porCampo.get(campo) !== head
      if (campo === 'ignorar' || duplicada) {
        const val = (f[head] ?? '').trim()
        if (val !== '') metadatos[slug(head)] = val
      }
    }
    // Persiste la referencia del código contable para que la clasificación
    // sobreviva a las recargas. `codigoReferencia` es transitorio (no se guarda
    // como columna), así que sin esto la re-detección posterior perdería el
    // código asignado al importar.
    const refContable = (get(f, 'codigo_contable') || '').trim()
    if (refContable) metadatos.codigo_contable = refContable

    // Pagos parciales: montos de cuotas (columnas mapeadas a 'pago_parcial':
    // P1..Pn, cuotas, pago/abono, total pagos). Permiten conciliar cuando el
    // banco refleja un abono parcial y no el total del documento. Se guardan
    // como números para que el motor de matching los use tras recargar.
    const montosPago: number[] = []
    for (const [head, campo] of Object.entries(mapeo)) {
      if (campo !== 'pago_parcial') continue
      const val = parsearMontoSeguro(f[head] ?? '')
      if (val !== undefined && val !== 0) montosPago.push(Math.abs(val))
    }
    const montosUnicos = [...new Set(montosPago)]
    if (montosUnicos.length > 0) metadatos.montos_pago = montosUnicos

    const saldo = numeroOpc(get(f, 'saldo'))
    const documento = get(f, 'documento') || undefined
    const baseHuella = [
      fuente, banco ?? '', fecha, monto, descripcion.trim().toLowerCase(), rutFinal ?? '',
      documento ?? '', tipoDoc ?? '', folio ?? '', proveedor ?? '',
    ].join('|')
    const hashBase = hashTexto(baseHuella)
    const ocurrencia = (ocurrencias.get(hashBase) ?? 0) + 1
    ocurrencias.set(hashBase, ocurrencia)
    const fingerprint = `${hashBase}-${ocurrencia}`

    transacciones.push({
      id: `${fuente}-${fingerprint}`,
      fuente,
      banco,
      fecha,
      monto,
      saldo,
      descripcion,
      rut: rutFinal,
      estado: 'no_conciliada',
      documento,
      externalId: get(f, 'external_id') || undefined,
      contraparte,
      codigoReferencia: get(f, 'codigo_contable') || undefined,
      codigoAliasesArchivo: (() => {
        const crudo = get(f, 'codigo_aliases')
        if (!crudo) return undefined
        const lista = crudo
          .split(/[|;\n]+/)
          .map((valor) => valor.trim())
          .filter(Boolean)
        return lista.length > 0 ? lista : undefined
      })(),
      codigoTipoDoc: get(f, 'codigo_tipo_doc') || undefined,
      ivaTotal: numeroOpc(get(f, 'iva_total')),
      ivaDebito: numeroOpc(get(f, 'iva_debito')),
      saldoDocumento: numeroOpc(get(f, 'saldo_documento')),
      folioReferencia,
      tipoDocReferencia: get(f, 'tipo_doc_referencia') || undefined,
      subtipoDocumento: get(f, 'subtipo_documento') || undefined,
      proveedor,
      tipoDoc,
      folio,
      exento: numeroOpc(get(f, 'exento')),
      neto: numeroOpc(get(f, 'neto')),
      ivaRecup: numeroOpc(get(f, 'iva_recup')),
      ivaNr: numeroOpc(get(f, 'iva_nr')),
      fechaVencimiento: parsearFecha(get(f, 'fecha_vencimiento')) || undefined,
      estadoPago: get(f, 'estado_pago') || undefined,
      metadatos: Object.keys(metadatos).length ? metadatos : undefined,
      fingerprint,
    })
  })

  return {
    transacciones,
    diagnosticos,
    omitidas: diagnosticos.filter((d) => d.tipo === 'omitida').length,
    advertencias: diagnosticos.filter((d) => d.tipo === 'advertencia').length,
  }
}

/** API compatible usada por previews y otros consumidores. */
export function filasATransacciones(
  filas: Fila[],
  mapeo: MapeoColumnas,
  fuente: FuenteDatos,
  banco: BancoChileno | undefined,
  perfilONegarMonto: PerfilArchivo | boolean = false,
): Transaccion[] {
  return analizarFilas(filas, mapeo, fuente, banco, perfilONegarMonto).transacciones
}
