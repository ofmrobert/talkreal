import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { GOALS, INTERESTS, type Profile as ProfileData } from '../../shared/profile'
import { useAuth } from '../auth/AuthContext'
import Achievements from '../components/Achievements'
import Avatar from '../components/Avatar'
import { BoltIcon, BookIcon, FlameIcon, MicIcon } from '../components/icons'
import { api } from '../lib/api'

interface Stats {
  joined: string
  lessons: number
  tests: number
  words: number
  callMinutes: number
  calls: number
  badges: number
}

interface Loaded {
  profile: ProfileData & { photoVersion: number | null }
  stats: Stats
}

/** How much of the profile is filled in, and what is still missing. */
function completeness(profile: Loaded['profile']) {
  const parts: [string, boolean][] = [
    ['photo', profile.photoVersion !== null],
    ['name', Boolean(profile.name)],
    ['bio', Boolean(profile.bio)],
    ['goals', profile.goals.length > 0],
    ['interests', profile.interests.length > 0],
  ]
  return { done: parts.filter(([, ok]) => ok).length, total: parts.length, missing: parts.find(([, ok]) => !ok)?.[0] ?? null }
}

/**
 * Profile tab: who the student is (photo, name, a few words, why they learn) and how far they
 * have come. Built like a page on a social network, ready for the day students can see each other.
 */
