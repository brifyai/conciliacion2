import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { useAuth } from '@/auth/useAuth'
import { esCorreoAutorizado } from '@/auth/authHelpers'
import { palette } from '@/theme/theme'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarClave, setMostrarClave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const dominioValido = email.length === 0 || esCorreoAutorizado(email)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Ingresa tu correo y contraseña.')
      return
    }
    if (!esCorreoAutorizado(email)) {
      setError(
        'Solo se permiten correos de origencomunicaciones.cl, origenmedios.cl o aintelligence.cl.',
      )
      return
    }

    setEnviando(true)
    try {
      await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'No se pudo iniciar sesión.'
      setError(
        /invalid|credenciales|unauthorized|401/i.test(mensaje)
          ? 'Correo o contraseña incorrectos.'
          : mensaje,
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        background: `linear-gradient(135deg, ${palette.primaryDark} 0%, ${palette.primary} 100%)`,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
        <Stack spacing={2.5} alignItems="center" sx={{ mb: 3 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '14px',
              bgcolor: 'primary.main',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LockOutlinedIcon />
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Conciliación Bancaria
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Inicia sesión para acceder a la plataforma
            </Typography>
          </Box>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <TextField
              type="email"
              autoComplete="email"
              fullWidth
              required
              placeholder="Correo corporativo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!dominioValido}
              helperText={!dominioValido ? 'Dominio no autorizado.' : undefined}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <MailOutlineRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Contraseña"
              type={mostrarClave ? 'text' : 'password'}
              autoComplete="current-password"
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment
                    position="end"
                    onClick={() => setMostrarClave((v) => !v)}
                    sx={{ cursor: 'pointer' }}
                  >
                    {mostrarClave ? (
                      <VisibilityOffOutlinedIcon fontSize="small" />
                    ) : (
                      <VisibilityOutlinedIcon fontSize="small" />
                    )}
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={enviando}
              startIcon={
                enviando ? (
                  <CircularProgress size={18} color="inherit" />
                ) : null
              }
            >
              {enviando ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
          </Stack>
        </Box>
      </Card>
    </Box>
  )
}
