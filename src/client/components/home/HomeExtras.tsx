import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import home from '../../../../content/home.json'
import { TEACHERS } from '../../../shared/teachers'
import Chai from '../Chai'
import SpeakButton from '../lesson/SpeakButton'
import TeacherAvatar from '../TeacherAvatar'

type Lang = 'ru' | 'en'

/** A number that changes once a day, so "of the day" content is the same all day for everyone. */
function dayNumber(): number {
  const now = new Date()
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000)
}

/** Chai with a speech bubble: a greeting first, then learning tips that change every few seconds. */
export function MascotSays({ streak }: { streak: number }) {
  const { t, i18n } = useTranslation()
  const lang: Lang = i18n.language === 'en' ? 'en' : 'ru'
  const [index, setIndex] = useState(0)

  const messages = useMemo(() => {
    const hour = new Date().getHours()
    const greeting =
      streak >= 2
        ? t('home.mascot.streak', { count: streak })
        : t(hour < 12 ? 'home.mascot.morning' : hour < 18 ? 'home.mascot.day' : 'home.mascot.evening')
    // Start the tips at a different place each day.
    const start = dayNumber() % home.tips.length
    const tips = [...home.tips.slice(start), ...home.tips.slice(0, start)].map((tip) => tip[lang])
    return [greeting, ...tips]
  }, [lang, streak, t])

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % messages.length), 9000)
    return () => clearInterval(timer)
  }, [messages.length])

  return (
    <button
      type="button"
      onClick={() => setIndex((index + 1) % messages.length)}
      className="flex w-full items-center gap-2 text-left"
      aria-label={t('home.mascot.next')}
    >
      <Chai size={92} mood={streak >= 2 ? 'excited' : 'happy'} />
      <span
        key={index}
        className="bubble-in min-w-0 flex-1 rounded-3xl rounded-bl-md bg-white px-4 py-3 text-base font-bold leading-snug shadow-[0_4px_0_0_rgba(31,27,58,0.07)]"
      >
        {messages[index % messages.length]}
      </span>
    </button>
  )
}

/** The last seven days as dots: filled when the student earned XP that day. */
export function WeekStrip({ week }: { week: { day: string; xp: number }[] }) {
  const { t, i18n } = useTranslation()
  const weekday = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en' : 'ru', { weekday: 'short', timeZone: 'UTC' })
  const activeDays = week.filter((d) => d.xp > 0).length

  return (
    <section className="rounded-3xl bg-white p-4 shadow-[0_5px_0_0_rgba(31,27,58,0.07)]">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-extrabold">{t('home.weekTitle')}</h2>
        <span className="text-sm font-bold text-ink/50">{t('home.weekDays', { count: activeDays })}</span>
      </div>
      <ol className="flex justify-between">
        {week.map((d, i) => {
          const active = d.xp > 0
          const today = i === week.length - 1
          return (
            <li key={d.day} className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${
                  active ? 'bg-coral text-white' : today ? 'border-2 border-dashed border-coral text-coral' : 'bg-ink/[0.07] text-ink/30'
                } ${active && today ? 'pop-in' : ''}`}
              >
                {active ? '✓' : ''}
              </span>
              <span className={`text-xs font-bold capitalize ${today ? 'text-coral' : 'text-ink/45'}`}>
                {weekday.format(new Date(`${d.day}T12:00:00Z`)).replace('.', '')}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** One useful everyday phrase a day, with audio and a short note. */
export function PhraseOfDay() {
  const { t } = useTranslation()
  const phrase = home.phrases[dayNumber() % home.phrases.length]

  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#7C5CFF] p-5 text-white shadow-[0_6px_0_0_#5B3FE0]">
      <span className="float-slow absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10" aria-hidden="true" />
      <span className="float-slow absolute -bottom-10 right-16 h-20 w-20 rounded-full bg-white/10" style={{ animationDelay: '1.5s' }} aria-hidden="true" />
      <p className="relative text-xs font-extrabold uppercase tracking-wide text-white/75">{t('home.phraseTitle')}</p>
      <div className="relative mt-2 flex items-start gap-3">
        <div className="min-w-0 flex-1 select-text">
          <p className="text-2xl font-extrabold leading-tight">{phrase.en}</p>
          <p className="mt-1 text-base font-semibold text-white/85">{phrase.ru}</p>
        </div>
        <SpeakButton text={phrase.en} className="!bg-white/20 !text-white" />
      </div>
      <p className="relative mt-3 select-text text-sm leading-snug text-white/80">{phrase.note}</p>
    </section>
  )
}

/** A different teacher each day, inviting the student to talk. */
export function TeacherOfDay() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang: Lang = i18n.language === 'en' ? 'en' : 'ru'
  const day = dayNumber()
  const teacher = TEACHERS[day % TEACHERS.length]
  const lines = home.teacherLines[teacher.id]
  const line = lines[Math.floor(day / TEACHERS.length) % lines.length][lang]

  return (
    <button
      type="button"
      onClick={() => navigate(`/talk/${teacher.id}`)}
      className="flex w-full items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-[0_5px_0_0_rgba(31,27,58,0.07)] active:translate-y-0.5"
    >
      <TeacherAvatar teacher={teacher.id} size={76} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-extrabold uppercase tracking-wide text-ink/45">{t('home.teacherTitle')}</span>
        <span className="block text-lg font-extrabold leading-tight">{teacher.name}</span>
        <span className="mt-1 block text-base leading-snug text-ink/70">«{line}»</span>
      </span>
    </button>
  )
}
