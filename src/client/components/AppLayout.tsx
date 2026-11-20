import { NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BookIcon, MicIcon, TrophyIcon, UserIcon } from './icons'

const tabs = [
  { to: '/', key: 'learn', Icon: BookIcon },
  { to: '/talk', key: 'talk', Icon: MicIcon },
  { to: '/league', key: 'league', Icon: TrophyIcon },
  { to: '/profile', key: 'profile', Icon: UserIcon },
] as const

/** The frame around the main screens: scrolling content on top, tab bar at the bottom. */
export default function AppLayout() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <main className="safe-top flex-1 overflow-y-auto px-5 pb-6">
        <Outlet />
      </main>

      <nav className="safe-bottom border-t-2 border-ink/5 bg-white px-2 pt-1">
        <ul className="flex">
          {tabs.map(({ to, key, Icon }) => (
            <li key={key} className="flex-1">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-bold transition-colors ${
                    isActive ? 'text-coral' : 'text-ink/45'
                  }`
                }
              >
                <Icon />
                {t(`tabs.${key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
