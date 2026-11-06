import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { MATCHING_DEFAULT } from '@/services/matching'
import { CODIGOS_CON_DOCUMENTO } from '@/services/categoriesEngine'
import { formatCLP, formatDateCL } from '@/lib/format'
import { formatRUT, limpiarRUT } from '@/lib/rut'
import type { Transaccion } from '@/types/conciliacion'

type DecisionManual = { tipo: 'vincular'; candidato: Transaccion } | { tipo: 'cerrar' }

/**
 * Motivos por los que el motor no propuso este par. Se muestran antes de
 * confirmar una conciliación manual, para que la decisión sea informada y no un
 * clic a ciegas.
 */
function diferenciasConciliacion(a: Transaccion, b: Transaccion): string[] {
  const avisos: string[] = []
  const diferenciaMonto = Math.abs(Math.round(a.monto) - Math.round(b.monto))
  if (diferenciaMonto > MATCHING_DEFAULT.toleranciaMonto) {
    avisos.push(
      `Los montos difieren en ${formatCLP(diferenciaMonto)} (${formatCLP(a.monto)} contra ${formatCLP(b.monto)}).`,
    )
  }
  const dias = Math.abs(differenceInCalendarDays(parseISO(a.fecha), parseISO(b.fecha)))
  if (dias > MATCHING_DEFAULT.toleranciaDias) {
    avisos.push(
      `Las fechas están a ${dias} días, más que la tolerancia de ${MATCHING_DEFAULT.toleranciaDias}.`,
    )
  }
  const rutA = a.rut ? limpiarRUT(a.rut) : ''
  const rutB = b.rut ? limpiarRUT(b.rut) : ''
  if (rutA && rutB && rutA !== rutB) {
    avisos.push(`Los RUT no coinciden (${formatRUT(a.rut!)} contra ${formatRUT(b.rut!)}).`)
  }
  if (a.fuente === b.fuente) avisos.push('Ambos movimientos son de la misma fuente.')
  return avisos
}

/**
 * Conciliación manual de un movimiento: vincularlo a una contraparte elegida a
 * mano o cerrarlo sin contraparte (justificado por su código). Ambas salidas
 * pasan por una confirmación que explica las consecuencias.
 */
