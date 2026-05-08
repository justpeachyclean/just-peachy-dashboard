import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('jp_token'))
  const [authRequired, setAuthRequired] = useState(false)
  const [checked, setChecked] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const s = await fetch('/api/auth/status').then(r => r.json())
      setAuthRequired(s.auth_required)
      if (!s.auth_required) {
        setChecked(true)
        return
      }
      // Verify stored token
      const t = localStorage.getItem('jp_token')
      if (!t) { setChecked(true); return }
      // Quick verify by hitting a protected endpoint
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${t}` }
      })
      if (!res.ok) { localStorage.removeItem('jp_token'); setToken(null) }
    } catch {}
    setChecked(true)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  const login = async (password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) throw new Error('Incorrect password')
    const { token: t } = await res.json()
    localStorage.setItem('jp_token', t)
    setToken(t)
  }

  const logout = () => {
    localStorage.removeItem('jp_token')
    setToken(null)
  }

  const isLoggedIn = !authRequired || !!token

  return (
    <AuthContext.Provider value={{ token, authRequired, isLoggedIn, login, logout, checked }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }

// Wrap fetch to auto-attach the token
export function apiFetch(url, opts = {}) {
  const t = localStorage.getItem('jp_token')
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  })
}
