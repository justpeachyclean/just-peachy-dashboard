import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Sales from './pages/Sales'
import BonusTracker from './pages/BonusTracker'
import UnitEconomics from './pages/UnitEconomics'
import Breakages from './pages/Breakages'
import Leads from './pages/Leads'
import CancelledClients from './pages/CancelledClients'
import ClientNurture from './pages/ClientNurture'
import Feedback from './pages/Feedback'
import Connections from './pages/Connections'
import Entry from './pages/Entry'
import Settings from './pages/Settings'
import Reports from './pages/Reports'

function AppShell() {
  const { isLoggedIn, checked } = useAuth()

  if (!checked) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  if (!isLoggedIn) return <Login />

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/bonus" element={<BonusTracker />} />
          <Route path="/economics" element={<UnitEconomics />} />
          <Route path="/breakages" element={<Breakages />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/cancellations" element={<CancelledClients />} />
          <Route path="/nurture" element={<ClientNurture />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/entry" element={<Entry />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/reports" element={<Reports />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
