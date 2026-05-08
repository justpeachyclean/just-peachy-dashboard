import { useState } from 'react'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(password)
    } catch {
      setError('Incorrect password. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-brand font-bold text-3xl italic mb-1" style={{ fontFamily: 'Georgia, serif' }}>
            just peachy
          </div>
          <div className="text-sage text-sm font-semibold tracking-widest">CLEAN, LLC</div>
          <p className="text-gray-400 text-sm mt-3">Team Dashboard</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-ink mb-1">Welcome back</h2>
          <p className="text-sm text-gray-400 mb-5">Enter your team password to continue</p>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="form-label">Password</label>
              <input
                type="password"
                autoFocus
                required
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Team password"
              />
            </div>
            {error && (
              <p className="text-sm text-danger mb-4 font-medium">{error}</p>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-300 mt-4">
          Password is set by your manager in Settings
        </p>
      </div>
    </div>
  )
}
