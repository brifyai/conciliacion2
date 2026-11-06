import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import DocumentScannerRoundedIcon from '@mui/icons-material/DocumentScannerRounded'
import { useSnackbar } from 'notistack'
import {
  buscarContrapartes,
  evaluarContraMovimiento,
  leerComprobante,
  sugerirCodigoDeComprobante,
  type ContraparteCandidata,
  type DatosComprobante,
  type EvaluacionComprobante,
  type ProgresoComprobante,
  type SugerenciaComprobante,
} from '@/services/comprobanteIA'
import { formatCLP, formatDateCL, formatPercent } from '@/lib/format'
import { formatRUT } from '@/lib/rut'
import type { Codigo, Transaccion } from '@/types/conciliacion'

const COLOR_VEREDICTO = {
  coincide: 'success',
  parcial: 'warning',
  no_coincide: 'error',
} as const

const TEXTO_VEREDICTO = {
  coincide: 'El comprobante calza con el movimiento',
  parcial: 'Calza sólo parcialmente',
  no_coincide: 'El comprobante no calza con el movimiento',
} as const

/** Campos del comprobante que se muestran, en orden. */
function campos(datos: DatosComprobante): [string, string][] {
  return (
    [
      ['Tipo', datos.tipoDocumento],
      ['Fecha', datos.fecha ? formatDateCL(datos.fecha) : ''],
      ['Monto', datos.monto != null ? `${formatCLP(datos.monto)} ${datos.moneda}`.trim() : ''],
      ['Ordenante', datos.ordenante],
      ['Beneficiario', datos.beneficiario],
      ['RUT beneficiario', datos.rutBeneficiario ? formatRUT(datos.rutBeneficiario) : ''],
      ['Banco destino', datos.bancoDestino],
      ['Cuenta destino', datos.cuentaDestino],
      ['Detalle', datos.detalle],
      ['N° operación', datos.numeroOperacion],
    ] as [string, string][]
  ).filter(([, valor]) => valor !== '')
}

