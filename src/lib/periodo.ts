import type { Transaccion } from '@/types/conciliacion'
import type { Periodo } from '@/store/useConciliacionStore'

/** Filtra las transacciones cuyo mes/año coincide con el período seleccionado. */
export function transaccionesDelPeriodo(
  transacciones: Transaccion[],
  periodo: Periodo,
): Transaccion[] {
  return transacciones.filter((t) => {
    const [y, m] = t.fecha.split('-').map(Number)
    return m === periodo.mes && y === periodo.anio
  })
}

/** Etiqueta legible del período, p.ej. "Junio 2026". */
export function etiquetaPeriodo(periodo: Periodo): string {
  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${MESES[periodo.mes - 1]} ${periodo.anio}`
}