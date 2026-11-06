import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded'
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded'
import RuleRoundedIcon from '@mui/icons-material/RuleRounded'
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Dashboard', icon: <DashboardRoundedIcon /> },
  { to: '/carga', label: 'Carga masiva', icon: <UploadFileRoundedIcon /> },
  { to: '/conciliacion', label: 'Conciliación', icon: <CompareArrowsRoundedIcon /> },
  { to: '/reglas', label: 'Reglas', icon: <RuleRoundedIcon /> },
  { to: '/codigos', label: 'Códigos', icon: <QrCode2RoundedIcon /> },
  { to: '/reportes', label: 'Reportes', icon: <PictureAsPdfRoundedIcon /> },
  { to: '/pdf-a-excel', label: 'PDF a Excel', icon: <TableChartRoundedIcon /> },
  { to: '/ayuda', label: 'Ayuda', icon: <HelpOutlineRoundedIcon /> },
]

export const SIDEBAR_WIDTH = 248

export function Sidebar() {
  return (
    <Box
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <Toolbar sx={{ px: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              bgcolor: 'primary.main',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            C
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>conciliaBK</Typography>
            <Typography variant="caption" color="text.secondary">
              Conciliación bancaria
            </Typography>
          </Box>
        </Box>
      </Toolbar>

      <List sx={{ px: 1.5, pt: 1 }}>
        {NAV.map((item) => (
          <ListItem key={item.to} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              component={NavLink}
              to={item.to}
              end={item.to === '/'}
              sx={{
                borderRadius: 2,
                py: 1,
                color: 'text.secondary',
                '&.active': {
                  bgcolor: 'primary.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'primary.dark' },
                  '& .MuiListItemIcon-root': { color: '#fff' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
