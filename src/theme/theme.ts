import { createTheme } from '@mui/material/styles'
import type {} from '@mui/x-data-grid/themeAugmentation'

/** Paleta "Modern Fintech Chile". */
export const palette = {
  primary: '#0033A0', // Azul profundo: confianza/estabilidad
  primaryDark: '#002680',
  success: '#009B77', // Verde esmeralda: conciliado
  warning: '#FF6B35', // Naranjo: pendiente/CTA
  error: '#D32F2F', // Rojo: no conciliado
  info: '#0EA5E9',
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  text: '#1A2233',
  muted: '#6B7280',
} as const

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: palette.primary,
      dark: palette.primaryDark,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: palette.success,
      contrastText: '#FFFFFF',
    },
    success: {
      main: palette.success,
      contrastText: '#FFFFFF',
    },
    warning: {
      main: palette.warning,
      contrastText: '#FFFFFF',
    },
    error: {
      main: palette.error,
      contrastText: '#FFFFFF',
    },
    info: {
      main: palette.info,
      contrastText: '#FFFFFF',
    },
    background: {
      default: palette.bg,
      paper: palette.surface,
    },
    text: {
      primary: palette.text,
      secondary: palette.muted,
    },
    divider: '#E4E8F0',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700, letterSpacing: '-0.01em' },
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none' as const },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: palette.bg,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: { boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.1)' },
      },
      defaultProps: { elevation: 0 },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: '1px solid #E4E8F0',
          boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10 },
        sizeMedium: { paddingInline: 18, paddingBlock: 9 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: palette.surface,
          color: palette.text,
          boxShadow: '0 1px 0 rgba(16,24,40,0.06)',
        },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: 'none',
          borderRadius: 14,
        },
        columnHeader: {
          fontWeight: 600,
          color: palette.muted,
        },
        row: {
          '&:hover': { backgroundColor: '#F0F4FF' },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { fontSize: 12, borderRadius: 8 },
      },
    },
  },
})

export type AppTheme = typeof theme
