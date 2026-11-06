import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

/** Formatea un monto en Peso Chileno (CLP), sin decimales y miles con punto. */
export function formatCLP(monto: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(monto)
}

/** Formatea solo el número (sin símbolo), útil para ejes de gráficos compactos. */
export function formatNumeroCL(monto: number): string {
  return new Intl.NumberFormat('es-CL', {
    maximumFractionDigits: 0,
  }).format(monto)
}

/**
 * Versión compacta en millones/miles para ejes.
 * Ej: 1.500.000 -> "$1,5M", 450.000 -> "$450K".
 */
export function formatCLPCompacto(monto: number): string {
  const abs = Math.abs(monto)
  if (abs >= 1_000_000) return `$${(monto / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `$${Math.round(monto / 1_000)}K`
  return `$${monto}`
}

/** Formatea una fecha ISO (YYYY-MM-DD) al formato chileno DD-MM-YYYY. */
export function formatDateCL(iso: string): string {
  if (!iso) return ''
  try {
    return format(parseISO(iso), 'dd-MM-yyyy')
  } catch {
    return iso
  }
}

/** Formatea una fecha ISO en formato largo legible (ej: "12 de mayo de 2025"). */
export function formatDateLargaCL(iso: string): string {
  if (!iso) return ''
  try {
    return format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: es })
  } catch {
    return iso
  }
}

/** Formatea un valor 0..1 (o 0..100) como porcentaje chileno con 1 decimal. */
export function formatPercent(valor: number, yaEsPorcentaje = false): string {
  const pct = yaEsPorcentaje ? valor : valor * 100
  return `${new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(pct)}%`
}
