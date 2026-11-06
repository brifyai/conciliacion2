import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded'
import { useSnackbar } from 'notistack'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import { agruparGlosasSinCodigo } from './glosasSinCodigo'
import { sugerirCodigosPorGlosa } from '@/services/clasificacionIA'

/** Cuántas glosas sin código se muestran como máximo, ordenadas por frecuencia. */
const TOPE_VISIBLE = 40
/** Confianza mínima para pre-seleccionar automáticamente la sugerencia de la IA. */
const UMBRAL_IA = 0.7

interface SugerenciaIA {
  codigoId: string
  confianza: number
}

/**
 * Lista las glosas de transacciones sin código contable, agrupadas y ordenadas
 * por frecuencia. Permite asignar el código correcto (manual o sugerido por IA);
 * al aplicar, cada glosa se guarda como alias del código y el store re-ejecuta la
 * detección, dejando clasificadas todas las transacciones con esa glosa —ahora y
 * en futuras cargas.
 */
export function PanelGlosasSinCodigo() {
  const { enqueueSnackbar } = useSnackbar()
  const transacciones = useConciliacionStore((s) => s.transacciones)
  const codigos = useConciliacionStore((s) => s.codigos)
  const agregarAliasesEnLote = useConciliacionStore((s) => s.agregarAliasesEnLote)

  const [abierto, setAbierto] = useState(false)
  // Código elegido (manual o por IA) para cada glosa, pendiente de aplicar.
  const [seleccion, setSeleccion] = useState<Record<string, string>>({})
  // Sugerencias de la IA por glosa, para mostrar el detalle de confianza.
  const [sugerencias, setSugerencias] = useState<Record<string, SugerenciaIA>>({})
  const [analizando, setAnalizando] = useState(false)
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null)

  const { grupos, totalSin } = useMemo(
    () => agruparGlosasSinCodigo(transacciones),
    [transacciones],
  )

  // Muestra representativa (monto/RUT/proveedor) por glosa, para dar contexto a la IA.
  const muestraPorGlosa = useMemo(() => {
    const mapa = new Map<string, { monto?: number; rut?: string; proveedor?: string }>()
    for (const t of transacciones) {
      if (t.codigoId) continue
      const glosa = (t.descripcion || t.proveedor || t.contraparte || '').trim()
      if (!glosa || mapa.has(glosa)) continue
      mapa.set(glosa, { monto: t.monto, rut: t.rut, proveedor: t.proveedor })
    }
    return mapa
  }, [transacciones])

  // Sin transacciones cargadas no hay nada que clasificar; se oculta.
  if (transacciones.length === 0) return null

  // Todas las transacciones tienen código: estado positivo, para que el panel
  // sea descubrible y confirme que no queda nada pendiente.
  if (grupos.length === 0) {
    return (
      <Alert severity="success" sx={{ mb: 2 }}>
        Todas las transacciones cargadas tienen código contable asignado. Cuando cargues datos
        con glosas nuevas que no se reconozcan, aparecerán aquí para clasificarlas.
      </Alert>
    )
  }

  const activos = codigos.filter((c) => c.activo)
  const pendientes = Object.entries(seleccion).filter(([, codigoId]) => codigoId)

  const analizarConIA = async () => {
    setAbierto(true)
    setAnalizando(true)
    setProgreso({ hechas: 0, total: grupos.length })
    try {
      const entrada = grupos.map((g) => ({ glosa: g.glosa, ...muestraPorGlosa.get(g.glosa) }))
      const res = await sugerirCodigosPorGlosa(entrada, codigos, {
        onProgreso: (hechas, total) => setProgreso({ hechas, total }),
      })
      const nuevasSug: Record<string, SugerenciaIA> = {}
      const nuevaSel: Record<string, string> = { ...seleccion }
      let auto = 0
      for (const s of res) {
        if (!s.codigoSugerido) continue
        nuevasSug[s.glosa] = { codigoId: s.codigoSugerido, confianza: s.confianza }
        if (s.confianza >= UMBRAL_IA && !nuevaSel[s.glosa]) {
          nuevaSel[s.glosa] = s.codigoSugerido
          auto += 1
        }
      }
      setSugerencias(nuevasSug)
      setSeleccion(nuevaSel)
      const total = Object.keys(nuevasSug).length
      enqueueSnackbar(
        total === 0
          ? 'La IA no encontró códigos adecuados para estas glosas.'
          : `IA sugirió ${total} código(s); ${auto} de alta confianza quedaron pre-seleccionados. Revisa y aplica.`,
        { variant: total === 0 ? 'warning' : 'info' },
      )
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo consultar la IA.', {
        variant: 'error',
      })
    } finally {
      setAnalizando(false)
      setProgreso(null)
    }
  }

  const aplicar = () => {
    const asignaciones = pendientes.map(([glosa, codigoId]) => ({ codigoId, alias: glosa }))
    if (asignaciones.length === 0) return
    agregarAliasesEnLote(asignaciones)
    setSeleccion({})
    setSugerencias({})
    enqueueSnackbar(
      `${asignaciones.length} glosa(s) asignadas y guardadas como alias. Se reclasificaron las transacciones.`,
      { variant: 'success' },
    )
  }

  return (
    <Box sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderLeft: '4px solid', borderLeftColor: 'warning.main', borderRadius: 1, p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={1.5}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Glosas sin código contable
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {totalSin} transacción(es) en {grupos.length} glosa(s) distintas sin código. Asigna el
            correcto (manual o con IA); se guardará como alias para detectarlas solo.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip color="warning" variant="outlined" label={`${totalSin} sin código`} sx={{ fontWeight: 600 }} />
          <Button
            size="small"
            variant="contained"
            color="secondary"
            startIcon={<AutoAwesomeRoundedIcon />}
            onClick={analizarConIA}
            disabled={analizando}
          >
            {analizando ? 'Analizando…' : 'Sugerir con IA'}
          </Button>
          <Button
            size="small"
            onClick={() => setAbierto((v) => !v)}
            endIcon={abierto ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
          >
            {abierto ? 'Ocultar' : 'Revisar'}
          </Button>
        </Stack>
      </Stack>

      {analizando && progreso && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Consultando a la IA… {progreso.hechas}/{progreso.total} glosas
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progreso.total ? (progreso.hechas / progreso.total) * 100 : 0}
            sx={{ mt: 0.5, borderRadius: 1 }}
          />
        </Box>
      )}

      <Collapse in={abierto} timeout="auto" unmountOnExit>
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.5 }}>
          <Button
            variant="contained"
            size="small"
            onClick={aplicar}
            disabled={pendientes.length === 0}
          >
            Aplicar {pendientes.length > 0 ? `${pendientes.length} ` : ''}asignación(es)
          </Button>
        </Stack>

        <TableContainer sx={{ maxHeight: 440, mt: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#FFF7E6' }}>Glosa</TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#FFF7E6', width: 80 }} align="right">
                  Cantidad
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#FFF7E6', width: 150 }}>
                  Sugerencia IA
                </TableCell>
                <TableCell sx={{ fontWeight: 700, bgcolor: '#FFF7E6', width: 280 }}>
                  Código a asignar
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {grupos.slice(0, TOPE_VISIBLE).map((g) => {
                const sug = sugerencias[g.glosa]
                return (
                  <TableRow key={g.glosa} hover>
                    <TableCell sx={{ maxWidth: 380 }}>
                      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                        {g.glosa}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {g.count}
                    </TableCell>
                    <TableCell>
                      {sug ? (
                        <Chip
                          size="small"
                          color={sug.confianza >= UMBRAL_IA ? 'success' : 'warning'}
                          variant="outlined"
                          label={`${sug.codigoId} · ${Math.round(sug.confianza * 100)}%`}
                          onClick={() => setSeleccion((s) => ({ ...s, [g.glosa]: sug.codigoId }))}
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.secondary">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        value={seleccion[g.glosa] ?? ''}
                        displayEmpty
                        onChange={(e) =>
                          setSeleccion((s) => ({ ...s, [g.glosa]: String(e.target.value) }))
                        }
                        renderValue={(val) =>
                          val ? (
                            String(val)
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Elegir código…
                            </Typography>
                          )
                        }
                        sx={{ width: '100%', fontSize: 13 }}
                      >
                        <MenuItem value="">
                          <em>Sin asignar</em>
                        </MenuItem>
                        {activos.map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.clave ? `${c.clave} · ` : ''}{c.id} · {c.nombre}
                          </MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {grupos.length > TOPE_VISIBLE && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Se muestran las {TOPE_VISIBLE} glosas más frecuentes. Al aplicar las de arriba, irán
            apareciendo las siguientes.
          </Alert>
        )}
      </Collapse>
    </Box>
  )
}
