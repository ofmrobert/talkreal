import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Person } from '../../shared/social'
import Chai from '../components/Chai'
import { BackButton, PersonCard } from '../components/social/SocialBits'
import { api } from '../lib/api'

type Tab = 'suggested' | 'following' | 'followers'
const TABS: Tab[] = ['suggested', 'following', 'followers']

interface PeopleData {
  people: Person[]
  counts: { followers: number; following: number }
}

/** Practice partners: students to follow and write to, the closest matches first. */
export default function Partners() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('suggested')
  const [q, setQ] = useState('')
  const [data, setData] = useState<PeopleData | null>(null)
  const [failed, setFailed] = useState(false)
  /** Whether the student's own profile can be found by others. Null while unknown. */
  const [visible, setVisible] = useState<boolean | null>(null)

  useEffect(() => {
    api<{ profile: { discoverable: boolean } }>('/profile')
      .then((result) => setVisible(result.profile.discoverable))
      .catch(() => {})
  }, [])

  useEffect(() => {
    // A short pause while typing, so not every letter asks the server.
    const timer = setTimeout(
      () => {
        api<PeopleData>(`/social/people?tab=${tab}${tab === 'suggested' && q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
          .then((result) => {
            setData(result)
            setFailed(false)
          })
          .catch(() => setFailed(true))
      },
      q ? 300 : 0,
    )
    return () => clearTimeout(timer)
  }, [tab, q])

  const count = (value: Tab) => (value === 'following' ? data?.counts.following : value === 'followers' ? data?.counts.followers : undefined)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3 pt-1">
        <BackButton to="/feed" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold leading-tight">{t('social.people.title')}</h1>
          <p className="text-sm font-semibold text-ink/60">{t('social.people.subtitle')}</p>
        </div>
      </header>

      {visible === false && (
        <button type="button" onClick={() => navigate('/profile/edit')} className="flex items-center gap-3 rounded-3xl bg-violet-soft p-4 text-left active:translate-y-0.5">
          <span className="text-3xl" aria-hidden="true">
            👀
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-extrabold leading-tight">{t('social.people.hiddenTitle')}</span>
            <span className="block text-sm font-semibold leading-snug text-ink/60">{t('social.people.hiddenText')}</span>
          </span>
          <span className="text-xl font-extrabold text-ink/30" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      <div className="flex gap-1 rounded-2xl bg-card p-1.5">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setData(null)
              setTab(value)
            }}
            aria-pressed={tab === value}
            className={`min-h-10 flex-1 rounded-xl px-0.5 text-[13px] font-extrabold transition-colors ${tab === value ? 'bg-coral text-white' : 'text-ink/60'}`}
          >
            {t(`social.people.tabs.${value}`)}
            {count(value) ? ` ${count(value)}` : ''}
          </button>
        ))}
      </div>

      {tab === 'suggested' && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 40))}
          type="search"
          placeholder={t('social.people.search')}
          aria-label={t('social.people.search')}
          className="min-h-12 select-text rounded-2xl border-2 border-ink/10 bg-card px-4 text-base font-semibold outline-none placeholder:text-ink/35 focus:border-coral"
        />
      )}

      {!data && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Chai size={90} />
          {failed && <p className="text-base font-bold text-ink/60">{t('login.errors.network')}</p>}
        </div>
      )}
      {data?.people.length === 0 && <p className="rounded-2xl bg-card p-4 text-base text-ink/65">{t(q.trim() && tab === 'suggested' ? 'social.people.nothingFound' : `social.people.empty.${tab}`)}</p>}
      {data?.people.map((person) => (
        <PersonCard key={person.face.userId} person={person} onChange={(next) => setData({ ...data, people: data.people.map((p) => (p.face.userId === next.face.userId ? next : p)) })} />
      ))}
    </div>
  )
}