export default function Profile() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<Loaded | null>(null)

  useEffect(() => {
    api<Loaded>('/profile')
      .then(setData)
      .catch(() => setData(null))
  }, [])

  if (!user) return null
  const profile = data?.profile
  const stats = data?.stats
  const paid = user.plan !== 'free'
  const filled = profile ? completeness(profile) : null
  const joined = stats ? new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'ru-RU', { month: 'long', year: 'numeric' }).format(new Date(stats.joined)).replace(/\s*г\.$/, '') : ''
  const name = profile?.name ?? user.displayName
  const facts = [profile?.age ? t('profile.years', { count: profile.age }) : null, profile?.city].filter(Boolean).join(' · ')

  const numbers = [
    { icon: <FlameIcon width={22} height={22} className="text-bad" />, value: user.currentStreak, label: t('profile.statStreak') },
    { icon: <BoltIcon width={22} height={22} className="text-sun" />, value: user.xp, label: t('profile.statXp') },
    { icon: <BookIcon width={22} height={22} className="text-violet" />, value: stats?.lessons ?? 0, label: t('profile.statLessons') },
    { icon: <MicIcon width={22} height={22} className="text-mint" />, value: stats?.callMinutes ?? 0, label: t('profile.statMinutes') },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* The card at the top: cover, photo, name, a few words */}
      <section className="overflow-hidden rounded-3xl bg-card shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
        <div className="relative h-24 bg-gradient-to-br from-coral to-violet">
          <span className="float-slow absolute -right-4 -top-6 h-24 w-24 rounded-full bg-white/15" aria-hidden="true" />
          <span className="float-slow absolute left-8 top-10 h-10 w-10 rounded-full bg-white/15" aria-hidden="true" />
          <button
            type="button"
            onClick={() => navigate('/settings')}
            aria-label={t('settings.title')}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/25 text-xl text-white backdrop-blur active:bg-white/40"
          >
            ⚙
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 pb-5">
          {/* Above the cover, so the photo overlaps it instead of hiding behind it. */}
          <div className="relative z-[1] -mt-12 flex items-end justify-between">
            <Avatar userId={user.id} name={name} photoVersion={profile?.photoVersion ?? user.photoVersion} size={96} className="ring-4 ring-card" />
            <button
              type="button"
              onClick={() => navigate('/profile/edit')}
              className="min-h-10 rounded-full border-2 border-ink/10 bg-card px-4 text-sm font-extrabold active:translate-y-0.5"
            >
              {t('profile.edit')}
            </button>
          </div>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold leading-tight">
              {name ?? t('profile.noName')}
              {paid && <span className="rounded-full bg-night px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-sun">👑 {t(`plans.name.${user.plan}`)}</span>}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink/55">
              {user.level && <span className="rounded-full bg-coral px-2.5 py-0.5 text-white">{user.level}</span>}
              {user.level && <span>{t(`levels.${user.level}.name`)}</span>}
              {facts && <span>· {facts}</span>}
            </p>
          </div>
          {profile?.bio && <p className="select-text whitespace-pre-line text-base leading-snug text-ink/80">{profile.bio}</p>}
          {profile && profile.goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {GOALS.filter((g) => profile.goals.includes(g.id)).map((g) => (
                <span key={g.id} className="rounded-full bg-coral/10 px-3 py-1 text-sm font-extrabold text-coral-ink">
                  {g.icon} {t(`goals.${g.id}`)}
                </span>
              ))}
            </div>
          )}
          {profile && profile.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {INTERESTS.filter((i) => profile.interests.includes(i.id)).map((i) => (
                <span key={i.id} className="rounded-full bg-ink/5 px-3 py-1 text-sm font-bold text-ink/70">
                  {i.icon} {t(`interests.${i.id}`)}
                </span>
              ))}
            </div>
          )}
          {joined && <p className="text-xs font-bold uppercase tracking-wide text-ink/40">{t('profile.joined', { date: joined })}</p>}
        </div>
      </section>

      {/* The numbers */}
      <section className="grid grid-cols-4 gap-2">
        {numbers.map((n) => (
          <div key={n.label} className="flex flex-col items-center gap-0.5 rounded-2xl bg-card px-1 py-3 text-center shadow-[0_4px_0_0_rgb(var(--shade)/0.06)]">
            {n.icon}
            <span className="text-xl font-extrabold tabular-nums leading-tight">{n.value}</span>
            <span className="text-[11px] font-bold leading-tight text-ink/50">{n.label}</span>
          </div>
        ))}
      </section>

      {/* The community */}
      <section className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => navigate('/people')} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-card px-3 text-base font-extrabold shadow-[0_4px_0_0_rgb(var(--shade)/0.06)] active:translate-y-0.5">
          <span aria-hidden="true">👥</span> {t('social.people.short')}
        </button>
        <button type="button" onClick={() => navigate('/messages')} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-card px-3 text-base font-extrabold shadow-[0_4px_0_0_rgb(var(--shade)/0.06)] active:translate-y-0.5">
          <span aria-hidden="true">✉️</span> {t('social.messages.title')}
        </button>
      </section>

      {/* A nudge to finish the profile */}
      {filled && filled.missing && (
        <button type="button" onClick={() => navigate('/profile/edit')} className="flex flex-col gap-2 rounded-3xl bg-sun/25 p-4 text-left active:translate-y-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-base font-extrabold">{t('profile.completeTitle')}</span>
            <span className="text-sm font-extrabold tabular-nums text-ink/60">
              {filled.done} / {filled.total}
            </span>
          </span>
          <span className="block h-2.5 w-full rounded-full bg-card/70">
            <span className="block h-2.5 rounded-full bg-sun transition-all" style={{ width: `${(filled.done / filled.total) * 100}%` }} />
          </span>
          <span className="text-sm font-semibold text-ink/65">{t(`profile.missing.${filled.missing}`)}</span>
        </button>
      )}

      {/* The plan */}
      <Link to="/plans" className={`flex items-center gap-3 rounded-3xl p-4 active:translate-y-0.5 ${paid ? 'bg-night text-white' : 'bg-card shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]'}`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sun text-2xl" aria-hidden="true">
          👑
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold leading-tight">{t('plans.yourPlan', { plan: t(`plans.name.${user.plan}`) })}</span>
          <span className="block text-sm font-semibold opacity-65">{paid ? t('plans.manage') : t('plans.upgradeHint')}</span>
        </span>
        <span className="text-2xl font-extrabold opacity-40" aria-hidden="true">
          ›
        </span>
      </Link>

      {/* What is coming: students practising with each other */}
      <section className="relative overflow-hidden rounded-3xl bg-violet-soft p-5">
        <span className="absolute -right-5 -top-5 text-7xl opacity-20" aria-hidden="true">
          🌍
        </span>
        <p className="text-xs font-extrabold uppercase tracking-wide text-violet-ink">{t('community.soon')}</p>
        <h2 className="mt-1 text-xl font-extrabold leading-tight">{t('community.title')}</h2>
        <p className="mt-1 text-base leading-snug text-ink/70">{t('community.text')}</p>
        <p className="mt-3 text-sm font-bold text-ink/60">
          {profile?.discoverable ? `✓ ${t('community.visible')}` : t('community.hidden')}{' '}
          <button type="button" onClick={() => navigate('/profile/edit')} className="font-extrabold text-violet-ink underline">
            {t('community.change')}
          </button>
        </p>
        <button type="button" onClick={() => navigate('/people')} className="mt-3 min-h-11 rounded-2xl bg-violet px-4 text-sm font-extrabold text-white shadow-[0_4px_0_0_var(--color-violet-dark)] active:translate-y-1">
          👥 {t('social.messages.find')}
        </button>
      </section>

      {user.isAdmin && (
        <Link to="/admin" className="flex min-h-12 items-center justify-center rounded-2xl bg-night px-4 text-base font-extrabold text-white active:translate-y-0.5">
          Admin panel
        </Link>
      )}

      <Achievements />

      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="flex min-h-14 items-center gap-3 rounded-2xl bg-card px-4 text-left text-base font-extrabold shadow-[0_4px_0_0_rgb(var(--shade)/0.06)] active:translate-y-0.5"
      >
        <span className="text-xl" aria-hidden="true">
          ⚙
        </span>
        <span className="flex-1">
          {t('settings.title')}
          <span className="block text-sm font-semibold text-ink/50">{t('settings.hint')}</span>
        </span>
        <span className="text-2xl font-extrabold text-ink/30" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  )
}
