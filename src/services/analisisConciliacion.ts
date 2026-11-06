import { CODIGOS_CON_DOCUMENTO } from './categoriesEngine'
import { esperaDocumento, universoConciliacion } from '@/lib/selectors'
import type { Transaccion } from '@/types/conciliacion'

export type TonoSeccion = 'error' | 'warning' | 'info' | 'success'

export interface SeccionAnalisis {
  id: string
  titulo: string
  /** Qué son estos movimientos, en una frase. */
  queEs: string
  /** Qué hacer, paso a paso. */
  queHacer: string[]
  tono: TonoSeccion
  items: Transaccion[]
  monto: number
}

export interface AnalisisPeriodo {
  /** Sólo los grupos con movimientos; vacío significa período sin brechas. */
  secciones: SeccionAnalisis[]
  /** Lectura priorizada de los hallazgos, para el encabezado. */
  diagnosticos: string[]
}

/** Un código que exige documento corresponde a operación (compra/venta). */
function esDeOperacion(t: Transaccion): boolean {
  return !!t.codigoId && CODIGOS_CON_DOCUMENTO.has(t.codigoId)
}

const sumarMontos = (items: Transaccion[]): number =>
  items.reduce((acc, t) => acc + Math.abs(t.monto), 0)

/**
 * Desglose accionable del período: cada grupo de movimientos con problemas,
 * ordenado desde lo que más pesa en la conciliación hasta lo que sólo requiere
 * un cierre, y con los pasos concretos para resolverlo.
 *
 * Se mide sobre el mismo universo que los KPIs (los movimientos del banco
 * cuando hay cartola cargada): la contabilidad sin pago es cuentas por pagar,
 * no una brecha de conciliación.
 */
