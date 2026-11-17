import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import Chai from './components/Chai'
import Home from './screens/Home'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import Profile from './screens/Profile'
import Talk from './screens/Talk'
import { load } from './lib/storage'

/** New visitors see the introduction first, then log in. */
function RequireUser() {
  const { user } = useAuth()
  if (!load('onboarded')) return <Navigate to="/welcome" replace />
  if (user === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Chai size={120} />
      </div>
    )
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/login" element={<Login />} />
          <Route element={<RequireUser />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/talk" element={<Talk />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
