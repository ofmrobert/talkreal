import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppLayout from './components/AppLayout'
import BillingReturn from './screens/BillingReturn'
import Call from './screens/Call'
import Chat from './screens/Chat'
import EditProfile from './screens/EditProfile'
import Feed from './screens/Feed'
import Chai from './components/Chai'
import Home from './screens/Home'
import League from './screens/League'
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
import ProfileSetup from './screens/ProfileSetup'
import Settings from './screens/Settings'
import Talk from './screens/Talk'
import { load } from './lib/storage'
import { trackPage } from './lib/track'

// The owner's panel is a separate download, so students never load it.
const Admin = lazy(() => import('./admin/Admin'))

/** Reports every screen that is opened, for the statistics in the admin panel. */
function PageTracker() {
  const { pathname } = useLocation()
  useEffect(() => trackPage(pathname), [pathname])
  return null
}

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

/** New students are asked a few things about themselves once, right after signing up. */
function RequireProfile() {
  const { user } = useAuth()
  // Only a clear "not yet" sends anyone there: an older saved copy of the account has no answer either way.
  return user?.profileSet === false ? <Navigate to="/setup" replace /> : <Outlet />
}

/** The app itself: first the "about you" step, then a level. */
function RequireLevelAndProfile() {
  const { user } = useAuth()
  if (user?.profileSet === false) return <Navigate to="/setup" replace />
  return user?.level ? <Outlet /> : <Navigate to="/placement" replace />
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
        <PageTracker />
        <Routes>
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={null}>
                <Admin />
              </Suspense>
            }
          />
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/offer" element={<Offer />} />
          <Route path="/plans" element={<Plans />} />
          <Route element={<RequireUser />}>
            <Route path="/setup" element={<ProfileSetup />} />
            <Route path="/billing/return" element={<BillingReturn />} />
            <Route path="/profile/edit" element={<EditProfile />} />
            <Route path="/settings" element={<Settings />} />
            <Route element={<RequireProfile />}>
              <Route path="/placement" element={<Placement />} />
            </Route>
            <Route element={<RequireLevelAndProfile />}>
              <Route path="/lesson/:id" element={<Lesson />} />
              <Route path="/review" element={<Review />} />
              <Route path="/test/:id" element={<Test />} />
              <Route path="/talk/:teacherId" element={<Call />} />
              <Route path="/chat/:teacherId" element={<Chat />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/feed" element={<Feed />} />
                <Route path="/talk" element={<Talk />} />
                <Route path="/league" element={<League />} />
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
