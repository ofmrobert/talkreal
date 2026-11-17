import { useTranslation } from 'react-i18next'

/** True when the app was opened from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  )
}

export default function InstallGuide() {
  const { t } = useTranslation()
  const steps = [t('install.step1'), t('install.step2'), t('install.step3')]

  return (
    <section className="w-full rounded-3xl bg-white p-5 text-left shadow-[0_6px_0_0_rgba(31,27,58,0.08)]">
      <h2 className="text-lg font-bold">{t('install.title')}</h2>
      <p className="mt-1 text-sm opacity-70">{t('install.safariOnly')}</p>
      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral font-bold text-white">
              {i + 1}
            </span>
            <span className="flex items-center gap-2 text-base">
              {step}
              {i === 0 && <ShareIcon />}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm opacity-60">{t('install.other')}</p>
    </section>
  )
}
