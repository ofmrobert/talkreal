import { useTranslation } from 'react-i18next'
import { achievementIcon } from '../../../shared/achievements'
import Chai from '../Chai'
import { FlameIcon } from '../icons'
import Button from '../ui/Button'
import ProgressBar from '../ui/ProgressBar'

export interface LessonResult {
  xpEarned: number
  accuracy: number
  streak: number
  streakExtended: boolean
  firstTime: boolean
  todayXp: number
  xpGoal: number
  newAchievements?: string[]
  freezeUsed?: boolean
  freezeEarned?: boolean
}

interface Props {
  result: LessonResult
  seconds: number
  onContinue: () => void
  /** Replaces the usual "lesson complete" headline when the result is not perfect or great. */
  title?: string
  /** Always shown as the headline, whatever the result (a passed test, a new level). */
  headline?: string
  /** A second button above "Continue", e.g. another round of review. */
  extraAction?: { label: string; onClick: () => void }
}

const CONFETTI = ['#FF6B4A', '#FFC53D', '#2EC4A0', '#7C5CFF', '#FF6B4A', '#FFC53D', '#2EC4A0', '#7C5CFF', '#FF6B4A', '#FFC53D', '#2EC4A0', '#7C5CFF']

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The celebration after a lesson: XP, accuracy, time, streak and the daily goal. */
export default function LessonSummary({ result, seconds, onContinue, title, headline: fixedHeadline, extraAction }: Props) {
  const { t } = useTranslation()
  const headline =
    fixedHeadline ??
    (result.accuracy === 100 ? t('summary.perfect') : result.accuracy >= 80 ? t('summary.great') : (title ?? t('summary.done')))

  const stats = [
    { label: t('summary.xp'), value: `+${result.xpEarned}`, color: 'bg-sun/30' },
    { label: t('summary.accuracy'), value: `${result.accuracy}%`, color: 'bg-mint/20' },
    { label: t('summary.time'), value: formatTime(seconds), color: 'bg-[#7C5CFF]/15' },
  ]

  return (
    <div className="safe-screen relative mx-auto flex h-full max-w-md flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0" aria-hidden="true">
        {CONFETTI.map((color, i) => (
          <span
            key={i}
            className="confetti"
            style={{ left: `${4 + i * 8}%`, backgroundColor: color, animationDelay: `${(i % 6) * 0.12}s` }}
          />
        ))}
      </div>

      <div className="slide-in flex flex-1 flex-col items-center gap-5 overflow-y-auto pb-2 pt-8 text-center">
        <Chai size={150} />
        <div>
          <h1 className="text-3xl font-extrabold">{headline}</h1>
          <p className="mt-1 text-lg text-ink/65">
            {result.firstTime ? t('summary.lessonComplete') : t('summary.practiceComplete')}
          </p>
        </div>

        <div className="grid w-full grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-2xl p-3 ${s.color}`}>
              <div className="text-2xl font-extrabold">{s.value}</div>
              <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-ink/60">{s.label}</div>
            </div>
          ))}
        </div>

        {result.streakExtended && (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-coral p-4 text-left text-white">
            <FlameIcon width={34} height={34} />
            <div>
              <div className="text-xl font-extrabold">{t('summary.streak', { count: result.streak })}</div>
              <div className="text-sm font-semibold opacity-90">{t('summary.streakHint')}</div>
            </div>
          </div>
        )}

        {result.freezeUsed && (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-[#DDF1FF] p-4 text-left">
            <span className="text-3xl" aria-hidden="true">
              🧊
            </span>
            <div>
              <div className="text-lg font-extrabold">{t('freeze.used')}</div>
              <div className="text-sm font-semibold text-ink/65">{t('freeze.usedHint')}</div>
            </div>
          </div>
        )}

        {result.freezeEarned && (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-[#DDF1FF] p-4 text-left">
            <span className="text-3xl" aria-hidden="true">
              🧊
            </span>
            <div>
              <div className="text-lg font-extrabold">{t('freeze.earned')}</div>
              <div className="text-sm font-semibold text-ink/65">{t('freeze.earnedHint')}</div>
            </div>
          </div>
        )}

        {(result.newAchievements ?? []).map((key) => (
          <div key={key} className="bubble-in flex w-full items-center gap-3 rounded-2xl bg-sun/30 p-4 text-left">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-3xl" aria-hidden="true">
              {achievementIcon(key)}
            </span>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wide text-ink/55">{t('achievements.newTitle')}</div>
              <div className="text-lg font-extrabold leading-tight">{t(`achievements.${key}.name`)}</div>
              <div className="text-sm font-semibold text-ink/65">{t(`achievements.${key}.text`)}</div>
            </div>
          </div>
        ))}

        <div className="w-full rounded-2xl bg-white p-4 text-left">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-base font-extrabold">{t('home.dailyGoal')}</span>
            <span className="text-sm font-bold text-ink/55">
              {Math.min(result.todayXp, result.xpGoal)} / {result.xpGoal} XP
            </span>
          </div>
          <ProgressBar value={result.todayXp / result.xpGoal} />
        </div>
      </div>

      {extraAction ? (
        <div className="flex flex-col gap-2">
          <Button onClick={extraAction.onClick}>{extraAction.label}</Button>
          <Button variant="ghost" onClick={onContinue}>
            {t('summary.continue')}
          </Button>
        </div>
      ) : (
        <Button onClick={onContinue}>{t('summary.continue')}</Button>
      )}
    </div>
  )
}
