import { Chip } from '@mui/material'
import type { EstadoTransaccion } from '@/types/conciliacion'

interface StatusBadgeProps {
  estado: EstadoTransaccion
  size?: 'small' | 'medium'
}

const CONFIG: Record<
  EstadoTransaccion,
  { label: string; icon: string; color: 'success' | 'warning' | 'error' | 'info' }
> = {
  conciliada: { label: 'Conciliada', icon: '✅', color: 'success' },
  resuelta: { label: 'Resuelta', icon: '🗂️', color: 'success' },
  pendiente: { label: 'Pendiente', icon: '⚠️', color: 'warning' },
  no_conciliada: { label: 'No conciliada', icon: '❌', color: 'error' },
  sugerida: { label: 'Sugerida', icon: '💡', color: 'info' },
}

export function StatusBadge({ estado, size = 'small' }: StatusBadgeProps) {
  const cfg = CONFIG[estado]
  return (
    <Chip
      icon={<span style={{ fontSize: size === 'small' ? 12 : 14 }}>{cfg.icon}</span>}
      label={cfg.label}
      color={cfg.color}
      variant={estado === 'conciliada' ? 'filled' : 'outlined'}
      size={size}
    />
  )
}
