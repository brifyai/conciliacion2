import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded'
import { useMemo, useState, type ReactNode } from 'react'
import { useSnackbar } from 'notistack'
import { PageHeader } from '@/components/common/PageHeader'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import { calcularKpis } from '@/lib/selectors'
import { formatCLP, formatPercent } from '@/lib/format'
import { etiquetaPeriodo, transaccionesDelPeriodo } from '@/lib/periodo'
import { exportarExcel, exportarPDF } from '@/services/exportarReporte'

export function ReportesPage() {
  const { enqueueSnackbar } = useSnackbar()
  const todasLasTransacciones = useConciliacionStore((s) => s.transacciones)
  const reglas = useConciliacionStore((s) => s.reglas)
  const codigos = useConciliacionStore((s) => s.codigos)
  const periodo = useConciliacionStore((s) => s.periodo)
  const cargando = useConciliacionStore((s) => s.cargando)

  const [codigoFiltro, setCodigoFiltro] = useState('')

  const transaccionesDelMes = transaccionesDelPeriodo(todasLasTransacciones, periodo)
  const noHayDatosDelPeriodo =
    !cargando && transaccionesDelMes.length === 0 && todasLasTransacciones.length > 0

  // Códigos presentes en el período, para ofrecer sólo opciones con datos.
  const codigosDelMes = useMemo(() => {
    const usados = new Set(
      transaccionesDelMes.map((t) => t.codigoId).filter((id): id is string => Boolean(id)),
    )
    return codigos.filter((c) => usados.has(c.id))
  }, [transaccionesDelMes, codigos])

  const transacciones = codigoFiltro
    ? transaccionesDelMes.filter((t) => t.codigoId === codigoFiltro)
    : transaccionesDelMes

  const kpis = calcularKpis(transacciones)
  const noConciliadas = transacciones.filter((t) => t.estado !== 'conciliada').length

  const handleExcel = async () => {
    try {
      await exportarExcel({ transacciones, reglas, codigos })
      enqueueSnackbar('Informe Excel generado.', { variant: 'success' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo generar Excel.', { variant: 'error' })
    }
  }

  const handlePDF = async () => {
    try {
      await exportarPDF({ transacciones, reglas, codigos })
      enqueueSnackbar('Informe PDF generado.', { variant: 'success' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo generar PDF.', { variant: 'error' })
    }
  }

  return (
    <Box>
      <PageHeader
        title="Reportes"
        subtitle="Genera informes ejecutivos de la conciliación para compartir o archivar."
      />

      {noHayDatosDelPeriodo ? (
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
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2.5}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Filtros del informe
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Período <strong>{etiquetaPeriodo(periodo)}</strong>
                      {codigoFiltro
                        ? ` · Código ${codigoFiltro}`
                        : ' · Todos los códigos'}
                    </Typography>
                  </Box>
                  <FormControl size="small" sx={{ minWidth: 260 }}>
                    <InputLabel id="filtro-codigo-label">Código contable</InputLabel>
                    <Select
                      labelId="filtro-codigo-label"
                      label="Código contable"
                      value={codigoFiltro}
                      onChange={(event) => setCodigoFiltro(String(event.target.value))}
                    >
                      <MenuItem value="">Todos los códigos</MenuItem>
                      {codigosDelMes.map((codigo) => (
                        <MenuItem key={codigo.id} value={codigo.id}>
                          {codigo.clave ? `${codigo.clave} · ` : ''}{codigo.id} · {codigo.nombre}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  Resumen del informe
                </Typography>
                <Grid container spacing={2}>
                  <Item label="Total de transacciones" value={String(kpis.totalTransacciones)} />
                  <Item label="Monto total" value={formatCLP(kpis.montoTotal)} />
                  <Item label="Monto no conciliado" value={formatCLP(kpis.montoNoConciliado)} />
                  <Item label="Tasa de conciliación" value={formatPercent(kpis.tasaConciliacion, true)} />
                  <Item label="No conciliadas" value={String(noConciliadas)} />
                  <Item label="Reglas activas" value={String(reglas.filter((r) => r.activa).length)} />
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  Exportar
                </Typography>
                <Stack spacing={2}>
                  <OpcionExportar
                    icon={<TableChartRoundedIcon />}
                    title="Informe Excel (.xlsx)"
                    description="Resumen ejecutivo, detalle de no conciliadas y reglas aplicadas en hojas separadas."
                    button="Descargar Excel"
                    onClick={handleExcel}
                  />
                  <OpcionExportar
                    icon={<PictureAsPdfRoundedIcon />}
                    title="Informe PDF"
                    description="Documento ejecutivo con KPIs y tabla de transacciones no conciliadas."
                    button="Descargar PDF"
                    onClick={handlePDF}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <Grid item xs={12} sm={6}>
      <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{value}</Typography>
      </Box>
    </Grid>
  )
}

function OpcionExportar({
  icon,
  title,
  description,
  button,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  button: string
  onClick: () => void
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      alignItems={{ sm: 'center' }}
      justifyContent="space-between"
      sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 40, height: 40, borderRadius: 2, bgcolor: '#E8EEFF', color: 'primary.main',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">{description}</Typography>
        </Box>
      </Stack>
      <Button variant="contained" onClick={onClick} sx={{ flexShrink: 0 }}>{button}</Button>
    </Stack>
  )
}