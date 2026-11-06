import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid'
import { esES } from '@mui/x-data-grid/locales'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AttachmentRoundedIcon from '@mui/icons-material/AttachmentRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded'
import TipsAndUpdatesRoundedIcon from '@mui/icons-material/TipsAndUpdatesRounded'
import { useSnackbar } from 'notistack'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { StatusBadge } from '@/components/common/StatusBadge'
import { DialogBuscarMatch } from '@/features/conciliacion/DialogBuscarMatch'
import { DialogInspeccionIA } from '@/features/conciliacion/DialogInspeccionIA'
import { DialogComprobante } from '@/features/conciliacion/DialogComprobante'
import { useConciliacion } from '@/hooks/useConciliacion'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import { analizarPeriodo, type SeccionAnalisis, type TonoSeccion } from '@/services/analisisConciliacion'
import { formatCLP, formatDateCL, formatNumeroCL, formatPercent } from '@/lib/format'
import { etiquetaPeriodo } from '@/lib/periodo'
import type { Transaccion } from '@/types/conciliacion'

const COLOR_TONO: Record<TonoSeccion, 'error' | 'warning' | 'info' | 'success'> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  success: 'success',
}

/**
 * Análisis del período: qué movimientos están frenando la conciliación, qué
 * significa cada grupo y desde aquí mismo resolverlos (vincular, cerrar sin
 * contraparte, revertir una resolución, pedirle el análisis a la IA).
 */
