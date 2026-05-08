import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('jp_token'))
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jp_user') || 'null') } catch { return null }
  })
  const [authRequired, setAuthRequired] = useState(false)
  const [checked, setChecked] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      const s = await fetch('/api/auth/status').then(r => r.json())
      setAuthRequired(s.auth_required)
      if (!s.auth_required) { setChecked(true); return }
      const t = localStorage.getItem('jp_token')
      if (!t) { setChecked(true); return }
      const res = await fetch('/api/settings', { headers: { Authorization: `Bearer ${t}` } })
      if (!res.ok) {
        localStorage.removeItem('jp_token')
        localStorage.removeItem('jp_user')
        setToken(null)
        setCurrentUser(null)
      }
    } catch {}
    setChecked(true)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  const login = async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error('Invalid username or password')
    const { token: t, user } = await res.json()
    localStorage.setItem('jp_token', t)
    localStorage.setItem('jp_user', JSON.stringify(user))
    setToken(t)
    setCurrentUser(user)
  }

  const logout = () => {
    localStorage.removeItem('jp_token')
    localStorage.removeItem('jp_user')
    setToken(null)
    setCurrentUser(null)
  }

  const isLoggedIn = !authRequired || !!token

  return (
    <AuthContext.Provider value={{ token, currentUser, authRequired, isLoggedIn, login, logout, checked }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }

export function apiFetch(url, opts = {}) {
  const t = localStorage.getItem('jp_token')
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  })
}
