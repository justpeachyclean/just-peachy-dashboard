import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Overview from './pages/Overview'
import Sales from './pages/Sales'
import BonusTracker from './pages/BonusTracker'
import UnitEconomics from './pages/UnitEconomics'
import Hiring from './pages/Hiring'
import Leads from './pages/Leads'
import CancelledClients from './pages/CancelledClients'
import ClientNurture from './pages/ClientNurture'
import Feedback from './pages/Feedback'
import Connections from './pages/Connections'
import Entry from './pages/Entry'
import Settings from './pages/Settings'

export default function App() {
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
          <Route path="/hiring" element={<Hiring />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/cancellations" element={<CancelledClients />} />
          <Route path="/nurture" element={<ClientNurture />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/entry" element={<Entry />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
