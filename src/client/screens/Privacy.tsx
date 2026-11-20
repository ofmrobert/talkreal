import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import privacy from '../../../content/privacy.json'

/** The privacy policy. Its text lives in content/privacy.json and can be edited without touching code. */
export default function Privacy() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const text = i18n.language === 'en' ? privacy.en : privacy.ru

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col gap-4">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          aria-label={t('privacy.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-ink/55 active:bg-ink/10"
        >
          ←
        </button>
        <h1 className="text-2xl font-extrabold leading-tight">{text.title}</h1>
      </header>

      <main className="flex flex-1 select-text flex-col gap-4 overflow-y-auto pb-4">
        <p className="text-base leading-relaxed text-ink/75">{text.intro}</p>
        {text.sections.map((section) => (
          <section key={section.heading} className="rounded-3xl bg-card p-4">
            <h2 className="text-lg font-extrabold">{section.heading}</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-base leading-relaxed text-ink/75">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-sm font-semibold leading-relaxed text-ink/55">
          {privacy.operator && (
            <>
              {text.operatorLabel}: {privacy.operator}
              <br />
            </>
          )}
          {privacy.contact && (
            <>
              {text.contactLabel}: {privacy.contact}
              <br />
            </>
          )}
          {text.updatedLabel}: {privacy.updated}
        </p>
      </main>
    </div>
  )
}
