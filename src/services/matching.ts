import { differenceInCalendarDays, parseISO } from 'date-fns'
import { compareTwoStrings } from 'string-similarity'
import type {
  EstadoTransaccion,
  MatchingConfig,
  Transaccion,
} from '@/types/conciliacion'
import { cuerpoRUT } from '@/lib/rut'

/** Configuración por defecto del matching. */
export const MATCHING_DEFAULT: MatchingConfig = {
  toleranciaMonto: 1, // ±$1 por redondeo
  // Un pago casi nunca ocurre el mismo día que la emisión del documento. Medido
  // sobre los datos reales (abril 2026): 24 pagos sin contraparte tenían su
  // factura con el MISMO monto a 62-77 días — facturas de enero pagadas a 60-90
  // días, el plazo habitual en Chile. Con 60 días esos pares se perdían.
  // 90 días cubre los plazos 30/60/90 sin abrir la puerta a pares casuales: el
  // monto se exige exacto (±$1) y el desempate prioriza RUT, glosa y cercanía.
  toleranciaDias: 90,
  umbralSimilitud: 0.72,
}

/** Normaliza una glosa para comparación difusa. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Evaluacion {
  montoOK: boolean
  /** Monto dentro de la tolerancia porcentual sin ser exacto (exige RUT). */
  montoCercano: boolean
  fechaOK: boolean
  rutOK: boolean
  rutConflicto: boolean
  /** El N° de documento de la cartola coincide con el folio del libro. */
  llaveDocumento: boolean
  similitud: number
  /** Días entre el pago y vencimiento, o emisión sólo si no hay vencimiento. */
  diffDias: number
}

/**
 * Tolerancia porcentual de monto (0,5%). Sólo se aplica cuando el RUT coincide:
 * sin esa llave, admitir diferencias de monto abre la puerta a falsos pares.
 */
const TOLERANCIA_PCT = 0.005

/**
 * Normaliza un número de documento para compararlo: sólo dígitos y sin ceros a
 * la izquierda (la cartola escribe "0001234" y el libro "1234").
 */
function normalizarDocumento(valor: string | undefined): string {
  if (!valor) return ''
  const digitos = valor.replace(/[^0-9]/g, '')
  return digitos ? String(Number(digitos)) : ''
}

/** El movimiento bancario referencia el mismo documento que el libro. */
function documentoCoincide(banco: Transaccion, contab: Transaccion): boolean {
  const a = normalizarDocumento(banco.documento)
  if (!a) return false
  return [contab.folio, contab.folioReferencia, contab.documento].some(
    (candidato) => normalizarDocumento(candidato) === a,
  )
}

/**
 * Montos con los que un documento contable puede calzar contra el banco: su
 * total y, si existen, cada pago parcial (cuotas P1..Pn / pago-abono). Todos
 * llevan el signo del movimiento (egreso negativo, ingreso positivo). Un pago
 * bancario que refleja sólo una cuota calza así con la factura completa.
 */
export function montosCandidatos(t: Transaccion): number[] {
  const total = Math.round(t.monto)
  if (t.fuente !== 'contabilidad') return [total]
  const parciales = t.metadatos?.montos_pago
  if (!Array.isArray(parciales) || parciales.length === 0) return [total]
  const signo = Math.sign(t.monto) || 1
  const montos = new Set<number>([total])
  for (const p of parciales) {
    const n = Number(p)
    if (Number.isFinite(n) && n !== 0) montos.add(Math.round(signo * Math.abs(n)))
  }
  return [...montos]
}

/** Ambos lados usan el mismo convenio: ingreso positivo y egreso negativo. */
function montosCompatibles(
  banco: Transaccion,
  contab: Transaccion,
  tolerancia: number,
): boolean {
  if (banco.monto === 0) return false
  for (const cand of montosCandidatos(contab)) {
    if (cand === 0) continue
    if (Math.sign(banco.monto) !== Math.sign(cand)) continue
    if (Math.abs(banco.monto - cand) <= tolerancia) return true
  }
  return false
}

