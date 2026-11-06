import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
} from '@mui/material'
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded'
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnackbar } from 'notistack'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import { calcularKpis } from '@/lib/selectors'
import { formatNumeroCL, formatPercent } from '@/lib/format'
import { transaccionesDelPeriodo } from '@/lib/periodo'
import { useAuth } from '@/auth/useAuth'

const MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
]

const ANIO_INICIO = 2026
const ANIOS = Array.from({ length: 5 }, (_, i) => ANIO_INICIO + i)

export function Topbar() {
  const { enqueueSnackbar } = useSnackbar()
  const transacciones = useConciliacionStore((s) => s.transacciones)
  const conciliarTodo = useConciliacionStore((s) => s.conciliarTodo)
  const periodo = useConciliacionStore((s) => s.periodo)
  const setPeriodo = useConciliacionStore((s) => s.setPeriodo)
  const procesando = useConciliacionStore((s) => s.procesando)
  const transaccionesPeriodo = transaccionesDelPeriodo(transacciones, periodo)
  const kpis = calcularKpis(transaccionesPeriodo)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const iniciales = (user?.name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

  const tieneDatosDelPeriodo = transaccionesPeriodo.length > 0
  const mostrarAviso = transacciones.length > 0 && !tieneDatosDelPeriodo

  const handleConciliar = async () => {
    try {
      await conciliarTodo()
      enqueueSnackbar('Conciliación actualizada en todos los períodos.', { variant: 'success' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
    }
  }

  return (
    <AppBar position="sticky" elevation={0}>
      <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <Box
            component="span"
            sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}
          >
            Período
          </Box>
          <TextField
            select
            size="small"
            value={periodo.mes}
            onChange={(e) => setPeriodo({ mes: Number(e.target.value) })}
            sx={{ minWidth: 130, bgcolor: 'background.paper' }}
          >
            {MESES.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            value={periodo.anio}
            onChange={(e) => setPeriodo({ anio: Number(e.target.value) })}
            sx={{ minWidth: 100, bgcolor: 'background.paper' }}
          >
            {ANIOS.map((a) => (
              <MenuItem key={a} value={a}>{a}</MenuItem>
            ))}
          </TextField>
          {mostrarAviso && (
            <Chip
              icon={<EventBusyRoundedIcon />}
              label="Mes sin data"
              color="warning"
              size="small"
              sx={{ fontWeight: 700 }}
            />
          )}
        </Stack>

        <Tooltip
          title={
            `Conciliado real: ${formatNumeroCL(kpis.conciliadas)} de ${formatNumeroCL(kpis.universo)} movimientos del banco. ` +
            `Explicado por código: ${formatPercent(kpis.tasaExplicado, true)} (${formatNumeroCL(kpis.resueltas)} movimientos).` +
            (kpis.sugeridas > 0 ? ` Por revisar: ${formatNumeroCL(kpis.sugeridas)}.` : '')
          }
        >
          <Chip
            label={`Conciliado: ${formatPercent(kpis.tasaConciliacion, true)}`}
            color={kpis.tasaConciliacion >= 90 ? 'success' : 'warning'}
            variant="outlined"
            sx={{ fontWeight: 700, display: { xs: 'none', sm: 'flex' } }}
          />
        </Tooltip>

        <Tooltip title="Vuelve a ejecutar el matching en todos los períodos">
          <span>
            <Button
              variant="contained"
              startIcon={<AutorenewRoundedIcon />}
              onClick={handleConciliar}
              disabled={procesando}
            >
              {procesando ? 'Conciliando…' : 'Conciliar'}
            </Button>
          </span>
        </Tooltip>

        <Tooltip title={user?.email ?? 'Usuario'}>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0 }}>
            <Avatar
              sx={{
                bgcolor: 'primary.main',
                width: 36,
                height: 36,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              {iniciales || '?'}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ px: 2, py: 1, maxWidth: 240 }}>
            <Box sx={{ fontWeight: 600, fontSize: 14 }}>
              {user?.name || 'Usuario'}
            </Box>
            <Box sx={{ fontSize: 12, color: 'text.secondary', wordBreak: 'break-all' }}>
              {user?.email}
            </Box>
          </Box>
          <MenuItem
            onClick={async () => {
              setAnchorEl(null)
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            <ListItemIcon>
              <LogoutRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Cerrar sesión</ListItemText>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  )
}