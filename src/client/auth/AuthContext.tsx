import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import { load, save } from '../lib/storage'

export interface User {
  id: string
  email: string | null
  displayName: string | null
  level: string | null
  plan: string
  /** When the paid plan runs out (ISO date); null on the free plan. */
  planUntil?: string | null
  xp: number
  currentStreak: number
  longestStreak: number
  freezes?: number
}

interface AuthState {
  /** undefined = still checking, null = logged out */
  user: User | null | undefined
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** The last known profile, so the installed app still opens without a connection. */
function cachedUser(): User | null {
  try {
    return JSON.parse(load('user') ?? 'null')
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>('/me')
      save('user', JSON.stringify(me))
      setUser(me)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        save('user', 'null')
        setUser(null)
      } else {
        // No connection, or the server is restarting: the student is still logged in.
        setUser(cachedUser())
      }
    }
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', {}).catch(() => {})
    save('user', 'null')
    setUser(null)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return <AuthContext.Provider value={{ user, refresh, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
