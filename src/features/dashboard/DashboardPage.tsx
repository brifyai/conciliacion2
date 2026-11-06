import { useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import MoneyOffRoundedIcon from '@mui/icons-material/MoneyOffRounded'
import PercentRoundedIcon from '@mui/icons-material/PercentRounded'
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded'
import SummarizeRoundedIcon from '@mui/icons-material/SummarizeRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { KpiCard } from '@/components/common/KpiCard'
import { AreaChartConciliacion } from '@/components/charts/AreaChartConciliacion'
import { BarChartPorBanco } from '@/components/charts/BarChartPorBanco'
import { useConciliacion } from '@/hooks/useConciliacion'
import { universoConciliacion } from '@/lib/selectors'
import { formatCLP, formatNumeroCL, formatPercent } from '@/lib/format'
import { etiquetaPeriodo } from '@/lib/periodo'
import type { EstadoTransaccion, Kpi, Transaccion } from '@/types/conciliacion'

export function DashboardPage() {
  const {
    kpis,
    evolucion,
    porBanco,
    procesando,
    cargando,
    errorCarga,
    transacciones,
    todasLasTransacciones,
    periodo,
  } = useConciliacion()

  const [resumenAbierto, setResumenAbierto] = useState(false)
  const navigate = useNavigate()
  const universo = universoConciliacion(transacciones)
  const porEstado = contarPorEstado(universo)
  const totalConciliables = universo.length
  const isLoading = cargando || (procesando && todasLasTransacciones.length > 0 && todasLasTransacciones.every((t) => t.estado === 'no_conciliada'))
  const noHayDatosDelPeriodo =
    !isLoading && transacciones.length === 0 && todasLasTransacciones.length > 0

  return (
    <Box>
      <PageHeader
        title="Dashboard"
        subtitle="Resumen ejecutivo de la conciliación bancaria del período."
        actions={
          <Button
            variant="outlined"
            startIcon={<SummarizeRoundedIcon />}
            onClick={() => setResumenAbierto(true)}
            disabled={transacciones.length === 0}
          >
            Resumen
          </Button>
        }
      />

      <ResumenDialog
        abierto={resumenAbierto}
        onClose={() => setResumenAbierto(false)}
        periodoLabel={etiquetaPeriodo(periodo)}
        transacciones={transacciones}
        kpis={kpis}
      />

      {errorCarga && (
        <Alert severity="error" sx={{ mb: 2 }}>
          No se pudieron cargar los datos desde Supabase: {errorCarga}
        </Alert>
      )}

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
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              title="Total de transacciones"
              value={formatNumeroCL(kpis.totalTransacciones)}
              icon={<ReceiptLongRoundedIcon />}
              accent="primary"
              subtitle={`${formatNumeroCL(transacciones.filter((t) => t.fuente === 'banco').length)} banco · ${formatNumeroCL(transacciones.filter((t) => t.fuente === 'contabilidad').length)} contabilidad`}
              isLoading={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              title="Monto no conciliado"
              value={formatCLP(kpis.montoNoConciliado)}
              icon={<MoneyOffRoundedIcon />}
              accent="error"
              subtitle={`Sobre ${formatCLP(kpis.montoTotal)} en movimientos`}
              isLoading={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              title="Conciliado real"
              value={formatPercent(kpis.tasaConciliacion, true)}
              icon={<PercentRoundedIcon />}
              accent={kpis.tasaConciliacion >= 90 ? 'success' : 'warning'}
              subtitle={
                `${formatNumeroCL(kpis.conciliadas)} de ${formatNumeroCL(kpis.universo)} movimientos` +
                ` · ${formatNumeroCL(kpis.resueltas)} por código` +
                (kpis.sugeridas > 0 ? ` · ${formatNumeroCL(kpis.sugeridas)} por revisar` : '')
              }
              isLoading={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <KpiCard
              title="Bancos cargados"
              value={formatNumeroCL(porBanco.length)}
              icon={<AccountBalanceRoundedIcon />}
              accent="info"
              subtitle="Fuentes bancarias en el período"
              isLoading={isLoading}
            />
          </Grid>

          {/* Gráfico de evolución */}
          <Grid item xs={12} md={8}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Evolución de la conciliación
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Movimientos por fecha y estado
                    </Typography>
                  </Box>
                </Stack>
                {isLoading ? (
                  <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
                ) : (
                  <AreaChartConciliacion data={evolucion} />
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Resumen por estado */}
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                  Distribución por estado
                </Typography>
                <Stack spacing={2}>
                  <BarraEstado
                    label="Conciliadas"
                    valor={porEstado.conciliada}
                    total={totalConciliables}
                    color="#009B77"
                  />
                  <BarraEstado
                    label="Explicadas por código (sin documento)"
                    valor={porEstado.resuelta}
                    total={totalConciliables}
                    color="#2E7D32"
                  />
                  <BarraEstado
                    label="Sugeridas / Pendientes"
                    valor={porEstado.sugerida + porEstado.pendiente}
                    total={totalConciliables}
                    color="#FF6B35"
                  />
                  <BarraEstado
                    label="No conciliadas"
                    valor={porEstado.no_conciliada}
                    total={totalConciliables}
                    color="#D32F2F"
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                  De los {formatNumeroCL(kpis.universo)} movimientos del banco:{' '}
                  <strong>{formatNumeroCL(kpis.operacion)}</strong> son de operación (pagos y cobros que
                  deben calzar con un documento) y <strong>{formatNumeroCL(kpis.tesoreria)}</strong> de
                  tesorería (traspasos entre cuentas, impuestos, comisiones y tarjetas), que no tienen
                  ni deben tener documento contable.
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<InsightsRoundedIcon />}
                  sx={{ mt: 2 }}
                  onClick={() => navigate('/analisis')}
                  disabled={transacciones.length === 0}
                >
                  Generar análisis
                </Button>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.75, textAlign: 'center' }}
                >
                  Detalle de lo que falta conciliar y cómo resolverlo
                </Typography>
                {isLoading && <LinearProgress sx={{ mt: 2 }} />}
              </CardContent>
            </Card>
          </Grid>

          {/* Gráfico por banco */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Conciliación por banco
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Transacciones conciliadas por institución bancaria
                </Typography>
                {isLoading ? (
                  <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 2 }} />
                ) : (
                  <BarChartPorBanco data={porBanco} />
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}

function BarraEstado({
  label,
  valor,
  total,
  color,
}: {
  label: string
  valor: number
  total: number
  color: string
}) {
  const pct = total > 0 ? (valor / total) * 100 : 0
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatNumeroCL(valor)} · {formatPercent(pct, true)}
        </Typography>
      </Stack>
      <Box sx={{ height: 10, borderRadius: 5, bgcolor: '#EEF1F7', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: color, borderRadius: 5, transition: 'width .4s' }} />
      </Box>
    </Box>
  )
}

function contarPorEstado(tx: { estado: EstadoTransaccion }[]) {
  const base = { conciliada: 0, pendiente: 0, no_conciliada: 0, sugerida: 0, resuelta: 0 }
  for (const t of tx) base[t.estado] += 1
  return base
}

const sumaAbs = (tx: Transaccion[]) => tx.reduce((acc, t) => acc + Math.abs(t.monto), 0)

function ResumenDialog({
  abierto,
  onClose,
  periodoLabel,
  transacciones,
  kpis,
}: {
  abierto: boolean
  onClose: () => void
  periodoLabel: string
  transacciones: Transaccion[]
  kpis: Kpi
}) {
  const banco = universoConciliacion(transacciones)
  const total = banco.length
  const conciliadas = banco.filter((t) => t.estado === 'conciliada')
  const resueltas = banco.filter((t) => t.estado === 'resuelta')
  const sugPend = banco.filter((t) => t.estado === 'sugerida' || t.estado === 'pendiente')
  const noConc = banco.filter((t) => t.estado === 'no_conciliada')
  const noConcConCodigo = noConc.filter((t) => t.codigoId)
  const noConcSinCodigo = noConc.filter((t) => !t.codigoId)

  const porCodigo = new Map<string, number>()
  for (const t of noConcConCodigo) porCodigo.set(t.codigoId!, (porCodigo.get(t.codigoId!) ?? 0) + 1)
  const topCodigos = [...porCodigo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

  const contab = transacciones.filter((t) => t.fuente === 'contabilidad' && t.monto !== 0)
  const contabConciliadas = contab.filter((t) => t.estado === 'conciliada').length
  const contabPendientes = contab.length - contabConciliadas

  const pct = (n: number) => (total > 0 ? formatPercent((n / total) * 100, true) : '0%')

  return (
    <Dialog open={abierto} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Resumen de conciliación · {periodoLabel}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Se analizan los <strong>{formatNumeroCL(total)}</strong> movimientos del banco del período.
          De ellos, <strong>{formatPercent(kpis.tasaExplicado, true)}</strong> están explicados
          (conciliados o resueltos). Las facturas del libro sin pago no entran en este porcentaje:
          se siguen aparte como cuentas por pagar/cobrar.
        </Typography>

        <Seccion titulo="✅ Conciliadas" color="success.main">
          <p>
            <strong>{formatNumeroCL(conciliadas.length)}</strong> ({pct(conciliadas.length)}) ·{' '}
            {formatCLP(sumaAbs(conciliadas))}
          </p>
          <p>Movimientos del banco que calzaron con un documento del libro (misma cifra, misma
            fecha aproximada). Es la conciliación en sentido estricto: pago ↔ factura.</p>
        </Seccion>

        <Seccion titulo="🗂️ Resueltas (sin contraparte)" color="success.dark">
          <p>
            <strong>{formatNumeroCL(resueltas.length)}</strong> ({pct(resueltas.length)}) ·{' '}
            {formatCLP(sumaAbs(resueltas))}
          </p>
          <p>Movimientos que no calzan con una factura pero están <strong>explicados por su código
            contable</strong>: comisiones, impuestos, traspasos entre cuentas, intereses,
            donaciones y cobros/pagos agrupados. No requieren contraparte, por eso se marcan como
            resueltos en vez de conciliados.</p>
        </Seccion>

        <Seccion titulo="💡 Sugeridas / Pendientes" color="warning.main">
          <p>
            <strong>{formatNumeroCL(sugPend.length)}</strong> ({pct(sugPend.length)}) ·{' '}
            {formatCLP(sumaAbs(sugPend))}
          </p>
          <p>Posibles coincidencias por revisar y confirmar manualmente en la tabla de conciliación.</p>
        </Seccion>

        <Seccion titulo="❌ No conciliadas" color="error.main">
          <p>
            <strong>{formatNumeroCL(noConc.length)}</strong> ({pct(noConc.length)}) ·{' '}
            {formatCLP(sumaAbs(noConc))} — este es el <strong>monto no conciliado</strong>.
          </p>
          <p>
            {formatNumeroCL(noConcConCodigo.length)} ya tienen código pero no calzaron con una
            factura puntual (suelen ser cobros/pagos agrupados, factoring o facturas de otro mes);
            puedes marcarlos como resueltos con un clic desde la tabla.
            {noConcSinCodigo.length > 0 && (
              <> {formatNumeroCL(noConcSinCodigo.length)} aún no tienen código asignado.</>
            )}
          </p>
          {topCodigos.length > 0 && (
            <p>
              Códigos más frecuentes entre las no conciliadas:{' '}
              {topCodigos.map(([c, n]) => `${c} (${n})`).join(' · ')}.
            </p>
          )}
        </Seccion>

        <Divider sx={{ my: 1.5 }} />

        <Seccion titulo="📄 Facturas del libro (contabilidad)" color="text.primary">
          <p>
            {formatNumeroCL(contab.length)} facturas en el período: {formatNumeroCL(contabConciliadas)}{' '}
            pagadas y conciliadas, {formatNumeroCL(contabPendientes)} pendientes de pago.
          </p>
          <p>Las pendientes de pago no cuentan como "no conciliadas" del banco: todavía no tienen un
            movimiento bancario asociado.</p>
        </Seccion>
      </DialogContent>
    </Dialog>
  )
}

function Seccion({ titulo, color, children }: { titulo: string; color: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, color, mb: 0.5 }}>
        {titulo}
      </Typography>
      <Box sx={{ '& p': { margin: 0, marginBottom: 0.5, fontSize: 13, color: 'text.secondary' } }}>
        {children}
      </Box>
    </Box>
  )
}
