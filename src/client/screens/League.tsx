import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LEAGUE_TIERS, type LeagueRow } from '../../shared/play'
import Avatar from '../components/Avatar'
import Chai from '../components/Chai'
import { BoltIcon } from '../components/icons'
import Button from '../components/ui/Button'
import { api } from '../lib/api'

interface LeagueData {
  joined: boolean
  tier: number
  daysLeft: number
  rows: LeagueRow[]
  zones: { up: number; down: number }
  topTier: number
}

/** League tab: this week's table of the student's group, and who is moving up or down. */
export default function League() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data, setData] = useState<LeagueData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api<LeagueData>('/league')
      .then(setData)
      .catch(() => setFailed(true))
  }, [])

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Chai size={110} />
        {failed && <p className="text-base font-bold text-ink/60">{t('login.errors.network')}</p>}
      </div>
    )
  }

  const tier = LEAGUE_TIERS[Math.min(data.tier, LEAGUE_TIERS.length - 1)]
  const me = data.rows.find((row) => row.me)
  const { up, down } = data.zones
  const canGoUp = data.tier < data.topTier
  const size = data.rows.length

  return (
    <div className="flex flex-col gap-4">
      <header className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: tier.color, boxShadow: '0 6px 0 0 rgb(var(--shade)/0.18)' }}>
        <span className="float-slow absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15" aria-hidden="true" />
        <div className="flex items-center gap-4">
          <span className="pop-in flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/25 text-5xl" aria-hidden="true">
            {tier.icon}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wide opacity-85">{t('league.title')}</p>
            <h1 className="text-2xl font-extrabold leading-tight">{t(`league.tiers.${data.tier}`)}</h1>
            <p className="mt-0.5 text-sm font-bold opacity-90">{t('league.daysLeft', { count: data.daysLeft })}</p>
          </div>
        </div>
        {/* All the leagues in a row, with this one marked */}
        <div className="mt-4 flex items-center justify-between gap-1" aria-hidden="true">
          {LEAGUE_TIERS.map((other, index) => (
            <span
              key={index}
              className={`flex h-9 flex-1 items-center justify-center rounded-xl text-lg ${index === data.tier ? 'bg-card text-ink shadow-[0_3px_0_0_rgb(var(--shade)/0.2)]' : index < data.tier ? 'bg-white/35' : 'bg-white/15 opacity-70'}`}
            >
              {other.icon}
            </span>
          ))}
        </div>
      </header>

      {!data.joined ? (
        <section className="flex flex-col items-center gap-4 rounded-3xl bg-card p-6 text-center shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
          <Chai size={120} />
          <div>
            <h2 className="text-xl font-extrabold">{t('league.joinTitle')}</h2>
            <p className="mt-1 text-base text-ink/65">{t('league.joinText')}</p>
          </div>
          <Button onClick={() => navigate('/')}>{t('league.joinButton')}</Button>
        </section>
      ) : (
        <>
          {me && (
            <p className="rounded-2xl bg-card px-4 py-3 text-base font-bold shadow-[0_4px_0_0_rgb(var(--shade)/0.06)]" role="status">
              {me.rank <= up && canGoUp
                ? `🚀 ${t('league.youUp', { rank: me.rank })}`
                : down > 0 && me.rank > size - down
                  ? `⚠️ ${t('league.youDown', { rank: me.rank })}`
                  : t('league.youStay', { rank: me.rank, count: size })}
            </p>
          )}

          <ol className="flex flex-col overflow-hidden rounded-3xl bg-card shadow-[0_5px_0_0_rgb(var(--shade)/0.07)]">
            {data.rows.map((row, index) => (
              <Fragment key={row.userId}>
                {canGoUp && index === up && (
                  <li className="flex items-center gap-2 bg-mint/15 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-good-ink">▲ {t('league.zoneUp')}</li>
                )}
                {down > 0 && index === size - down && (
                  <li className="flex items-center gap-2 bg-bad/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-bad-ink">▼ {t('league.zoneDown')}</li>
                )}
                <li className={`flex items-center gap-3 px-4 py-2.5 ${row.me ? 'bg-sun/25' : ''} ${index > 0 ? 'border-t border-ink/5' : ''}`}>
                  <span className={`w-7 shrink-0 text-center text-base font-extrabold tabular-nums ${row.rank <= 3 ? 'text-ink' : 'text-ink/45'}`}>
                    {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank}
                  </span>
                  <Avatar userId={row.userId} name={row.name} photoVersion={row.photoVersion} size={40} />
                  <span className="min-w-0 flex-1 truncate text-base font-bold">
                    {row.name ?? `${t('league.student')} ${row.tag}`}
                    {row.me && <span className="ml-1.5 rounded-full bg-night px-2 py-0.5 text-xs font-extrabold text-white">{t('league.you')}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-base font-extrabold tabular-nums">
                    <BoltIcon width={16} height={16} className="text-sun" />
                    {row.xp}
                  </span>
                </li>
              </Fragment>
            ))}
          </ol>

          <p className="px-1 text-sm font-semibold leading-snug text-ink/50">{t('league.rules', { up, down })}</p>
          <p className="px-1 pb-2 text-sm font-semibold leading-snug text-ink/50">
            {t('league.privacy')}{' '}
            <button type="button" onClick={() => navigate('/profile/edit')} className="font-extrabold text-coral-ink underline">
              {t('community.change')}
            </button>
          </p>
        </>
      )}
    </div>
  )
}