export function DialogBuscarMatch({
  origen,
  candidatos,
  onClose,
  onConfirmar,
  onCerrarSinVinculo,
}: {
  origen: Transaccion | null
  candidatos: Transaccion[]
  onClose: () => void
  onConfirmar: (id: string) => Promise<void>
  onCerrarSinVinculo: (t: Transaccion) => Promise<void>
}) {
  const [decision, setDecision] = useState<DecisionManual | null>(null)
  const [enviando, setEnviando] = useState(false)
  // En pendientes y no conciliadas el buscador es la vía de conciliación manual;
  // en el resto de los estados sigue siendo una búsqueda de contraparte.
  const esManual = origen?.estado === 'pendiente' || origen?.estado === 'no_conciliada'
  const diferencias = useMemo(
    () =>
      origen && decision?.tipo === 'vincular'
        ? diferenciasConciliacion(origen, decision.candidato)
        : [],
    [origen, decision],
  )
  // Un código que exige documento hace que el cierre sin contraparte sea la
  // excepción, no la regla: el aviso lo dice explícitamente.
  const exigeDocumento = !!origen?.codigoId && CODIGOS_CON_DOCUMENTO.has(origen.codigoId)

  const cerrar = () => {
    setDecision(null)
    onClose()
  }

  const confirmar = async () => {
    if (!origen || !decision) return
    setEnviando(true)
    try {
      if (decision.tipo === 'vincular') await onConfirmar(decision.candidato.id)
      else await onCerrarSinVinculo(origen)
    } finally {
      setEnviando(false)
      cerrar()
    }
  }

  return (
    <Dialog open={!!origen} onClose={cerrar} maxWidth="sm" fullWidth>
      <DialogTitle>
        {decision
          ? decision.tipo === 'cerrar'
            ? 'Confirmar cierre sin contraparte'
            : 'Confirmar conciliación manual'
          : esManual
            ? 'Conciliar manualmente'
            : 'Buscar contraparte'}
        {origen && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {origen.descripcion} · {formatCLP(origen.monto)} · {formatDateCL(origen.fecha)}
          </Typography>
        )}
      </DialogTitle>

      {decision ? (
        <>
          <DialogContent>
            <Stack spacing={2}>
              {decision.tipo === 'vincular' ? (
                <>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Se vinculará con
                    </Typography>
                    <Typography variant="body2">{decision.candidato.descripcion}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateCL(decision.candidato.fecha)} ·{' '}
                      {formatCLP(decision.candidato.monto)}
                      {decision.candidato.rut ? ` · ${formatRUT(decision.candidato.rut)}` : ''}
                    </Typography>
                  </Box>

                  <Alert
                    severity={diferencias.length ? 'warning' : 'success'}
                    icon={
                      diferencias.length ? (
                        <WarningAmberRoundedIcon fontSize="inherit" />
                      ) : undefined
                    }
                  >
                    {diferencias.length === 0 ? (
                      <Typography variant="body2">
                        Monto, fecha y RUT coinciden, pero el motor no propuso este par. Confírmalo
                        sólo si estás seguro de que corresponde.
                      </Typography>
                    ) : (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          El motor no propuso este par y hay diferencias:
                        </Typography>
                        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                          {diferencias.map((aviso) => (
                            <li key={aviso}>
                              <Typography variant="body2">{aviso}</Typography>
                            </li>
                          ))}
                        </Box>
                      </>
                    )}
                  </Alert>

                  <Typography variant="caption" color="text.secondary">
                    Al confirmar, ambos movimientos quedan conciliados. Es una decisión manual y no
                    queda registrada como tal: si recalculas el período, el motor puede rehacerla.
                    Puedes deshacerla antes con «Desconciliar».
                  </Typography>
                </>
              ) : (
                <>
                  <Alert severity="warning" icon={<WarningAmberRoundedIcon fontSize="inherit" />}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Se cierra sin contraparte
                    </Typography>
                    <Typography variant="body2">
                      El movimiento queda en estado «Resuelta», justificado por su código
                      {origen?.codigoId ? ` «${origen.codigoId}»` : ''}, y sale del emparejamiento:
                      no se le volverá a buscar contraparte hasta que uses «Revertir resolución».
                    </Typography>
                    {exigeDocumento && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Ojo: ese código normalmente exige calzar con un documento del libro. Ciérralo
                        sólo si sabes que no existe (por ejemplo, una transferencia recibida).
                      </Typography>
                    )}
                  </Alert>

                  <Typography variant="caption" color="text.secondary">
                    Queda marcado con el chip «manual» en la columna Estado, para distinguirlo de lo
                    conciliado contra un documento.
                  </Typography>
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDecision(null)} disabled={enviando}>
              Volver
            </Button>
            <Button
              variant="contained"
              color={decision.tipo === 'vincular' && diferencias.length ? 'warning' : 'success'}
              onClick={() => void confirmar()}
              disabled={enviando}
            >
              {enviando
                ? 'Guardando…'
                : decision.tipo === 'cerrar'
                  ? 'Sí, cerrar sin contraparte'
                  : 'Sí, conciliar'}
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent>
            <Stack spacing={1} sx={{ mt: 1, maxHeight: 400, overflow: 'auto' }}>
              {candidatos.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No hay candidatos disponibles en la fuente contraria.
                </Typography>
              )}
              {candidatos.map((c) => (
                <Stack
                  key={c.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    '&:hover': { borderColor: 'primary.main', bgcolor: '#F5F8FF' },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {c.descripcion}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateCL(c.fecha)} · {formatCLP(c.monto)}
                      {c.rut ? ` · ${formatRUT(c.rut)}` : ''}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => setDecision({ tipo: 'vincular', candidato: c })}
                  >
                    Vincular
                  </Button>
                </Stack>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={cerrar}>Cancelar</Button>
            {esManual && (
              <Tooltip
                title={
                  origen?.codigoId
                    ? 'No necesita respaldo ni contraparte: se cierra con su código'
                    : 'Asigna un código contable en la fila para poder cerrarlo sin contraparte'
                }
              >
                <span>
                  <Button
                    color="success"
                    startIcon={<CheckCircleRoundedIcon />}
                    disabled={!origen?.codigoId}
                    onClick={() => setDecision({ tipo: 'cerrar' })}
                  >
                    Conciliar sin vincular
                  </Button>
                </span>
              </Tooltip>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}
