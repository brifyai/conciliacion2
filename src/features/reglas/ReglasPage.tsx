import { useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import { useSnackbar } from 'notistack'
import { PageHeader } from '@/components/common/PageHeader'
import { useConciliacionStore } from '@/store/useConciliacionStore'
import type {
  CampoRegla,
  OperadorRegla,
  Regla,
} from '@/types/conciliacion'

const CAMPOS: { value: CampoRegla; label: string }[] = [
  { value: 'descripcion', label: 'Descripción' },
  { value: 'monto', label: 'Monto' },
  { value: 'rut', label: 'RUT' },
  { value: 'categoria', label: 'Categoría' },
  { value: 'banco', label: 'Banco' },
]

const OPERADORES: { value: OperadorRegla; label: string }[] = [
  { value: 'contiene', label: 'contiene' },
  { value: 'no_contiene', label: 'no contiene' },
  { value: 'es_igual', label: 'es igual a' },
  { value: 'comienza_con', label: 'comienza con' },
  { value: 'termina_con', label: 'termina con' },
  { value: 'mayor_que', label: 'mayor que' },
  { value: 'menor_que', label: 'menor que' },
  { value: 'monto_positivo', label: 'es positivo' },
  { value: 'monto_negativo', label: 'es negativo' },
]

const VACIA: Regla = {
  id: '',
  nombre: '',
  activa: true,
  campo: 'descripcion',
  operador: 'contiene',
  valor: '',
  accion: { asignarCategoria: '' },
  prioridad: 99,
}

export function ReglasPage() {
  const { enqueueSnackbar } = useSnackbar()
  const reglas = useConciliacionStore((s) => s.reglas)
  const agregarRegla = useConciliacionStore((s) => s.agregarRegla)
  const actualizarRegla = useConciliacionStore((s) => s.actualizarRegla)
  const eliminarRegla = useConciliacionStore((s) => s.eliminarRegla)
  const aplicarReglasActivas = useConciliacionStore((s) => s.aplicarReglasActivas)

  const [editando, setEditando] = useState<Regla | null>(null)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<Regla | null>(null)

  const guardar = (regla: Regla) => {
    if (regla.id) {
      actualizarRegla(regla.id, regla)
      enqueueSnackbar('Regla actualizada.', { variant: 'success' })
    } else {
      agregarRegla({ ...regla, id: `regla-${Date.now()}` })
      enqueueSnackbar('Regla creada.', { variant: 'success' })
    }
    aplicarReglasActivas()
    setEditando(null)
  }

  return (
    <Box>
      <PageHeader
        title="Reglas de conciliación"
        subtitle="Automatiza la categorización de transacciones recurrentes."
        actions={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => setEditando({ ...VACIA })}
          >
            Nueva regla
          </Button>
        }
      />

      <Stack spacing={1.5}>
        {reglas
          .slice()
          .sort((a, b) => a.prioridad - b.prioridad)
          .map((regla) => (
            <Card key={regla.id} sx={{ opacity: regla.activa ? 1 : 0.6 }}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  alignItems={{ md: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        bgcolor: '#E8EEFF',
                        color: 'primary.main',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <BoltRoundedIcon fontSize="small" />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>{regla.nombre}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Si <strong>{etiquetaCampo(regla.campo)}</strong>{' '}
                        {etiquetaOperador(regla.operador)}{' '}
                        {requiereValor(regla.operador) ? <strong>«{regla.valor}»</strong> : ''}
                        {regla.accion.asignarCategoria ? ` → asigna «${regla.accion.asignarCategoria}»` : ''}
                      </Typography>
                    </Box>
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      Activa
                    </Typography>
                    <Switch
                      checked={regla.activa}
                      onChange={(e) => {
                        actualizarRegla(regla.id, { activa: e.target.checked })
                        aplicarReglasActivas()
                      }}
                    />
                    <IconButton onClick={() => setEditando({ ...regla })}>
                      <EditRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      color="error"
                      onClick={() => setConfirmandoEliminar(regla)}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
      </Stack>

      <Dialog open={!!confirmandoEliminar} onClose={() => setConfirmandoEliminar(null)}>
        <DialogTitle>Eliminar regla</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            ¿Seguro que deseas eliminar la regla <strong>{confirmandoEliminar?.nombre}</strong>?
            Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmandoEliminar(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (confirmandoEliminar) {
                eliminarRegla(confirmandoEliminar.id)
                enqueueSnackbar('Regla eliminada.', { variant: 'info' })
              }
              setConfirmandoEliminar(null)
            }}
          >
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      {editando && (
        <DialogRegla
          regla={editando}
          onClose={() => setEditando(null)}
          onGuardar={guardar}
        />
      )}
    </Box>
  )
}

function DialogRegla({
  regla,
  onClose,
  onGuardar,
}: {
  regla: Regla
  onClose: () => void
  onGuardar: (r: Regla) => void
}) {
  const [draft, setDraft] = useState<Regla>(regla)
  const set = (patch: Partial<Regla>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{regla.id ? 'Editar regla' : 'Nueva regla'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Nombre de la regla"
            value={draft.nombre}
            onChange={(e) => set({ nombre: e.target.value })}
            fullWidth
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Campo"
              value={draft.campo}
              onChange={(e) => set({ campo: e.target.value as CampoRegla })}
              fullWidth
            >
              {CAMPOS.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Operador"
              value={draft.operador}
              onChange={(e) => set({ operador: e.target.value as OperadorRegla })}
              fullWidth
            >
              {OPERADORES.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
          </Stack>
          {requiereValor(draft.operador) && (
            <TextField
              label="Valor de comparación"
              value={draft.valor}
              onChange={(e) => set({ valor: e.target.value })}
              fullWidth
              helperText="Para montos usa solo el número (ej: 500000)"
            />
          )}
          <TextField
            label="Categoría a asignar"
            value={draft.accion.asignarCategoria ?? ''}
            onChange={(e) => set({ accion: { ...draft.accion, asignarCategoria: e.target.value } })}
            fullWidth
          />
          <TextField
            type="number"
            label="Prioridad (menor = se evalúa antes)"
            value={draft.prioridad}
            onChange={(e) => set({ prioridad: Number(e.target.value) })}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={() => onGuardar(draft)} disabled={!draft.nombre}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function requiereValor(op: OperadorRegla): boolean {
  return op !== 'monto_positivo' && op !== 'monto_negativo'
}

function etiquetaCampo(c: CampoRegla): string {
  return CAMPOS.find((x) => x.value === c)?.label ?? c
}
function etiquetaOperador(o: OperadorRegla): string {
  return OPERADORES.find((x) => x.value === o)?.label ?? o
}
