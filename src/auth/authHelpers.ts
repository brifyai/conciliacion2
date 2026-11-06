const DOMINIOS_AUTORIZADOS = ['origencomunicaciones.cl', 'origenmedios.cl']

export function esCorreoAutorizado(email: string): boolean {
  const dominio = email.split('@')[1]?.toLowerCase()
  return !!dominio && DOMINIOS_AUTORIZADOS.includes(dominio)
}
