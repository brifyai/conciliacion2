import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/auth/ProtectedRoute'

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: async () => {
      const { LoginPage } = await import('@/features/auth/LoginPage')
      return { Component: LoginPage }
    },
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            index: true,
            lazy: async () => {
              const { DashboardPage } = await import('@/features/dashboard/DashboardPage')
              return { Component: DashboardPage }
            },
          },
          {
            path: 'carga',
            lazy: async () => {
              const { CargaPage } = await import('@/features/carga/CargaPage')
              return { Component: CargaPage }
            },
          },
          {
            path: 'conciliacion',
            lazy: async () => {
              const { ConciliacionPage } = await import('@/features/conciliacion/ConciliacionPage')
              return { Component: ConciliacionPage }
            },
          },
          {
            path: 'analisis',
            lazy: async () => {
              const { AnalisisPage } = await import('@/features/analisis/AnalisisPage')
              return { Component: AnalisisPage }
            },
          },
          {
            path: 'reglas',
            lazy: async () => {
              const { ReglasPage } = await import('@/features/reglas/ReglasPage')
              return { Component: ReglasPage }
            },
          },
          {
            path: 'codigos',
            lazy: async () => {
              const { CodigosPage } = await import('@/features/codigos/CodigosPage')
              return { Component: CodigosPage }
            },
          },
          {
            path: 'reportes',
            lazy: async () => {
              const { ReportesPage } = await import('@/features/reportes/ReportesPage')
              return { Component: ReportesPage }
            },
          },
          {
            path: 'pdf-a-excel',
            lazy: async () => {
              const { PdfAExcelPage } = await import('@/features/pdfaexcel/PdfAExcelPage')
              return { Component: PdfAExcelPage }
            },
          },
          {
            path: 'ayuda',
            lazy: async () => {
              const { AyudaPage } = await import('@/features/ayuda/AyudaPage')
              return { Component: AyudaPage }
            },
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
