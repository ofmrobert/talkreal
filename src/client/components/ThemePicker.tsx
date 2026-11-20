import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AUTO, chooseTheme, chosenTheme, THEMES, type Theme } from '../lib/theme'

/** A tiny picture of the app in a theme's colours: a card with two lines of text and a button. */
function Preview({ theme }: { theme: Theme }) {
  const [page, card, accent, text] = theme.preview
  return (
    <span className="flex h-16 w-full flex-col justify-between rounded-xl p-2" style={{ background: page, boxShadow: `inset 0 0 0 1px ${text}1f` }} aria-hidden="true">
      <span className="flex flex-col gap-1 rounded-md p-1.5" style={{ background: card, boxShadow: `0 1px 0 0 ${text}1f` }}>
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: text }} />
        <span className="h-1.5 w-1/2 rounded-full" style={{ background: text, opacity: 0.35 }} />
      </span>
      <span className="h-2.5 w-full rounded-full" style={{ background: accent }} />
    </span>
  )
}

/** Settings: choose how the app looks. The change shows at once. */
export default function ThemePicker() {
  const { t } = useTranslation()
  const [choice, setChoice] = useState(chosenTheme)

  function pick(id: string) {
    chooseTheme(id)
    setChoice(id)
  }

  const group = (dark: boolean) => (
    <div className={`grid gap-2 ${dark ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {THEMES.filter((theme) => theme.dark === dark).map((theme) => {
        const active = choice === theme.id
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => pick(theme.id)}
            aria-pressed={active}
            className={`flex flex-col gap-1.5 rounded-2xl border-2 bg-card p-2 active:translate-y-0.5 ${active ? 'border-coral' : 'border-ink/10'}`}
          >
            <Preview theme={theme} />
            <span className={`truncate text-sm font-extrabold ${active ? 'text-coral-ink' : 'text-ink/70'}`}>
              {active ? '✓ ' : ''}
              {t(`theme.names.${theme.id}`)}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink/50">{t('theme.title')}</h2>
      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/35">{t('theme.light')}</p>
      {group(false)}
      <p className="mt-1 text-xs font-extrabold uppercase tracking-wide text-ink/35">{t('theme.dark')}</p>
      {group(true)}
      <button
        type="button"
        onClick={() => pick(AUTO)}
        aria-pressed={choice === AUTO}
        className={`mt-1 flex min-h-14 items-center gap-3 rounded-2xl border-2 bg-card px-4 py-2 text-left active:translate-y-0.5 ${choice === AUTO ? 'border-coral' : 'border-ink/10'}`}
      >
        <span className="text-2xl" aria-hidden="true">
          🌗
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-base font-extrabold ${choice === AUTO ? 'text-coral-ink' : ''}`}>
            {choice === AUTO ? '✓ ' : ''}
            {t('theme.auto')}
          </span>
          <span className="block text-sm font-semibold leading-snug text-ink/55">{t('theme.autoHint')}</span>
        </span>
      </button>
    </section>
  )
}