/**
 * Igual que `montosCompatibles` pero admitiendo una diferencia porcentual.
 * Se usa sólo como propuesta (estado 'sugerida') y siempre con RUT coincidente.
 */
function montosCercanos(banco: Transaccion, contab: Transaccion): boolean {
  if (banco.monto === 0) return false
  for (const cand of montosCandidatos(contab)) {
    if (cand === 0) continue
    if (Math.sign(banco.monto) !== Math.sign(cand)) continue
    if (Math.abs(banco.monto - cand) <= Math.abs(cand) * TOLERANCIA_PCT) return true
  }
  return false
}

/** Días calendario entre el movimiento bancario y la fecha del documento. */
function diasDeDiferencia(banco: Transaccion, contab: Transaccion): number {
  const referencia = contab.fechaVencimiento ?? contab.fecha
  return Math.abs(differenceInCalendarDays(parseISO(banco.fecha), parseISO(referencia)))
}

function evaluar(
  banco: Transaccion,
  contab: Transaccion,
  config: MatchingConfig,
): Evaluacion {
  const montoOK = montosCompatibles(banco, contab, config.toleranciaMonto)
  // Una diferencia de monto sólo se admite cuando el RUT confirma que se trata
  // del mismo proveedor/cliente; sin esa llave sería ruido.
  const montoCercano = !montoOK && montosCercanos(banco, contab)

  const diffDias = diasDeDiferencia(banco, contab)
  const fechaOK = diffDias <= config.toleranciaDias

  const rutBanco = banco.rut ? cuerpoRUT(banco.rut) : ''
  const rutContab = contab.rut ? cuerpoRUT(contab.rut) : ''
  const ambosConRut = rutBanco !== '' && rutContab !== ''
  const rutOK = ambosConRut && rutBanco === rutContab
  const rutConflicto = ambosConRut && rutBanco !== rutContab

  const textoMatching = (t: Transaccion): string => normalizar([
    t.descripcion,
    t.contraparte,
    t.folio,
    t.documento,
    t.folioReferencia,
    t.tipoDoc,
  ].filter(Boolean).join(' '))
  const similitud = compareTwoStrings(
    textoMatching(banco),
    textoMatching(contab),
  )
  const llaveDocumento = documentoCoincide(banco, contab)
  return { montoOK, montoCercano, fechaOK, rutOK, rutConflicto, llaveDocumento, similitud, diffDias }
}

/** Niveles de calidad de un par, de mayor a menor fuerza. */
const NIVEL = {
  llaveDura: 5, // RUT o N° de documento igual + monto exacto → concilia
  fuerte: 4, // monto + fecha + descripción similar → concilia
  sugerido: 3, // monto + fecha, descripción distinta → concilia sólo si es único
  propuesta: 2, // RUT igual + monto dentro de la tolerancia % → sugerida
  soloMonto: 1, // solo monto (fuera de rango de fecha) → pendiente
  ninguno: 0,
} as const

interface Par {
  banco: Transaccion
  contab: Transaccion
  ev: Evaluacion
  nivel: number
  estado: EstadoTransaccion // estado a asignar si el par gana
  confianza: number | undefined
}

/**
 * Clasifica un par candidato en nivel de calidad y el estado que produciría.
 */
