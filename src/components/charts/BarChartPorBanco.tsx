import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Box, Typography } from '@mui/material'
import type { AgregadoPorBanco } from '@/types/conciliacion'
import { palette } from '@/theme/theme'

interface Props {
  data: AgregadoPorBanco[]
}

export function BarChartPorBanco({ data }: Props) {
  return (
    <Box sx={{ width: '100%', height: 280 }}>
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>
          Sin datos para mostrar.
        </Typography>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E8F0" vertical={false} />
            <XAxis
              dataKey="banco"
              tick={{ fontSize: 11, fill: palette.muted }}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: palette.muted }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: '#F0F4FF' }}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #E4E8F0',
                fontSize: 13,
                boxShadow: '0 4px 12px rgba(16,24,40,0.08)',
              }}
            />
            <Bar dataKey="conciliadas" name="Conciliadas" radius={[6, 6, 0, 0]} maxBarSize={54}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.conciliadas === entry.total ? palette.success : palette.primary
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Box>
  )
}
