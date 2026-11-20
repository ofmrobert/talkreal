import { useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { load, save } from '../lib/storage'
import { FeedPage } from './FeedAdmin'
import { AiPage, OverviewPage, TrafficPage } from './Insights'
import { PaymentsPage, PhotosPage, PromosPage, UserPage, UsersPage } from './People'
import { LearningPage, SystemPage } from './Product'

const TABS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Students' },
  { to: '/admin/photos', label: 'Photos' },
  { to: '/admin/feed', label: 'Feed' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/promos', label: 'Promo codes' },
  { to: '/admin/learning', label: 'Learning' },
  { to: '/admin/ai', label: 'AI teachers' },
  { to: '/admin/traffic', label: 'Traffic' },
  { to: '/admin/system', label: 'System' },
]

/**
 * The owner's panel at /admin: statistics, students, payments, promo codes. Only people whose
 * email is listed in ADMIN_EMAILS get in; the server checks that again on every request.
 * It is loaded separately from the app, so students never download it.
 */
export default function Admin() {
  const { user } = useAuth()
  // Dark or light: what was chosen last time here, otherwise what the computer itself uses.
  const [dark, setDark] = useState(() => {
    const saved = load('admin.theme')
    return saved ? saved === 'dark' : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  function toggleTheme() {
    save('admin.theme', dark ? 'light' : 'dark')
    setDark(!dark)
  }
  if (user === undefined) return <p className="p-6 text-sm text-slate-500">Loading…</p>
  if (!user) {
    // After logging in, come straight back here instead of landing in the app.
    save('afterLogin', '/admin')
    return <Navigate to="/login" replace />
  }
  // Say why, instead of silently showing the app: otherwise a missing setting looks like a broken link.
  if (!user.isAdmin) {
    return (
      <div className="mx-auto flex h-full max-w-md select-text flex-col items-center justify-center gap-3 p-6 text-center font-[system-ui,sans-serif] text-slate-700">
        <h1 className="text-xl font-extrabold text-slate-900">This account cannot open the admin panel</h1>
        <p className="text-sm">
          You are logged in as <b>{user.email ?? user.displayName ?? 'an account without an email'}</b>. The panel opens only for the emails listed in the
          ADMIN_EMAILS setting on the hosting. Add this email there, restart the app, and reload this page.
        </p>
        <NavLink to="/" className="text-sm font-bold text-violet-700 underline">
          Back to the app
        </NavLink>
      </div>
    )
  }

  return (
    <div className={`admin flex h-full select-text flex-col bg-slate-50 font-[system-ui,sans-serif] text-slate-800 md:flex-row ${dark ? 'admin-dark' : ''}`} style={{ userSelect: 'text' }}>
      <nav className="shrink-0 border-b border-slate-200 bg-white md:w-52 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block">
          <p className="text-base font-extrabold tracking-tight text-slate-900">
            Talkreal <span className="font-semibold text-slate-400">admin</span>
          </p>
          <NavLink to="/" className="text-xs font-semibold text-violet-700 hover:underline md:mt-1 md:block">
            ← Back to the app
          </NavLink>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 px-4 pb-3 md:mt-2 md:block md:py-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={dark}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
          >
            <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <p className="truncate text-xs text-slate-400 md:mt-3">{user.email}</p>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserPage />} />
            <Route path="photos" element={<PhotosPage />} />
            <Route path="feed" element={<FeedPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="promos" element={<PromosPage />} />
            <Route path="learning" element={<LearningPage />} />
            <Route path="ai" element={<AiPage />} />
            <Route path="traffic" element={<TrafficPage />} />
            <Route path="system" element={<SystemPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
