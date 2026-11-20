import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Quest } from '../../../shared/play'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import { playComplete, playCorrect } from '../../lib/sounds'

interface State {
  quests: Quest[]
  chestXp: number
  chestOpened: boolean
}

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Today's three quests: a bar for each, a button to collect the XP, and a chest for doing all three. */
export default function Quests({ onClaim }: { onClaim?: () => void }) {
  const { t } = useTranslation()
  const { refresh } = useAuth()
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /** The XP just collected, shown for a moment next to the quest. */
  const [gained, setGained] = useState<{ id: string; xp: number } | null>(null)

  useEffect(() => {
    api<State>(`/quests?tz=${encodeURIComponent(timezone())}`)
      .then(setState)
      .catch(() => setState(null))
  }, [])

  if (!state || state.quests.length === 0) return null

  async function claim(quest: Quest) {
    setBusy(quest.id)
    try {
      const result = await api<State & { xp: number; chest: boolean }>('/quests/claim', { id: quest.id, tz: timezone() })
      setState(result)
      setGained({ id: quest.id, xp: result.xp })
      if (result.chest) playComplete()
      else playCorrect()
      void refresh()
      onClaim?.()
      setTimeout(() => setGained(null), 2200)
    } catch {
      // Already collected, or the day changed: show what is true now.
      api<State>(`/quests?tz=${encodeURIComponent(timezone())}`)
        .then(setState)
        .catch(() => {})
    } finally {
      setBusy(null)
    }
  }

  const claimed = state.quests.filter((q) => q.claimed).length

  return (
    <section className="rounded-3xl bg-white p-4 shadow-[0_5px_0_0_rgba(31,27,58,0.07)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{t('quests.title')}</h2>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold ${state.chestOpened ? 'bg-mint/20 text-[#0E6B55]' : 'bg-sun/30 text-ink'}`}
          aria-label={t('quests.chest', { xp: state.chestXp })}
        >
          <span aria-hidden="true">{state.chestOpened ? '🎉' : '🎁'}</span>
          {state.chestOpened ? t('quests.chestOpened') : `${claimed} / ${state.quests.length} · +${state.chestXp} XP`}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {state.quests.map((quest) => (
          <li key={quest.id} className="flex items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${quest.claimed ? 'bg-mint/20' : 'bg-cream'}`} aria-hidden="true">
              {quest.claimed ? '✓' : quest.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-base font-bold leading-tight ${quest.claimed ? 'text-ink/45 line-through' : ''}`}>{t(`quests.${quest.id}`, { count: quest.target })}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="block h-2.5 flex-1 rounded-full bg-ink/10">
                  <span
                    className={`block h-2.5 rounded-full transition-all duration-500 ${quest.done ? 'bg-mint' : 'bg-sun'}`}
                    style={{ width: `${Math.max(quest.progress > 0 ? 6 : 0, (quest.progress / quest.target) * 100)}%` }}
                  />
                </span>
                <span className="text-xs font-extrabold tabular-nums text-ink/50">
                  {quest.progress} / {quest.target}
                </span>
              </div>
            </div>
            {quest.done && !quest.claimed ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => claim(quest)}
                className="pulse-soft min-h-11 shrink-0 rounded-2xl bg-coral px-3 text-sm font-extrabold text-white shadow-[0_4px_0_0_var(--color-coral-dark)] active:translate-y-1 active:shadow-[0_1px_0_0_var(--color-coral-dark)] disabled:opacity-60"
              >
                +{quest.xp} XP
              </button>
            ) : (
              <span className={`w-14 shrink-0 text-right text-sm font-extrabold ${gained?.id === quest.id ? 'pop-in text-[#0E8A6C]' : 'text-ink/35'}`}>
                {gained?.id === quest.id ? `+${gained.xp}` : quest.claimed ? '' : `+${quest.xp}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
