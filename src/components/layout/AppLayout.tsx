import { useEffect } from 'react'
import { Box, LinearProgress, Stack } from '@mui/material'
import { Outlet } from 'react-router-dom'
import { useSnackbar } from 'notistack'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useConciliacionStore } from '@/store/useConciliacionStore'

export function AppLayout() {
  const cargarDatos = useConciliacionStore((s) => s.cargarDatos)
  const cargando = useConciliacionStore((s) => s.cargando)
  const completandoCarga = useConciliacionStore((s) => s.completandoCarga)
  const errorSincronizacion = useConciliacionStore((s) => s.errorSincronizacion)
  const limpiarErrorSincronizacion = useConciliacionStore((s) => s.limpiarErrorSincronizacion)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  useEffect(() => {
    if (errorSincronizacion) {
      enqueueSnackbar(`Error de sincronización: ${errorSincronizacion}`, {
        variant: 'error',
        autoHideDuration: 6000,
      })
      limpiarErrorSincronizacion()
    }
  }, [errorSincronizacion, enqueueSnackbar, limpiarErrorSincronizacion])

  return (
    <Stack direction="row" sx={{ minHeight: '100vh' }}>
      <Sidebar />
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Topbar />
        {(cargando || completandoCarga) && (
          <LinearProgress
            aria-label="Cargando datos"
            sx={{ position: 'sticky', top: 0, zIndex: (t) => t.zIndex.appBar + 1 }}
          />
        )}
        <Box
          component="main"
          sx={{
            flex: 1,
            px: { xs: 2, md: 3.5 },
            py: { xs: 2.5, md: 3.5 },
            maxWidth: 1400,
            width: '100%',
            mx: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Stack>
    </Stack>
  )
}
