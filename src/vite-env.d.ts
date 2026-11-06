/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /**
   * Inspección con IA (ClinePass). La API key NO va aquí: vive en
   * `CLINEPASS_API_KEY` (sin prefijo VITE_) y sólo la lee el proxy del servidor
   * de desarrollo, para que no acabe en el bundle del navegador.
   */
  readonly VITE_CLINEPASS_BASE_URL?: string
  readonly VITE_CLINEPASS_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
