import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import AppLayout from './components/AppLayout'
import Home from './screens/Home'
import Onboarding from './screens/Onboarding'
import Profile from './screens/Profile'
import Talk from './screens/Talk'
import { load } from './lib/storage'

/** New visitors see the introduction first. */
function RequireOnboarding() {
  return load('onboarded') ? <Outlet /> : <Navigate to="/welcome" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<Onboarding />} />
        <Route element={<RequireOnboarding />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/talk" element={<Talk />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