export function analizarPeriodo(transacciones: Transaccion[]): AnalisisPeriodo {
  const base = universoConciliacion(transacciones)
  const operacionCerrada = base.filter((t) => t.estado === 'resuelta' && esDeOperacion(t))
  const esperanDocumento = base.filter(esperaDocumento)
  const porRevisar = base.filter((t) => t.estado === 'sugerida' || t.estado === 'pendiente')
  const sinCodigo = base.filter((t) => t.estado === 'no_conciliada' && !t.codigoId)
  const tesoreriaAbierta = base.filter(
    (t) => t.estado === 'no_conciliada' && !!t.codigoId && !esDeOperacion(t),
  )
  const tesoreriaCerrada = base.filter((t) => t.estado === 'resuelta' && !esDeOperacion(t))

  const candidatas: SeccionAnalisis[] = [
    {
      id: 'operacion-sin-documento',
      titulo: 'De operación, cerradas sin documento',
      queEs:
        'Pagos o cobros que deberían calzar con una factura y quedaron cerrados sin contraparte. ' +
        'El motor nunca produce ese cierre: fue una decisión manual, así que el código asignado es lo único que los explica.',
      queHacer: [
        'Confirma con IA (✨) que el código corresponde al movimiento.',
        'Si el código está mal, reasígnalo en la columna Código de Conciliación.',
        'Si el movimiento sí tiene documento, revierte la resolución (↺) y búscale la contraparte.',
      ],
      tono: 'error',
      items: operacionCerrada,
      monto: sumarMontos(operacionCerrada),
    },
    {
      id: 'esperan-documento',
      titulo: 'Esperan documento',
      queEs:
        'Movimientos del banco cuyo código exige calzar con un documento del libro (COVE, IVEN, MER, FACT). ' +
        'Son brecha real de conciliación: falta el par en la contabilidad o sobra el movimiento en el banco.',
      queHacer: [
        'Búscale la contraparte con «Conciliar manualmente» (✓): la factura o boleta está en el libro.',
        'Adjunta el comprobante (📎) si tienes el respaldo de la transferencia.',
        'Si sabes que no existe documento (transferencia recibida, pago interno), ciérralo sin contraparte.',
      ],
      tono: 'error',
      items: esperanDocumento,
      monto: sumarMontos(esperanDocumento),
    },
    {
      id: 'por-revisar',
      titulo: 'Sugeridas / Pendientes',
      queEs:
        'El motor encontró un candidato por monto, fecha o RUT, pero no se atreve a cerrarlo solo: falta tu confirmación.',
      queHacer: [
        'Confirma con ✓ si el par propuesto es correcto.',
        'Analiza con IA (✨) cuando tengas dudas: explica el movimiento y sus candidatos.',
        'Si el par no corresponde, vincúlalo a mano con «Conciliar manualmente».',
      ],
      tono: 'warning',
      items: porRevisar,
      monto: sumarMontos(porRevisar),
    },
    {
      id: 'sin-codigo',
      titulo: 'Sin código y sin contraparte',
      queEs:
        'Movimientos del banco sin código contable ni contraparte. Mientras no tengan código no se pueden cerrar: no hay nada que los explique.',
      queHacer: [
        'Asígnales un código contable en la columna Código de Conciliación.',
        'Si corresponden a un documento del libro, vincúlalos con «Conciliar manualmente».',
      ],
      tono: 'warning',
      items: sinCodigo,
      monto: sumarMontos(sinCodigo),
    },
    {
      id: 'tesoreria-abierta',
      titulo: 'De tesorería, listas para cerrar',
      queEs:
        'Movimientos con código de tesorería (traspasos entre cuentas, impuestos, comisiones, tarjetas) que no calzaron con ningún documento. ' +
        'Por definición no tienen ni deben tener uno.',
      queHacer: [
        'Ciérralas con «Conciliar sin vincular» (✓) desde la fila.',
        'En Conciliación puedes hacerlo en bloque con «Resolver banco codificado».',
      ],
      tono: 'info',
      items: tesoreriaAbierta,
      monto: sumarMontos(tesoreriaAbierta),
    },
    {
      id: 'explicadas',
      titulo: 'Explicadas por código (sin documento)',
      queEs:
        'Cerradas por su código de tesorería, sin contraparte. Es el cierre esperado para lo que no tiene documento contable.',
      queHacer: [
        'Nada, si el código es correcto.',
        'Revisa con IA (✨) las que no reconozcas; si el código está mal, revierte (↺) y reasígnalo.',
      ],
      tono: 'success',
      items: tesoreriaCerrada,
      monto: sumarMontos(tesoreriaCerrada),
    },
  ]

  const diagnosticos: string[] = []
  if (operacionCerrada.length > 0) {
    diagnosticos.push(
      `${operacionCerrada.length} movimiento(s) de operación están cerrados sin documento: es lo primero a revisar, porque inflan el "explicado" con cierres manuales.`,
    )
  }
  if (esperanDocumento.length > 0) {
    diagnosticos.push(
      `${esperanDocumento.length} movimiento(s) esperan un documento del libro: sin ese par no hay conciliación posible.`,
    )
  }
  if (sinCodigo.length > 0) {
    diagnosticos.push(
      `${sinCodigo.length} movimiento(s) no tienen código contable: mientras no lo tengan no se pueden cerrar.`,
    )
  }
  if (tesoreriaAbierta.length > 0) {
    diagnosticos.push(
      `${tesoreriaAbierta.length} movimiento(s) de tesorería ya tienen código y sólo falta cerrarlos: son los más rápidos de resolver.`,
    )
  }
  if (porRevisar.length > 0) {
    diagnosticos.push(
      `${porRevisar.length} movimiento(s) tienen un candidato propuesto esperando tu confirmación.`,
    )
  }
  if (diagnosticos.length === 0) {
    diagnosticos.push(
      'No hay brechas en el período: todo está conciliado o explicado por su código.',
    )
  }

  return {
    secciones: candidatas.filter((s) => s.items.length > 0),
    diagnosticos,
  }
}
