import { useEffect, useState, type ReactNode } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
  type User,
} from './authContext'
import { esCorreoAutorizado } from './authHelpers'
import { useConciliacionStore } from '@/store/useConciliacionStore'

function limpiarDatosDeSesion(): void {
  useConciliacionStore.setState({
    transacciones: [],
    reglas: [],
    codigos: [],
    inicializado: false,
    cargando: false,
    errorCarga: null,
    errorSincronizacion: null,
  })
}

function mapUsuario(usuario: SupabaseUser | null | undefined): User | null {
  if (!usuario) return null
  const metadata = usuario.user_metadata ?? {}
  const nombre = (metadata.name ?? metadata.full_name ?? '') as string
  return {
    id: usuario.id,
    email: usuario.email ?? '',
    name: nombre,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    let activo = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!activo) return
        setState({ user: mapUsuario(data.session?.user), loading: false })
      })
      .catch(() => {
        if (!activo) return
        setState({ user: null, loading: false })
      })

    // Mantiene el estado sincronizado ante refresh de token, logout u otras pestañas.
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (!activo) return
      setState({ user: mapUsuario(session?.user), loading: false })
    })

    return () => {
      activo = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextValue = {
    ...state,
    async signIn(email, password) {
      limpiarDatosDeSesion()
      if (!esCorreoAutorizado(email)) {
        throw new Error('Dominio no autorizado.')
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      setState({ user: mapUsuario(data.user), loading: false })
    },
    async signOut() {
      await supabase.auth.signOut()
      limpiarDatosDeSesion()
      setState({ user: null, loading: false })
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
