import { useEffect, useRef, useState } from 'react'
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
  Stack,
  Typography,
} from '@mui/material'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import { inspeccionarConIA, type ContextoInspeccion, type InspeccionIA } from '@/services/inspeccionIA'
import { formatCLP, formatDateCL, formatPercent } from '@/lib/format'
import { formatRUT } from '@/lib/rut'
import type { Codigo, Transaccion } from '@/types/conciliacion'

const COLOR_VEREDICTO = {
  confirmar: 'success',
  rechazar: 'error',
  revisar: 'warning',
} as const

const TEXTO_VEREDICTO = {
  confirmar: 'Confirmar la conciliación',
  rechazar: 'Rechazar la contraparte propuesta',
  revisar: 'Revisar manualmente',
} as const

// Cuando el movimiento no tenía una contraparte propuesta (no conciliadas o
// pendientes), el veredicto se refiere a por qué no se pudo conciliar.
const TEXTO_VEREDICTO_SIN_PROPUESTA = {
  confirmar: 'Contraparte identificada',
  rechazar: 'Sin contraparte conciliable',
  revisar: 'Revisar manualmente',
} as const

// Si ya está cerrado por su código, el veredicto se refiere a si esa
// explicación se sostiene.
const TEXTO_VEREDICTO_RESUELTA = {
  confirmar: 'El código asignado se sostiene',
  rechazar: 'El código no corresponde',
  revisar: 'Revisar manualmente',
} as const

export function DialogInspeccionIA({
  transaccion,
  codigos,
  onClose,
  onConfirmar,
}: {
  transaccion: Transaccion | null
  codigos: Codigo[]
  onClose: () => void
  onConfirmar: (tx: Transaccion) => Promise<void>
}) {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<InspeccionIA | null>(null)
  const [contexto, setContexto] = useState<ContextoInspeccion | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!transaccion) return
    const control = new AbortController()
    abortRef.current = control
    setCargando(true)
    setError(null)
    setResultado(null)
    setContexto(null)

    inspeccionarConIA(transaccion, codigos, control.signal)
      .then(({ inspeccion, contexto: ctx }) => {
        if (control.signal.aborted) return
        setResultado(inspeccion)
        setContexto(ctx)
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return
        setError(e instanceof Error ? e.message : 'No se pudo completar la inspección.')
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false)
      })

    // Cancela la petición si el diálogo se cierra antes de que responda.
    return () => control.abort()
  }, [transaccion, codigos])

  const propuesta = contexto?.contraparistaPropuesta
  const textosVeredicto = transaccion?.estado === 'resuelta'
    ? TEXTO_VEREDICTO_RESUELTA
    : propuesta ? TEXTO_VEREDICTO : TEXTO_VEREDICTO_SIN_PROPUESTA

  return (
    <Dialog open={!!transaccion} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeRoundedIcon color="primary" fontSize="small" />
        Inspección con IA
      </DialogTitle>

      <DialogContent dividers>
        {transaccion && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {transaccion.descripcion} · {formatCLP(transaccion.monto)} · {formatDateCL(transaccion.fecha)}
            {transaccion.rut ? ` · ${formatRUT(transaccion.rut)}` : ''}
          </Typography>
        )}

        {cargando && (
          <Stack alignItems="center" spacing={2} sx={{ py: 5 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              Consultando el contexto en la base de datos y analizando…
            </Typography>
          </Stack>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {resultado && !cargando && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                color={COLOR_VEREDICTO[resultado.veredicto]}
                label={textosVeredicto[resultado.veredicto]}
              />
              <Typography variant="caption" color="text.secondary">
                Confianza del modelo: {formatPercent(resultado.confianza)}
              </Typography>
            </Stack>

            <Typography variant="body1">{resultado.resumen}</Typography>

            {propuesta && (
              <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Contraparte propuesta por el motor
                </Typography>
                <Typography variant="body2">
                  {propuesta.descripcion} · {formatCLP(propuesta.monto)} · {formatDateCL(propuesta.fecha)}
                </Typography>
              </Box>
            )}

            {resultado.motivos.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>Evidencia</Typography>
                <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
                  {resultado.motivos.map((m) => (
                    <Typography key={m} component="li" variant="body2">{m}</Typography>
                  ))}
                </Stack>
              </Box>
            )}

            {resultado.acciones.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>Qué hacer</Typography>
                <Stack component="ol" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
                  {resultado.acciones.map((a) => (
                    <Typography key={a} component="li" variant="body2">{a}</Typography>
                  ))}
                </Stack>
              </Box>
            )}

            {resultado.codigoSugerido && (
              <Typography variant="body2">
                <strong>Código sugerido:</strong> {resultado.codigoSugerido}
                {codigos.find((c) => c.id === resultado.codigoSugerido)?.nombre
                  ? ` · ${codigos.find((c) => c.id === resultado.codigoSugerido)?.nombre}`
                  : ' (no existe en el catálogo)'}
              </Typography>
            )}

            {contexto && contexto.otrosCandidatos.length > 0 && (
              <>
                <Divider />
                <Typography variant="caption" color="text.secondary">
                  Se encontraron {contexto.otrosCandidatos.length} candidato(s) alternativo(s)
                  con el mismo monto en fechas cercanas.
                </Typography>
              </>
            )}

            <Alert severity="info" variant="outlined">
              Es una sugerencia generada por IA. Verifícala antes de aplicarla.
            </Alert>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        {resultado?.veredicto === 'confirmar' && transaccion?.matchId && (
          <Button
            variant="contained"
            color="success"
            onClick={async () => { await onConfirmar(transaccion) }}
          >
            Confirmar conciliación
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