export function AnalisisPage() {
  const { transacciones, todasLasTransacciones, codigos, periodo, kpis, cargando } = useConciliacion()
  const conciliarManual = useConciliacionStore((s) => s.conciliarManual)
  const marcarResueltas = useConciliacionStore((s) => s.marcarResueltas)
  const revertirResuelta = useConciliacionStore((s) => s.revertirResuelta)
  const actualizarTransaccion = useConciliacionStore((s) => s.actualizarTransaccion)
  const navigate = useNavigate()
  const { enqueueSnackbar } = useSnackbar()

  const [buscadorDe, setBuscadorDe] = useState<Transaccion | null>(null)
  const [inspeccionDe, setInspeccionDe] = useState<Transaccion | null>(null)
  const [comprobanteDe, setComprobanteDe] = useState<Transaccion | null>(null)

  const { secciones, diagnosticos } = useMemo(
    () => analizarPeriodo(transacciones),
    [transacciones],
  )

  const error = (e: unknown, porDefecto: string) =>
    enqueueSnackbar(e instanceof Error ? e.message : porDefecto, { variant: 'error' })

  const confirmarSugerida = async (id: string, matchId: string) => {
    try {
      await conciliarManual(id, matchId)
      enqueueSnackbar('Conciliación confirmada.', { variant: 'success' })
    } catch (e) {
      error(e, 'No se pudo conciliar.')
    }
  }

  const cerrarSinVinculo = async (tx: Transaccion) => {
    try {
      await marcarResueltas([tx.id], { forzar: true })
      enqueueSnackbar('Movimiento cerrado sin contraparte (resuelto manualmente).', {
        variant: 'success',
      })
    } catch (e) {
      error(e, 'No se pudo cerrar.')
    }
  }

  const revertir = async (id: string) => {
    try {
      await revertirResuelta(id)
      enqueueSnackbar('Resolución revertida: vuelve a la conciliación.', { variant: 'info' })
    } catch (e) {
      error(e, 'No se pudo revertir.')
    }
  }

  const cerrarTesoreria = async (items: Transaccion[]) => {
    try {
      await marcarResueltas(items.map((t) => t.id))
      enqueueSnackbar(`${items.length} movimiento(s) cerrados con su código.`, { variant: 'success' })
    } catch (e) {
      error(e, 'No se pudieron cerrar.')
    }
  }

  return (
    <Box>
      <PageHeader
        title="Análisis del período"
        subtitle={`${etiquetaPeriodo(periodo)} · qué está frenando la conciliación y cómo resolverlo.`}
        actions={
          <Button
            variant="outlined"
            startIcon={<CompareArrowsRoundedIcon />}
            onClick={() => navigate('/conciliacion')}
          >
            Ir a conciliación
          </Button>
        }
      />

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Resumen label="Universo" valor={formatNumeroCL(kpis.universo)} />
        <Resumen
          label="Conciliado real"
          valor={`${formatNumeroCL(kpis.conciliadas)} · ${formatPercent(kpis.tasaConciliacion, true)}`}
        />
        <Resumen
          label="Explicado"
          valor={`${formatNumeroCL(kpis.conciliadas + kpis.resueltas)} · ${formatPercent(kpis.tasaExplicado, true)}`}
        />
        <Resumen
          label="Por resolver"
          valor={`${formatNumeroCL(kpis.universo - kpis.conciliadas - kpis.resueltas)} · ${formatCLP(kpis.montoNoConciliado)}`}
        />
      </Stack>

      <Card sx={{ mb: 2.5 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TipsAndUpdatesRoundedIcon color="warning" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Diagnóstico
            </Typography>
          </Stack>
          <Stack component="ol" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
            {diagnosticos.map((texto) => (
              <li key={texto}>
                <Typography variant="body2">{texto}</Typography>
              </li>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {cargando && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Cargando transacciones del período…
        </Alert>
      )}

      {!cargando && secciones.length === 0 && (
        <Alert severity="success">
          No hay movimientos por resolver en {etiquetaPeriodo(periodo)}.
        </Alert>
      )}

      <Stack spacing={2.5}>
        {secciones.map((seccion) => (
          <TarjetaSeccion
            key={seccion.id}
            seccion={seccion}
            accionBloque={
              seccion.id === 'tesoreria-abierta' ? (
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={() => void cerrarTesoreria(seccion.items)}
                >
                  Cerrar las {seccion.items.length} con su código
                </Button>
              ) : undefined
            }
            onBuscar={setBuscadorDe}
            onConfirmar={confirmarSugerida}
            onInspeccion={setInspeccionDe}
            onComprobante={setComprobanteDe}
            onRevertir={revertir}
          />
        ))}
      </Stack>

      <DialogBuscarMatch
        origen={buscadorDe}
        candidatos={
          buscadorDe
            ? transacciones.filter((t) => t.fuente !== buscadorDe.fuente && t.estado !== 'conciliada')
            : []
        }
        onClose={() => setBuscadorDe(null)}
        onConfirmar={async (id) => {
          if (!buscadorDe) return
          try {
            await conciliarManual(buscadorDe.id, id)
            enqueueSnackbar('Conciliación manual realizada.', { variant: 'success' })
            setBuscadorDe(null)
          } catch (e) {
            error(e, 'No se pudo conciliar.')
          }
        }}
        onCerrarSinVinculo={cerrarSinVinculo}
      />

      <DialogInspeccionIA
        transaccion={inspeccionDe}
        codigos={codigos}
        onClose={() => setInspeccionDe(null)}
        onConfirmar={async (tx) => {
          if (!tx.matchId) return
          try {
            await conciliarManual(tx.id, tx.matchId)
            enqueueSnackbar('Conciliación confirmada.', { variant: 'success' })
            setInspeccionDe(null)
          } catch (e) {
            error(e, 'No se pudo conciliar.')
          }
        }}
      />

      <DialogComprobante
        transaccion={comprobanteDe}
        transacciones={todasLasTransacciones}
        codigos={codigos}
        onClose={() => setComprobanteDe(null)}
        onAplicar={async (id, patch) => {
          actualizarTransaccion(id, patch)
        }}
        onConciliar={async (idDocumento) => {
          if (!comprobanteDe) return
          await conciliarManual(comprobanteDe.id, idDocumento)
        }}
      />
    </Box>
  )
}

function Resumen({ label, valor }: { label: string; valor: string }) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {valor}
      </Typography>
    </Box>
  )
}

function TarjetaSeccion({
  seccion,
  accionBloque,
  onBuscar,
  onConfirmar,
  onInspeccion,
  onComprobante,
  onRevertir,
}: {
  seccion: SeccionAnalisis
  accionBloque?: ReactNode
  onBuscar: (t: Transaccion) => void
  onConfirmar: (id: string, matchId: string) => Promise<void>
  onInspeccion: (t: Transaccion) => void
  onComprobante: (t: Transaccion) => void
  onRevertir: (id: string) => Promise<void>
}) {
  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1}
          sx={{ mb: 1 }}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {seccion.titulo}
            </Typography>
            <Chip
              size="small"
              color={COLOR_TONO[seccion.tono]}
              label={`${formatNumeroCL(seccion.items.length)} mov. · ${formatCLP(seccion.monto)}`}
              sx={{ fontWeight: 700 }}
            />
          </Stack>
          {accionBloque}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {seccion.queEs}
        </Typography>

        <Box sx={{ bgcolor: '#F7F9FC', borderRadius: 2, p: 1.5, mb: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
            Qué hacer
          </Typography>
          <Stack component="ol" spacing={0.25} sx={{ m: 0, pl: 2.5 }}>
            {seccion.queHacer.map((paso) => (
              <li key={paso}>
                <Typography variant="body2">{paso}</Typography>
              </li>
            ))}
          </Stack>
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        <DataGrid
          rows={seccion.items}
          columns={columnas(onBuscar, onConfirmar, onInspeccion, onComprobante, onRevertir)}
          autoHeight
          density="compact"
          disableRowSelectionOnClick
          initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
          pageSizeOptions={[5, 10, 25]}
          localeText={esES.components.MuiDataGrid.defaultProps.localeText}
          sx={{ border: 'none' }}
        />
      </CardContent>
    </Card>
  )
}

function columnas(
  onBuscar: (t: Transaccion) => void,
  onConfirmar: (id: string, matchId: string) => Promise<void>,
  onInspeccion: (t: Transaccion) => void,
  onComprobante: (t: Transaccion) => void,
  onRevertir: (id: string) => Promise<void>,
): GridColDef<Transaccion>[] {
  return [
    {
      field: 'fecha',
      headerName: 'Fecha',
      width: 100,
      valueFormatter: (v) => formatDateCL(String(v)),
    },
    { field: 'descripcion', headerName: 'Descripción', flex: 1, minWidth: 220 },
    {
      field: 'codigoId',
      headerName: 'Código',
      width: 100,
      valueFormatter: (v) => (v ? String(v) : '—'),
    },
    {
      field: 'estado',
      headerName: 'Estado',
      width: 120,
      renderCell: (p: GridRenderCellParams<Transaccion>) => <StatusBadge estado={p.row.estado} />,
    },
    {
      field: 'monto',
      headerName: 'Monto',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (v) => formatCLP(Number(v)),
    },
    {
      field: 'acciones',
      headerName: '',
      width: 190,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (p: GridRenderCellParams<Transaccion>) => {
        const { id, estado, matchId } = p.row
        return (
          <Stack direction="row" spacing={0.5} sx={{ height: '100%', alignItems: 'center' }}>
            {estado === 'sugerida' && matchId && (
              <Tooltip title="Confirmar la contraparte que propone el motor">
                <IconButton size="small" color="success" onClick={() => void onConfirmar(id, matchId)}>
                  <CheckCircleRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {(estado === 'pendiente' || estado === 'no_conciliada') && (
              <Tooltip title="Conciliar manualmente: vincular una contraparte o cerrarlo sin contraparte">
                <IconButton size="small" color="success" onClick={() => onBuscar(p.row)}>
                  <CheckCircleRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {estado === 'resuelta' && (
              <Tooltip title="Revertir la resolución: vuelve a la conciliación">
                <IconButton size="small" color="warning" onClick={() => void onRevertir(id)}>
                  <ReplayRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Inspeccionar con IA">
              <IconButton size="small" color="primary" onClick={() => onInspeccion(p.row)}>
                <AutoAwesomeRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {estado !== 'resuelta' && (
              <Tooltip title="Adjuntar el comprobante (PDF o imagen) para deducir el código contable">
                <IconButton size="small" color="secondary" onClick={() => onComprobante(p.row)}>
                  <AttachmentRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Buscar contraparte">
              <IconButton size="small" onClick={() => onBuscar(p.row)}>
                <SearchRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )
      },
    },
  ]
}
