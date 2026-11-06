import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  DataGrid,
  GridToolbar,
  type GridColDef,
  type GridRenderCellParams,
  type GridRowSelectionModel,
} from '@mui/x-data-grid'
import { esES } from '@mui/x-data-grid/locales'
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded'
import AttachmentRoundedIcon from '@mui/icons-material/AttachmentRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import { useSnackbar } from 'notistack'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { DialogInspeccionIA } from './DialogInspeccionIA'
import { DialogComprobante } from './DialogComprobante'
import { DialogBuscarMatch } from './DialogBuscarMatch'
import { StatusBadge } from '@/components/common/StatusBadge'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import { CODIGOS_CON_DOCUMENTO } from '@/services/categoriesEngine'
import { esperaDocumento } from '@/lib/selectors'
import { formatCLP, formatDateCL, formatPercent } from '@/lib/format'
import { formatRUT } from '@/lib/rut'
import { transaccionesDelPeriodo, etiquetaPeriodo } from '@/lib/periodo'
import type { EstadoTransaccion, Transaccion } from '@/types/conciliacion'

/** Pestañas de la tabla. 'cerradas' agrupa conciliadas + resueltas (sólo vista). */
type FiltroTabla = EstadoTransaccion | 'todas' | 'cerradas' | 'esperan'

const FILTROS: { value: FiltroTabla; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'cerradas', label: 'Cerradas' },
  { value: 'conciliada', label: 'Conciliadas' },
  { value: 'resuelta', label: 'Resueltas' },
  { value: 'sugerida', label: 'Sugeridas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'no_conciliada', label: 'No conciliadas' },
  { value: 'esperan', label: 'Esperan documento' },
]

