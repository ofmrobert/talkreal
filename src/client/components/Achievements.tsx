import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ACHIEVEMENTS } from '../../shared/achievements'
import { api } from '../lib/api'

/** Profile section: every badge, with the earned ones in colour. Tap a badge to see how to get it. */
export default function Achievements() {
  const { t } = useTranslation()
  const [earned, setEarned] = useState<Set<string> | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    api<{ earned: { key: string }[] }>('/achievements')
      .then((res) => setEarned(new Set(res.earned.map((a) => a.key))))
      .catch(() => setEarned(new Set()))
  }, [])

  if (!earned) return null

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('achievements.title')}</h2>
        <span className="text-sm font-bold text-ink/50">
          {earned.size} / {ACHIEVEMENTS.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {ACHIEVEMENTS.map((badge) => {
          const has = earned.has(badge.key)
          return (
            <button
              key={badge.key}
              type="button"
              onClick={() => setOpen(open === badge.key ? null : badge.key)}
              aria-pressed={open === badge.key}
              className={`flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center active:translate-y-0.5 ${
                has ? 'bg-card shadow-[0_4px_0_0_rgb(var(--shade)/0.07)]' : 'bg-card/50'
              } ${open === badge.key ? 'ring-2 ring-coral' : ''}`}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full text-3xl ${has ? 'bg-sun/30' : 'bg-ink/5 opacity-40 grayscale'}`}
                aria-hidden="true"
              >
                {badge.icon}
              </span>
              <span className={`text-xs font-extrabold leading-tight ${has ? '' : 'text-ink/40'}`}>
                {t(`achievements.${badge.key}.name`)}
              </span>
            </button>
          )
        })}
      </div>
      {open && (
        <p className="bubble-in mt-2.5 rounded-2xl bg-card p-3 text-center text-sm font-bold text-ink/70" role="status">
          {earned.has(open) ? '✓ ' : ''}
          {t(`achievements.${open}.text`)}
        </p>
      )}
    </section>
  )
}
