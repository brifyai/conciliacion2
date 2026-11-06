import { format, parseISO } from 'date-fns'
import type {
  AgregadoPorBanco,
  Kpi,
  PuntoEvolucion,
  Transaccion,
} from '@/types/conciliacion'
import { CODIGOS_CON_DOCUMENTO } from '@/services/categoriesEngine'

/**
 * Universo sobre el que se mide la conciliación bancaria. Se excluyen montos $0
 * (traspasos internos, notas anuladas). Cuando hay cartola bancaria cargada, el
 * universo son los movimientos del BANCO: se reconcilia el extracto contra la
 * contabilidad. Las facturas del libro sin pago no son "no conciliadas" (están
 * pendientes de pago) y se siguen en cuentas por pagar/cobrar, no aquí.
 */
export function universoConciliacion(transacciones: Transaccion[]): Transaccion[] {
  const conMonto = transacciones.filter((t) => t.monto !== 0)
  return conMonto.some((t) => t.fuente === 'banco')
    ? conMonto.filter((t) => t.fuente === 'banco')
    : conMonto
}

/**
 * Movimiento del banco sin conciliar cuyo código exige calzar con un documento
 * del libro (COVE/IVEN/MER/FACT). Es la lista que guía qué falta conciliar.
 */
export function esperaDocumento(t: Transaccion): boolean {
  return (
    t.fuente === 'banco' &&
    t.estado === 'no_conciliada' &&
    !!t.codigoId &&
    CODIGOS_CON_DOCUMENTO.has(t.codigoId) &&
    t.monto !== 0
  )
}

/** Calcula los KPIs principales a partir de las transacciones. */
export function calcularKpis(transacciones: Transaccion[]): Kpi {
  const base = universoConciliacion(transacciones)
  const conciliadas = base.filter((t) => t.estado === 'conciliada').length
  const resueltas = base.filter((t) => t.estado === 'resuelta').length
  const sugeridas = base.filter((t) => t.estado === 'sugerida').length
  // Desglose del universo: los códigos que exigen documento (COVE/IVEN/MER/FACT)
  // son movimientos de "operación" (pagos y cobros que deben calzar con una
  // factura); el resto son tesorería (traspasos entre cuentas, impuestos,
  // comisiones, tarjetas), que por naturaleza no tienen documento contable.
  const conCodigo = base.filter((t) => t.codigoId)
  const operacion = conCodigo.filter((t) => CODIGOS_CON_DOCUMENTO.has(t.codigoId!)).length
  const tesoreria = conCodigo.length - operacion
  // Un movimiento "explicado" es el que está conciliado (con contraparte) o
  // resuelto (sin contraparte, justificado por su código de tesorería).
  const explicados = conciliadas + resueltas
  const montoNoConciliado = base
    .filter((t) => t.estado !== 'conciliada' && t.estado !== 'resuelta')
    .reduce((acc, t) => acc + Math.abs(t.monto), 0)
  const montoTotal = base.reduce((acc, t) => acc + Math.abs(t.monto), 0)

  return {
    totalTransacciones: transacciones.length,
    universo: base.length,
    montoNoConciliado,
    tasaConciliacion: base.length > 0 ? (conciliadas / base.length) * 100 : 0,
    tasaExplicado: base.length > 0 ? (explicados / base.length) * 100 : 0,
    conciliadas,
    resueltas,
    sugeridas,
    operacion,
    tesoreria,
    montoTotal,
  }
}

/** Serie temporal de evolución de la conciliación por fecha. */
export function evolucionConciliacion(transacciones: Transaccion[]): PuntoEvolucion[] {
  const porFecha = new Map<string, PuntoEvolucion>()
  const ordenadas = [...transacciones].sort((a, b) => a.fecha.localeCompare(b.fecha))

  for (const t of ordenadas) {
    if (!t.fecha || t.monto === 0) continue
    const etiqueta = safeFormat(t.fecha, 'dd-MM-yyyy')
    const actual = porFecha.get(etiqueta) ?? {
      fecha: etiqueta,
      conciliadas: 0,
      pendientes: 0,
      noConciliadas: 0,
    }
    if (t.estado === 'conciliada' || t.estado === 'resuelta') actual.conciliadas += 1
    else if (t.estado === 'pendiente' || t.estado === 'sugerida') actual.pendientes += 1
    else actual.noConciliadas += 1
    porFecha.set(etiqueta, actual)
  }

  return Array.from(porFecha.values())
}

/** Agregado de transacciones por banco (solo fuente banco). */
export function agregadoPorBanco(transacciones: Transaccion[]): AgregadoPorBanco[] {
  const mapa = new Map<string, { total: number; conciliadas: number }>()
  for (const t of transacciones.filter(
    (x) => x.fuente === 'banco' && x.monto !== 0,
  )) {
    const nombre = t.banco ?? 'Otro'
    const actual = mapa.get(nombre) ?? { total: 0, conciliadas: 0 }
    actual.total += 1
    if (t.estado === 'conciliada' || t.estado === 'resuelta') actual.conciliadas += 1
    mapa.set(nombre, actual)
  }
  return Array.from(mapa.entries()).map(([banco, v]) => ({ banco, ...v }))
}

function safeFormat(iso: string, patron: string): string {
  try {
    return format(parseISO(iso), patron)
  } catch {
    return iso
  }
}
