import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  InputBase,
  LinearProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import { useSnackbar } from 'notistack'
import { PageHeader } from '@/components/common/PageHeader'
import {
  MODELO,
  construirExcel,
  descargarBlob,
  extraerTablasDePdf,
  type ProgresoConversion,
  type TablaExtraida,
} from '@/services/pdfAExcel'
import type { Moneda } from '@/services/pdfCartola'

const ETAPA_TEXTO: Record<ProgresoConversion['etapa'], string> = {
  renderizando: 'Renderizando páginas del PDF',
  analizando: 'Leyendo las tablas con IA',
  construyendo: 'Construyendo el Excel',
}

export function PdfAExcelPage() {
  const { enqueueSnackbar } = useSnackbar()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoConversion | null>(null)
  const [tablas, setTablas] = useState<TablaExtraida[] | null>(null)
  const [pestana, setPestana] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Moneda de la cartola. CLP por defecto; Global 66 viene en USD (con decimales).
  const [moneda, setMoneda] = useState<Moneda>('CLP')
  // Ediciones manuales de celdas, en una capa aparte para no copiar el arreglo
  // completo de filas en cada tecla. Clave: `${tabla}:${fila}:${columna}`.
  const [edits, setEdits] = useState<Record<string, string>>({})

  const claveCelda = (t: number, f: number, c: number) => `${t}:${f}:${c}`

  const editarCelda = (t: number, f: number, c: number, valor: string) => {
    setEdits((prev) => ({ ...prev, [claveCelda(t, f, c)]: valor }))
  }

  /** Aplica las ediciones manuales sobre las tablas extraídas. */
  const tablasConEdits = (tabs: TablaExtraida[]): TablaExtraida[] =>
    tabs.map((tabla, t) => ({
      ...tabla,
      filas: tabla.filas.map((fila, f) =>
        fila.map((celda, c) => edits[claveCelda(t, f, c)] ?? celda),
      ),
    }))

  const reiniciar = () => {
    setTablas(null)
    setPestana(0)
    setError(null)
    setProgreso(null)
    setNombreArchivo('')
    setEdits({})
    if (fileRef.current) fileRef.current.value = ''
  }

  const convertir = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      enqueueSnackbar('Selecciona un archivo PDF.', { variant: 'warning' })
      return
    }
    setNombreArchivo(file.name)
    setConvirtiendo(true)
    setError(null)
    setTablas(null)
    setPestana(0)
    setEdits({})
    try {
      const extraidas = await extraerTablasDePdf(file, { moneda, onProgress: setProgreso })
      if (extraidas.length === 0) {
        setError('No se detectaron tablas en el PDF. Prueba con un documento que contenga datos tabulares.')
      } else {
        setTablas(extraidas)
        const filas = extraidas.reduce((n, t) => n + t.filas.length, 0)
        enqueueSnackbar(`Conversión lista: ${extraidas.length} tabla(s), ${filas} fila(s).`, {
          variant: 'success',
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo convertir el PDF.')
    } finally {
      setConvirtiendo(false)
      setProgreso(null)
    }
  }

  const descargar = async () => {
    if (!tablas) return
    try {
      const blob = await construirExcel(tablasConEdits(tablas))
      const base = nombreArchivo.replace(/\.pdf$/i, '') || 'documento'
      descargarBlob(blob, `${base}.xlsx`)
      enqueueSnackbar('Excel descargado.', { variant: 'success' })
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : 'No se pudo generar el Excel.', {
        variant: 'error',
      })
    }
  }

  return (
    <Box>
      <PageHeader
        title="PDF a Excel"
        subtitle={`Convierte una cartola bancaria en PDF a una planilla Excel usando IA de visión (${MODELO}).`}
        actions={
          tablas || nombreArchivo ? (
            <Button variant="text" onClick={reiniciar} disabled={convirtiendo}>
              Convertir otro
            </Button>
          ) : undefined
        }
      />

      {!tablas && (
        <Card>
          <CardContent>
            <Stack alignItems="center" spacing={2.5} sx={{ py: 6 }}>
              <Box
                sx={{
                  width: 64, height: 64, borderRadius: 3, bgcolor: '#E8EEFF',
                  color: 'primary.main', display: 'grid', placeItems: 'center',
                }}
              >
                <AutoAwesomeRoundedIcon sx={{ fontSize: 32 }} />
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Sube una cartola en PDF
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  El modelo de visión lee cada página y reconstruye la cartola. Luego podrás
                  editar, previsualizar y descargar el Excel.
                </Typography>
              </Box>

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Moneda de la cartola
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={moneda}
                  onChange={(_, v: Moneda | null) => { if (v) setMoneda(v) }}
                  disabled={convirtiendo}
                >
                  <ToggleButton value="CLP">CLP (pesos)</ToggleButton>
                  <ToggleButton value="USD">USD (Global 66)</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Button
                variant="contained"
                component="label"
                startIcon={<UploadFileRoundedIcon />}
                disabled={convirtiendo}
              >
                Seleccionar PDF
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) convertir(file)
                  }}
                />
              </Button>

              {convirtiendo && (
                <Box sx={{ width: '100%', maxWidth: 460 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      {progreso ? ETAPA_TEXTO[progreso.etapa] : 'Preparando…'}
                      {progreso ? ` (${progreso.actual}/${progreso.total})` : ''}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant={progreso ? 'determinate' : 'indeterminate'}
                    value={progreso ? (progreso.actual / progreso.total) * 100 : undefined}
                    sx={{ borderRadius: 1 }}
                  />
                  {nombreArchivo && (
                    <Typography variant="caption" color="text.secondary">
                      {nombreArchivo}
                    </Typography>
                  )}
                </Box>
              )}

              {error && (
                <Alert severity="error" sx={{ width: '100%', maxWidth: 560 }}>
                  {error}
                </Alert>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {tablas && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ sm: 'center' }}
                spacing={2}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <TableChartRoundedIcon color="primary" />
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{nombreArchivo || 'Documento'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {tablas.length} tabla(s) ·{' '}
                      {tablas.reduce((n, t) => n + t.filas.length, 0)} fila(s) en total
                    </Typography>
                  </Box>
                </Stack>
                <Button
                  variant="contained"
                  startIcon={<DownloadRoundedIcon />}
                  onClick={descargar}
                >
                  Descargar Excel
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            {tablas.length > 1 && (
              <Tabs
                value={pestana}
                onChange={(_, v) => setPestana(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 1 }}
              >
                {tablas.map((t, i) => (
                  <Tab key={i} label={`${t.nombre} (${t.filas.length})`} />
                ))}
              </Tabs>
            )}
            <PreviewTabla
              tabla={tablas[pestana] ?? tablas[0]}
              valor={(f, c) => edits[claveCelda(pestana, f, c)] ?? (tablas[pestana]?.filas[f]?.[c] ?? '')}
              onEditar={(f, c, v) => editarCelda(pestana, f, c, v)}
            />
          </Card>
        </Stack>
      )}
    </Box>
  )
}

/**
 * Muestra hasta 100 filas de la tabla con celdas editables; el Excel descargado
 * incluye todas las filas y refleja las ediciones manuales.
 */
function PreviewTabla({
  tabla,
  valor,
  onEditar,
}: {
  tabla: TablaExtraida
  valor: (fila: number, columna: number) => string
  onEditar: (fila: number, columna: number, valor: string) => void
}) {
  const TOPE = 100
  const visibles = tabla.filas.slice(0, TOPE)
  return (
    <Box>
      <Box sx={{ px: 2, pt: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          Puedes editar cualquier celda (por ejemplo, completar RUT o Nombre vacíos);
          los cambios se incluyen al descargar el Excel.
        </Typography>
      </Box>
      <TableContainer sx={{ maxHeight: 520 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {tabla.encabezados.map((h, i) => (
                <TableCell key={i} sx={{ fontWeight: 700, bgcolor: '#F5F7FB', whiteSpace: 'nowrap' }}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibles.map((_, r) => (
              <TableRow key={r} hover>
                {tabla.encabezados.map((_, c) => (
                  <TableCell key={c} sx={{ p: 0.25 }}>
                    <InputBase
                      value={valor(r, c)}
                      onChange={(e) => onEditar(r, c, e.target.value)}
                      fullWidth
                      sx={{
                        fontSize: 13,
                        px: 1,
                        borderRadius: 1,
                        '& input': { p: '4px 0' },
                        '&:hover': { bgcolor: 'action.hover' },
                        '&.Mui-focused': { bgcolor: 'action.selected', outline: '1px solid', outlineColor: 'primary.main' },
                      }}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {tabla.filas.length > TOPE && (
        <Box sx={{ p: 1.5 }}>
          <Chip
            size="small"
            variant="outlined"
            label={`Vista previa editable de ${TOPE} de ${tabla.filas.length} filas · el Excel incluye todas`}
          />
        </Box>
      )}
    </Box>
  )
}
