import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { QueryClientProvider } from '@tanstack/react-query'
import { SnackbarProvider } from 'notistack'
import { RouterProvider } from 'react-router-dom'
import { theme } from '@/theme/theme'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/routes'
import { AuthProvider } from '@/auth/AuthProvider'

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          autoHideDuration={3000}
        >
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </SnackbarProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
