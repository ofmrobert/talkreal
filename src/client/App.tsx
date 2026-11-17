import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import Chai from './components/Chai'
import Home from './screens/Home'
import Lesson from './screens/Lesson'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import Placement from './screens/Placement'
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

/** The main screens need a level, so students without one go to the level step first. */
function RequireLevel() {
  const { user } = useAuth()
  return user?.level ? <Outlet /> : <Navigate to="/placement" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/login" element={<Login />} />
          <Route element={<RequireUser />}>
            <Route path="/placement" element={<Placement />} />
            <Route element={<RequireLevel />}>
              <Route path="/lesson/:id" element={<Lesson />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/talk" element={<Talk />} />
                <Route path="/profile" element={<Profile />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
