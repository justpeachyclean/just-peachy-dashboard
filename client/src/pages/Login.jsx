import { useState } from 'react'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(username, password)
    } catch {
      setError('Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-brand font-bold text-3xl italic mb-1" style={{ fontFamily: 'Georgia, serif' }}>just peachy</div>
          <div className="text-sage text-sm font-semibold tracking-widest">CLEAN, LLC</div>
          <p className="text-gray-400 text-sm mt-3">Team Dashboard</p>
        </div>
        <div className="card">
          <h2 className="text-lg font-bold text-ink mb-1">Welcome back</h2>
          <p className="text-sm text-gray-400 mb-5">Sign in to continue</p>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Username</label>
              <input type="text" autoFocus required className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. lexi" />
            </div>
            <div className="mb-4">
              <label className="form-label">Password</label>
              <input type="password" required className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
            </div>
            {error && <p className="text-sm text-danger mb-4 font-medium">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">
          Trouble logging in? Contact Jen — username is <span className="font-mono">admin</span>
        </p>
      </div>
    </div>
  )
}
