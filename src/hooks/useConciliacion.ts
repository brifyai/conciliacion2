import { useEffect, useMemo } from 'react'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import {
  agregadoPorBanco,
  calcularKpis,
  evolucionConciliacion,
} from '@/lib/selectors'
import { transaccionesDelPeriodo } from '@/lib/periodo'

/**
 * Hook principal de conciliación.
 * - Carga las transacciones y reglas desde Supabase al montar (una sola vez).
 * - Filtra las transacciones por el período seleccionado (mes/año) antes de
 *   calcular KPIs y series para los gráficos.
 */
export function useConciliacion() {
  const todasLasTransacciones = useConciliacionStore((s) => s.transacciones)
  const reglas = useConciliacionStore((s) => s.reglas)
  const codigos = useConciliacionStore((s) => s.codigos)
  const matchingConfig = useConciliacionStore((s) => s.matchingConfig)
  const periodo = useConciliacionStore((s) => s.periodo)
  const procesando = useConciliacionStore((s) => s.procesando)
  const cargando = useConciliacionStore((s) => s.cargando)
  const errorCarga = useConciliacionStore((s) => s.errorCarga)
  const cargarDatos = useConciliacionStore((s) => s.cargarDatos)

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const transacciones = useMemo(
    () => transaccionesDelPeriodo(todasLasTransacciones, periodo),
    [todasLasTransacciones, periodo],
  )

  const kpis = useMemo(() => calcularKpis(transacciones), [transacciones])
  const evolucion = useMemo(
    () => evolucionConciliacion(transacciones),
    [transacciones],
  )
  const porBanco = useMemo(
    () => agregadoPorBanco(transacciones),
    [transacciones],
  )

  return {
    transacciones,
    todasLasTransacciones,
    reglas,
    codigos,
    matchingConfig,
    periodo,
    procesando,
    cargando,
    errorCarga,
    kpis,
    evolucion,
    porBanco,
  }
}