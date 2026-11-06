import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Prefijo vacío: carga también las variables sin `VITE_`, que son las que
  // NO se incrustan en el bundle del navegador.
  const env = loadEnv(mode, process.cwd(), '')

  return {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Vite 8 (Rolldown) resuelve @mui/icons-material a los archivos CJS
      // en vez de ESM, causando que los default imports se reciban como
      // objetos namespace. Forzamos la ruta ESM explícitamente.
      '@mui/icons-material': path.resolve(
        __dirname,
        'node_modules/@mui/icons-material/esm',
      ),
    },
  },
  server: {
    port: 5173,
    open: true,
    /**
     * Proxy para la inspección con IA (ClinePass).
     *
     * La API de Cline no debe llamarse desde el navegador —conviene evitar
     * exponer la key y depender de CORS—, así que el proxy la reenvía desde
     * Node, que no está sujeto a la política de mismo origen.
     *
     * Además inyecta aquí la API key, de modo que vive sólo en el proceso del
     * servidor de desarrollo y nunca llega al bundle del cliente. Por eso la
     * variable es `CLINEPASS_API_KEY` y no `VITE_CLINEPASS_API_KEY`.
     *
     * OJO: esto sólo existe en `npm run dev`. La build de producción no lleva
     * proxy; para publicar hay que mover la llamada a un backend propio (por
     * ejemplo la función serverless `api/clinepass.js` en Vercel).
     */
    proxy: {
      '/api/clinepass': {
        target: env.CLINEPASS_BASE_URL || 'https://api.deepseek.com',
        changeOrigin: true,
        // Ruta única: siempre apunta al endpoint de chat del modelo.
        rewrite: () => '/chat/completions',
        configure: (proxy) => {
          proxy.on('proxyReq', (peticion) => {
            if (env.CLINEPASS_API_KEY) {
              peticion.setHeader('Authorization', `Bearer ${env.CLINEPASS_API_KEY}`)
            }
          })
        },
      },
      /**
       * Proxy separado para la conversión PDF a Excel y la lectura de
       * comprobantes, con su propio modelo de visión y su propia variable de API
       * key (Cline). Va aparte del de inspección/clasificación para no
       * interferir, y mantiene la key sólo en el servidor (sin prefijo VITE_).
       */
      '/api/pdf': {
        target: env.PDF_MODEL_BASE_URL || 'https://api.cline.bot/api/v1',
        changeOrigin: true,
        rewrite: () => '/chat/completions',
        configure: (proxy) => {
          proxy.on('proxyReq', (peticion) => {
            if (env.PDF_MODEL_API_KEY) {
              peticion.setHeader('Authorization', `Bearer ${env.PDF_MODEL_API_KEY}`)
            }
          })
        },
      },
    },
  },
  }
})
