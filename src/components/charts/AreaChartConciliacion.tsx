import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Box, Typography } from '@mui/material'
import type { PuntoEvolucion } from '@/types/conciliacion'
import { palette } from '@/theme/theme'

interface Props {
  data: PuntoEvolucion[]
}

export function AreaChartConciliacion({ data }: Props) {
  return (
    <Box sx={{ width: '100%', height: 300 }}>
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>
          Sin datos para mostrar.
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorConciliadas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={palette.success} stopOpacity={0.4} />
                <stop offset="95%" stopColor={palette.success} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorPendientes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={palette.warning} stopOpacity={0.3} />
                <stop offset="95%" stopColor={palette.warning} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorNoConciliadas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={palette.error} stopOpacity={0.3} />
                <stop offset="95%" stopColor={palette.error} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E8F0" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 12, fill: palette.muted }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: palette.muted }} tickLine={false} axisLine={false} width={28} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #E4E8F0',
                fontSize: 13,
                boxShadow: '0 4px 12px rgba(16,24,40,0.08)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Area
              type="monotone"
              dataKey="conciliadas"
              name="Conciliadas"
              stroke={palette.success}
              strokeWidth={2.5}
              fill="url(#colorConciliadas)"
            />
            <Area
              type="monotone"
              dataKey="pendientes"
              name="Pendientes / Sugeridas"
              stroke={palette.warning}
              strokeWidth={2.5}
              fill="url(#colorPendientes)"
            />
            <Area
              type="monotone"
              dataKey="noConciliadas"
              name="No conciliadas"
              stroke={palette.error}
              strokeWidth={2.5}
              fill="url(#colorNoConciliadas)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Box>
  )
}