function clasificar(
  ev: Evaluacion,
  config: MatchingConfig,
): { nivel: number; estado: EstadoTransaccion; confianza: number | undefined } {
  // Un RUT distinto en ambos lados descarta el par sin importar el monto.
  if (ev.rutConflicto) {
    return { nivel: NIVEL.ninguno, estado: 'no_conciliada', confianza: undefined }
  }
  // Llave dura: el RUT o el N° de documento confirman que es la contraparte.
  if (ev.montoOK && (ev.rutOK || ev.llaveDocumento)) {
    return {
      nivel: NIVEL.llaveDura,
      estado: 'conciliada',
      confianza: ev.rutOK ? 1 : 0.99,
    }
  }
  if (ev.montoOK && ev.fechaOK) {
    if (ev.similitud >= config.umbralSimilitud) {
      return { nivel: NIVEL.fuerte, estado: 'conciliada', confianza: Math.max(0.9, ev.similitud) }
    }
    // Monto y fecha calzan pero la glosa no aporta evidencia. Se concilia sólo
    // si no hay otra factura compitiendo por este movimiento; `conciliar`
    // degrada a 'sugerida' cuando hay competencia (ver paso 3).
    return {
      nivel: NIVEL.sugerido,
      estado: 'conciliada',
      confianza: Math.max(0.6, ev.similitud),
    }
  }
  // Mismo RUT con una diferencia de monto pequeña: se propone, no se afirma.
  if (ev.montoCercano && ev.rutOK && ev.fechaOK) {
    return { nivel: NIVEL.propuesta, estado: 'sugerida', confianza: 0.7 }
  }
  if (ev.montoOK) {
    return { nivel: NIVEL.soloMonto, estado: 'pendiente', confianza: undefined }
  }
  return { nivel: NIVEL.ninguno, estado: 'no_conciliada', confianza: undefined }
}

/**
 * Ejecuta la conciliación entre las transacciones del banco y la contabilidad.
 *
 * Algoritmo greedy global: evalúa TODOS los pares banco×contabilidad, los
 * ordena por calidad descendente (llave dura > fuerte > sugerido > propuesta) y
 * los asigna uno a uno, consumiendo cada banco y cada contabilidad una sola vez.
 * Así, cuando hay varias facturas y varios pagos idénticos del mismo proveedor
 * (duplicados), todos encuentran pareja en vez de solo el primero.
 *
 * Los pares de monto $0 se descartan: no son pagos reales y solo generan
 * ruido (0 siempre "coincide" con 0).
 *
 * @returns Nuevo arreglo con los estados y matchId actualizados.
 */
