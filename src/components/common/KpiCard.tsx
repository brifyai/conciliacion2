import { Box, Card, CardContent, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface KpiCardProps {
  title: string
  value: string
  icon: ReactNode
  /** Texto secundario (ej: tendencia o subtítulo). */
  subtitle?: string
  /** Color de acento del ícono. */
  accent?: 'primary' | 'success' | 'warning' | 'error' | 'info'
  isLoading?: boolean
}

const ACCENT_BG: Record<NonNullable<KpiCardProps['accent']>, string> = {
  primary: '#E8EEFF',
  success: '#E3F5EF',
  warning: '#FFEDE2',
  error: '#FBE3E3',
  info: '#E2F4FE',
}
const ACCENT_FG: Record<NonNullable<KpiCardProps['accent']>, string> = {
  primary: '#0033A0',
  success: '#009B77',
  warning: '#FF6B35',
  error: '#D32F2F',
  info: '#0EA5E9',
}

export function KpiCard({
  title,
  value,
  icon,
  subtitle,
  accent = 'primary',
  isLoading = false,
}: KpiCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" spacing={2} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography
              variant="h5"
              sx={{ mt: 0.5, fontWeight: 700, lineHeight: 1.1, wordBreak: 'break-word' }}
            >
              {isLoading ? '—' : value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              bgcolor: ACCENT_BG[accent],
              color: ACCENT_FG[accent],
              '& svg': { fontSize: 24 },
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}
