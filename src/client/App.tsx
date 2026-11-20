import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import BillingReturn from './screens/BillingReturn'
import Call from './screens/Call'
import Chat from './screens/Chat'
import Chai from './components/Chai'
import Home from './screens/Home'
import Lesson from './screens/Lesson'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import Placement from './screens/Placement'
import Privacy from './screens/Privacy'
import Review from './screens/Review'
import Test from './screens/Test'
import Offer from './screens/Offer'
import Plans from './screens/Plans'
import Profile from './screens/Profile'
import Talk from './screens/Talk'
import { load } from './lib/storage'

/** New visitors see the introduction first, then log in. */
function RequireUser() {
  const { user } = useAuth()
  if (user === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Chai size={120} />
      </div>
    )
  }
  // Someone who is already logged in never sees the introduction again, even on a phone that forgot it was shown.
  if (!user && !load('onboarded')) return <Navigate to="/welcome" replace />
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
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/offer" element={<Offer />} />
          <Route path="/plans" element={<Plans />} />
          <Route element={<RequireUser />}>
            <Route path="/placement" element={<Placement />} />
            <Route path="/billing/return" element={<BillingReturn />} />
            <Route element={<RequireLevel />}>
              <Route path="/lesson/:id" element={<Lesson />} />
              <Route path="/review" element={<Review />} />
              <Route path="/test/:id" element={<Test />} />
              <Route path="/talk/:teacherId" element={<Call />} />
              <Route path="/chat/:teacherId" element={<Chat />} />
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