export function ConciliacionPage() {
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const todasLasTransacciones = useConciliacionStore((s) => s.transacciones)
  const codigos = useConciliacionStore((s) => s.codigos)
  const periodo = useConciliacionStore((s) => s.periodo)
  const conciliarManual = useConciliacionStore((s) => s.conciliarManual)
  const desconciliar = useConciliacionStore((s) => s.desconciliar)
  const marcarResueltas = useConciliacionStore((s) => s.marcarResueltas)
  const revertirResuelta = useConciliacionStore((s) => s.revertirResuelta)
  const actualizarTransaccion = useConciliacionStore((s) => s.actualizarTransaccion)
  const recalcularPeriodo = useConciliacionStore((s) => s.recalcularPeriodo)
  const cargando = useConciliacionStore((s) => s.cargando)

  const transacciones = transaccionesDelPeriodo(todasLasTransacciones, periodo)
  const noHayDatosDelPeriodo =
    transacciones.length === 0 && todasLasTransacciones.length > 0

  const [filtro, setFiltro] = useState<FiltroTabla>('todas')
  const [seleccion, setSeleccion] = useState<GridRowSelectionModel>([])
  const [buscadorDe, setBuscadorDe] = useState<Transaccion | null>(null)
  const [inspeccionDe, setInspeccionDe] = useState<Transaccion | null>(null)
  const [comprobanteDe, setComprobanteDe] = useState<Transaccion | null>(null)
  const [confirmandoRecalculo, setConfirmandoRecalculo] = useState(false)
  const [confirmandoResueltas, setConfirmandoResueltas] = useState<Transaccion[] | null>(null)
  const [recalculando, setRecalculando] = useState(false)

  const filas = useMemo(() => {
    if (filtro === 'todas') return transacciones
    // 'cerradas' es una vista: junta lo emparejado (conciliada) con lo explicado
    // por código sin contraparte (resuelta). El estado real sigue siendo el de
    // cada fila, y la columna Estado lo muestra.
    if (filtro === 'cerradas') {
      return transacciones.filter((t) => t.estado === 'conciliada' || t.estado === 'resuelta')
    }
    // Vista guía: sólo los movimientos que esperan un documento del libro.
    if (filtro === 'esperan') return transacciones.filter(esperaDocumento)
    return transacciones.filter((t) => t.estado === filtro)
  }, [transacciones, filtro])

  const seleccionadas = transacciones.filter((t) => seleccion.includes(t.id))
  const puedeMatchManual =
    seleccionadas.length === 2 &&
    seleccionadas.some((t) => t.fuente === 'banco') &&
    seleccionadas.some((t) => t.fuente === 'contabilidad')
  // Resolver por clasificación: movimientos bancarios sin contraparte, con código.
  const puedeResolver =
    seleccionadas.length > 0 &&
    seleccionadas.every(
      (t) => t.fuente === 'banco' && t.estado !== 'conciliada' && t.estado !== 'resuelta',
    )
  // Movimientos del banco del período, con código y sin conciliar.
  //
  // Se EXCLUYEN los códigos que siempre deben calzar con un documento
  // (COVE/IVEN/MER/FACT). Antes este listado sólo exigía tener código, así que
  // "Resolver banco codificado" barría también los pagos a proveedores y los
  // cobros de clientes, escondiéndolos de la conciliación: una vez en estado
  // 'resuelta' el motor de matching ya no los vuelve a emparejar.
  const bancoResolvibles = transacciones.filter(
    (t) =>
      t.fuente === 'banco' &&
      t.estado === 'no_conciliada' &&
      t.codigoId &&
      !CODIGOS_CON_DOCUMENTO.has(t.codigoId) &&
      t.monto !== 0,
  )
  // Movimientos del banco con código que exige contraparte documental.
  const bancoConDocumento = transacciones.filter(esperaDocumento)

  const handleMatchSeleccion = async () => {
    const [a, b] = seleccionadas
    try {
      await conciliarManual(a.id, b.id)
      enqueueSnackbar('Transacciones conciliadas manualmente.', { variant: 'success' })
      setSeleccion([])
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
    }
  }

  /** Confirma el par que el motor ya propuso (mismo matchId), sin IA. */
  const handleConfirmarSugerida = async (id: string, matchId: string) => {
    try {
      await conciliarManual(id, matchId)
      enqueueSnackbar('Conciliación confirmada.', { variant: 'success' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
    }
  }

  const handleDesconciliar = async (id: string) => {
    try {
      await desconciliar(id)
      enqueueSnackbar('Match desvinculado.', { variant: 'info' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo desvincular.', { variant: 'error' })
    }
  }

  const handleMarcarResueltas = async () => {
    const sinCodigo = seleccionadas.filter((t) => !t.codigoId)
    if (sinCodigo.length > 0) {
      enqueueSnackbar(
        'Asigna un código contable antes de marcar como resuelto (justifica el movimiento).',
        { variant: 'warning' },
      )
      return
    }
    // Un código que exige documento (COVE/IVEN/MER/FACT) sale del flujo normal:
    // marcarlo como resuelto lo saca del matching y esconde la brecha real. Se
    // permite sólo como decisión manual explícita, con confirmación aparte
    // (por ejemplo una transferencia recibida que no tiene documento).
    const conDocumento = seleccionadas.filter(
      (t) => t.codigoId && CODIGOS_CON_DOCUMENTO.has(t.codigoId),
    )
    if (conDocumento.length > 0) {
      setConfirmandoResueltas(seleccionadas)
      return
    }
    try {
      await marcarResueltas(seleccionadas.map((t) => t.id))
      enqueueSnackbar(`${seleccionadas.length} movimiento(s) marcados como resueltos.`, { variant: 'success' })
      setSeleccion([])
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo resolver.', { variant: 'error' })
    }
  }

  const handleConfirmarResueltas = async () => {
    const objetivo = confirmandoResueltas ?? []
    if (objetivo.length === 0) return
    try {
      await marcarResueltas(objetivo.map((t) => t.id), { forzar: true })
      enqueueSnackbar(
        `${objetivo.length} movimiento(s) resueltos manualmente (sin documento).`,
        { variant: 'success' },
      )
      setConfirmandoResueltas(null)
      setSeleccion([])
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo resolver.', { variant: 'error' })
    }
  }

  const handleResolverTodasBanco = async () => {
    if (bancoResolvibles.length === 0) return
    try {
      await marcarResueltas(bancoResolvibles.map((t) => t.id))
      enqueueSnackbar(
        `${bancoResolvibles.length} movimiento(s) del banco marcados como resueltos por su código.` +
          (bancoConDocumento.length > 0
            ? ` ${bancoConDocumento.length} quedaron pendientes porque su código exige documento (COVE/IVEN/MER/FACT).`
            : ''),
        { variant: 'success' },
      )
      setSeleccion([])
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo resolver.', { variant: 'error' })
    }
  }

  const handleRevertirResuelta = async (id: string) => {
    try {
      await revertirResuelta(id)
      enqueueSnackbar('Movimiento devuelto a no conciliado.', { variant: 'info' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo revertir.', { variant: 'error' })
    }
  }

  const handleRecalcular = async () => {
    setRecalculando(true)
    try {
      await recalcularPeriodo(periodo)
      enqueueSnackbar(
        `Conciliación de ${etiquetaPeriodo(periodo)} recalculada desde cero.`,
        { variant: 'success' },
      )
      setConfirmandoRecalculo(false)
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo recalcular.', { variant: 'error' })
    } finally {
      setRecalculando(false)
    }
  }

  const handleEditarCategoria = (id: string, nuevaCategoria: string) => {
    actualizarTransaccion(id, { categoria: nuevaCategoria || undefined })
    enqueueSnackbar('Categoría actualizada.', { variant: 'success' })
  }

  const handleAsignarCodigo = (tx: Transaccion, codigoId: string) => {
    if (!codigoId) {
      actualizarTransaccion(tx.id, {
        codigoId: undefined,
        codigoOrigen: undefined,
        codigoConfianza: undefined,
        codigoEvidencia: undefined,
      })
      enqueueSnackbar('Código contable removido.', { variant: 'info' })
      return
    }
    const codigo = codigos.find((item) => item.id === codigoId)
    if (!codigo) return
    actualizarTransaccion(tx.id, {
      codigoId: codigo.id,
      codigoOrigen: 'manual',
      codigoConfianza: 1,
      codigoEvidencia: 'Asignado manualmente',
      categoria: codigo.categoria ?? tx.categoria,
    })
    enqueueSnackbar(`Código ${codigo.id} asignado.`, { variant: 'success' })
  }

  const columnas: GridColDef[] = [
    { field: 'fecha', headerName: 'Fecha', width: 110, valueFormatter: (v) => formatDateCL(String(v)) },
    {
      field: 'fechaVencimiento',
      headerName: 'Vencimiento',
      width: 120,
      valueFormatter: (v) => (v ? formatDateCL(String(v)) : '—'),
    },
    {
      field: 'fuente',
      headerName: 'Origen',
      width: 130,
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            size="small"
            label={p.row.fuente === 'banco' ? p.row.banco ?? 'Banco' : 'Contabilidad'}
            variant="outlined"
            color={p.row.fuente === 'banco' ? 'primary' : 'secondary'}
          />
        </Box>
      ),
    },
    { field: 'descripcion', headerName: 'Descripción / Glosa', flex: 1, minWidth: 220 },
    {
      field: 'contraparte',
      headerName: 'Contraparte',
      flex: 1,
      minWidth: 180,
      valueFormatter: (v) => (v ? String(v) : '—'),
    },
    {
      field: 'rut',
      headerName: 'RUT',
      width: 130,
      valueFormatter: (v) => (v ? formatRUT(String(v)) : '—'),
    },
    {
      field: 'monto',
      headerName: 'Monto',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (v) => formatCLP(Number(v)),
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '100%' }}>
          <Typography
            sx={{
              fontWeight: 600,
              color: p.row.monto >= 0 ? 'success.main' : 'error.main',
            }}
          >
            {formatCLP(p.row.monto)}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'codigoId',
      headerName: 'Código contable',
      width: 250,
      sortable: true,
      renderCell: (p: GridRenderCellParams<Transaccion>) => {
        const seleccionado = codigos.find((codigo) => codigo.id === p.row.codigoId)
        const detalle = p.row.codigoOrigen
          ? `Origen: ${p.row.codigoOrigen} · Confianza: ${formatPercent(p.row.codigoConfianza ?? 0)}${p.row.codigoEvidencia ? ` · ${p.row.codigoEvidencia}` : ''}`
          : 'Sin código asignado'
        return (
          <Tooltip title={detalle}>
            <Select
              size="small"
              value={p.row.codigoId ?? ''}
              displayEmpty
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => handleAsignarCodigo(p.row, String(event.target.value))}
              renderValue={() => seleccionado
                ? `${seleccionado.clave ? `${seleccionado.clave} · ` : ''}${seleccionado.id} · ${seleccionado.nombre}`
                : 'Sin código'}
              sx={{ width: '100%', fontSize: 12, height: 34 }}
            >
              <MenuItem value="">Sin código</MenuItem>
              {codigos.filter((codigo) => codigo.activo).map((codigo) => (
                <MenuItem key={codigo.id} value={codigo.id}>
                  {codigo.clave ? `${codigo.clave} · ` : ''}{codigo.id} · {codigo.nombre}
                </MenuItem>
              ))}
            </Select>
          </Tooltip>
        )
      },
    },
    {
      field: 'categoria',
      headerName: 'Categoría',
      width: 180,
      editable: true,
      type: 'string',
    },
    {
      field: 'confianza',
      headerName: 'Confianza',
      width: 110,
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {p.row.confianza !== undefined ? (
            <Typography variant="caption" color="text.secondary">
              {formatPercent(p.row.confianza)}
            </Typography>
          ) : (
            '—'
          )}
        </Box>
      ),
    },
    {
      field: 'estado',
      headerName: 'Estado',
      width: 190,
      renderCell: (p: GridRenderCellParams<Transaccion>) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
          <StatusBadge estado={p.row.estado} />
          {p.row.estado === 'resuelta' &&
            p.row.codigoId &&
            CODIGOS_CON_DOCUMENTO.has(p.row.codigoId) && (
              <Tooltip title="Resuelto manualmente: su código exige documento (COVE/IVEN/MER/FACT), pero se cerró sin contraparte.">
                <Chip
                  size="small"
                  variant="outlined"
                  color="warning"
                  label="manual"
                  sx={{ height: 18, fontSize: 10 }}
                />
              </Tooltip>
            )}
        </Box>
      ),
    },
    {
      field: 'acciones',
      headerName: '',
      width: 230,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (p: GridRenderCellParams<Transaccion>) => {
        const { id, estado, matchId } = p.row
        return (
          <Stack direction="row" spacing={0.5} sx={{ height: '100%', alignItems: 'center' }}>
            {estado === 'pendiente' || estado === 'no_conciliada' ? (
              <Tooltip title="Conciliar manualmente: vincular una contraparte o cerrarlo sin contraparte">
                <IconButton size="small" color="success" onClick={() => setBuscadorDe(p.row)}>
                  <CheckCircleRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Buscar contraparte">
                <IconButton size="small" onClick={() => setBuscadorDe(p.row)}>
                  <SearchRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {estado !== 'conciliada' && (
              <Tooltip title="Adjuntar el comprobante (PDF o imagen) para deducir el código contable y buscar la contraparte">
                <IconButton size="small" color="secondary" onClick={() => setComprobanteDe(p.row)}>
                  <AttachmentRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {estado === 'sugerida' && matchId && (
              <Tooltip title="Confirmar la contraparte que propone el motor (sin IA)">
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => void handleConfirmarSugerida(id, matchId)}
                >
                  <CheckCircleRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {estado !== 'conciliada' && (
              <Tooltip
                title={
                  estado === 'sugerida'
                    ? 'Inspeccionar con IA'
                    : estado === 'resuelta'
                      ? 'Resumir con IA este movimiento resuelto'
                      : 'Analizar con IA por qué no se concilió'
                }
              >
                <IconButton size="small" color="primary" onClick={() => setInspeccionDe(p.row)}>
                  <AutoAwesomeRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {estado === 'conciliada' && (
              <Tooltip title="Desconciliar">
                <IconButton size="small" color="error" onClick={() => handleDesconciliar(id)}>
                  <LinkOffRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {estado === 'resuelta' && (
              <Tooltip title="Revertir resolución">
                <IconButton size="small" color="warning" onClick={() => handleRevertirResuelta(id)}>
                  <LinkOffRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )
      },
    },
  ]

  if (noHayDatosDelPeriodo) {
    return (
      <Box>
        <PageHeader
          title="Tabla de conciliación"
          subtitle="Revisa, filtra y concilia transacciones entre el banco y la contabilidad."
        />
        <Card>
          <CardContent>
            <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
              <EventBusyRoundedIcon sx={{ fontSize: 56, color: 'warning.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Mes sin data
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                No hay transacciones para <strong>{etiquetaPeriodo(periodo)}</strong>.
                <br />
                Selecciona otro período o carga un extracto bancario desde el menú <em>Carga</em>.
              </Typography>
              <Button
                variant="contained"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => navigate('/carga')}
              >
                Cargar cartola
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  }

  if (transacciones.length === 0) {
    return (
      <Box>
        <PageHeader
          title="Tabla de conciliación"
          subtitle="Revisa, filtra y concilia transacciones entre el banco y la contabilidad."
        />
        <Card>
          <CardContent>
            <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
              <UploadFileRoundedIcon sx={{ fontSize: 56, color: 'text.secondary' }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Sin transacciones cargadas
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                Carga tu extracto bancario y tu libro contable para empezar a conciliar.
              </Typography>
              <Button
                variant="contained"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => navigate('/carga')}
              >
                Cargar datos
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader
        title="Tabla de conciliación"
        subtitle="Revisa, filtra y concilia transacciones entre el banco y la contabilidad."
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {bancoConDocumento.length > 0 && (
              <Tooltip
                title={
                  filtro === 'esperan'
                    ? 'Mostrando sólo los movimientos que esperan documento · clic para ver todos'
                    : 'Ver sólo los movimientos cuyo código exige un documento del libro (COVE/IVEN/MER/FACT)'
                }
              >
                <Chip
                  color="warning"
                  variant={filtro === 'esperan' ? 'filled' : 'outlined'}
                  size="small"
                  label={`Esperan documento: ${bancoConDocumento.length}`}
                  onClick={() => setFiltro(filtro === 'esperan' ? 'todas' : 'esperan')}
                  sx={{ fontWeight: 700, cursor: 'pointer' }}
                />
              </Tooltip>
            )}
            {puedeResolver ? (
              <Tooltip title="Marca los movimientos del banco seleccionados (sin contraparte) como resueltos por su código.">
                <span>
                  <Button variant="outlined" onClick={handleMarcarResueltas}>
                    Marcar resueltas ({seleccionadas.length})
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Tooltip title={`Marca como 'Resuelta' los movimientos del banco del período que ya tienen código de tesorería y no calzaron con un documento (comisiones, impuestos, traspasos, intereses…). NO incluye los códigos que exigen documento (COVE/IVEN/MER/FACT): esos quedan pendientes de conciliar.${bancoConDocumento.length > 0 ? ` Hoy hay ${bancoConDocumento.length} movimiento(s) de ese tipo.` : ''}`}>
                <span>
                  <Button
                    variant="outlined"
                    disabled={bancoResolvibles.length === 0}
                    onClick={handleResolverTodasBanco}
                  >
                    Resolver banco codificado ({bancoResolvibles.length})
                  </Button>
                </span>
              </Tooltip>
            )}
            <Tooltip title="Descarta los estados calculados del período (conciliada, resuelta, sugerida) y vuelve a correr el motor desde cero. Conserva categorías y códigos. Úsalo cuando hayas revertido resoluciones o cambiado reglas.">
              <span>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<ReplayRoundedIcon />}
                  disabled={recalculando || transacciones.length === 0}
                  onClick={() => setConfirmandoRecalculo(true)}
                >
                  {recalculando ? 'Recalculando…' : 'Recalcular'}
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              disabled={!puedeMatchManual}
              onClick={handleMatchSeleccion}
            >
              Conciliar selección ({seleccionadas.length})
            </Button>
          </Stack>
        }
      />

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        {FILTROS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            color={filtro === f.value ? 'primary' : 'default'}
            variant={filtro === f.value ? 'filled' : 'outlined'}
            onClick={() => setFiltro(f.value)}
          />
        ))}
      </Stack>

      <Box sx={{ height: 620, width: '100%', bgcolor: 'background.paper', borderRadius: 2 }}>
        <DataGrid
          rows={filas}
          columns={columnas}
          loading={cargando}
          getRowId={(r) => r.id}
          checkboxSelection
          disableRowSelectionOnClick
          rowSelectionModel={seleccion}
          onRowSelectionModelChange={setSeleccion}
          localeText={esES.components.MuiDataGrid.defaultProps.localeText}
          slots={{ toolbar: GridToolbar }}
          slotProps={{
            toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 200 } },
          }}
          onRowDoubleClick={(params) => setBuscadorDe(params.row as Transaccion)}
          processRowUpdate={(newRow, oldRow) => {
            const row = newRow as Transaccion
            const anterior = oldRow as Transaccion
            if (row.categoria !== anterior.categoria) {
              handleEditarCategoria(row.id, row.categoria ?? '')
            }
            return row
          }}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            '& .MuiDataGrid-columnHeaders': { borderRadius: '8px 8px 0 0' },
          }}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            columns: { columnVisibilityModel: { categoria: true } },
            sorting: { sortModel: [{ field: 'fecha', sort: 'asc' }] },
          }}
        />
      </Box>

      <Dialog open={confirmandoRecalculo} onClose={() => setConfirmandoRecalculo(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Recalcular {etiquetaPeriodo(periodo)}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se descartan los estados calculados de este período (conciliada, resuelta y
            sugerida) y se vuelve a ejecutar el motor de conciliación desde cero. Las
            conciliaciones manuales de este período también se pierden. Las categorías y
            los códigos asignados se conservan.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoRecalculo(false)} disabled={recalculando}>
            Cancelar
          </Button>
          <Button onClick={handleRecalcular} color="warning" variant="contained" disabled={recalculando}>
            {recalculando ? 'Recalculando…' : 'Recalcular'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!confirmandoResueltas}
        onClose={() => setConfirmandoResueltas(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Resolver manualmente</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmandoResueltas?.length ?? 0} movimiento(s) tienen un código que normalmente
            debe calzar con un documento del libro (
            {[
              ...new Set(
                (confirmandoResueltas ?? [])
                  .map((t) => t.codigoId)
                  .filter((id): id is string => !!id),
              ),
            ].join(', ')}
            ). Al marcarlos como resueltos saldrán de la brecha de conciliación y quedarán
            explicados por su código, pero sin contraparte ni documento que los respalde. La
            resolución queda registrada como manual y puedes revertirla cuando quieras.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoResueltas(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void handleConfirmarResueltas()}
          >
            Resolver igual
          </Button>
        </DialogActions>
      </Dialog>

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

      <DialogBuscarMatch
        origen={buscadorDe}
        candidatos={buscadorDe ? transacciones.filter((t) => t.fuente !== buscadorDe.fuente && t.estado !== 'conciliada') : []}
        onClose={() => setBuscadorDe(null)}
        onConfirmar={async (id) => {
          if (!buscadorDe) return
          try {
            await conciliarManual(buscadorDe.id, id)
            enqueueSnackbar('Conciliación manual realizada.', { variant: 'success' })
            setBuscadorDe(null)
          } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
          }
        }}
        onCerrarSinVinculo={async (tx) => {
          try {
            await marcarResueltas([tx.id], { forzar: true })
            enqueueSnackbar('Movimiento cerrado sin contraparte (resuelto manualmente).', {
              variant: 'success',
            })
          } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo cerrar.', { variant: 'error' })
          }
        }}
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
            enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', { variant: 'error' })
          }
        }}
      />
    </Box>
  )
}

