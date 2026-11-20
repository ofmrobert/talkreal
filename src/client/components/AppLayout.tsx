import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useFeedNews } from '../lib/feedNews'
import { BookIcon, FeedIcon, MicIcon, TrophyIcon, UserIcon } from './icons'

const tabs = [
  { to: '/', key: 'learn', Icon: BookIcon },
  { to: '/feed', key: 'feed', Icon: FeedIcon },
  { to: '/talk', key: 'talk', Icon: MicIcon },
  { to: '/league', key: 'league', Icon: TrophyIcon },
  { to: '/profile', key: 'profile', Icon: UserIcon },
] as const

/** The frame around the main screens: scrolling content on top, tab bar at the bottom. */
export default function AppLayout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // Asked again when the student moves between tabs, so the dot keeps up.
  const news = useFeedNews(pathname)
  const feedHasNews = (news?.fresh ?? 0) > 0 && pathname !== '/feed'

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <main className="safe-top flex-1 overflow-y-auto px-5 pb-6">
        <Outlet />
      </main>

      <nav className="safe-bottom border-t-2 border-ink/5 bg-card px-2 pt-1">
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
                <span className="relative">
                  <Icon />
                  {key === 'feed' && feedHasNews && <span className="absolute -right-1.5 -top-0.5 h-3 w-3 rounded-full bg-coral ring-2 ring-card" aria-label={t('feed.home.newDot')} />}
                </span>
                {t(`tabs.${key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