export function DialogComprobante({
  transaccion,
  transacciones,
  codigos,
  onClose,
  onAplicar,
  onConciliar,
}: {
  transaccion: Transaccion | null
  /** Todas las transacciones cargadas, para buscar la contraparte en los libros. */
  transacciones: Transaccion[]
  codigos: Codigo[]
  onClose: () => void
  onAplicar: (
    id: string,
    patch: Pick<
      Partial<Transaccion>,
      'codigoId' | 'codigoOrigen' | 'codigoConfianza' | 'codigoEvidencia'
    >,
  ) => Promise<void>
  onConciliar: (idDocumento: string) => Promise<void>
}) {
  const { enqueueSnackbar } = useSnackbar()
  const [cargando, setCargando] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoComprobante | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [datos, setDatos] = useState<DatosComprobante | null>(null)
  const [evaluacion, setEvaluacion] = useState<EvaluacionComprobante | null>(null)
  const [sugerencia, setSugerencia] = useState<SugerenciaComprobante | null>(null)
  const [candidatos, setCandidatos] = useState<ContraparteCandidata[]>([])
  const [aplicando, setAplicando] = useState(false)
  const [conciliando, setConciliando] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const reiniciar = () => {
    abortRef.current?.abort()
    setCargando(false)
    setProgreso(null)
    setError(null)
    setDatos(null)
    setEvaluacion(null)
    setSugerencia(null)
    setCandidatos([])
  }

  const cerrar = () => {
    reiniciar()
    onClose()
  }

  const handleArchivo = async (file: File | undefined) => {
    if (!file || !transaccion) return
    reiniciar()
    const control = new AbortController()
    abortRef.current = control
    setCargando(true)
    try {
      const leidos = await leerComprobante(file, { signal: control.signal, onProgreso: setProgreso })
      if (control.signal.aborted) return
      setDatos(leidos)
      setEvaluacion(evaluarContraMovimiento(leidos, transaccion))
      setCandidatos(buscarContrapartes(leidos, transaccion, transacciones))
      setProgreso({ etapa: 'leyendo', mensaje: 'Buscando el código contable…' })
      const propuesta = await sugerirCodigoDeComprobante(leidos, transaccion, codigos, control.signal)
      if (control.signal.aborted) return
      setSugerencia(propuesta)
    } catch (e) {
      if (control.signal.aborted) return
      setError(e instanceof Error ? e.message : 'No se pudo leer el comprobante.')
    } finally {
      if (!control.signal.aborted) {
        setCargando(false)
        setProgreso(null)
      }
    }
  }

  const handleAplicar = async () => {
    if (!transaccion || !sugerencia || !datos) return
    setAplicando(true)
    try {
      const resumen = [
        datos.beneficiario ? `a ${datos.beneficiario}` : '',
        datos.detalle ? `"${datos.detalle}"` : '',
        datos.fecha ? formatDateCL(datos.fecha) : '',
        datos.monto != null ? formatCLP(datos.monto) : '',
        evaluacion ? `· ${TEXTO_VEREDICTO[evaluacion.veredicto]}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      await onAplicar(transaccion.id, {
        codigoId: sugerencia.codigo.id,
        codigoOrigen: 'manual',
        codigoConfianza: sugerencia.confianza,
        codigoEvidencia: `Comprobante adjunto: ${resumen}`.slice(0, 400),
      })
      enqueueSnackbar(`Código ${sugerencia.codigo.id} aplicado desde el comprobante.`, {
        variant: 'success',
      })
      cerrar()
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo aplicar el código.', {
        variant: 'error',
      })
    } finally {
      setAplicando(false)
    }
  }

  const handleConciliar = async (idDocumento: string) => {
    setConciliando(true)
    try {
      await onConciliar(idDocumento)
      enqueueSnackbar('Conciliación realizada con la contraparte del comprobante.', {
        variant: 'success',
      })
      cerrar()
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo conciliar.', {
        variant: 'error',
      })
    } finally {
      setConciliando(false)
    }
  }

  return (
    <Dialog open={!!transaccion} onClose={cerrar} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <DocumentScannerRoundedIcon color="primary" fontSize="small" />
        Leer comprobante de la transferencia
      </DialogTitle>

      <DialogContent dividers>
        {transaccion && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Movimiento: {transaccion.descripcion} · {formatCLP(transaccion.monto)} ·{' '}
            {formatDateCL(transaccion.fecha)}
          </Typography>
        )}

        <Button
          component="label"
          variant="outlined"
          startIcon={<UploadFileRoundedIcon />}
          disabled={cargando}
          sx={{ mb: 2 }}
        >
          {datos ? 'Subir otro comprobante' : 'Subir comprobante (PDF o imagen)'}
          <input
            type="file"
            hidden
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              void handleArchivo(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </Button>

        {cargando && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress sx={{ mb: 1 }} />
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                {progreso?.mensaje ?? 'Procesando…'}
              </Typography>
            </Stack>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {datos && (
          <Stack spacing={2}>
            {evaluacion && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip
                  color={COLOR_VEREDICTO[evaluacion.veredicto]}
                  label={TEXTO_VEREDICTO[evaluacion.veredicto]}
                />
                {evaluacion.rutOK && <Chip size="small" variant="outlined" label="RUT coincide" />}
              </Stack>
            )}

            {evaluacion && evaluacion.diferencias.length > 0 && (
              <Alert severity="warning" variant="outlined">
                <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
                  {evaluacion.diferencias.map((d) => (
                    <Typography key={d} component="li" variant="body2">
                      {d}
                    </Typography>
                  ))}
                </Stack>
              </Alert>
            )}

            <Table size="small">
              <TableBody>
                {campos(datos).map(([etiqueta, valor]) => (
                  <TableRow key={etiqueta}>
                    <TableCell sx={{ color: 'text.secondary', width: 150 }}>{etiqueta}</TableCell>
                    <TableCell>{valor}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Divider />

            {sugerencia ? (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Código propuesto desde el comprobante
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Chip color="primary" label={sugerencia.codigo.id} />
                  <Typography variant="body2">{sugerencia.codigo.nombre}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    confianza {formatPercent(sugerencia.confianza)} · origen {sugerencia.origen}
                  </Typography>
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  {sugerencia.evidencia}
                </Typography>
              </Box>
            ) : (
              <Alert severity="info" variant="outlined">
                No se pudo deducir un código del comprobante. Revisa los datos extraídos o asígnalo
                a mano en la tabla de conciliación.
              </Alert>
            )}

            <Alert severity="info" variant="outlined">
              Los datos los extrae un modelo de IA: verifícalos contra la imagen antes de aplicarlos.
            </Alert>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Posibles contrapartes en los libros
              </Typography>
              {candidatos.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No se encontraron documentos compatibles con el RUT y el monto del comprobante.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {candidatos.map((c) => (
                    <Box
                      key={c.transaccion.id}
                      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {c.transaccion.proveedor ??
                              c.transaccion.contraparte ??
                              c.transaccion.descripcion}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateCL(c.transaccion.fecha)} · {formatCLP(c.transaccion.monto)}
                            {c.transaccion.tipoDoc ? ` · ${c.transaccion.tipoDoc}` : ''}
                            {c.transaccion.folio ? ` ${c.transaccion.folio}` : ''}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={conciliando}
                          onClick={() => void handleConciliar(c.transaccion.id)}
                        >
                          Conciliar
                        </Button>
                      </Stack>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        <Chip
                          size="small"
                          color="primary"
                          variant="outlined"
                          label={`evidencia ${formatPercent(c.puntaje)}`}
                        />
                        {c.motivos.map((m) => (
                          <Chip key={m} size="small" variant="outlined" label={m} />
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Sólo se listan documentos libres (sin conciliar) del lado opuesto.
              </Typography>
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={cerrar} disabled={aplicando}>
          Cerrar
        </Button>
        <Button
          variant="contained"
          onClick={handleAplicar}
          disabled={!sugerencia || aplicando || cargando}
        >
          {aplicando
            ? 'Aplicando…'
            : `Aplicar código${sugerencia ? ` ${sugerencia.codigo.id}` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
