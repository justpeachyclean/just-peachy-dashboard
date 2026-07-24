import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'

const tabs = [
  { path: '/overview', label: 'Overview' },
  { path: '/sales', label: 'Sales & Leads' },
  { path: '/bonus', label: 'Bonus Tracker' },
  { path: '/economics', label: 'Unit Economics' },
  { path: '/leads', label: 'Client Log' },
  { path: '/cancellations', label: 'Cancellations' },
  { path: '/nurture', label: 'Client Care' },
  { path: '/feedback', label: 'Feedback' },
  { path: '/breakages', label: 'Breakages' },
  { path: '/connections', label: 'Connections' },
  { path: '/reports', label: 'Reports' },
]

export default function Navbar() {
  const { authRequired, currentUser, logout } = useAuth()
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/overview" className="flex items-center">
            <img
              src="/jpc-logo.png"
              alt="Just Peachy Clean, LLC"
              className="h-12 w-auto object-contain"
              onError={e => {
                e.target.style.display = 'none'
                e.target.nextSibling.style.display = 'block'
              }}
            />
            <div className="leading-none hidden">
              <div className="text-brand font-bold text-xl italic" style={{ fontFamily: 'Georgia, serif' }}>
                just peachy
              </div>
              <div className="text-sage text-xs font-semibold" style={{ letterSpacing: '0.18em' }}>
                CLEAN, LLC
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/entry" className="btn-primary text-sm px-4 py-2">
              + Log Data
            </Link>
            <Link
              to="/settings"
              className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-50 transition-colors text-lg"
              title="Settings"
            >
              ⚙️
            </Link>
            {authRequired && currentUser && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 hidden sm:block">
                  {currentUser.display_name || currentUser.username}
                </span>
                <button
                  onClick={() => { if (window.confirm('Sign out?')) logout() }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        <nav className="flex gap-6 -mb-px overflow-x-auto">
          {tabs.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `pb-3 pt-1 text-sm whitespace-nowrap transition-colors border-b-2 ${
                  isActive
                    ? 'border-brand text-brand font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
