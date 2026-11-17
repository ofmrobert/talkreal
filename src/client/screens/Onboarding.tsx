import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import Chai from '../components/Chai'
import InstallGuide, { isStandalone } from '../components/InstallGuide'
import Button from '../components/ui/Button'
import { BoltIcon, MicIcon } from '../components/icons'
import { save } from '../lib/storage'

type Slide = 'hello' | 'lessons' | 'talk' | 'install'

function Illustration({ slide }: { slide: Slide }) {
  if (slide === 'hello') return <Chai size={200} />
  if (slide === 'install') return <Chai size={120} />
  const Icon = slide === 'lessons' ? BoltIcon : MicIcon
  const color = slide === 'lessons' ? 'bg-sun' : 'bg-mint'
  return (
    <div className={`flex h-44 w-44 items-center justify-center rounded-[3rem] ${color} text-ink shadow-[0_8px_0_0_rgba(31,27,58,0.12)]`}>
      <Icon width={84} height={84} />
    </div>
  )
}

/** First-launch introduction. The last slide (install steps) is skipped when already installed. */
export default function Onboarding() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [slides] = useState<Slide[]>(() =>
    isStandalone() ? ['hello', 'lessons', 'talk'] : ['hello', 'lessons', 'talk', 'install'],
  )
  const [index, setIndex] = useState(0)
  const slide = slides[index]
  const isLast = index === slides.length - 1
  const nextLang = i18n.language === 'ru' ? 'en' : 'ru'

  function finish() {
    save('onboarded', '1')
    navigate('/', { replace: true })
  }

  return (
    <div className="safe-screen mx-auto flex h-full max-w-md flex-col">
      <header className="flex items-center justify-between">
        <button
          onClick={() => i18n.changeLanguage(nextLang)}
          className="min-h-11 min-w-11 rounded-full bg-white px-4 text-sm font-bold uppercase shadow-[0_3px_0_0_rgba(31,27,58,0.1)] active:translate-y-0.5"
        >
          {nextLang}
        </button>
        {!isLast && (
          <button onClick={finish} className="min-h-11 px-2 text-base font-bold text-ink/50">
            {t('common.skip')}
          </button>
        )}
      </header>

      {/* key restarts the entrance animation on every slide */}
      <section key={slide} className="slide-in flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto py-4 text-center">
        <Illustration slide={slide} />
        <div>
          <h1 className="text-3xl font-extrabold leading-tight">{t(`onboarding.${slide}.title`)}</h1>
          <p className="mt-3 text-lg leading-snug text-ink/70">{t(`onboarding.${slide}.text`)}</p>
        </div>
        {slide === 'install' && <InstallGuide />}
      </section>

      <footer className="flex flex-col items-center gap-5">
        <div className="flex gap-2" aria-hidden="true">
          {slides.map((s, i) => (
            <span
              key={s}
              className={`h-2.5 rounded-full transition-all duration-300 ${i === index ? 'w-7 bg-coral' : 'w-2.5 bg-ink/15'}`}
            />
          ))}
        </div>
        <Button onClick={isLast ? finish : () => setIndex(index + 1)}>
          {isLast ? t('common.start') : t('common.next')}
        </Button>
      </footer>
    </div>
  )
}
