import { createContext } from 'react'

export type User = {
  id: string
  email: string
  name?: string
}

export type AuthState = {
  user: User | null
  loading: boolean
}

export type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