export function conciliar(
  transacciones: Transaccion[],
  config: MatchingConfig = MATCHING_DEFAULT,
): Transaccion[] {
  const resultado = transacciones.map((t): Transaccion => (
    // 'resuelta' es una decisión de clasificación (movimiento sin contraparte
    // explicado por su código): se preserva y queda fuera del emparejamiento.
    t.estado === 'resuelta'
      ? { ...t }
      : {
          ...t,
          estado: 'no_conciliada' as EstadoTransaccion,
          matchId: undefined,
          confianza: undefined,
        }
  ))

  const disponible = (t: Transaccion): boolean =>
    t.monto !== 0 && t.estado !== 'resuelta'
  const banco = resultado.filter((t) => t.fuente === 'banco' && disponible(t))
  const contab = resultado.filter((t) => t.fuente === 'contabilidad' && disponible(t))

  // Indexa por monto para no recorrer el producto cartesiano completo. Cada
  // documento se indexa bajo su total y bajo cada pago parcial, de modo que un
  // movimiento bancario que refleja una cuota también encuentre su factura.
  const contabPorMonto = new Map<number, Transaccion[]>()
  for (const c of contab) {
    for (const clave of montosCandidatos(c)) {
      const grupo = contabPorMonto.get(clave) ?? []
      grupo.push(c)
      contabPorMonto.set(clave, grupo)
    }
  }
  const candidatosMonto = (monto: number): Transaccion[] => {
    const vistos = new Set<string>()
    const candidatos: Transaccion[] = []
    const desde = Math.floor(monto - config.toleranciaMonto)
    const hasta = Math.ceil(monto + config.toleranciaMonto)
    for (let valor = desde; valor <= hasta; valor += 1) {
      for (const c of contabPorMonto.get(valor) ?? []) {
        if (vistos.has(c.id)) continue
        vistos.add(c.id)
        candidatos.push(c)
      }
    }
    return candidatos
  }

  // Índice por RUT: permite proponer pares con una diferencia de monto pequeña
  // (tolerancia porcentual) sin recorrer todo el universo. Sólo se usa cuando
  // el movimiento trae RUT, que en la cartola suele venir dentro de la glosa.
  const contabPorRut = new Map<string, Transaccion[]>()
  for (const c of contab) {
    const cuerpo = c.rut ? cuerpoRUT(c.rut) : ''
    if (!cuerpo) continue
    const grupo = contabPorRut.get(cuerpo) ?? []
    grupo.push(c)
    contabPorRut.set(cuerpo, grupo)
  }

  // 1) Construir sólo pares con monto y signo compatibles.
  const pares: Par[] = []
  for (const b of banco) {
    const candidatos = new Set<Transaccion>(candidatosMonto(b.monto))
    const cuerpoBanco = b.rut ? cuerpoRUT(b.rut) : ''
    if (cuerpoBanco) {
      for (const c of contabPorRut.get(cuerpoBanco) ?? []) candidatos.add(c)
    }
    for (const c of candidatos) {
      const ev = evaluar(b, c, config)
      const { nivel, estado, confianza } = clasificar(ev, config)
      if (nivel === NIVEL.ninguno) continue // sin compatibilidad de monto
      if (nivel === NIVEL.soloMonto) continue // se trata después (pendiente)
      pares.push({ banco: b, contab: c, ev, nivel, estado, confianza })
    }
  }

  // 2) Ordenar: mejor nivel primero; a igual nivel, más similitud y menor
  //    diferencia de fecha ganan. Esto asegura que los matches exactos se
  //    resuelvan antes que los difusos, evitando que un match débil le robe
  //    la contraparte a uno fuerte.
  pares.sort((a, z) => {
    if (z.nivel !== a.nivel) return z.nivel - a.nivel
    if (z.ev.similitud !== a.ev.similitud) return z.ev.similitud - a.ev.similitud
    return a.ev.diffDias - z.ev.diffDias
  })

  // 3) Asignar greedy: cada banco y contabilidad se usa una sola vez.
  const bancoUsado = new Set<string>()
  const contabUsada = new Set<string>()
  for (const p of pares) {
    if (bancoUsado.has(p.banco.id) || contabUsada.has(p.contab.id)) continue
    // Cuando el único sustento es monto + fecha (glosa no concluyente), el par
    // sólo es seguro si no hay otra factura disponible con el mismo monto y
    // signo: con competencia se propone como 'sugerida' para revisión humana.
    let estado = p.estado
    if (estado === 'conciliada' && p.nivel === NIVEL.sugerido) {
      const rivales = candidatosMonto(p.banco.monto).filter(
        (c) =>
          c.id !== p.contab.id &&
          !contabUsada.has(c.id) &&
          montosCompatibles(p.banco, c, config.toleranciaMonto) &&
          // Sólo compite un documento que podría ser la contraparte del
          // movimiento, es decir, dentro de la ventana de fecha. Una factura
          // fuera de plazo (p. ej. de otro año) no debe degradar un par que sí
          // calza: sin este filtro, importar un libro antiguo bajaba la
          // conciliación de períodos que ni siquiera toca.
          diasDeDiferencia(p.banco, c) <= config.toleranciaDias,
      )
      if (rivales.length > 0) estado = 'sugerida'
    }
    p.banco.estado = estado
    p.banco.matchId = p.contab.id
    p.banco.confianza = p.confianza
    p.contab.estado = estado
    p.contab.matchId = p.banco.id
    p.contab.confianza = p.confianza
    bancoUsado.add(p.banco.id)
    contabUsada.add(p.contab.id)
  }

  // 4) Pagos sin pareja confirmada pero con un monto y signo compatibles
  //    quedan pendientes para revisión manual.
  for (const b of banco) {
    if (bancoUsado.has(b.id)) continue
    if (b.monto === 0) continue
    const hayPorMonto = candidatosMonto(b.monto).some(
      (c) => !contabUsada.has(c.id) && montosCompatibles(b, c, config.toleranciaMonto),
    )
    if (hayPorMonto) b.estado = 'pendiente'
  }

  return resultado
}

/** Calcula el monto total (absoluto) sin explicar (ni conciliado ni resuelto). */
export function montoNoConciliado(transacciones: Transaccion[]): number {
  return transacciones
    .filter((t) => t.estado !== 'conciliada' && t.estado !== 'resuelta')
    .reduce((acc, t) => acc + Math.abs(t.monto), 0)
}
