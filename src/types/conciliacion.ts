/** Tipos de dominio para la conciliación bancaria. */

/** Nombre de banco configurable por cada organización. */
export type BancoChileno = string

export interface BancoCatalogo {
  nombre: string
}

/** Origen de los datos cargados. */
export type FuenteDatos = 'banco' | 'contabilidad'

export type CodigoOrigen =
  | 'explicito'
  | 'id'
  | 'clave'
  | 'alias'
  | 'nombre'
  | 'perfil'
  | 'contraparte'
  | 'manual'
  | 'rut'

/** Estado de conciliación de una transacción. */
export type EstadoTransaccion =
  | 'conciliada'
  | 'pendiente'
  | 'no_conciliada'
  | 'sugerida'
  | 'resuelta'

/** Transacción normalizada proveniente del banco o de la contabilidad. */
export interface Transaccion {
  id: string
  fuente: FuenteDatos
  banco?: BancoChileno
  /** Fecha de la operación en formato ISO (YYYY-MM-DD). */
  fecha: string
  /** Monto en CLP. Positivo = ingreso (abono), negativo = egreso (cargo). */
  monto: number
  /** Saldo posterior, opcional (solo extractos bancarios). */
  saldo?: number
  /** Glosa / descripción tal como viene en el extracto. */
  descripcion: string
  /** RUT del contraparte, opcional. */
  rut?: string
  /** Categoría contable sugerida o asignada. */
  categoria?: string
  /** Código contable asignado; es distinto del código tributario SII. */
  codigoId?: string
  codigoOrigen?: CodigoOrigen
  codigoConfianza?: number
  codigoEvidencia?: string
  /** Valor explícito leído del archivo; sólo se usa durante la clasificación previa a importar. */
  codigoReferencia?: string
  /** Aliases del código leídos del archivo; se fusionan al catálogo al importar. */
  codigoAliasesArchivo?: string[]
  estado: EstadoTransaccion
  /** ID de la transacción con la que se concilió, si aplica. */
  matchId?: string
  /** Confidence del matching difuso (0..1), cuando corresponde. */
  confianza?: number
  /** Número de documento/cheque, opcional. */
  documento?: string
  /** Identificador estable provisto por el sistema de origen (por ejemplo, UUID). */
  externalId?: string
  /** Nombre o razón social de la contraparte. */
  contraparte?: string
  /** Código tributario SII del tipo de documento. */
  codigoTipoDoc?: string
  /** IVA total informado por el documento. */
  ivaTotal?: number
  /** IVA débito informado por el documento. */
  ivaDebito?: number
  /** Saldo pendiente del documento contable. */
  saldoDocumento?: number
  /** Folio del documento referenciado por una nota. */
  folioReferencia?: string
  /** Tipo del documento referenciado por una nota. */
  tipoDocReferencia?: string
  /** Subtipo de documento (por ejemplo, tipo de nota). */
  subtipoDocumento?: string

  // ---------------------- Campos del Libro de Compras ----------------------
  proveedor?: string
  tipoDoc?: string
  folio?: string
  exento?: number
  neto?: number
  ivaRecup?: number
  ivaNr?: number
  fechaVencimiento?: string
  estadoPago?: string
  metadatos?: Record<string, unknown>
  fingerprint?: string
  importId?: string
}

export interface ResultadoImportacion {
  insertadas: number
  omitidas: number
  yaImportado: boolean
}

export interface ProgresoImportacion {
  etapa: 'preparando' | 'subiendo' | 'confirmando' | 'recargando' | 'conciliando'
  actual: number
  total: number
  mensaje: string
}

export interface MatchingConfig {
  toleranciaMonto: number
  toleranciaDias: number
  umbralSimilitud: number
}

export type OperadorRegla =
  | 'contiene'
  | 'no_contiene'
  | 'es_igual'
  | 'comienza_con'
  | 'termina_con'
  | 'mayor_que'
  | 'menor_que'
  | 'monto_positivo'
  | 'monto_negativo'

export type CampoRegla =
  | 'descripcion'
  | 'monto'
  | 'rut'
  | 'categoria'
  | 'banco'

export interface AccionRegla {
  asignarCategoria?: string
}

export interface Regla {
  id: string
  nombre: string
  activa: boolean
  campo: CampoRegla
  operador: OperadorRegla
  valor: string
  accion: AccionRegla
  prioridad: number
}

/** Código contable del catálogo del cliente (ej. COVE, IVEN, REMU). */
export interface Codigo {
  /** Mnemónico del cliente, en mayúsculas. */
  id: string
  /** Nombre o desglose humano del ítem. */
  nombre: string
  /** Agrupador padre opcional; no reemplaza al código. */
  categoria?: string
  descripcion?: string
  /** Clave numérica u otro identificador del cliente (ej. 2804). */
  clave?: string
  /** Frases completas permitidas para detección automática. */
  aliases: string[]
  /** Menor número gana cuando dos códigos tienen igual evidencia. */
  prioridad: number
  activo: boolean
}

/** KPI del dashboard. */
export interface Kpi {
  totalTransacciones: number
  /** Movimientos que se están midiendo (banco con monto != 0). */
  universo: number
  montoNoConciliado: number
  tasaConciliacion: number // 0..100, solo movimientos emparejados (conciliada)
  /** 0..100, explicados = conciliada + resuelta (sin contraparte, por código). */
  tasaExplicado: number
  conciliadas: number
  resueltas: number
  /** Pares propuestos por monto/fecha o RUT que esperan revisión humana. */
  sugeridas: number
  /** Movimientos con código que exige documento (COVE/IVEN/MER/FACT). */
  operacion: number
  /** Movimientos con código de tesorería (traspasos, impuestos, comisiones…). */
  tesoreria: number
  montoTotal: number
}

/** Punto de evolución temporal de la conciliación. */
export interface PuntoEvolucion {
  fecha: string
  conciliadas: number
  pendientes: number
  noConciliadas: number
}

/** Agregado por banco para gráficos. */
export interface AgregadoPorBanco {
  banco: string
  total: number
  conciliadas: number
}
